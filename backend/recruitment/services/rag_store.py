"""
RAG vector store — ChromaDB + Ollama nomic-embed-text

Stores job request documents so that when a resume is uploaded,
we can retrieve the most relevant job context chunks to feed
into the Ollama prompt alongside the resume text.

Also stores past successful matches so the LLM can learn
from previous shortlisting decisions.

Install:
    pip install chromadb --break-system-packages
Pull embedding model:
    ollama pull nomic-embed-text
"""

import os
import chromadb
from chromadb.config import Settings

# ── ChromaDB client (persistent, stored next to manage.py) ───────────────────
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_CHROMA_PATH = os.path.join(_BASE_DIR, "chroma_db")

_client = None
_job_collection = None
_match_collection = None
_resume_collection = None 


def _get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=_CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False)
        )
    return _client


def _get_job_collection():
    global _job_collection
    if _job_collection is None:
        _job_collection = _get_client().get_or_create_collection(
            name="job_requests",
            metadata={"hnsw:space": "cosine"}
        )
    return _job_collection


def _get_match_collection():
    global _match_collection
    if _match_collection is None:
        _match_collection = _get_client().get_or_create_collection(
            name="past_matches",
            metadata={"hnsw:space": "cosine"}
        )
    return _match_collection


# ── Embedding via Ollama nomic-embed-text ─────────────────────────────────────

def _embed(text: str) -> list:
    """Get embedding vector from Ollama nomic-embed-text model."""
    try:
        import ollama
        response = ollama.embeddings(model="nomic-embed-text", prompt=text[:8000])
        return response["embedding"]
    except Exception as e:
        print(f"[RAG] Embedding error: {e}")
        return []


# ── Job request indexing ──────────────────────────────────────────────────────

def index_job_request(job_request) -> bool:
    """
    Index a job request into ChromaDB.
    Call this when a job request is APPROVED so it's ready for retrieval.
    Also call on create/update in case content changes.
    """
    try:
        doc_text = _build_job_doc(job_request)
        embedding = _embed(doc_text)
        if not embedding:
            return False

        collection = _get_job_collection()
        collection.upsert(
            ids=[str(job_request.id)],
            embeddings=[embedding],
            documents=[doc_text],
            metadatas=[{
                "job_id":     str(job_request.id),
                "title":      job_request.title,
                "department": job_request.department or "",
                "status":     job_request.status,
            }]
        )
        print(f"[RAG] Indexed job request #{job_request.id}: {job_request.title}")
        return True
    except Exception as e:
        print(f"[RAG] index_job_request error: {e}")
        return False


def _build_job_doc(job_request) -> str:
    """Build a rich text document from a job request for embedding."""
    parts = [
        f"Job Title: {job_request.title}",
        f"Department: {job_request.department or 'Not specified'}",
        f"Experience Required: {job_request.experience_required} years",
        f"Vacancies: {job_request.vacancies}",
        f"Required Skills: {job_request.skills_required or 'Not specified'}",
    ]
    if job_request.description:
        parts.append(f"Description: {job_request.description}")
    if getattr(job_request, "key_responsibilities", None):
        parts.append(f"Key Responsibilities: {job_request.key_responsibilities}")
    if getattr(job_request, "basic_qualifications", None):
        parts.append(f"Basic Qualifications: {job_request.basic_qualifications}")
    if getattr(job_request, "preferred_qualifications", None):
        parts.append(f"Preferred Qualifications: {job_request.preferred_qualifications}")
    return "\n".join(parts)


# ── Past match indexing ───────────────────────────────────────────────────────

def index_past_match(resume_id: int, resume_text: str, job_title: str,
                     skills: list, match_score: float, fit_summary: str) -> bool:
    """
    Store a shortlisted candidate's resume + outcome in the match collection.
    This lets future RAG retrievals learn from past successful matches.
    """
    try:
        doc_text = (
            f"Job: {job_title}\n"
            f"Skills: {', '.join(skills)}\n"
            f"Match score: {match_score:.1f}%\n"
            f"Why shortlisted: {fit_summary}\n"
            f"Resume excerpt: {resume_text[:2000]}"
        )
        embedding = _embed(doc_text)
        if not embedding:
            return False

        collection = _get_match_collection()
        collection.upsert(
            ids=[f"match_{resume_id}"],
            embeddings=[embedding],
            documents=[doc_text],
            metadatas=[{
                "resume_id":   str(resume_id),
                "job_title":   job_title,
                "match_score": str(match_score),
            }]
        )
        print(f"[RAG] Indexed past match for resume #{resume_id}")
        return True
    except Exception as e:
        print(f"[RAG] index_past_match error: {e}")
        return False


# ── Retrieval ─────────────────────────────────────────────────────────────────

def retrieve_job_context(job_request, resume_text: str, n_results: int = 2) -> str:
    """
    Retrieve the most relevant job context for this resume.
    Returns a formatted string ready to inject into the Ollama prompt.
    """
    try:
        # Primary: always include the actual job request content
        primary = _build_job_doc(job_request)

        # Secondary: find similar jobs from the vector store
        # (useful when the job has little description but similar ones exist)
        similar_jobs = ""
        query_text = f"{resume_text[:2000]} {job_request.skills_required}"
        embedding = _embed(query_text)

        if embedding:
            collection = _get_job_collection()
            count = collection.count()
            if count > 1:  # only query if there's more than the current job
                results = collection.query(
                    query_embeddings=[embedding],
                    n_results=min(n_results, count),
                    where={"status": "APPROVED"},
                )
                docs = results.get("documents", [[]])[0]
                ids  = results.get("ids", [[]])[0]

                similar = [
                    doc for doc, doc_id in zip(docs, ids)
                    if doc_id != str(job_request.id)
                ]
                if similar:
                    similar_jobs = "\n\nSIMILAR APPROVED ROLES (for context):\n" + "\n---\n".join(similar[:1])

        return primary + similar_jobs
    except Exception as e:
        print(f"[RAG] retrieve_job_context error: {e}")
        # Graceful fallback — just return the job text
        return _build_job_doc(job_request)


def retrieve_past_matches(resume_text: str, job_title: str,
                          n_results: int = 2) -> str:
    """
    Retrieve past successful match summaries similar to this resume+job combo.
    Returns formatted string for prompt injection.
    """
    try:
        query_text = f"{job_title} {resume_text[:1500]}"
        embedding = _embed(query_text)
        if not embedding:
            return ""

        collection = _get_match_collection()
        if collection.count() == 0:
            return ""

        results = collection.query(
            query_embeddings=[embedding],
            n_results=min(n_results, collection.count()),
        )
        docs = results.get("documents", [[]])[0]
        if not docs:
            return ""

        return "\n\nPAST SUCCESSFUL MATCHES (learn from these):\n" + "\n---\n".join(docs)

    except Exception as e:
        print(f"[RAG] retrieve_past_matches error: {e}")
        return ""
def _get_resume_collection():
    global _resume_collection
    if _resume_collection is None:
        _resume_collection = _get_client().get_or_create_collection(
            name="resumes",
            metadata={"hnsw:space": "cosine"}
        )
    return _resume_collection
 
 
# ── Resume indexing ────────────────────────────────────────────────────────
 
def index_resume(resume_id, redacted_text: str, job_request_id, original_filename: str = "") -> str | bool:
    """
    Embed and store a resume's REDACTED text in ChromaDB.
 
    Call this once per resume, right after PII redaction, regardless
    of which upload path (bulk, single-URL, SharePoint screening) the
    resume came through.
 
    Returns the chroma_id (== str(resume_id)) on success, so the
    caller can save it onto CandidateResume.chroma_id. Returns False
    on failure (e.g. embedding model unreachable) — callers should
    treat this the same way index_job_request() treats a False return:
    log it and move on, don't block the rest of the pipeline on it.
    """
    try:
        embedding = _embed(redacted_text[:8000])
        if not embedding:
            return False
 
        chroma_id = str(resume_id)
        collection = _get_resume_collection()
        collection.upsert(
            ids=[chroma_id],
            embeddings=[embedding],
            documents=[redacted_text],
            metadatas=[{
                "resume_id":         str(resume_id),
                "job_request_id":    str(job_request_id),
                "original_filename": original_filename or "",
            }]
        )
        print(f"[RAG] Indexed resume #{resume_id} for job #{job_request_id}")
        return chroma_id
    except Exception as e:
        print(f"[RAG] index_resume error: {e}")
        return False
 
 
# ── Resume retrieval (the pre-filter step) ────────────────────────────────
 
def find_similar_resumes(job_request, top_n: int = 15) -> list:
    """
    Given a job request, return the IDs of the top_n most similar
    resumes already indexed, restricted to resumes uploaded for
    THIS job (so you're not matching candidates against an unrelated
    role's resume pool).
 
    This is the "Stage 1 retrieval" step in the retrieve-then-rerank
    pattern — fast vector similarity narrows the field BEFORE the
    expensive LLM scoring step runs on just these results.
 
    Returns a list of resume_id strings (matching CandidateResume.id),
    NOT chroma_ids directly, since chroma_id == str(resume_id) by
    construction in index_resume() above.
    """
    try:
        query_text = _build_job_doc(job_request)
        embedding = _embed(query_text)
        if not embedding:
            print("[RAG] find_similar_resumes: embedding failed, returning empty list")
            return []
 
        collection = _get_resume_collection()
        count = collection.count()
        if count == 0:
            return []
 
        results = collection.query(
            query_embeddings=[embedding],
            n_results=min(top_n, count),
            where={"job_request_id": str(job_request.id)},
        )
 
        ids = results.get("ids", [[]])[0]
        print(f"[RAG] find_similar_resumes: {len(ids)} candidates for job #{job_request.id}")
        return ids
 
    except Exception as e:
        print(f"[RAG] find_similar_resumes error: {e}")
        return []