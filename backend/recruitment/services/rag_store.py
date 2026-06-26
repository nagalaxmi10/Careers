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


def _get_resume_collection():
    global _resume_collection
    if _resume_collection is None:
        _resume_collection = _get_client().get_or_create_collection(
            name="resumes",
            metadata={"hnsw:space": "cosine"}
        )
    return _resume_collection


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


def index_job_request(job_request) -> bool:
    """
    Index a job request into ChromaDB.
    Call this when a job request is APPROVED so it's ready for retrieval.
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


# ── Past match indexing ───────────────────────────────────────────────────────

def index_past_match(resume_id: int, resume_text: str, job_title: str,
                     skills: list, match_score: float, fit_summary: str) -> bool:
    """Store a shortlisted candidate's resume + outcome in the match collection."""
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
    """Retrieve the most relevant job context for this resume."""
    try:
        primary = _build_job_doc(job_request)

        similar_jobs = ""
        query_text = f"{resume_text[:2000]} {job_request.skills_required}"
        embedding = _embed(query_text)

        if embedding:
            collection = _get_job_collection()
            count = collection.count()
            if count > 1:
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
        return _build_job_doc(job_request)


def retrieve_past_matches(resume_text: str, job_title: str, n_results: int = 2) -> str:
    """Retrieve past successful match summaries similar to this resume+job combo."""
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


# ── Resume indexing ────────────────────────────────────────────────────────

def index_resume(resume_id, redacted_text: str, job_request_id, original_filename: str = "") -> str | bool:
    """Embed and store a resume's REDACTED text in ChromaDB."""
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
                "job_request_id":    str(job_request_id) if job_request_id else "None",
                "original_filename": original_filename or "",
            }]
        )
        print(f"[RAG] Indexed resume #{resume_id}")
        return chroma_id
    except Exception as e:
        print(f"[RAG] index_resume error: {e}")
        return False


# ── Resume retrieval (Pre-filter for Pool Screening) ────────────────────────

def query_similar_resumes(job_text, top_k=50):
    """
    Searches ChromaDB for resumes most similar to the job description.
    Returns a list of INTEGER resume IDs.
    """
    try:
        # 1. Generate embedding using Ollama
        embedding = _embed(job_text[:8000])
        if not embedding:
            print("[RAG] query_similar_resumes: embedding failed")
            return []

        # 2. Get the resume collection
        collection = _get_resume_collection()
        count = collection.count()
        if count == 0:
            return []

        # 3. Query ChromaDB (NO job_request_id filter, because pool resumes have "None")
        results = collection.query(
            query_embeddings=[embedding],
            n_results=min(top_k, count),
            include=["metadatas"]
        )
        
        # 4. Extract integer IDs for Django
        resume_ids = []
        if results and results['metadatas'] and results['metadatas'][0]:
            for meta in results['metadatas'][0]:
                if 'resume_id' in meta:
                    resume_ids.append(int(meta['resume_id']))
                    
        print(f"[RAG] query_similar_resumes: found {len(resume_ids)} vector matches")
        return resume_ids
        
    except Exception as e:
        print(f"[RAG STORE] Vector search failed, falling back to full pool: {e}")
        return []


def find_best_matching_job(redacted_resume_text: str):
    """Given a resume's redacted text, find the single most similar APPROVED job request."""
    try:
        embedding = _embed(redacted_resume_text[:8000])
        if not embedding:
            return None, 0.0

        collection = _get_job_collection()
        count = collection.count()
        if count == 0:
            return None, 0.0

        results = collection.query(
            query_embeddings=[embedding],
            n_results=1,
            where={"status": "APPROVED"},
        )
        ids = results.get("ids", [[]])[0]
        distances = results.get("distances", [[]])[0]

        if not ids:
            return None, 0.0

        similarity = 1.0 - distances[0]
        return ids[0], similarity

    except Exception as e:
        print(f"[RAG] find_best_matching_job error: {e}")
        return None, 0.0