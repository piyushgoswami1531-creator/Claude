"""Host (team) pages: login, team accounts, submissions, payouts, queries, exports."""

import csv
import io
import os
import re
import tempfile
from datetime import datetime

from fastapi import BackgroundTasks, Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import RedirectResponse, Response

from . import auth, validation
from .db import IST, STATUSES, TICKET_STATUSES
from .digest import build_digest
from .planner import current_plan, group_by_day, today_ist
from .reels import verify_pending
from .web import Ctx, csv_safe, format_ist


def _safe_next(url: str) -> str:
    return url if url.startswith("/admin") and not url.startswith("//") else "/admin"


def _csv_response(header: list[str], rows: list[list], filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    for row in rows:
        writer.writerow([csv_safe(v) for v in row])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def register(app: FastAPI, ctx: Ctx) -> None:
    db = ctx.db
    host = Depends(ctx.require_host)

    # --- login / team ------------------------------------------------------

    @app.get("/login")
    def login_form(request: Request, next: str = "/admin"):
        if ctx.current_host(request):
            return RedirectResponse(_safe_next(next))
        return ctx.render(request, "login.html", {
            "next": _safe_next(next), "errors": [],
            "disabled": not ctx.host_login_possible(),
        })

    @app.post("/login")
    def login(request: Request, username: str = Form(...), password: str = Form(...),
              next: str = Form("/admin")):
        problem = ctx.check_host_password(username, password)
        if problem:
            return ctx.render(request, "login.html", {
                "next": _safe_next(next), "errors": [problem], "username": username,
                "disabled": not ctx.host_login_possible(),
            }, status_code=400)
        response = RedirectResponse(_safe_next(next), status_code=303)
        ctx.start_session(request, response, {"role": "host", "user": username.strip().lower()},
                          auth.HOST_SESSION_SECONDS)
        return response

    @app.get("/admin/team")
    def team(request: Request, user: str = host):
        return ctx.render(request, "admin_team.html", {
            "stats": db.stats(), "hosts": db.list_hosts(), "owner": ctx.owner_username(),
            "is_owner": ctx.is_owner(user), "me": user, "errors": [],
            "saved": request.query_params.get("saved"),
        })

    @app.post("/admin/team")
    def add_host(request: Request, username: str = Form(...), name: str = Form(""),
                 password: str = Form(...), user: str = host):
        if not ctx.is_owner(user):
            raise HTTPException(403, "Only the owner account can add team members.")
        username = username.strip().lower()
        errors = []
        if not re.fullmatch(r"[a-z0-9._-]{3,30}", username):
            errors.append("Username: 3–30 letters, numbers, dots, dashes or underscores.")
        elif username == ctx.owner_username().lower() or db.get_host(username):
            errors.append("That username is already taken.")
        if len(password) < 10:
            errors.append("Password must be at least 10 characters.")
        if errors:
            return ctx.render(request, "admin_team.html", {
                "stats": db.stats(), "hosts": db.list_hosts(), "owner": ctx.owner_username(),
                "is_owner": True, "me": user, "errors": errors,
            }, status_code=400)
        db.add_host(username, name.strip(), auth.hash_secret(password))
        return RedirectResponse("/admin/team?saved=added", status_code=303)

    @app.post("/admin/team/{username}/delete")
    def remove_host(username: str, user: str = host):
        if not ctx.is_owner(user):
            raise HTTPException(403, "Only the owner account can remove team members.")
        db.delete_host(username)
        return RedirectResponse("/admin/team?saved=removed", status_code=303)

    @app.post("/admin/team/password")
    def change_password(request: Request, current: str = Form(...), new: str = Form(...),
                        user: str = host):
        if ctx.is_owner(user):
            raise HTTPException(400, "The owner password is set with ADMIN_PASSWORD on the server.")
        if ctx.check_host_password(user, current):
            raise HTTPException(400, "Current password is wrong.")
        if len(new) < 10:
            raise HTTPException(400, "New password must be at least 10 characters.")
        db.set_host_password(user, auth.hash_secret(new))
        return RedirectResponse("/admin/team?saved=password", status_code=303)

    # --- submissions ---------------------------------------------------------

    @app.get("/admin")
    def admin(request: Request, status_filter: str | None = None,
              campaign: int | None = None, user: str = host):
        if status_filter not in STATUSES:
            status_filter = None
        return ctx.render(request, "admin.html", {
            "stats": db.stats(),
            "campaigns": db.list_campaigns(),
            "submissions": db.list_submissions(status_filter, campaign),
            "statuses": STATUSES,
            "status_filter": status_filter,
            "campaign_filter": campaign,
            "verify_on": ctx.fetcher is not None,
            "verifying": request.query_params.get("verifying") == "1",
            "pin_reset": request.query_params.get("pin_reset"),
        })

    @app.post("/admin/verify")
    def verify_reels(background_tasks: BackgroundTasks, user: str = host):
        if ctx.fetcher is None:
            raise HTTPException(400, "Reel checks are off: set APIFY_TOKEN.")
        # An Apify run takes ~20-60s, so run it after the response is sent.
        background_tasks.add_task(verify_pending, db, ctx.fetcher, ctx.notifier)
        return RedirectResponse("/admin?verifying=1", status_code=303)

    @app.post("/admin/submissions/{submission_id}")
    def update_submission(
        submission_id: int,
        new_status: str = Form(...),
        amount: int = Form(...),
        note: str = Form(""),
        upi_id: str = Form(""),
        next_url: str = Form("/admin"),
        user: str = host,
    ):
        if new_status not in STATUSES or amount < 0:
            raise HTTPException(400, "Invalid status or amount.")
        if db.get_submission(submission_id) is None:
            raise HTTPException(404)
        new_upi = None
        if upi_id.strip():
            try:
                new_upi = validation.clean_upi(upi_id, upi_id)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
        db.update_submission(submission_id, new_status, amount, note.strip(), new_upi)
        return RedirectResponse(_safe_next(next_url), status_code=303)

    @app.post("/admin/submissions/{submission_id}/reset-pin")
    def reset_creator_pin(submission_id: int, user: str = host):
        """Forgotten PIN: remove it; the creator sets a new one at their next login."""
        sub = db.get_submission(submission_id)
        if sub is None:
            raise HTTPException(404)
        db.delete_creator_account(sub["ig_handle"], sub["whatsapp"])
        return RedirectResponse(f"/admin?pin_reset={sub['ig_handle']}", status_code=303)

    @app.get("/admin/export.csv")
    def export_csv(status_filter: str | None = None, campaign: int | None = None,
                   user: str = host):
        if status_filter not in STATUSES:
            status_filter = None
        rows = [
            [r["id"], r["campaign_name"], r["ig_handle"], r["whatsapp"], r["upi_id"],
             r["amount"], r["status"], r["reel_url"], format_ist(r["submitted_at"]),
             format_ist(r["paid_at"]), r["note"]]
            for r in db.list_submissions(status_filter, campaign)
        ]
        return _csv_response(
            ["id", "campaign", "ig_handle", "whatsapp", "upi_id", "amount", "status",
             "reel_url", "submitted_at_ist", "paid_at_ist", "note"],
            rows, f"payments-{status_filter or 'all'}.csv")

    @app.get("/admin/backup")
    def backup(user: str = host):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "backup.db")
            db.backup_to(path)
            with open(path, "rb") as f:
                data = f.read()
        return Response(data, media_type="application/vnd.sqlite3", headers={
            "Content-Disposition": f'attachment; filename="praabhaav-backup-{today_ist()}.db"'})

    # --- payouts ---------------------------------------------------------------

    @app.get("/admin/payouts")
    def payouts(request: Request, user: str = host):
        plan = current_plan(db)
        today = today_ist()
        start_of_today = datetime(today.year, today.month, today.day, tzinfo=IST)
        return ctx.render(request, "admin_payouts.html", {
            "stats": db.stats(),
            "daily_limit": db.get_daily_limit(),
            "paid_today": db.paid_since(start_of_today),
            "today": today,
            "todays": [p for p in plan if p.pay_date == today],
            "days": [d for d in group_by_day(plan) if d[0] != today],
            "over_limit": [p for p in plan if p.over_limit],
        })

    @app.post("/admin/payouts/limit")
    def set_limit(daily_limit: int = Form(...), user: str = host):
        if daily_limit <= 0:
            raise HTTPException(400, "Daily limit must be more than ₹0.")
        db.set_daily_limit(daily_limit)
        return RedirectResponse("/admin/payouts", status_code=303)

    @app.post("/admin/payouts/mark-paid")
    def mark_paid(submission_ids: list[int] = Form([]), user: str = host):
        db.mark_paid(submission_ids)
        return RedirectResponse("/admin/payouts", status_code=303)

    @app.get("/admin/payouts/today.csv")
    def todays_batch_csv(user: str = host):
        today = today_ist()
        rows = [
            [s["id"], s["ig_handle"], s["upi_id"], s["amount"], s["campaign_name"], s["whatsapp"]]
            for s in (p.submission for p in current_plan(db) if p.pay_date == today)
        ]
        return _csv_response(["id", "ig_handle", "upi_id", "amount", "campaign", "whatsapp"],
                             rows, f"payouts-{today}.csv")

    # --- queries -----------------------------------------------------------------

    @app.get("/admin/tickets")
    def admin_tickets(request: Request, status_filter: str | None = "escalated",
                      user: str = host):
        if status_filter not in TICKET_STATUSES:
            status_filter = None
        return ctx.render(request, "admin_tickets.html", {
            "tickets": db.list_tickets(status_filter), "statuses": TICKET_STATUSES,
            "status_filter": status_filter, "stats": db.stats(),
            "agent_mode": "Claude" if ctx.agent.uses_claude else "keyword rules (no API key)",
            "telegram_on": ctx.notifier.configured,
        })

    @app.post("/admin/tickets/{ticket_id}")
    def update_ticket(ticket_id: int, new_status: str = Form(...), team_reply: str = Form(""),
                      user: str = host):
        if new_status not in TICKET_STATUSES:
            raise HTTPException(400, "Invalid status.")
        if db.get_ticket(ticket_id) is None:
            raise HTTPException(404)
        db.update_ticket(ticket_id, new_status, team_reply.strip())
        return RedirectResponse("/admin/tickets", status_code=303)

    @app.post("/admin/digest")
    def send_digest(request: Request, user: str = host):
        text = build_digest(db, ctx.public_url(request))
        sent = ctx.notifier.send(text)
        return Response(
            ("Sent to Telegram.\n\n" if sent else "Telegram not configured. Digest:\n\n") + text,
            media_type="text/plain; charset=utf-8",
        )
