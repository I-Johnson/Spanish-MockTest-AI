import os
import json
import re

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import AsyncGroq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY", ""))


def build_system_prompt(user_context: dict) -> str:
    ctx_block = ""
    if user_context:
        bucket_lines = "\n".join(
            f"[{key.upper().replace('_', ' ')}]: {value.strip()}"
            for key, value in user_context.items()
            if value.strip()
        )
        if bucket_lines:
            ctx_block = f"""

Here is structured background context about the user, organized in buckets:
---
{bucket_lines}
---

Rules for using this context:
- Scan ALL buckets before responding, pick only what is relevant to the question
- If a bucket is irrelevant to the question, completely ignore it
- Never reference multiple unrelated buckets just to show off the profile
- Never say "as mentioned" or "according to my profile" — speak naturally in first person
- If question is branching from the previous question or the profile, be able to continually build the conversation naturally.
- If asked for an opinion (favorite music, food, travel), ALWAYS take a personal stance using the relevant bucket — never be neutral or say "it depends"
- If no bucket is relevant, just answer naturally without any personal detail
"""

    personality_block = """
Personality & tone rules (always apply these, every single response):
- You are a 22 year old girl with a warm, confident, slightly playful energy
- You have opinions — when asked for preferences, pick a side and own it
- Casual but articulate — like talking to a new friend, not a job robot
- Never sound corporate, stiff, or overly formal
- Short-to-medium length answers — not essays, not one word (max 2-3 sentences)
"""

    return (
        "You are a Spanish language interview assistant helping a user respond "
        "in a mock Spanish interview (casual, newly-met-friend style conversation)."
        + ctx_block
        + personality_block
        + """
Reply ONLY with a valid JSON object with exactly three keys:
'question_en': the interviewer's question translated to natural English,
'spanish': a natural Spanish response the user can say out loud,
'english': the English translation of that response.
No markdown, no explanation, just the JSON.
"""
    )


def _parse_llm_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence:
        text = fence.group(1)
    return json.loads(text)


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    about_me: str = Form(""),
    major: str = Form(""),
    where_i_live: str = Form(""),
    why_i_like_it_here: str = Form(""),
    recent_vacation: str = Form(""),
    hobbies: str = Form(""),
    food: str = Form(""),
    music: str = Form(""),
    personality: str = Form(""),
    history_json: str = Form("[]"),
):
    audio_bytes = await audio.read()
    user_context = {
        "about_me":           about_me,
        "major":              major,
        "where_i_live":       where_i_live,
        "why_i_like_it_here": why_i_like_it_here,
        "recent_vacation":    recent_vacation,
        "hobbies":            hobbies,
        "food":               food,
        "music":              music,
        "personality":        personality,
    }

    try:
        history = json.loads(history_json)
        if not isinstance(history, list):
            history = []
    except (json.JSONDecodeError, ValueError):
        history = []

    filled = sum(1 for v in user_context.values() if v.strip())
    print(f"[SERVER] audio={audio.filename}  size={len(audio_bytes)}B  profile={filled}/9  history={len(history)}")

    # ── 1. Whisper transcription ──────────────────────────────────────────────
    try:
        transcription = await groq_client.audio.transcriptions.create(
            file=(audio.filename or "recording.webm", audio_bytes),
            model="whisper-large-v3-turbo",
        )
        transcript_text = transcription.text.strip()
        print(f"[WHISPER] {transcript_text}")
    except Exception as exc:
        print(f"[WHISPER ERROR] {exc}")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}")

    # ── 2. LLaMA response generation ─────────────────────────────────────────
    try:
        messages = [{"role": "system", "content": build_system_prompt(user_context)}]

        if history:
            lines = ["Recent conversation history (last few exchanges for context):", "---"]
            for h in history:
                lines.append(f"Q: {h.get('question_es', '')} / {h.get('question_en', '')}")
                lines.append(f"A: {h.get('answer_es', '')} / {h.get('answer_en', '')}")
                lines.append("")
            lines += [
                "---",
                "Use this history ONLY to maintain conversational coherence and handle "
                "follow-up or tangent questions. Do not repeat or re-reference old answers "
                "unless the new question directly builds on them.",
            ]
            messages.append({"role": "user",      "content": "\n".join(lines)})
            messages.append({"role": "assistant",  "content": "Understood."})

        messages.append({"role": "user", "content": transcript_text})

        chat = await groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        raw = chat.choices[0].message.content
        print(f"[LLAMA] {raw}")
        llm_data = _parse_llm_json(raw)
    except json.JSONDecodeError as exc:
        print(f"[LLAMA JSON ERROR] {exc}")
        raise HTTPException(status_code=502, detail="LLM returned malformed JSON")
    except Exception as exc:
        print(f"[LLAMA ERROR] {exc}")
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}")

    return {
        "transcript":  transcript_text,
        "question_en": llm_data.get("question_en", ""),
        "spanish":     llm_data.get("spanish", ""),
        "english":     llm_data.get("english", ""),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
