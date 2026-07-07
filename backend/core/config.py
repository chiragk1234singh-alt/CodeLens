from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    
    groq_api_key: str = os.getenv("groq_api_key")
    nvidia_api_key:  str = os.getenv("NVIDIA_API_KEY")
    repo_storage_path: str = "/tmp/codelens/repos"
    chroma_persist_path: str = "/tmp/codelens/chroma"
    sqlite_db_path: str = "/tmp/codelens/jobs.db"
    max_files_per_repo: int = 200
    groq_model: str = "llama-3.3-70b-versatile" 

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"



settings = Settings()