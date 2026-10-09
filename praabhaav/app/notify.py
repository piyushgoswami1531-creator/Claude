"""Alerts to the core team over Telegram.

Set TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (your chat with
the bot, or a team group). Without them, alerts are written to the log.
"""

import logging
import os

import httpx

log = logging.getLogger(__name__)


class Notifier:
    def __init__(self, bot_token: str | None = None, chat_id: str | None = None):
        self.bot_token = bot_token
        self.chat_id = chat_id

    @classmethod
    def from_env(cls) -> "Notifier":
        return cls(os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID"))

    @property
    def configured(self) -> bool:
        return bool(self.bot_token and self.chat_id)

    def send(self, text: str) -> bool:
        if not self.configured:
            # WARNING so it shows in the default uvicorn log and isn't silently lost.
            log.warning("Telegram not configured; alert:\n%s", text)
            return False
        try:
            # Plain text (no parse_mode) so creator-written text can't inject formatting.
            r = httpx.post(
                f"https://api.telegram.org/bot{self.bot_token}/sendMessage",
                json={"chat_id": self.chat_id, "text": text[:4000],
                      "disable_web_page_preview": True},
                timeout=10,
            )
            r.raise_for_status()
            return True
        except httpx.HTTPError:
            log.exception("Telegram alert failed")
            return False


def ticket_alert(ticket, base_url: str) -> str:
    icon = "🔴" if ticket["priority"] == "high" else "🟡"
    who = f"@{ticket['name']}" if ticket["role"] == "creator" else ticket["name"]
    lines = [
        f"{icon} New {ticket['priority']} query #{ticket['id']} · {ticket['category'].replace('_', ' ')}",
        f"From: {who} ({ticket['role']}) · WhatsApp {ticket['contact']}",
    ]
    if ticket["campaign_name"]:
        lines.append(f"Campaign: {ticket['campaign_name']}")
    lines += [
        f"Summary: {ticket['team_summary']}",
        f"Message: {ticket['message'][:500]}",
        f"Open: {base_url}/admin/tickets",
    ]
    return "\n".join(lines)
