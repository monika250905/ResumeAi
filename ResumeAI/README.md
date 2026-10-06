# ResumeAI

ResumeAI is a full-stack resume assistant with an AI chat helper, resume-section drafting, a retrieval-augmented guidance index, and an explainable ATS-style resume analysis.

## Project layout

- `resumeai-frontend/` — React and Vite web app.
- `resumeai-backend/` — FastAPI API, OpenAI integration, and SQLite-backed guidance retrieval.
- `resumeai-backend/knowledge_base/resume_ats_guidelines.md` — curated guidance indexed for RAG.

## Requirements

- Python 3.10 or newer.
- Node.js 20.19+ or 22.12+ (Vite 8 requirement).
- An OpenAI API key for chat, drafting, ATS suggestions, and embedding-powered retrieval.

## Start the backend

From `resumeai-backend/`, create and activate a virtual environment, install dependencies, then configure environment variables:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then start the API:

```powershell
uvicorn main:app --reload --port 8000
```

The API reads `.env` beside `main.py`. It creates `data/rag.sqlite3` on first retrieval. Curated resume guidance is persisted there; resume and job-description text is only embedded for the current request and is not saved to the RAG database.

## Start the frontend

From `resumeai-frontend/`:

```powershell
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Vite proxies `/api` requests to `http://localhost:8000`. To use another API URL, set `VITE_API_BASE` in a frontend `.env.local` file.

## Features

- Resume builder stores the working draft in the browser's local storage.
- AI chatbot answers resume questions using the resume and optional job description as temporary context, plus retrieved resume guidance.
- Resume drafting generates summary and experience content from user-provided facts; review and edit all suggestions before use.
- ATS analysis estimates keyword alignment, standard sections, quantified impact, resume length, and contact information. It reports matched and missing job-description terms, checklist findings, and contextual suggestions.
- ATS score is an explainable estimate, not a score from an employer's proprietary ATS.

## API routes

- `GET /api/health` — health check; does not call an AI model.
- `POST /api/chat` — context-aware assistant chat.
- `POST /api/resume/generate` — draft resume sections.
- `POST /api/ats/analyze` — ATS-style analysis and suggestions.
- `POST /api/resume` — validate a resume payload for browser-side saving.

## Configuration

See `resumeai-backend/.env.example` for `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL`, `RAG_STORE_PATH`, `CORS_ORIGINS`, and optional `DATABASE_URL`. The optional database URL is for SQLAlchemy integration; the current resume flow does not require a relational database.

Never commit `.env` or publish API credentials. The distributed source archive intentionally excludes `.env`, virtual environments, frontend dependencies, and generated RAG data. Configure your own key when unpacking the archive.

## Checks

The frontend production bundle is built with `npm run build`; static checks run with `npm run lint`. Backend syntax can be checked with `python -m compileall -q .`, and the API responds at `/api/health` without invoking OpenAI.
