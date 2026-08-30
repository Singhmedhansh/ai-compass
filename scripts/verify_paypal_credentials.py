"""Confirm PayPal REST credentials can actually verify a payment.

Runs the exact OAuth call verify_paypal_order() depends on, so a green
result here means /submit can verify a real order. Reads .env (or the
process environment) and never prints the secret.

    python scripts/verify_paypal_credentials.py

Optionally pass a real order ID to check the full lookup path end-to-end:

    python scripts/verify_paypal_credentials.py 5XY12345678901234
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_dotenv(path=".env"):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main():
    load_dotenv()

    from app.payments import (
        _paypal_access_token,
        _paypal_base_url,
        looks_like_hosted_button_id,
    )

    client_id = os.environ.get("PAYPAL_CLIENT_ID", "")
    secret = os.environ.get("PAYPAL_CLIENT_SECRET", "")
    mode = os.environ.get("PAYPAL_MODE", "live")

    print("PayPal credential check")
    print("  mode          : %s" % mode)
    print("  api base      : %s" % _paypal_base_url(mode))
    print("  client id     : %s (%d chars)" % (
        (client_id[:10] + "…") if client_id else "(unset)", len(client_id)))
    print("  client secret : %s" % ("set (%d chars)" % len(secret) if secret else "(unset)"))

    problems = []
    if not client_id:
        problems.append("PAYPAL_CLIENT_ID is unset.")
    if not secret:
        problems.append("PAYPAL_CLIENT_SECRET is unset.")
    if looks_like_hosted_button_id(client_id):
        problems.append(
            "PAYPAL_CLIENT_ID looks like a hosted-button ID (~25 chars). Use the "
            "Client ID from a REST app at developer.paypal.com (~80 chars)."
        )
    if problems:
        print("\nFAILED — cannot even attempt authentication:")
        for p in problems:
            print("  - %s" % p)
        return 1

    token = _paypal_access_token()
    if not token:
        print(
            "\nFAILED — PayPal rejected these credentials.\n"
            "  Check the ID and secret come from the SAME app, and that\n"
            "  PAYPAL_MODE (%s) matches that app's environment." % mode
        )
        return 1

    print("\nOK — OAuth token acquired. /submit can verify payments.")

    order_id = sys.argv[1] if len(sys.argv) > 1 else ""
    if order_id:
        from app.payments import verify_paypal_order

        verified, detail = verify_paypal_order(order_id)
        print("\nOrder lookup for %s" % order_id)
        print("  verified : %s" % verified)
        print("  detail   : %s" % detail)
        if not verified:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
