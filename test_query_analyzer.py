print("SCRIPT STARTED")
from backend.agents.query_analyzer import analyze_query


tests = [
    {
        "query": "how does authentication work",
        "mode": "chat",
    },

    {
        "query": "review this file",
        "mode": "review",
        "target_file": "backend/main.py",
    },

    {
        "query": "generate architecture report",
        "mode": "report",
    }
]


for t in tests:

    result = analyze_query(
        user_query=t["query"],
        mode=t["mode"],
        target_file=t.get("target_file")
    )

    print()
    print("=" * 50)
    print(result)