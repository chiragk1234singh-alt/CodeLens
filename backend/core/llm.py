import os
from backend.core.config import settings

# NVIDIA's API is OpenAI-compatible — same SDK, different base_url and key
# If NVIDIA key exists and has credits, use it. Otherwise fall back to Groq.
USE_NVIDIA = settings.llm_provider.lower() == "nvidia"

if USE_NVIDIA:
    from openai import OpenAI
    _client = OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=settings.nvidia_api_key,
    )
    MODEL = settings.llm_model
    print(f"[llm] using NVIDIA: {MODEL}")
else:
    from groq import Groq
    _client = Groq(api_key=settings.groq_api_key)
    MODEL = "llama-3.3-70b-versatile"
    print(f"[llm] using Groq: {MODEL}")


def call_llm(system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
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

    try:
        response = _client.chat.completions.create(**kwargs)
        return response.choices[0].message.content.strip()

    except Exception as e:
        # If NVIDIA fails for any reason, fall back to Groq
        if USE_NVIDIA:
            print(f"[llm] NVIDIA failed ({e}), falling back to Groq")
            from groq import Groq
            groq_client = Groq(api_key=settings.groq_api_key)
            fallback = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=kwargs["messages"],
                temperature=0.1,
                max_tokens=2048,
            )
            return fallback.choices[0].message.content.strip()
        raise