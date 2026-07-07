import os
from backend.core.config import settings

# NVIDIA's API is OpenAI-compatible — same SDK, different base_url and key
# If NVIDIA key exists and has credits, use it. Otherwise fall back to Groq.
USE_NVIDIA = bool(settings.nvidia_api_key)

if USE_NVIDIA:
    from openai import OpenAI
    _client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=settings.nvidia_api_key,
    )
    MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"
    print(f"[llm] using NVIDIA: {MODEL}")
else:
    from groq import Groq
    _client = Groq(api_key=settings.groq_api_key)
    MODEL = "llama-3.3-70b-versatile"
    print(f"[llm] using Groq: {MODEL}")


def call_llm(system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
    """
    Single function for all LLM calls. Works with both NVIDIA and Groq.
    The API shape is identical — only the client and model name differ.
    """
    kwargs = {
        "model":    MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens":  2048,
    }

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = _client.chat.completions.create(**kwargs)
    return response.choices[0].message.content.strip()