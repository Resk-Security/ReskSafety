"""Newsletter subscription endpoint for the ReskLayer waitlist."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import get_current_admin
from resk_app.config import get_settings
from resk_app.db.session import get_db
from resk_app.limiter import limiter
from resk_app.models.newsletter import NewsletterSubscriber

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/newsletter", tags=["newsletter"])


class NewsletterSubscribeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field("", max_length=128)
    email: EmailStr
    company: str | None = Field(None, max_length=128)
    website: str | None = Field(None, max_length=256, alias="_website")


class NewsletterSubscribeResponse(BaseModel):
    message: str
    email: str


def _send_welcome_email(email: str, name: str) -> bool:
    """Send a welcome email via Resend. Returns True on success."""
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping welcome email for %s", email)
        return False

    try:
        import httpx

        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": "ReskLayer <contact@resk.fr>",
                "to": [email],
                "subject": "Welcome to the ReskLayer Waitlist",
                "html": f"""<h2>Welcome to ReskLayer, {name}!</h2>
<p>Thank you for joining the ReskLayer waitlist. You're now among the first to know about:</p>
<ul>
  <li><strong>Early access</strong> to the ReskLayer platform</li>
  <li><strong>Security insights</strong> on LLM protection and prompt injection threats</li>
  <li><strong>Product updates</strong> and new feature announcements</li>
  <li><strong>Exclusive content</strong> on AI security best practices</li>
</ul>
<p>In the meantime, try the <a href="https://demo.resk.fr">live demo</a> or check out the <a href="https://github.com/Resk-Security/Resk">source code on GitHub</a>.</p>
<p>— The ReskLayer Team</p>""",
            },
            timeout=15,
        )
        if resp.is_error:
            logger.error("Resend API error: %s %s", resp.status_code, resp.text)
            return False
        return True
    except Exception as exc:
        logger.error("Failed to send welcome email via Resend: %s", exc)
        return False


def _send_owner_notification(name: str, email: str, company: str | None) -> bool:
    """Notify the team that a new subscriber signed up (includes their email)."""
    settings = get_settings()
    if not settings.RESEND_API_KEY:
        logger.warning(
            "RESEND_API_KEY not set — skipping owner notification for new subscriber %s <%s>",
            name, email,
        )
        return False

    try:
        import httpx

        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": "ReskSafety Demo <contact@resk.fr>",
                "to": [settings.NOTIFY_EMAIL],
                "subject": f"New demo signup: {email}",
                "html": f"""<h2>New newsletter signup on demo.resk.fr</h2>
<ul>
  <li><strong>Name:</strong> {name}</li>
  <li><strong>Email:</strong> {email}</li>
  <li><strong>Company:</strong> {company or "—"}</li>
</ul>""",
            },
            timeout=15,
        )
        if resp.is_error:
            logger.error("Resend owner notification error: %s %s", resp.status_code, resp.text)
            return False
        return True
    except Exception as exc:
        logger.error("Failed to send owner notification: %s", exc)
        return False


@router.post("/subscribe", response_model=NewsletterSubscribeResponse)
@limiter.limit("5/minute")
def subscribe(
    req: NewsletterSubscribeRequest,
    request: Request,  # noqa: ARG001 - required by slowapi
    db: Session = Depends(get_db),  # noqa: B008
):
    if req.website:
        logger.warning("Honeypot triggered — bot detected on subscribe: %s", req.email)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request.")

    existing = db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == req.email)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already on the waitlist.",
        )

    subscriber_name = req.name.strip() or "there"
    subscriber = NewsletterSubscriber(
        name=subscriber_name,
        email=req.email,
        company=req.company or None,
    )
    db.add(subscriber)
    db.commit()
    db.refresh(subscriber)

    logger.info("New newsletter subscriber: %s <%s>", subscriber_name, req.email)

    _send_welcome_email(req.email, subscriber_name)
    _send_owner_notification(subscriber_name, req.email, req.company)

    return NewsletterSubscribeResponse(
        message="You've been added to the ReskLayer waitlist!",
        email=req.email,
    )


@router.get("/subscribers")
def list_subscribers(
    db: Session = Depends(get_db),  # noqa: B008
    _admin=Depends(get_current_admin),  # noqa: B008
):
    """List all subscribers (admin only)."""
    subscribers = (
        db.execute(
            select(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc())
        )
        .scalars()
        .all()
    )

    return [
        {
            "id": str(s.id),
            "name": s.name,
            "email": s.email,
            "company": s.company,
            "created_at": s.created_at.isoformat(),
        }
        for s in subscribers
    ]
