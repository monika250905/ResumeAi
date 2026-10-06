"""Small persistent embeddings RAG index for trusted resume guidance.

Curated knowledge is stored in SQLite. User resume and job-description chunks are
embedded only for the current request and are never written to the vector store.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Any

from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent
KNOWLEDGE_FILE = BASE_DIR / "knowledge_base" / "resume_ats_guidelines.md"
EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
MAX_CHUNK_CHARS = 1100


def _database_path() -> Path:
    configured = Path(os.getenv("RAG_STORE_PATH", "data/rag.sqlite3"))
    return configured if configured.is_absolute() else BASE_DIR / configured


def _split_knowledge(text: str) -> list[dict[str, str]]:
    chunks: list[dict[str, str]] = []
    heading = "Resume guidance"
    section: list[str] = []

    def flush() -> None:
        content = "\n".join(section).strip()
        if not content:
            return
        paragraphs = [part.strip() for part in content.split("\n\n") if part.strip()]
        current = ""
        for paragraph in paragraphs:
            if len(current) + len(paragraph) + 2 > MAX_CHUNK_CHARS and current:
                chunks.append({"source": heading, "text": current.strip()})
                current = ""
            while len(paragraph) > MAX_CHUNK_CHARS:
                chunks.append({"source": heading, "text": paragraph[:MAX_CHUNK_CHARS].strip()})
                paragraph = paragraph[MAX_CHUNK_CHARS:]
            current += ("\n\n" if current else "") + paragraph
        if current.strip():
            chunks.append({"source": heading, "text": current.strip()})

    for line in text.splitlines():
        if line.startswith("## "):
            flush()
            heading = line[3:].strip()
            section = []
        elif line.startswith("# "):
            continue
        else:
            section.append(line)
    flush()
    return chunks


def _personal_chunks(label: str, text: str | None) -> list[dict[str, str]]:
    if not text or not text.strip():
        return []
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    parts: list[str] = []
    while normalized:
        part = normalized[:MAX_CHUNK_CHARS]
        if len(normalized) > MAX_CHUNK_CHARS:
            boundary = max(part.rfind("\n"), part.rfind(". "), part.rfind("; "))
            if boundary > MAX_CHUNK_CHARS // 2:
                part = normalized[:boundary + 1]
        parts.append(part.strip())
        normalized = normalized[len(part):].lstrip()
    return [{"source": label, "text": part} for part in parts if part]


class ResumeRAG:
    def __init__(self) -> None:
        self._lock = threading.RLock()

    def _connect(self) -> sqlite3.Connection:
        path = _database_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(path, timeout=20)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("""CREATE TABLE IF NOT EXISTS rag_chunks (
            id INTEGER PRIMARY KEY, source TEXT NOT NULL, content TEXT NOT NULL,
            embedding TEXT NOT NULL, content_hash TEXT NOT NULL
        )""")
        connection.execute("CREATE TABLE IF NOT EXISTS rag_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        return connection

    def _ensure_index(self, client: OpenAI) -> list[dict[str, Any]]:
        source_text = KNOWLEDGE_FILE.read_text(encoding="utf-8")
        source_hash = hashlib.sha256(f"{EMBEDDING_MODEL}\n{source_text}".encode("utf-8")).hexdigest()
        with self._lock, closing(self._connect()) as connection:
            row = connection.execute("SELECT value FROM rag_metadata WHERE key='source_hash'").fetchone()
            chunks = connection.execute("SELECT source, content, embedding FROM rag_chunks ORDER BY id").fetchall()
            if row and row[0] == source_hash and chunks:
                return [{"source": source, "text": content, "embedding": json.loads(vector)} for source, content, vector in chunks]

            documents = _split_knowledge(source_text)
            if not documents:
                raise RuntimeError("The resume guidance knowledge base is empty.")
            response = client.embeddings.create(model=EMBEDDING_MODEL, input=[item["text"] for item in documents])
            connection.execute("DELETE FROM rag_chunks")
            connection.execute("DELETE FROM rag_metadata")
            for item, result in zip(documents, response.data, strict=True):
                vector = result.embedding
                connection.execute(
                    "INSERT INTO rag_chunks(source, content, embedding, content_hash) VALUES (?, ?, ?, ?)",
                    (item["source"], item["text"], json.dumps(vector), source_hash),
                )
            connection.execute("INSERT INTO rag_metadata(key, value) VALUES ('source_hash', ?)", (source_hash,))
            connection.commit()
            return [{**item, "embedding": result.embedding} for item, result in zip(documents, response.data, strict=True)]

    @staticmethod
    def _dot(left: list[float], right: list[float]) -> float:
        return sum(a * b for a, b in zip(left, right))

    def retrieve(
        self,
        client: OpenAI,
        query: str,
        resume_text: str | None = None,
        job_description: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, str | float]]:
        documents = self._ensure_index(client)
        personal = _personal_chunks("Candidate resume", resume_text) + _personal_chunks("Target job description", job_description)
        embedding_inputs = [query[:12000]] + [item["text"] for item in personal]
        embedded = client.embeddings.create(model=EMBEDDING_MODEL, input=embedding_inputs).data
        query_vector = embedded[0].embedding
        candidates = documents + [
            {**item, "embedding": result.embedding}
            for item, result in zip(personal, embedded[1:], strict=True)
        ]
        ranked = sorted(candidates, key=lambda item: self._dot(query_vector, item["embedding"]), reverse=True)
        selected: list[dict[str, str | float]] = []
        seen: set[tuple[str, str]] = set()
        for item in ranked:
            identity = (item["source"], item["text"])
            if identity in seen:
                continue
            seen.add(identity)
            selected.append({"source": item["source"], "text": item["text"], "score": round(self._dot(query_vector, item["embedding"]), 4)})
            if len(selected) >= limit:
                break
        return selected


resume_rag = ResumeRAG()
