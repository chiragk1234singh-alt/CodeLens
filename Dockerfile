FROM python:3.11-slim

RUN apt-get update && apt-get install -y git

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENTRYPOINT ["sh", "-c"]

CMD ["uvicorn backend.main:app --host 0.0.0.0 --port $PORT"]