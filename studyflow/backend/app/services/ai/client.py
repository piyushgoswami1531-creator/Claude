"""Thin wrapper around the Anthropic SDK.

- One client, key read from settings (.env) - never hardcoded.
- `generate_json` = call Claude, extract JSON, validate with Pydantic, and on failure
  retry once, telling Claude exactly what was wrong.
- Every SDK error becomes an `AIError` with a message that is safe to show the user.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from typing import TypeVar

import anthropic
from pydantic import BaseModel, ValidationError

from ...config import get_settings

log = logging.getLogger("studyflow.ai")
T = TypeVar("T", bound=BaseModel)

# Models that accept the server-side refusal fallback (`fallbacks: "default"`).
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"
# Models that support the dynamic-filtering web search tool version.
NEW_WEB_SEARCH_PREFIXES = ("claude-opus-5", "claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8",
                           "claude-sonnet-5", "claude-sonnet-4-6", "claude-fable")


class AIError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


@lru_cache
def _client() -> anthropic.Anthropic:
    s = get_settings()
    return anthropic.Anthropic(api_key=s.anthropic_api_key, max_retries=2, timeout=300.0)


def web_search_tool(max_uses: int = 4) -> dict:
    model = get_settings().claude_model
    kind = "web_search_20260209" if model.startswith(NEW_WEB_SEARCH_PREFIXES) else "web_search_20250305"
    return {"type": kind, "name": "web_search", "max_uses": max_uses}


def call_claude(
    *,
    system: str,
    messages: list[dict],
    max_tokens: int = 16000,
    tools: list[dict] | None = None,
    json_schema: dict | None = None,
    effort: str = "medium",
):
    """One Messages API request (handles pause_turn for server tools). Returns the final message."""
    s = get_settings()
    model = s.claude_model
    output_config: dict = {"effort": effort}
    if json_schema is not None:
        output_config["format"] = {"type": "json_schema", "schema": json_schema}

    kwargs: dict = dict(model=model, max_tokens=max_tokens, system=system, messages=list(messages),
                        output_config=output_config)
    if tools:
        kwargs["tools"] = tools
    use_fallback = s.ai_fallbacks and model in FALLBACK_MODELS
    if use_fallback:
        kwargs["betas"] = [FALLBACK_BETA]
        kwargs["fallbacks"] = "default"

    client = _client()
    try:
        for _ in range(4):  # a server-tool turn may pause; resume a few times at most
            if use_fallback:
                resp = client.beta.messages.create(**kwargs)
            else:
                resp = client.messages.create(**kwargs)
            if resp.stop_reason == "pause_turn":
                kwargs["messages"] = list(messages) + [{"role": "assistant", "content": resp.content}]
                continue
            break
    except anthropic.AuthenticationError as e:
        raise AIError("Claude rejected the API key. Check ANTHROPIC_API_KEY in your .env file.", 502) from e
    except anthropic.PermissionDeniedError as e:
        raise AIError("Your API key doesn't have access to this model or feature. Try another CLAUDE_MODEL.", 502) from e
    except anthropic.NotFoundError as e:
        raise AIError(f"Model '{model}' was not found. Check CLAUDE_MODEL in your .env file.", 502) from e
    except anthropic.RateLimitError as e:
        raise AIError("Claude is rate-limiting requests right now. Wait a minute and try again.", 503) from e
    except anthropic.BadRequestError as e:
        log.warning("Bad request to Claude: %s", e)
        raise AIError(f"Claude rejected the request: {getattr(e, 'message', str(e))}", 502) from e
    except anthropic.APIStatusError as e:
        raise AIError(f"Claude API error ({e.status_code}). Try again shortly.", 503) from e
    except anthropic.APIConnectionError as e:
        raise AIError("Couldn't reach the Claude API. Check your internet connection.", 503) from e

    if resp.stop_reason == "refusal":
        raise AIError("Claude declined this request. Try rephrasing your syllabus or topic.", 422)
    if resp.stop_reason == "max_tokens":
        raise AIError("Claude's answer was cut off (too long). Try a shorter syllabus.", 502)
    return resp


def final_text(resp) -> str:
    """Text written after the last tool result (that's where the answer lives)."""
    blocks = list(resp.content)
    last_tool = max((i for i, b in enumerate(blocks) if getattr(b, "type", "").endswith("_tool_result")), default=-1)
    return "".join(b.text for b in blocks[last_tool + 1:] if getattr(b, "type", "") == "text").strip()


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def extract_json(text: str):
    """Pull a JSON object out of model text (plain, fenced, or surrounded by prose)."""
    text = text.strip()
    candidates = [text]
    candidates += _FENCE.findall(text)
    if "{" in text and "}" in text:
        candidates.append(text[text.index("{"): text.rindex("}") + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except (json.JSONDecodeError, ValueError):
            continue
    raise ValueError("response did not contain a valid JSON object")


def validate_text(text: str, model: type[T]) -> T:
    return model.model_validate(extract_json(text))


def generate_json(
    *,
    system: str,
    user_content: list[dict] | str,
    model: type[T],
    json_schema: dict,
    tools: list[dict] | None = None,
    effort: str = "medium",
    max_tokens: int = 16000,
) -> tuple[T, object]:
    """Ask for JSON, validate it, retry once with the validation error. Returns (parsed, raw_response).

    Structured outputs (`json_schema`) are used when no server tools are attached. With web
    search attached the JSON is requested in the prompt instead (search results carry
    citations, which don't combine with a forced output format) and validated after.
    """
    messages = [{"role": "user", "content": user_content}]
    resp = call_claude(system=system, messages=messages, tools=tools, effort=effort, max_tokens=max_tokens,
                       json_schema=None if tools else json_schema)
    text = final_text(resp)
    try:
        return validate_text(text, model), resp
    except (ValueError, ValidationError) as err:
        log.warning("AI JSON failed validation, retrying once: %s", err)
        error_summary = str(err)[:1500]

    # Repair pass: no tools needed, enforce the schema, show Claude its own mistake.
    repair = [
        {"role": "user", "content": user_content},
        {"role": "assistant", "content": text or "(empty)"},
        {"role": "user", "content": (
            "That output failed validation:\n" + error_summary +
            "\n\nReturn the corrected JSON object only, fixing every problem listed. Keep the same content where it was valid."
        )},
    ]
    resp2 = call_claude(system=system, messages=repair, effort=effort, max_tokens=max_tokens, json_schema=json_schema)
    try:
        return validate_text(final_text(resp2), model), resp
    except (ValueError, ValidationError) as err:
        log.error("AI JSON failed validation twice: %s", err)
        raise AIError("Claude returned malformed data twice. Please try again.", 502) from err


def search_sources(resp) -> list[dict]:
    """URLs Claude looked at via web search (for showing 'sources' under a quiz)."""
    out, seen = [], set()
    for b in getattr(resp, "content", []) or []:
        if getattr(b, "type", "") != "web_search_tool_result":
            continue
        content = getattr(b, "content", None)
        if not isinstance(content, list):  # error object, not a result list
            continue
        for r in content:
            url = getattr(r, "url", None)
            if url and url not in seen:
                seen.add(url)
                out.append({"url": url, "title": getattr(r, "title", "") or url})
    return out[:8]
