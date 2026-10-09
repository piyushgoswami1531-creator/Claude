from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user, get_today
from ..models import User
from ..services import usage
from ..services.auth import COOKIE_NAME, DUMMY_HASH, create_token, hash_password, login_throttle, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        local, _, domain = v.partition("@")
        if not local or "." not in domain or " " in v:
            raise ValueError("Enter a valid email address.")
        return v


class Signup(Credentials):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Enter your name.")
        return v


class DeleteAccount(BaseModel):
    password: str


def _set_session(response: Response, user: User) -> None:
    s = get_settings()
    response.set_cookie(
        COOKIE_NAME, create_token(user.id), max_age=s.session_days * 86400,
        httponly=True, samesite="lax", secure=s.cookie_secure, path="/",
    )


def _me(db: Session, user: User, today: date) -> dict:
    s = get_settings()
    return {
        "id": user.id, "email": user.email, "name": user.name,
        "ai": {
            "mode": "live" if s.ai_live else "demo",
            "limit": s.daily_ai_limit if s.ai_live else None,
            "used_today": usage.used_today(db, user, today),
        },
    }


@router.post("/signup")
def signup(body: Signup, response: Response, db: Session = Depends(get_db), today: date = Depends(get_today)):
    if db.scalar(select(User.id).where(func.lower(User.email) == body.email)):
        raise HTTPException(409, "An account with this email already exists. Log in instead.")
    user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    _set_session(response, user)
    return _me(db, user, today)


@router.post("/login")
def login(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db),
          today: date = Depends(get_today)):
    key = f"{body.email}|{request.client.host if request.client else ''}"
    if login_throttle.blocked(key):
        raise HTTPException(429, "Too many failed attempts. Wait 5 minutes and try again.")
    user = db.scalar(select(User).where(func.lower(User.email) == body.email))
    # Always run the hash check so timing doesn't reveal whether the email exists.
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        login_throttle.fail(key)
        raise HTTPException(401, "Wrong email or password.")
    login_throttle.reset(key)
    _set_session(response, user)
    return _me(db, user, today)


@router.post("/logout")
def logout(response: Response):
    s = get_settings()
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=s.cookie_secure)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db), today: date = Depends(get_today)):
    return _me(db, user, today)


@router.delete("/me")
def delete_me(body: DeleteAccount, response: Response, user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    """Permanently delete the account and every plan, quiz and review in it."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(403, "Wrong password.")
    db.execute(delete(User).where(User.id == user.id))  # DB-level ON DELETE CASCADE removes the rest
    db.commit()
    logout(response)
    return {"ok": True}
