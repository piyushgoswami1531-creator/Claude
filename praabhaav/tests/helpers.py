"""Shared helpers for tests that act as creators.

Submitting a reel logs the creator in (cookie), so helpers clear cookies
afterwards; otherwise the next 'creator' in a test would reuse that session.
"""

PIN = "1234"


def submit_reel(client, data: dict):
    data = {"pin": PIN, "pin_confirm": PIN, **data}
    r = client.post("/submit", data=data)
    client.cookies.clear()
    return r


def login_creator(client, handle: str, whatsapp: str, pin: str = PIN):
    client.cookies.clear()
    return client.post("/me/login", data={"ig_handle": handle, "whatsapp": whatsapp, "pin": pin})


def creator_page(client, handle: str, whatsapp: str, pin: str = PIN):
    """Log in as a creator, return the /me response, then log out."""
    r = login_creator(client, handle, whatsapp, pin)
    client.cookies.clear()
    return r
