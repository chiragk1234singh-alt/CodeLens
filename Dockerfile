FROM python:3.11-slim

# git is needed for cloning repos
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (Docker layer caching — faster rebuilds)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the sentence-transformers model during BUILD
# Without this, the model downloads on first request (slow, might timeout)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy your code
COPY . .

# Railway injects $PORT at runtime
# ${PORT:-8000} means: use $PORT if set, otherwise use 8000
# This single CMD line is the correct way to expand environment variables
CMD sh -c "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"