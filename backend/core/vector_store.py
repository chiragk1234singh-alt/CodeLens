import chromadb
from chromadb.config import Settings as ChromaSettings
from backend.core.config import settings

# Create ONE ChromaDB client for the whole application
# PersistentClient means data is saved to disk, not lost when server restarts
_chroma_client = chromadb.PersistentClient(
    path=settings.chroma_persist_path,
    settings=ChromaSettings(anonymized_telemetry=False)
)

def get_collection(repo_id: str):
    """
    Get or create a ChromaDB collection for a specific repo.
    Each repo gets its own isolated collection named "repo_{repo_id}".
    """
    return _chroma_client.get_or_create_collection(
        name=f"repo_{repo_id}",
        # cosine distance: measures angle between vectors
        # better than euclidean distance for text similarity
        metadata={"hnsw:space": "cosine"}
    )

def delete_collection(repo_id: str):
    """Delete a repo's collection when the repo is deleted."""
    try:
        _chroma_client.delete_collection(f"repo_{repo_id}")
    except Exception:
        pass    # collection might not exist, that's fine