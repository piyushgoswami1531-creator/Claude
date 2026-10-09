"""Input cleaning and validation for creator submissions.

Each ``clean_*`` function returns the normalised value or raises
``ValueError`` with a message that is safe to show to the creator.
"""

import re

IG_HANDLE_RE = re.compile(r"^[a-z0-9._]{1,30}$")
UPI_RE = re.compile(r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$")
REEL_URL_RE = re.compile(
    r"^https?://(www\.)?instagram\.com/(reel|reels|p)/[A-Za-z0-9_-]+/?(\?.*)?$"
)
INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def clean_ig_handle(raw: str) -> str:
    handle = raw.strip().lstrip("@").lower()
    if not IG_HANDLE_RE.match(handle):
        raise ValueError(
            "Enter a valid Instagram handle (letters, numbers, . and _ only)."
        )
    return handle


def clean_whatsapp(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not INDIAN_MOBILE_RE.match(digits):
        raise ValueError("Enter a valid 10-digit Indian mobile number.")
    return digits


def clean_upi(raw: str, confirm: str) -> str:
    upi = raw.strip()
    if not UPI_RE.match(upi):
        raise ValueError("Enter a valid UPI ID, e.g. name@okaxis.")
    if upi.lower() != confirm.strip().lower():
        raise ValueError("The two UPI IDs don't match. Please re-check.")
    return upi.lower()


def clean_reel_url(raw: str) -> str:
    url = raw.strip()
    if not REEL_URL_RE.match(url):
        raise ValueError(
            "Paste the full Instagram reel link, e.g. https://www.instagram.com/reel/abc123/"
        )
    return url.split("?")[0]


def clean_name(raw: str) -> str:
    name = " ".join(raw.split())
    if not 2 <= len(name) <= 80:
        raise ValueError("Enter your name or company name (2–80 characters).")
    return name


def clean_message(raw: str) -> str:
    message = raw.strip()
    if len(message) < 5:
        raise ValueError("Please describe your query in a few words.")
    if len(message) > 2000:
        raise ValueError("Please keep your message under 2000 characters.")
    return message


AUDIO_URL_RE = re.compile(r"instagram\.com/reels?/audio/(\d+)")


def clean_audio(raw: str) -> str:
    """Instagram audio link (or bare audio ID) -> audio ID. Empty input is allowed."""
    raw = raw.strip()
    if not raw:
        return ""
    if raw.isdigit():
        return raw
    m = AUDIO_URL_RE.search(raw)
    if not m:
        raise ValueError(
            "Paste the Instagram audio link, e.g. https://www.instagram.com/reels/audio/1234567890/"
        )
    return m.group(1)


def clean_pin(pin: str, confirm: str | None = None) -> str:
    pin = pin.strip()
    if not re.fullmatch(r"\d{4,6}", pin):
        raise ValueError("Your PIN must be 4 to 6 digits.")
    if confirm is not None and pin != confirm.strip():
        raise ValueError("The two PINs don't match.")
    return pin
