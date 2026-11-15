"""Chat with Moon-C from the terminal (development helper).

Start the backend first (uvicorn app.main:app --reload --port 8000), then:

    python scripts/chat.py                  # English, no crew member
    python scripts/chat.py --crew moises    # as Moisés (replies in Spanish)
    python scripts/chat.py --lang es        # force Spanish
    python scripts/chat.py --auto           # like the General account: replies in the language you write in

Commands: /reset clears the conversation, /quit exits.
Nothing is saved: the backend keeps the conversation in memory only.
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat with Moon-C from the terminal.")
    parser.add_argument("--url", default="http://localhost:8000", help="backend URL")
    parser.add_argument("--crew", help="crew_id from shared/crew.json, e.g. moises, ana, ruben, valentina")
    parser.add_argument("--lang", choices=["en", "es"], help="reply language")
    parser.add_argument(
        "--auto", action="store_true", help="reply in the language each message is written in (General account)"
    )
    args = parser.parse_args()

    try:
        status = httpx.get(f"{args.url}/status", timeout=5).json()
    except httpx.HTTPError:
        sys.exit(f"Can't reach Moon-C at {args.url}. Is the backend running?")
    ai = "on" if status["ollama_reachable"] and status["model_available"] else "off (canned replies)"
    print(f"Moon-C {status['version']} | AI: {ai} | model: {status['model']}")
    print("Type a message. /reset clears the conversation, /quit exits.\n")

    session_id = f"cli-{uuid.uuid4().hex[:8]}"
    language = args.lang
    with httpx.Client(base_url=args.url, timeout=90) as client:
        while True:
            try:
                message = input("you    > ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not message:
                continue
            if message in ("/quit", "/exit"):
                break
            if message == "/reset":
                client.post("/session/reset", json={"session_id": session_id})
                print("(conversation cleared)\n")
                continue

            body = {"session_id": session_id, "message": message}
            if args.crew:
                body["crew_id"] = args.crew
            if language:
                body["language"] = language
            if args.auto:
                body["auto_language"] = True
            start = time.perf_counter()
            res = client.post("/chat", json=body)
            elapsed = time.perf_counter() - start
            if res.status_code != 200:
                print(f"(error {res.status_code}: {res.text})\n")
                continue

            data = res.json()
            if args.auto:
                language = data["language"]  # like the front-end: the next unclear message keeps this language
            print(f"Moon-C > {data['reply']}")
            details = [data["category"], data["language"], "AI" if data["ai_used"] else "no AI", f"{elapsed:.1f}s"]
            if data.get("protocol"):
                details.append(f"protocol: {data['protocol']['name']}")
            if data.get("indicator"):
                details.append(f"indicator: {data['indicator']}")
            print(f"         [{' | '.join(details)}]")
            if data.get("suggestions"):
                print(f"         suggestions: {' / '.join(data['suggestions'])}")
            print()


if __name__ == "__main__":
    main()
