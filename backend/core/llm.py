import json
from groq import Groq
from backend.core.config import settings



_client = Groq(api_key=settings.groq_api_key)


MODEL = "llama-3.3-70b-versatile"


def call_llm(system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
    """
    Single function for all LLM calls in the project.
    
    json_mode=True tells the model it MUST return valid JSON.
    Use this for the planner so you can parse its decision reliably.
    
    Returns the model's response as a string.
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