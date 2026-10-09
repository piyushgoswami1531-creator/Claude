"""Creator and client pages: reel submission, creator login + dashboard, queries."""

import secrets

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Request
from fastapi.responses import RedirectResponse

from . import auth, validation
from .db import DuplicateSubmission
from .notify import ticket_alert
from .planner import expected_dates
from .web import Ctx


def register(app: FastAPI, ctx: Ctx) -> None:
    db = ctx.db

    @app.get("/healthz")
    def healthz():
        db.get_setting("daily_limit")  # fails loudly if the database is unreachable
        return {"ok": True}

    @app.get("/")
    def home(request: Request):
        if ctx.current_host(request):
            return RedirectResponse("/admin")
        return ctx.render(request, "home.html")

    # --- reel submission ---------------------------------------------------

    @app.get("/submit")
    def submit_form(request: Request, campaign: int | None = None):
        return ctx.render(request, "submit.html", {
            "campaigns": db.list_campaigns(active_only=True),
            "values": {"campaign_id": campaign}, "errors": [],
        })

    @app.post("/submit")
    def submit(
        request: Request,
        campaign_id: int = Form(...),
        ig_handle: str = Form(""),
        whatsapp: str = Form(""),
        upi_id: str = Form(...),
        upi_confirm: str = Form(...),
        reel_url: str = Form(...),
        pin: str = Form(""),
        pin_confirm: str = Form(""),
    ):
        creator = ctx.current_creator(request)
        if creator:  # logged in: identity comes from the session, not the form
            ig_handle, whatsapp = creator["handle"], creator["phone"]
        values = {
            "campaign_id": campaign_id, "ig_handle": ig_handle, "whatsapp": whatsapp,
            "upi_id": upi_id, "upi_confirm": upi_confirm, "reel_url": reel_url,
        }
        errors: list[str] = []
        cleaned: dict = {}

        campaign = db.get_campaign(campaign_id)
        if campaign is None or not campaign["active"]:
            errors.append("Please choose a campaign.")
        checks = [
            ("ig_handle", lambda: validation.clean_ig_handle(ig_handle)),
            ("whatsapp", lambda: validation.clean_whatsapp(whatsapp)),
            ("upi_id", lambda: validation.clean_upi(upi_id, upi_confirm)),
            ("reel_url", lambda: validation.clean_reel_url(reel_url)),
        ]
        for name, check in checks:
            try:
                cleaned[name] = check()
            except ValueError as exc:
                errors.append(str(exc))

        new_pin = None
        if not errors and not creator:
            account = db.get_creator_account(cleaned["ig_handle"], cleaned["whatsapp"])
            if account:
                problem = ctx.check_creator_pin(cleaned["ig_handle"], cleaned["whatsapp"], pin)
                if problem:
                    errors.append(problem)
            else:
                try:
                    new_pin = validation.clean_pin(pin, pin_confirm)
                except ValueError as exc:
                    errors.append(str(exc))

        if not errors:
            try:
                db.add_submission(campaign_id, **cleaned)
            except DuplicateSubmission:
                errors.append("You've already submitted a reel for this campaign. "
                              "Open 'My payments' to track it.")

        if errors:
            return ctx.render(request, "submit.html", {
                "campaigns": db.list_campaigns(active_only=True), "values": values,
                "errors": errors,
            }, status_code=400)

        if new_pin:
            db.set_creator_pin(cleaned["ig_handle"], cleaned["whatsapp"], auth.hash_secret(new_pin))
        response = ctx.render(request, "submitted.html",
                              {"campaign": campaign, "ig_handle": cleaned["ig_handle"]})
        ctx.start_session(request, response, {
            "role": "creator", "handle": cleaned["ig_handle"], "phone": cleaned["whatsapp"],
        }, auth.CREATOR_SESSION_SECONDS)
        return response

    # --- creator login + dashboard ------------------------------------------

    @app.get("/status")
    def old_status_page():
        return RedirectResponse("/me")

    @app.get("/me")
    def me(request: Request):
        creator = ctx.current_creator(request)
        if not creator:
            return ctx.render(request, "me_login.html", {"values": {}, "errors": []})
        handle, phone = creator["handle"], creator["phone"]
        return ctx.render(request, "me.html", {
            "results": db.find_for_creator(handle, phone),
            "expected": expected_dates(db),
            "tickets": db.find_tickets_for_creator(handle, phone),
            "handle": handle,
        })

    @app.post("/me/login")
    def me_login(
        request: Request,
        ig_handle: str = Form(...),
        whatsapp: str = Form(...),
        pin: str = Form(...),
        pin_confirm: str = Form(""),
    ):
        values = {"ig_handle": ig_handle, "whatsapp": whatsapp}
        try:
            handle = validation.clean_ig_handle(ig_handle)
            phone = validation.clean_whatsapp(whatsapp)
        except ValueError as exc:
            return ctx.render(request, "me_login.html",
                              {"values": values, "errors": [str(exc)]}, status_code=400)

        if db.get_creator_account(handle, phone):
            problem = ctx.check_creator_pin(handle, phone, pin)
            if problem:
                return ctx.render(request, "me_login.html",
                                  {"values": values, "errors": [problem]}, status_code=400)
        else:
            # First login for creators who submitted before PINs existed.
            if not db.find_for_creator(handle, phone):
                return ctx.render(request, "me_login.html", {
                    "values": values,
                    "errors": ["No reels found for that Instagram handle and WhatsApp number. "
                               "Use the same details you submitted with."],
                }, status_code=400)
            if not pin_confirm:
                return ctx.render(request, "me_login.html",
                                  {"values": values, "errors": [], "set_pin": True})
            try:
                new_pin = validation.clean_pin(pin, pin_confirm)
            except ValueError as exc:
                return ctx.render(request, "me_login.html",
                                  {"values": values, "errors": [str(exc)], "set_pin": True},
                                  status_code=400)
            db.set_creator_pin(handle, phone, auth.hash_secret(new_pin))

        response = RedirectResponse("/me", status_code=303)
        ctx.start_session(request, response, {"role": "creator", "handle": handle, "phone": phone},
                          auth.CREATOR_SESSION_SECONDS)
        return response

    @app.post("/logout")
    def logout():
        response = RedirectResponse("/", status_code=303)
        auth.clear_session(response)
        return response

    # --- queries -------------------------------------------------------------

    @app.get("/query")
    def query_form(request: Request):
        return ctx.render(request, "query.html", {
            "campaigns": db.list_campaigns(active_only=True), "values": {}, "errors": [],
        })

    @app.post("/query")
    def submit_query(
        request: Request,
        background_tasks: BackgroundTasks,
        name: str = Form(""),
        whatsapp: str = Form(""),
        campaign_id: str = Form(""),
        message: str = Form(...),
    ):
        # Logged-in creators ask as themselves; everyone else asks as a client.
        # (Creator payment data is only ever used for the logged-in creator.)
        creator = ctx.current_creator(request)
        role = "creator" if creator else "client"
        values = {"name": name, "whatsapp": whatsapp, "message": message,
                  "campaign_id": int(campaign_id) if campaign_id.isdigit() else None}
        errors: list[str] = []
        if creator:
            name, phone = creator["handle"], creator["phone"]
        else:
            try:
                name = validation.clean_name(name)
            except ValueError as exc:
                errors.append(str(exc))
            try:
                phone = validation.clean_whatsapp(whatsapp)
            except ValueError as exc:
                errors.append(str(exc))
        try:
            message = validation.clean_message(message)
        except ValueError as exc:
            errors.append(str(exc))
        campaign = db.get_campaign(values["campaign_id"]) if values["campaign_id"] else None
        if errors:
            return ctx.render(request, "query.html", {
                "campaigns": db.list_campaigns(active_only=True), "values": values,
                "errors": errors,
            }, status_code=400)

        records = db.find_for_creator(name, phone) if creator else []
        # Clients only get the campaign's name and song, never creator data.
        campaign_info = {"name": campaign["name"], "song": campaign["song"]} if campaign else None
        decision = ctx.agent.handle(
            role=role, name=name, message=message, records=records,
            campaign_info=campaign_info,
            expected=expected_dates(db) if creator else None,
        )
        ticket_id = db.add_ticket(
            access_token=secrets.token_urlsafe(16), role=role, name=name, contact=phone,
            campaign_id=campaign["id"] if campaign else None, message=message,
            category=decision.category, priority=decision.priority,
            ai_reply=decision.reply, team_summary=decision.team_summary,
            handled_by=decision.handled_by, escalated=decision.escalate,
        )
        ticket = db.get_ticket(ticket_id)
        if decision.escalate:
            background_tasks.add_task(ctx.notifier.send,
                                      ticket_alert(ticket, ctx.public_url(request)))
        return ctx.render(request, "ticket.html", {
            "ticket": ticket, "just_created": True,
            "ticket_url": f"/tickets/{ticket_id}?token={ticket['access_token']}",
        })

    @app.get("/tickets/{ticket_id}")
    def view_ticket(request: Request, ticket_id: int, token: str = ""):
        ticket = db.get_ticket(ticket_id)
        if ticket is None or not secrets.compare_digest(
            ticket["access_token"].encode(), token.encode()
        ):
            raise HTTPException(404, "Query not found")
        return ctx.render(request, "ticket.html",
                          {"ticket": ticket, "just_created": False, "ticket_url": None})
