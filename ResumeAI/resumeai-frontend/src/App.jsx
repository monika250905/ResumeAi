import { useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.message || `Request failed (${response.status})`);
  return data;
}

function resumeToText(resume) {
  const sections = [
    ["Contact", [resume.fullName, resume.email, resume.phone, resume.location, resume.linkedin, resume.github].filter(Boolean).join(" | ")],
    ["Professional Summary", resume.summary], ["Experience", resume.experience],
    ["Projects", resume.projects], ["Skills", resume.skills], ["Tools", resume.tools],
    ["Education", [resume.degree, resume.college, resume.graduationYear, resume.cgpa].filter(Boolean).join(" | ")],
    ["Certifications", resume.certifications],
  ];
  return sections.filter(([, value]) => value).map(([heading, value]) => `${heading}\n${value}`).join("\n\n");
}

function App() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [showATS, setShowATS] = useState(false);
  const [chatMessages, setChatMessages] = useState([{ role: "assistant", content: "Hi! I can help draft resume sections, tailor your resume to a role, or explain ATS suggestions. Add your resume in the builder for more context." }]);
  const [chatInput, setChatInput] = useState("");
  const [chatJobDescription, setChatJobDescription] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatSources, setChatSources] = useState([]);
  const [resumeMessage, setResumeMessage] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const [resume, setResume] = useState(() => {
    try {
      const saved = localStorage.getItem("resumeai-draft");
      if (saved) return JSON.parse(saved);
    } catch { /* Use a clean draft if local data cannot be read. */ }
    return {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    jobRole: "",
    summary: "",
    degree: "",
    college: "",
    graduationYear: "",
    cgpa: "",
    skills: "",
    tools: "",
    experience: "",
    projects: "",
    certifications: "",
    };
  });

  const handleChange = (event) => {
    const { name, value } = event.target;

    setResume({
      ...resume,
      [name]: value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setResumeError("");
    setResumeMessage("");
    try {
      await apiRequest("/api/resume", { method: "POST", body: JSON.stringify(resume) });
      localStorage.setItem("resumeai-draft", JSON.stringify(resume));
      setResumeMessage("Resume validated and saved in this browser.");
    } catch (error) {
      setResumeError(error.message);
    }
  };

  const handleChat = async (event) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    const history = chatMessages.map(({ role, content }) => ({ role, content }));
    setChatMessages((items) => [...items, { role: "user", content: message }]);
    setChatInput(""); setChatBusy(true); setChatError(""); setChatSources([]);
    try {
      const result = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message, history, resume, job_description: chatJobDescription }),
      });
      setChatMessages((items) => [...items, { role: "assistant", content: result.reply }]);
      setChatSources(result.sources || []);
    } catch (error) {
      setChatError(error.message);
      setChatMessages((items) => [...items, { role: "assistant", content: "I couldn't reach the AI service. Please try again after checking the backend configuration." }]);
    } finally { setChatBusy(false); }
  };

  const handleGenerateSummary = async () => {
    setAiBusy(true); setResumeError(""); setResumeMessage("");
    try {
      const result = await apiRequest("/api/resume/generate", {
        method: "POST",
        body: JSON.stringify({ resume, section: "summary", instruction: "Draft a concise professional summary for the target role using only my supplied facts." }),
      });
      setResume((current) => ({ ...current, summary: result.draft }));
      setResumeMessage(`AI drafted a summary using ${result.sources?.length || 0} retrieved guidance source(s). Review it before saving.`);
    } catch (error) { setResumeError(error.message); }
    finally { setAiBusy(false); }
  };

  const handleATSFromBuilder = () => {
    localStorage.setItem("resumeai-draft", JSON.stringify(resume));
    setShowBuilder(false); setShowATS(true);
  };

  if (showATS) {
    return <div className="builder-page"><header className="navbar"><div className="logo">Resume<span>AI</span></div><button className="nav-button" onClick={() => setShowATS(false)}>← Back Home</button></header><main className="builder-container"><ATSAnalyzer initialResume={resumeToText(resume)} onBack={() => setShowATS(false)}/></main></div>;
  }

  if (showBuilder) {
    return (
      <div className="builder-page">

        <header className="navbar">
          <div className="logo">
            Resume<span>AI</span>
          </div>

          <button
            className="nav-button"
            onClick={() => setShowBuilder(false)}
          >
            ← Back Home
          </button>
        </header>

        <main className="builder-container">

          <div className="builder-heading">
            <p className="section-label">RESUME BUILDER</p>

            <h1>Create Your Professional Resume</h1>

            <p>
              Enter your information below to create an
              ATS-friendly resume.
            </p>
          </div>

          <form onSubmit={handleSubmit}>

            {/* PERSONAL INFORMATION */}

            <section className="form-section">

              <h2>Personal Information</h2>

              <div className="form-grid">

                <div className="form-group">
                  <label>Full Name</label>

                  <input
                    type="text"
                    name="fullName"
                    placeholder="Enter your full name"
                    value={resume.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email</label>

                  <input
                    type="email"
                    name="email"
                    placeholder="example@gmail.com"
                    value={resume.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Phone</label>

                  <input
                    type="text"
                    name="phone"
                    placeholder="+91 XXXXX XXXXX"
                    value={resume.phone}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Location</label>

                  <input
                    type="text"
                    name="location"
                    placeholder="City, State"
                    value={resume.location}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>LinkedIn</label>

                  <input
                    type="text"
                    name="linkedin"
                    placeholder="LinkedIn profile"
                    value={resume.linkedin}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>GitHub</label>

                  <input
                    type="text"
                    name="github"
                    placeholder="GitHub profile"
                    value={resume.github}
                    onChange={handleChange}
                  />
                </div>

              </div>

            </section>


            {/* PROFESSIONAL INFORMATION */}

            <section className="form-section">

              <h2>Professional Information</h2>

              <div className="form-grid">

                <div className="form-group">
                  <label>Target Job Role</label>

                  <input
                    type="text"
                    name="jobRole"
                    placeholder="Example: Full Stack Developer"
                    value={resume.jobRole}
                    onChange={handleChange}
                    required
                  />
                </div>

              </div>

              <div className="form-group">

                <label>Professional Summary</label>

                <textarea
                  name="summary"
                  rows="5"
                  placeholder="Write a short professional summary..."
                  value={resume.summary}
                  onChange={handleChange}
                />

              </div>

            </section>


            {/* EDUCATION */}

            <section className="form-section">

              <h2>Education</h2>

              <div className="form-grid">

                <div className="form-group">
                  <label>Degree</label>

                  <input
                    type="text"
                    name="degree"
                    placeholder="Example: B.Tech Information Technology"
                    value={resume.degree}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>College / University</label>

                  <input
                    type="text"
                    name="college"
                    placeholder="Enter college name"
                    value={resume.college}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>Graduation Year</label>

                  <input
                    type="text"
                    name="graduationYear"
                    placeholder="Example: 2027"
                    value={resume.graduationYear}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label>CGPA / Percentage</label>

                  <input
                    type="text"
                    name="cgpa"
                    placeholder="Example: 8.01"
                    value={resume.cgpa}
                    onChange={handleChange}
                  />
                </div>

              </div>

            </section>


            {/* SKILLS */}

            <section className="form-section">

              <h2>Skills</h2>

              <div className="form-group">

                <label>Technical Skills</label>

                <textarea
                  name="skills"
                  rows="3"
                  placeholder="Example: Java, JavaScript, React, SQL..."
                  value={resume.skills}
                  onChange={handleChange}
                />

              </div>

              <div className="form-group">

                <label>Tools & Technologies</label>

                <textarea
                  name="tools"
                  rows="3"
                  placeholder="Example: VS Code, GitHub, MySQL..."
                  value={resume.tools}
                  onChange={handleChange}
                />

              </div>

            </section>


            {/* EXPERIENCE */}

            <section className="form-section">

              <h2>Experience</h2>

              <div className="form-group">

                <label>Experience Details</label>

                <textarea
                  name="experience"
                  rows="5"
                  placeholder="Company, role, duration and responsibilities..."
                  value={resume.experience}
                  onChange={handleChange}
                />

              </div>

            </section>


            {/* PROJECTS */}

            <section className="form-section">

              <h2>Projects</h2>

              <div className="form-group">

                <label>Project Details</label>

                <textarea
                  name="projects"
                  rows="5"
                  placeholder="Project name, technologies and description..."
                  value={resume.projects}
                  onChange={handleChange}
                />

              </div>

            </section>


            {/* CERTIFICATIONS */}

            <section className="form-section">

              <h2>Certifications</h2>

              <div className="form-group">

                <label>Certification Details</label>

                <textarea
                  name="certifications"
                  rows="4"
                  placeholder="Example: NPTEL Programming in Java..."
                  value={resume.certifications}
                  onChange={handleChange}
                />

              </div>

            </section>


            <div className="form-submit">

              {resumeError && <p className="error-banner" role="alert">{resumeError}</p>}
              {resumeMessage && <p className="success-banner" role="status">{resumeMessage}</p>}
              <div className="builder-actions">
                <button type="button" className="outline-button" onClick={handleGenerateSummary} disabled={aiBusy}>{aiBusy ? "Drafting..." : "✦ Draft Summary with AI"}</button>
                <button type="button" className="outline-button" onClick={handleATSFromBuilder}>Analyze ATS fit</button>
                <button type="submit" className="primary-button">Save Resume →</button>
              </div>

            </div>

          </form>

        </main>

      </div>
    );
  }


  return (
    <div className="app">

      <header className="navbar">

        <div className="logo">
          Resume<span>AI</span>
        </div>

        <nav>
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <button className="nav-link" onClick={() => setShowATS(true)}>ATS Analyzer</button>
          <a href="#chat">AI Chat</a>
        </nav>

        <button
          className="nav-button"
          onClick={() => setShowBuilder(true)}
        >
          Get Started
        </button>

      </header>


      <section className="hero" id="home">

        <div className="hero-content">

          <div className="badge">
            ✨ AI-Powered Resume Platform
          </div>

          <h1>
            Build a Resume That
            <span> Gets Noticed</span>
          </h1>

          <p>
            Create professional ATS-friendly resumes,
            analyze your existing resume, and optimize
            it for your dream job with AI.
          </p>

          <div className="hero-buttons">

            <button
              className="primary-button"
              onClick={() => setShowBuilder(true)}
            >
              Create Resume →
            </button>

            <button
              className="outline-button"
              onClick={() => setShowATS(true)}
            >
              Analyze for ATS
            </button>

          </div>

        </div>

      </section>


      <section className="features" id="features">

        <div className="section-heading">

          <p className="section-label">
            POWERFUL FEATURES
          </p>

          <h2>
            Everything You Need for a Better Resume
          </h2>

          <p>
            ResumeAI helps you create, improve and
            optimize your resume from one simple platform.
          </p>

        </div>

        <div className="feature-grid">

          <div className="feature-card">
            <div className="feature-icon">📄</div>
            <h3>Resume Builder</h3>
            <p>
              Create a professional resume with structured
              job-ready sections.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📤</div>
            <h3>ATS Analyzer</h3>
            <p>
              Compare resume text with a target job description and see transparent keyword and structure feedback.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h3>ATS Analyzer</h3>
            <p>
              Analyze your resume against a job description.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI Assistant</h3>
            <p>
              Get context-aware resume guidance powered by retrieval and an LLM.
            </p>
          </div>

        </div>

      </section>


      <section className="chat-section" id="chat">

        <div className="chat-container">

          <div className="chat-heading">

            <div className="ai-icon">
              🤖
            </div>

            <div>
              <h2>ResumeAI Assistant</h2>
              <p>
                Ask questions about your resume and career.
              </p>
            </div>

          </div>

          <details className="chat-context"><summary>Add a target job description for more tailored answers</summary><textarea value={chatJobDescription} onChange={(event) => setChatJobDescription(event.target.value)} maxLength={12000} rows={4} placeholder="Paste the role requirements you want ResumeAI to consider..."/></details>

          <div className="chat-box" aria-live="polite">
            {chatMessages.map((message, index) => <div className={`chat-message ${message.role === "user" ? "user-message" : "bot-message"}`} key={`${message.role}-${index}`}>
              <div className="avatar">{message.role === "user" ? "You" : "AI"}</div>
              <div className="message-content"><strong>{message.role === "user" ? "You" : "ResumeAI"}</strong><p>{message.content}</p></div>
            </div>)}
            {chatBusy && <p className="assistant-thinking">ResumeAI is finding relevant guidance...</p>}
          </div>
          {chatSources.length > 0 && <p className="source-note">Guidance used: {chatSources.join(" · ")}</p>}
          {chatError && <p className="error-banner" role="alert">{chatError}</p>}
          <form className="chat-input" onSubmit={handleChat}>
            <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} maxLength={3000} placeholder="Ask about your resume, ATS fit, or a target role..." aria-label="Message ResumeAI" />
            <button type="submit" disabled={chatBusy || !chatInput.trim()}>{chatBusy ? "Thinking..." : "Send →"}</button>
          </form>

        </div>

      </section>


      <footer className="footer">

        <div className="logo">
          Resume<span>AI</span>
        </div>

        <p>
          AI-powered resume building and optimization platform.
        </p>

        <p className="copyright">
          © 2026 ResumeAI. All rights reserved.
        </p>

      </footer>

    </div>
  );
}

function ATSAnalyzer({ initialResume, onBack }) {
  const [resumeText, setResumeText] = useState(initialResume);
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const analyze = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setAnalysis(null);
    try {
      const result = await apiRequest("/api/ats/analyze", {
        method: "POST", body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription }),
      });
      setAnalysis(result);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return <>
    <div className="builder-heading ats-heading"><p className="section-label">RESUME ANALYSIS</p><h1>Check your ATS readiness</h1><p>Compare resume text to a target job description. Scores are a transparent checklist estimate, not an employer’s actual ATS result.</p><button type="button" className="text-back" onClick={onBack}>← Back to ResumeAI</button></div>
    <form className="ats-form" onSubmit={analyze}>
      <section className="form-section"><h2>Your resume</h2><div className="form-group"><label htmlFor="ats-resume">Paste resume text</label><textarea id="ats-resume" rows="14" minLength={80} maxLength={16000} required value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Paste the text from your resume, including section headings and contact details."/><small>For best results, paste selectable text from your document. Image-only scans are not analyzed.</small></div></section>
      <section className="form-section"><h2>Target job description</h2><div className="form-group"><label htmlFor="ats-job">Job description</label><textarea id="ats-job" rows="10" minLength={40} maxLength={12000} required value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the role responsibilities, requirements, and skills..."/></div></section>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="form-submit"><button type="submit" className="primary-button" disabled={busy}>{busy ? "Analyzing with AI..." : "Analyze resume →"}</button></div>
    </form>
    {analysis && <section className="ats-results" aria-live="polite">
      <div className="score-card"><div className="score-ring" style={{ "--score": `${analysis.score * 3.6}deg` }}><span>{analysis.score}<small>/100</small></span></div><div><p className="section-label">{analysis.label}</p><h2>Estimated readiness</h2><p>{analysis.disclaimer}</p></div></div>
      <div className="ats-result-grid"><section className="form-section"><h2>Score breakdown</h2>{Object.entries(analysis.components).map(([key, value]) => <div className="score-row" key={key}><div><span>{key.replace(/([A-Z])/g, " $1")}</span><b>{value.score} / {value.outOf}</b></div><i><b style={{ width: `${(value.score / value.outOf) * 100}%` }}/></i></div>)}</section><section className="form-section"><h2>Job-description keywords</h2><p className="muted-copy">Matched terms are present in your resume text. Review missing terms and add them only if they accurately describe you.</p><div className="keyword-group"><b>Matched</b><div>{analysis.matchedKeywords.length ? analysis.matchedKeywords.map((word) => <span className="keyword matched" key={word}>{word}</span>) : <small>No matches found yet.</small>}</div></div><div className="keyword-group"><b>Consider if accurate</b><div>{analysis.missingKeywords.length ? analysis.missingKeywords.map((word) => <span className="keyword missing" key={word}>{word}</span>) : <small>No keyword gaps found.</small>}</div></div></section></div>
      <section className="form-section suggestion-card"><h2>AI suggestions</h2><p className="ai-suggestions">{analysis.aiSuggestions}</p><ul>{analysis.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>{analysis.sources?.length > 0 && <small className="source-note">Retrieved guidance: {analysis.sources.join(" · ")}</small>}</section>
    </section>}
  </>;
}

export default App;
