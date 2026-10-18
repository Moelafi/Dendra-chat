"""Dendra backend: a thin, stateless proxy to the OpenAI API.

All conversation data lives in the browser (IndexedDB). This server only
holds the API key and streams model output back to the client.
"""

import json
import os
import re
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import APIError, AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Dendra")
client = AsyncOpenAI()

DEFAULT_MODEL = "gpt-6-luna"
TITLE_MODEL = "gpt-6-luna"
# Optional hard cap on reply length; unset means the model's own maximum.
MAX_OUTPUT_TOKENS = int(os.environ["MAX_OUTPUT_TOKENS"]) if os.environ.get("MAX_OUTPUT_TOKENS") else None

# Chat-capable families only: "gpt-6.1-sol", "gpt-5.5", "gpt-5.4-mini", ...
CHAT_MODEL_RE = re.compile(r"^gpt-\d+(\.\d+)?(-[a-z]+)?$")
EXCLUDED_WORDS = ("image", "realtime", "audio", "transcribe", "tts", "live", "search", "codex")

SYSTEM_PROMPT = (
    "You are a helpful assistant inside Dendra, a non-linear chat app. "
    "Use Markdown for formatting and fenced code blocks with a language tag for code. "
    "When the user quotes an excerpt from earlier in the conversation, focus your answer on that excerpt."
)


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[Message]
    # How long/detailed replies are (GPT-5 and newer only).
    verbosity: Literal["low", "medium", "high"] = "high"


def supports_verbosity(model: str) -> bool:
    m = re.match(r"^gpt-(\d+)", model)
    return bool(m) and int(m.group(1)) >= 5


class TitleRequest(BaseModel):
    messages: list[Message]


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def error_message(exc: Exception) -> str:
    if isinstance(exc, APIError):
        body = getattr(exc, "body", None)
        if isinstance(body, dict) and body.get("message"):
            return body["message"]
        return exc.message
    return str(exc)


@app.get("/api/models")
async def list_models():
    try:
        models = (await client.models.list()).data
    except APIError as exc:
        return {"models": [DEFAULT_MODEL], "default": DEFAULT_MODEL, "error": error_message(exc)}
    chat = [
        m
        for m in models
        if CHAT_MODEL_RE.match(m.id) and not any(w in m.id for w in EXCLUDED_WORDS)
    ]
    chat.sort(key=lambda m: m.created, reverse=True)
    ids = [m.id for m in chat]
    if DEFAULT_MODEL not in ids:
        ids.insert(0, DEFAULT_MODEL)
    return {"models": ids, "default": DEFAULT_MODEL}


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    model = req.model or DEFAULT_MODEL
    input_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + [
        m.model_dump() for m in req.messages
    ]

    async def stream():
        try:
            options: dict = {}
            if supports_verbosity(model):
                options["text"] = {"verbosity": req.verbosity}
            if MAX_OUTPUT_TOKENS:
                options["max_output_tokens"] = MAX_OUTPUT_TOKENS
            response = await client.responses.create(model=model, input=input_messages, stream=True, **options)
            async for event in response:
                if await request.is_disconnected():
                    await response.close()
                    return
                if event.type == "response.output_text.delta":
                    yield sse("delta", {"text": event.delta})
                elif event.type == "response.incomplete":
                    details = event.response.incomplete_details
                    reason = details.reason if details else "unknown"
                    message = (
                        "The reply hit the output token limit."
                        if reason == "max_output_tokens"
                        else f"The reply was cut short ({reason})."
                    )
                    yield sse("error", {"message": message})
                    return
                elif event.type == "response.failed":
                    err = event.response.error
                    yield sse("error", {"message": err.message if err else "Response failed"})
                    return
            yield sse("done", {"model": model})
        except Exception as exc:  # surfaced inline in the UI with a retry button
            yield sse("error", {"message": error_message(exc)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/title")
async def title(req: TitleRequest):
    transcript = "\n\n".join(f"{m.role}: {m.content[:1500]}" for m in req.messages[-4:])
    try:
        r = await client.responses.create(
            model=TITLE_MODEL,
            input=[
                {
                    "role": "system",
                    "content": "Write a short title (max 6 words) for this conversation. "
                    "Reply with the title only, no quotes or punctuation at the end.",
                },
                {"role": "user", "content": transcript},
            ],
        )
        return {"title": r.output_text.strip().strip('"').strip()[:80]}
    except Exception as exc:
        return {"title": None, "error": error_message(exc)}
