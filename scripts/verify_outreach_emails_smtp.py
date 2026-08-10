"""
Verifies outreach candidate emails via a real SMTP RCPT-TO handshake — no
email is ever sent, the connection is closed with QUIT right after RCPT TO
and DATA is never issued. Runs from GitHub Actions (outreach-cron.yml)
because Render's free/hobby tier blocks outbound SMTP at the network level
(see app/email_utils.py's module docstring for the same constraint on
sending); a live diagnostic run confirmed GitHub-hosted runners do allow
outbound port 25.

Pulls a batch of unverified candidates from
/api/v1/admin/outreach/verification-queue and posts verdicts back to
/api/v1/admin/outreach/verification-results. This is the free counterpart
to verify_email_via_neverbounce() in app/outreach.py — both produce the
same result vocabulary (valid/invalid/catchall/unknown/disposable), consumed
identically by VERIFICATION_RESULT_CONFIDENCE on the server side.
"""
import os
import random
import smtplib
import socket
import string
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import dns.resolver
import requests

BASE_URL = os.environ.get("OUTREACH_BASE_URL", "https://ai-compass.in").rstrip("/")
SECRET = os.environ.get("OUTREACH_SECRET", "")
BATCH_LIMIT = int(os.environ.get("SMTP_VERIFY_BATCH_LIMIT", "80"))
MAX_WORKERS = int(os.environ.get("SMTP_VERIFY_MAX_WORKERS", "5"))
SMTP_TIMEOUT = 8  # seconds, covers connect + each command round-trip

HELO_DOMAIN = "ai-compass.in"
MAIL_FROM = "verify@ai-compass.in"


def _resolve_mx_hosts(domain):
    """MX hosts sorted by preference, falling back to the domain's own A
    record (implicit null-MX) if there's no MX record — same fallback
    _domain_has_mail_capability() in app/outreach.py uses.
    """
    try:
        answers = dns.resolver.resolve(domain, "MX", lifetime=6)
        return [str(r.exchange).rstrip(".") for r in sorted(answers, key=lambda r: r.preference)]
    except Exception:
        pass
    try:
        dns.resolver.resolve(domain, "A", lifetime=6)
        return [domain]
    except Exception:
        return []


def _random_local_part():
    return "probe-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


def check_email(email):
    """Returns one of: 'valid', 'invalid', 'catchall', 'unknown'."""
    if "@" not in email:
        return "unknown"
    domain = email.rsplit("@", 1)[-1].lower()
    mx_hosts = _resolve_mx_hosts(domain)
    if not mx_hosts:
        return "unknown"

    for mx_host in mx_hosts[:2]:  # top 2, in case the primary is unresponsive
        smtp = smtplib.SMTP(timeout=SMTP_TIMEOUT)
        try:
            smtp.connect(mx_host, 25)
            smtp.helo(HELO_DOMAIN)
            smtp.mail(MAIL_FROM)

            real_code, _ = smtp.rcpt(email)
            bogus_code, _ = smtp.rcpt(f"{_random_local_part()}@{domain}")

            real_ok = 200 <= real_code < 300
            bogus_ok = 200 <= bogus_code < 300

            if real_ok and bogus_ok:
                return "catchall"  # domain accepts everything — can't confirm the mailbox itself
            if real_ok:
                return "valid"
            if 500 <= real_code < 600:
                return "invalid"
            return "unknown"  # 4xx (e.g. greylisting) or an unexpected response
        except (smtplib.SMTPException, OSError, socket.timeout):
            continue  # try the next MX host
        finally:
            try:
                smtp.quit()
            except Exception:
                try:
                    smtp.close()
                except Exception:
                    pass

    return "unknown"


def main():
    if not SECRET:
        print("ERROR: OUTREACH_SECRET is not set.", file=sys.stderr)
        sys.exit(1)

    headers = {"X-Outreach-Secret": SECRET}
    resp = requests.get(
        f"{BASE_URL}/api/v1/admin/outreach/verification-queue",
        headers=headers, params={"limit": BATCH_LIMIT}, timeout=30,
    )
    resp.raise_for_status()
    candidates = resp.json().get("candidates", [])
    print(f"Fetched {len(candidates)} candidate(s) to verify.")

    if not candidates:
        print("Nothing to verify.")
        return

    results = []
    counts = {"valid": 0, "invalid": 0, "catchall": 0, "unknown": 0}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(check_email, c["email"]): c for c in candidates}
        for future in as_completed(futures):
            c = futures[future]
            try:
                verdict = future.result()
            except Exception as e:
                print(f"  {c['email']}: ERROR {e}")
                verdict = "unknown"
            counts[verdict] = counts.get(verdict, 0) + 1
            print(f"  {c['email']}: {verdict}")
            results.append({"id": c["id"], "verification_result": verdict})

    post_resp = requests.post(
        f"{BASE_URL}/api/v1/admin/outreach/verification-results",
        headers=headers, json={"results": results}, timeout=30,
    )
    post_resp.raise_for_status()
    updated = post_resp.json().get("updated", 0)

    print(f"\nSummary: {counts}")
    print(f"Persisted {updated} verification result(s).")


if __name__ == "__main__":
    main()
