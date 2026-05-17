from sentence_transformers import SentenceTransformer
from backend.core.vector_store import get_collection

# Load the embedding model once when this module is imported
# all-MiniLM-L6-v2 is ~80MB, runs on CPU, good quality
# This download happens the first time — after that it's cached locally
_model = SentenceTransformer("all-MiniLM-L6-v2")


def embed_chunks(
    repo_id: str,
    chunks: list[dict],
    progress_callback=None
) -> int:
    """
    Embed all chunks and store them in ChromaDB.

    progress_callback(current, total, file_path)

    Returns:
        int = total chunks stored
    """

    if not chunks:
        return 0

    collection = get_collection(repo_id)

    # Bigger batch = faster embeddings
    # 50 is a good balance for CPU + RAM
    batch_size = 50

    total_stored = 0

    for i in range(0, len(chunks), batch_size):

        batch = chunks[i : i + batch_size]

        # Extract raw text
        texts = [
            chunk["text"]
            for chunk in batch
        ]

        # Generate embeddings
        embeddings = _model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False
        ).tolist()

        # Build Chroma payload
        ids = [
            f"{repo_id}_{i + j}"
            for j in range(len(batch))
        ]

        documents = texts

        metadatas = [
            chunk["metadata"]
            for chunk in batch
        ]

        # Store in vector DB
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )

        total_stored += len(batch)

        # IMPORTANT:
        # Do NOT fire callback every batch.
        # SQLite gets flooded with writes.
        #
        # Only update every 100 chunks
        # OR final chunk count.

        if progress_callback and (
            total_stored % 100 == 0
            or total_stored == len(chunks)
        ):

            current_file = batch[-1]["metadata"].get(
                "file_path",
                ""
            )

            progress_callback(
                total_stored,
                len(chunks),
                current_file
            )

    return total_stored