"""Exercise the *live* Claude code path against a local stub server.

No API key or network needed: the real Anthropic SDK sends real HTTP requests to a
fake endpoint, so we check what we send (model, structured output, web search tool,
fallbacks beta) and that validate -> retry works on a malformed first answer.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.config import get_settings
from app.services.ai import client as ai_client
from app.services.ai import quiz as ai_quiz
from app.services.ai import syllabus as ai_syllabus

from .test_ai_validation import good_quiz


def message(text, stop="end_turn", extra_blocks=()):
    return {
        "id": "msg_test", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
        "content": [*extra_blocks, {"type": "text", "text": text}],
        "stop_reason": stop, "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }


class Stub:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests: list[tuple[dict, dict]] = []


@pytest.fixture
def stub(monkeypatch):
    state = Stub([])

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            state.requests.append((dict(self.headers), body))
            payload = json.dumps(state.responses.pop(0)).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *a):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(settings, "ai_mock", False)
    monkeypatch.setenv("ANTHROPIC_BASE_URL", f"http://127.0.0.1:{server.server_port}")
    ai_client._client.cache_clear()
    yield state
    server.shutdown()
    ai_client._client.cache_clear()


SYLLABUS_JSON = {"subjects": [{"name": "DBMS", "units": [{"name": "Unit 1", "topics": [
    {"name": "Joins", "difficulty": 4, "est_minutes": 90}]}]}]}


def test_syllabus_uses_structured_output_and_fallbacks(stub):
    stub.responses = [message(json.dumps(SYLLABUS_JSON))]
    parsed = ai_syllabus.parse_text("DBMS\nUnit 1: Joins")
    assert parsed.subjects[0].units[0].topics[0].name == "Joins"

    headers, body = stub.requests[0]
    assert body["model"] == "claude-opus-5-5"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in headers.get("anthropic-beta", "")
    assert "thinking" not in body  # Opus 5.5: thinking is adaptive by default
    assert "sk-test" not in json.dumps(body)


def test_quiz_uses_web_search_and_retries_bad_json(stub):
    bad = good_quiz()
    bad["questions"][9]["difficulty"] = "easy"  # wrong 4/4/2 mix
    search_block = {
        "type": "web_search_tool_result", "tool_use_id": "srvtoolu_1",
        "content": [{"type": "web_search_result", "url": "https://example.edu/joins", "title": "Joins",
                     "encrypted_content": "x", "page_age": None}],
    }
    tool_use = {"type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": {"query": "sql joins"}}
    stub.responses = [
        message("```json\n" + json.dumps(bad) + "\n```", extra_blocks=(tool_use, search_block)),
        message(json.dumps(good_quiz())),
    ]
    quiz, sources = ai_quiz.generate("DBMS", "Unit 3", "Joins")
    assert len(quiz.questions) == 10
    assert sources == [{"url": "https://example.edu/joins", "title": "Joins"}]

    first, retry = stub.requests[0][1], stub.requests[1][1]
    assert first["tools"][0]["type"] == "web_search_20260209"
    assert "format" not in first["output_config"]  # JSON requested in prompt when tools are on
    assert "failed validation" in retry["messages"][-1]["content"]
    assert retry["output_config"]["format"]["type"] == "json_schema"
    assert "tools" not in retry


def test_refusal_becomes_friendly_error(stub):
    stub.responses = [message("", stop="refusal")]
    with pytest.raises(ai_client.AIError, match="declined"):
        ai_syllabus.parse_text("DBMS\nUnit 1: Joins")


def test_pause_turn_is_resumed(stub):
    stub.responses = [message("searching...", stop="pause_turn"), message(json.dumps(SYLLABUS_JSON))]
    ai_syllabus.parse_text("DBMS\nUnit 1: Joins")
    assert len(stub.requests) == 2
    assert stub.requests[1][1]["messages"][-1]["role"] == "assistant"
