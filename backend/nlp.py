"""
nlp.py
------
Core NLP helpers: PDF text extraction, embeddings, similarity scoring,
and missing-keyword detection.
"""

import re
from io import BytesIO
from functools import lru_cache
from typing import List, Tuple

from PyPDF2 import PdfReader
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    """Load and cache the sentence-transformer model (loaded once per process)."""
    return SentenceTransformer(MODEL_NAME)


# ---------------------------------------------------------------------------
# Lightweight stopword list — avoids requiring an NLTK download
# ---------------------------------------------------------------------------
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "of",
    "to", "in", "on", "at", "by", "with", "from", "as", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "must", "can", "shall",
    "this", "that", "these", "those", "i", "you", "he", "she", "it", "we",
    "they", "them", "their", "our", "your", "his", "her", "its", "my", "me",
    "us", "what", "which", "who", "whom", "whose", "when", "where", "why",
    "how", "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "also", "about", "above", "after", "again", "into",
    "out", "up", "down", "over", "under", "between", "through", "during",
    "before", "while", "because", "until", "etc", "via", "use", "used",
    "using", "work", "works", "worked", "working", "experience", "experienced",
    "year", "years", "month", "months", "day", "days", "team", "teams",
    "good", "strong", "ability", "able", "including", "include", "includes",
    "responsible", "responsibility", "role", "roles", "skill", "skills",
    "knowledge", "understanding", "familiar", "preferred", "required",
    "requirements", "must", "etc.", "e.g.", "i.e.",
}


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF given as raw bytes."""
    reader = PdfReader(BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:
            pages.append("")
    return "\n".join(pages).strip()


def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def tokenize(text: str) -> List[str]:
    """Tokenize while preserving '+' and '#' (so c++/c# survive)."""
    text = text.lower()
    keep = {"+", "#"}
    cleaned = "".join(
        ch if (ch.isalnum() or ch in keep or ch.isspace()) else " "
        for ch in text
    )
    return [
        t for t in cleaned.split()
        if t not in STOPWORDS and len(t) > 1 and not t.isdigit()
    ]


def compute_similarity(resume_text: str, jd_text: str) -> float:
    """Return semantic similarity score in [0, 100]."""
    model = get_model()
    embeddings = model.encode(
        [clean_text(resume_text), clean_text(jd_text)],
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    score = cosine_similarity(
        embeddings[0].reshape(1, -1),
        embeddings[1].reshape(1, -1),
    )[0][0]
    score = float(max(0.0, min(1.0, score)))
    return round(score * 100, 2)


def find_missing_keywords(
    resume_text: str,
    jd_text: str,
    top_n: int = 15,
) -> Tuple[List[str], List[str]]:
    """Return (missing_keywords, matched_keywords)."""
    resume_tokens = set(tokenize(resume_text))
    jd_tokens = tokenize(jd_text)

    seen = set()
    jd_unique = []
    for t in jd_tokens:
        if t not in seen:
            seen.add(t)
            jd_unique.append(t)

    missing = [t for t in jd_unique if t not in resume_tokens]
    matched = [t for t in jd_unique if t in resume_tokens]
    return missing[:top_n], matched[:top_n]


def interpret_score(score: float) -> str:
    if score >= 75:
        return "Strong Match"
    if score >= 55:
        return "Good Match"
    if score >= 35:
        return "Medium Match"
    return "Low Match"


def generate_suggestions(score: float, missing_keywords: List[str]) -> List[str]:
    suggestions: List[str] = []

    if score < 35:
        suggestions.append(
            "Your resume diverges significantly from this role. Consider "
            "tailoring it heavily or applying to a closer-fit position."
        )
    elif score < 55:
        suggestions.append(
            "Your resume is partially aligned. Rework the summary and skills "
            "sections to mirror the job description's language."
        )
    elif score < 75:
        suggestions.append(
            "Solid foundation. Small, targeted edits could push this into a "
            "strong match."
        )
    else:
        suggestions.append(
            "Excellent alignment. Focus on quantifying achievements to stand out."
        )

    if missing_keywords:
        preview = ", ".join(missing_keywords[:8])
        suggestions.append(
            f"Add or emphasize these terms if you have relevant experience: {preview}."
        )
        suggestions.append(
            "Weave missing keywords into bullet points naturally — avoid keyword stuffing."
        )

    suggestions.append(
        "Use action verbs (built, designed, led) and include measurable impact "
        "(e.g. 'reduced latency by 40%')."
    )
    return suggestions
