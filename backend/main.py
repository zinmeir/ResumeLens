"""
main.py
-------
FastAPI backend for the AI Resume Screener.

Endpoints:
  GET  /                  - Serves the frontend (index.html)
  GET  /health            - Health check
  POST /api/analyze       - Analyze resume (PDF) against job description (text)

Run locally:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from pathlib import Path
from typing import List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from nlp import (
    extract_text_from_pdf,
    compute_similarity,
    find_missing_keywords,
    interpret_score,
    generate_suggestions,
    get_model,
)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ResumeLens API",
    description="Semantic resume-to-job-description matching using sentence-transformers.",
    version="1.0.0",
)

# CORS — open during development; tighten for production deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve frontend folder relative to this file
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------
class AnalyzeResponse(BaseModel):
    score: float
    label: str
    missing_keywords: List[str]
    matched_keywords: List[str]
    suggestions: List[str]
    resume_preview: str


# ---------------------------------------------------------------------------
# Startup: warm up the model so the first request is fast
# ---------------------------------------------------------------------------
@app.on_event("startup")
def warmup():
    get_model()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(
    resume: UploadFile = File(...),
    job_description: str = Form(...),
):
    if not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Resume must be a PDF file.")

    if not job_description.strip():
        raise HTTPException(status_code=400, detail="Job description cannot be empty.")

    try:
        pdf_bytes = await resume.read()
        resume_text = extract_text_from_pdf(pdf_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")

    if not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No text extracted from the PDF. It may be a scanned image.",
        )

    score = compute_similarity(resume_text, job_description)
    missing, matched = find_missing_keywords(resume_text, job_description)
    label = interpret_score(score)
    suggestions = generate_suggestions(score, missing)

    preview = resume_text[:600] + ("…" if len(resume_text) > 600 else "")

    return AnalyzeResponse(
        score=score,
        label=label,
        missing_keywords=missing,
        matched_keywords=matched,
        suggestions=suggestions,
        resume_preview=preview,
    )


# ---------------------------------------------------------------------------
# Static frontend mounting (mounted last so /api/* takes precedence)
# ---------------------------------------------------------------------------
if FRONTEND_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=str(FRONTEND_DIR)),
        name="static",
    )

    @app.get("/")
    def root():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
