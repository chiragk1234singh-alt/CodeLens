FROM python:3.11-slim

RUN apt-get update && apt-get install -y git

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

ENTRYPOINT sh -c 'uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}'