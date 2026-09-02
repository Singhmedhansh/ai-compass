"""Canonical brand constants: the addresses and the From line.

One place, because these strings were previously spread across a React page,
four legal pages, an inline HTML email in auth.py, a Jinja footer and two
env-var defaults — and they had already drifted. A founder reading the refund
policy was told to write to a personal Gmail; the same site's checkout error
told them to write to help@. Both cannot be right, and neither reads as a
business.

The split is deliberate and is what /contact now explains:

  SUPPORT_EMAIL  help@   — anything about the product or the catalogue,
                           including "which tier should I buy". Answering a
                           pre-sales question is support, not billing.
  BILLING_EMAIL  admin@  — money and urgency: a charge that looks wrong, a
                           double charge, a payment we could not confirm, a
                           listing that did not appear after payment.

DEFAULT_SENDER is a real, monitored mailbox rather than no-reply@. Gmail files
mail by the From line before a human ever sees the body, and no-reply@ is one
of the clearest bulk-sender tells there is — it costs deliverability on
exactly the transactional mail (invoices, "you are live") that must arrive.
Reply-To is then not needed to make a reply land somewhere real.
"""

import os

SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "help@ai-compass.in")
BILLING_EMAIL = os.environ.get("BILLING_EMAIL", "admin@ai-compass.in")

# The From line for every outbound message that is not cold outreach
# (app/outreach.py keeps its own, signed personally on purpose).
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "medhansh.singh@ai-compass.in")
DEFAULT_SENDER = os.environ.get("RESEND_FROM", f"AI Compass <{SENDER_EMAIL}>")

SITE_NAME = "AI Compass"
SITE_URL = "https://ai-compass.in"


def brand_context():
    """Template vars injected into every render — see the context processor in
    app/__init__. Emails and web pages read the same names."""
    from datetime import datetime, timezone

    return {
        "support_email": SUPPORT_EMAIL,
        "billing_email": BILLING_EMAIL,
        "sender_email": SENDER_EMAIL,
        "site_name": SITE_NAME,
        "site_url": SITE_URL,
        "current_year": datetime.now(timezone.utc).year,
    }
