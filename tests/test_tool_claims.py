"""Claimed listings: a maker owning their own page (app/claims.py).

The rules these pin, in the order they matter:

  * A domain match auto-approves, because it checks a fact. Everything else
    waits for a human, because the cost of a wrong approval is edit rights
    over somebody else's listing.
  * One listing, one owner.
  * A maker can edit their own copy — and cannot reach anything that was
    sold, scored or curated. "Claim your listing" must never become "grant
    yourself placement".
  * Every edit is logged, which is what makes applying it immediately
    reversible rather than merely fast.
"""
import json
import os
import tempfile

import pytest

from app import claims, create_app, db
from app.models import CatalogTool, Review, ToolClaim, ToolEdit, User
from app.tool_cache import get_cached_tools, refresh_tools_cache


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    refresh_tools_cache()
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _tool(slug="claimable-tool", name="Claimable Tool", url="https://claimable.example.com"):
    data = {
        "slug": slug, "name": name, "category": "Productivity",
        "description": "The original description.", "tagline": "Original tagline.",
        "link": url, "features": ["One", "Two"], "sponsored": False,
    }
    db.session.add(CatalogTool(slug=slug, name=name, category="Productivity",
                               hidden=False, data=json.dumps(data)))
    db.session.commit()
    refresh_tools_cache()


def _user(app, email, is_admin=False):
    with app.app_context():
        u = User(email=email, is_admin=is_admin)
        db.session.add(u)
        db.session.commit()
        return u.id


def _login(client, user_id):
    # Cleared first: several tests switch identity mid-test (owner ->
    # imposter -> admin), and Flask-Login's session protection rejects a
    # swapped _user_id left beside the previous session's _id, which shows up
    # as a confusing 401 rather than a permission error.
    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True


# Claims are rate-limited to 10/hour per IP and this module files more than
# that. Each call gets its own client address so the limiter measures what it
# is meant to (one person mass-claiming listings) rather than the test file.
_IP_SEQ = iter(range(1, 250))


# A real (tiny) PNG. The server sniffs magic bytes rather than trusting the
# declared MIME, so a fake payload cannot stand in here.
_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _claim(client, slug="claimable-tool", **payload):
    return client.post(
        f"/api/v1/claims/{slug}",
        environ_base={"REMOTE_ADDR": f"10.1.0.{next(_IP_SEQ)}"},
        json=payload,
    )


# --- who gets approved ------------------------------------------------------


def test_a_matching_email_domain_is_approved_immediately(client, app):
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)

    resp = _claim(client)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["claim"]["status"] == "approved"
    assert body["claim"]["verified_domain_match"] is True


def test_a_stranger_waits_for_a_human(client, app):
    with app.app_context():
        _tool()
    uid = _user(app, "someone@gmail.com")
    _login(client, uid)

    resp = _claim(client, evidence="I am the CTO.")
    assert resp.status_code == 201
    assert resp.get_json()["claim"]["status"] == "pending"

    # …and gets nothing until then.
    with app.app_context():
        assert claims.user_can_edit(User.query.get(uid), "claimable-tool") is False


def test_a_subdomain_does_not_count_as_a_match(app):
    """The crude domain check must fail closed. A stricter parse would be more
    correct and would also start accepting claims across subdomains, which is
    the direction this must not be wrong in."""
    assert claims.domain_matches("me@evil.claimable.example.com",
                                 "https://claimable.example.com") is False
    assert claims.domain_matches("me@claimable.example.com",
                                 "https://www.claimable.example.com") is True


def test_one_listing_has_one_owner(client, app):
    with app.app_context():
        _tool()
    first = _user(app, "founder@claimable.example.com")
    _login(client, first)
    _claim(client)

    second = _user(app, "imposter@claimable.example.com")
    _login(client, second)
    resp = _claim(client)
    assert resp.status_code == 409

    with app.app_context():
        approved = ToolClaim.query.filter_by(tool_slug="claimable-tool", status="approved").all()
        assert len(approved) == 1
        assert approved[0].user_id == first


def test_an_admin_cannot_approve_two_claims_on_one_listing(client, app):
    """The realistic race: two people file before either is decided, and the
    admin works down the queue. The second approval has to be refused, or two
    strangers end up holding edit rights on the same page.

    (Filing against an ALREADY-approved listing never gets this far — it is
    refused at 409 without creating a competing row.)
    """
    with app.app_context():
        _tool()
    first = _user(app, "one@gmail.com")
    _login(client, first)
    _claim(client, evidence="I am the founder.")

    second = _user(app, "two@gmail.com")
    _login(client, second)
    _claim(client, evidence="No, I am.")

    with app.app_context():
        pending = ToolClaim.query.filter_by(status="pending").order_by(ToolClaim.id).all()
        assert len(pending) == 2
        assert claims.decide_claim(pending[0], "approved") is None
        assert claims.decide_claim(pending[1], "approved") == "already_claimed_by_another_user"
        assert ToolClaim.query.filter_by(status="approved").count() == 1


# --- what a claim lets you do ----------------------------------------------


def test_an_owner_can_edit_their_own_copy(client, app):
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing", json={
        "description": "We rewrote this ourselves.",
        "features": ["Fast", "Cheap", "Good"],
    })
    assert resp.status_code == 200, resp.get_json()

    with app.app_context():
        record = json.loads(CatalogTool.query.filter_by(slug="claimable-tool").one().data)
        assert record["description"] == "We rewrote this ourselves."
        assert record["features"] == ["Fast", "Cheap", "Good"]

    # The public catalog serves the edit, not a stale cache.
    served = next(t for t in get_cached_tools() if t["slug"] == "claimable-tool")
    assert served["description"] == "We rewrote this ourselves."


def test_a_non_owner_cannot_edit(client, app):
    with app.app_context():
        _tool()
    _user(app, "founder@claimable.example.com")
    stranger = _user(app, "stranger@gmail.com")
    _login(client, stranger)

    resp = client.patch("/api/v1/claims/claimable-tool/listing",
                        json={"description": "Mine now."})
    assert resp.status_code == 403
    with app.app_context():
        record = json.loads(CatalogTool.query.filter_by(slug="claimable-tool").one().data)
        assert record["description"] == "The original description."


def test_an_owner_cannot_grant_themselves_placement(client, app):
    """The line that makes claiming safe to offer at all: everything sold,
    scored or curated is unreachable from the founder edit path."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing", json={
        "description": "Legit edit.",
        "sponsored": True,
        "featured": True,
        "rating": 5,
        "editorial_blurb": "Editor's pick!",
    })
    assert resp.status_code == 200

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="claimable-tool").one()
        record = json.loads(row.data)
        assert record["description"] == "Legit edit."
        assert record.get("sponsored") is False
        assert record.get("featured") in (None, False)
        assert record.get("rating") in (None, 0, 0.0)
        assert row.editorial_blurb is None


def test_changing_where_the_listing_points_is_captured_not_applied(client, app):
    """The invariant is unchanged — a maker cannot move where their listing
    points — but the request no longer bounces.

    It used to 400 with "these need a human", which was honest and threw the
    maker's words away: they then had to retype them into an email to admin@,
    and mostly did not. Now the edit is accepted, the link is still NOT
    touched, and the request comes back under `requested` for an admin to
    action. The security property (the destination of every reader and every
    tracked click) is exactly as strong; only the dead end is gone."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing", json={
        "description": "A real edit, alongside the request.",
        "link": "https://somewhere-else.example.com",
    })
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["requested"]["link"] == "https://somewhere-else.example.com"

    with app.app_context():
        record = json.loads(CatalogTool.query.filter_by(slug="claimable-tool").one().data)
        # Not moved.
        assert record["link"] == "https://claimable.example.com"
        # And the rest of the edit still went live, which is the point: a
        # gated field must not hold the maker's other corrections hostage.
        assert record["description"] == "A real edit, alongside the request."
        assert "_change_requests" not in record


def test_a_gated_request_alone_changes_nothing_but_is_still_reported(client, app):
    """An edit that touches ONLY a gated field has nothing to publish. It must
    still come back as a request rather than as a silent no-op, or the maker
    has no way to tell that we heard them."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing", json={
        "category": "Coding",
    })
    assert resp.status_code == 200
    assert resp.get_json()["requested"] == {"category": "Coding"}

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="claimable-tool").one()
        assert row.category == "Productivity"
        assert json.loads(row.data)["category"] == "Productivity"


def test_a_maker_can_rename_their_own_tool_without_moving_its_url(client, app):
    """`name` is founder-editable and `link` is not, which looks inconsistent
    until you ask what each one can do.

    A rename changes a label. The slug is the key upsert_tool writes against
    and this path never touches it, so the URL, every inbound link and every
    OutboundClick row stay where they were. Products rebrand, and a maker who
    cannot fix their own product's name does not really own the listing."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing",
                        json={"name": "Claimable Pro"})
    assert resp.status_code == 200

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="claimable-tool").one()
        assert row.name == "Claimable Pro"
        # The address did not move.
        assert row.slug == "claimable-tool"
        assert json.loads(row.data)["slug"] == "claimable-tool"
        # And it is logged like any other edit, so it is reversible.
        assert ToolEdit.query.filter_by(tool_slug="claimable-tool", field="name").count() == 1


def test_a_logo_upload_lands_on_the_row_and_on_the_record(client, app):
    """A claimed maker can replace the logo, and both halves have to happen:
    the bytes on the catalog row (served from /logo/tool/<slug>) and a URL in
    the record, which is the only thing ToolLogo ever reads. Writing one
    without the other means an upload that succeeds and never appears."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing",
                        json={"logo": _PNG_DATA_URL})
    assert resp.status_code == 200

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="claimable-tool").one()
        assert row.logo_data is not None
        assert row.logo_mime == "image/png"
        record = json.loads(row.data)
        assert record["logo_url"].startswith("/logo/tool/claimable-tool?v=")
        # `icon` is what ToolLogo checks FIRST — a stale one here is how an
        # upload lands in the database and still never reaches a card.
        assert record["icon"] == record["logo_url"]

    served = client.get("/logo/tool/claimable-tool")
    assert served.status_code == 200
    assert served.mimetype == "image/png"


def test_a_logo_that_is_not_really_an_image_is_refused(client, app):
    """The declared MIME in a data: URL is whatever the sender says it is, so
    the server sniffs the magic bytes. This is the same check the submit form
    relies on (app/tool_logos.py) reached through a different door — and this
    door is open to anyone who has claimed a listing."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    resp = client.patch("/api/v1/claims/claimable-tool/listing", json={
        "logo": "data:image/png;base64,bm90LWEtcG5nLWF0LWFsbA==",
    })
    assert resp.status_code == 400
    assert "PNG" in resp.get_json()["error"]

    with app.app_context():
        assert CatalogTool.query.filter_by(slug="claimable-tool").one().logo_data is None


def test_saving_without_touching_the_logo_does_not_erase_it(client, app):
    """The editor sends `logo` only when the maker actually picked a new file.
    Belt and braces on the server too: an empty logo field is 'unchanged', not
    'delete it'. Getting this wrong wipes a founder's logo the first time they
    fix a typo."""
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)
    assert client.patch("/api/v1/claims/claimable-tool/listing",
                        json={"logo": _PNG_DATA_URL}).status_code == 200

    assert client.patch("/api/v1/claims/claimable-tool/listing",
                        json={"description": "Just a typo fix.", "logo": ""}).status_code == 200

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="claimable-tool").one()
        assert row.logo_data is not None
        assert json.loads(row.data)["description"] == "Just a typo fix."


def test_the_editor_only_opens_for_the_person_who_owns_the_listing(client, app):
    """The editor page seeds its form from this endpoint. If it answered to
    anyone signed in, it would hand a stranger the current copy of a listing
    they cannot edit — and, worse, imply they can."""
    with app.app_context():
        _tool()
    owner = _user(app, "founder@claimable.example.com")
    _login(client, owner)
    _claim(client)

    resp = client.get("/api/v1/claims/claimable-tool/listing")
    assert resp.status_code == 200
    tool = resp.get_json()["tool"]
    assert tool["name"] == "Claimable Tool"
    # The gated fields are RETURNED, so the editor can show them as inputs
    # rather than hiding them — a founder who cannot see where the URL lives
    # assumes we are hiding it.
    assert tool["link"] == "https://claimable.example.com"

    stranger = _user(app, "someone@else.example.com")
    _login(client, stranger)
    assert client.get("/api/v1/claims/claimable-tool/listing").status_code == 403


def test_every_edit_is_logged(client, app):
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)
    client.patch("/api/v1/claims/claimable-tool/listing",
                 json={"description": "First rewrite."})

    with app.app_context():
        edits = ToolEdit.query.filter_by(tool_slug="claimable-tool").all()
        assert len(edits) == 1
        assert edits[0].field == "description"
        assert edits[0].old_value == "The original description."
        assert edits[0].new_value == "First rewrite."
        assert edits[0].user_id == uid


# --- what a reader sees -----------------------------------------------------


def test_the_tool_page_shows_a_claimed_badge_that_names_nobody(client, app):
    with app.app_context():
        _tool()
    uid = _user(app, "founder@claimable.example.com")
    _login(client, uid)
    _claim(client)

    body = client.get("/api/v1/tools/claimable-tool").get_json()
    assert body["claim"]["claimed"] is True
    assert body["claim"]["label"] == "Claimed by the maker"
    # Who owns it is between them and us.
    assert "user_id" not in body["claim"]
    assert "user_email" not in body["claim"]


def test_an_unclaimed_tool_carries_no_badge(client, app):
    with app.app_context():
        _tool()
    assert "claim" not in client.get("/api/v1/tools/claimable-tool").get_json()


# --- admin ------------------------------------------------------------------


def test_the_claim_queue_and_decisions_are_admin_only(client, app):
    with app.app_context():
        _tool()
    uid = _user(app, "someone@gmail.com")
    _login(client, uid)
    _claim(client)

    assert client.get("/api/v1/claims/admin/queue").status_code == 403
    with app.app_context():
        claim_id = ToolClaim.query.one().id
    assert client.patch(f"/api/v1/claims/admin/{claim_id}",
                        json={"status": "approved"}).status_code == 403


def test_an_admin_can_approve_a_pending_claim(client, app):
    with app.app_context():
        _tool()
    founder = _user(app, "founder@gmail.com")
    _login(client, founder)
    _claim(client, evidence="I built it.")

    admin_id = _user(app, "claims-admin@example.com", is_admin=True)
    _login(client, admin_id)
    queue = client.get("/api/v1/claims/admin/queue").get_json()["claims"]
    assert len(queue) == 1
    assert queue[0]["evidence"] == "I built it."
    assert queue[0]["user_email"] == "founder@gmail.com"

    resp = client.patch(f"/api/v1/claims/admin/{queue[0]['id']}",
                        json={"status": "approved", "admin_note": "Checked their team page."})
    assert resp.status_code == 200

    _login(client, founder)
    assert client.patch("/api/v1/claims/claimable-tool/listing",
                        json={"description": "Now I can edit."}).status_code == 200


# --- what an owner can say --------------------------------------------------


def test_only_the_maker_can_post_a_changelog_for_their_tool(client, app):
    """The reason a claimed listing is an account and not a receipt: the
    maker has a standing reason to come back. Anyone may post ABOUT a tool;
    only its owner may speak AS its maker."""
    with app.app_context():
        _tool()
    stranger = _user(app, "stranger@gmail.com")
    _login(client, stranger)

    resp = client.post("/api/v1/community/posts", json={
        "title": "Version 2.0 is out",
        "body": "We shipped a big release today with lots of new things in it.",
        "post_type": "changelog",
        "tool_slug": "claimable-tool",
    })
    assert resp.status_code == 403

    owner = _user(app, "founder@claimable.example.com")
    _login(client, owner)
    _claim(client)
    resp = client.post("/api/v1/community/posts", json={
        "title": "Version 2.0 is out",
        "body": "We shipped a big release today with lots of new things in it.",
        "post_type": "changelog",
        "tool_slug": "claimable-tool",
    })
    assert resp.status_code == 201, resp.get_json()

    feed = client.get("/api/v1/community/posts").get_json()
    post = next(p for p in feed["posts"] if p["post_type"] == "changelog")
    assert post["by_maker"] is True


def test_a_changelog_post_must_name_a_tool(client, app):
    with app.app_context():
        _tool()
    owner = _user(app, "founder@claimable.example.com")
    _login(client, owner)
    _claim(client)

    resp = client.post("/api/v1/community/posts", json={
        "title": "Something happened",
        "body": "But I did not say which tool this release is even about.",
        "post_type": "changelog",
    })
    assert resp.status_code == 400


def test_a_revoked_claim_stops_the_maker_label(client, app):
    """Computed, not stored: a post that keeps claiming to be from the maker
    after the claim is gone is a label nobody can trust."""
    with app.app_context():
        _tool()
    owner = _user(app, "founder@claimable.example.com")
    _login(client, owner)
    _claim(client)
    client.post("/api/v1/community/posts", json={
        "title": "Version 2.0 is out",
        "body": "We shipped a big release today with lots of new things in it.",
        "post_type": "changelog",
        "tool_slug": "claimable-tool",
    })

    with app.app_context():
        claim = ToolClaim.query.filter_by(tool_slug="claimable-tool").one()
        assert claims.decide_claim(claim, "revoked") is None

    feed = client.get("/api/v1/community/posts").get_json()
    post = next(p for p in feed["posts"] if p["post_type"] == "changelog")
    assert post["by_maker"] is False


# --- answering reviews ------------------------------------------------------


def _leave_review(client, app, slug="claimable-tool", body="It crashed on my monorepo twice."):
    reviewer = _user(app, f"reviewer{_next_reviewer()}@example.com")
    _login(client, reviewer)
    resp = client.post(f"/api/v1/tools/{slug}/reviews", json={"body": body})
    assert resp.status_code in (200, 201), resp.get_json()
    return reviewer


_REVIEWER_SEQ = iter(range(1, 200))


def _next_reviewer():
    return next(_REVIEWER_SEQ)


def test_the_maker_can_answer_a_review_and_a_stranger_cannot(client, app):
    """An unanswered complaint is worth less to a reader than one with the
    maker's side beside it — but only the maker may post that side."""
    with app.app_context():
        _tool()
    _leave_review(client, app)

    with app.app_context():
        review_id = Review.query.filter_by(tool_slug="claimable-tool").one().id

    stranger = _user(app, "stranger@gmail.com")
    _login(client, stranger)
    assert client.post(f"/api/v1/reviews/{review_id}/reply",
                       json={"body": "Not my tool but I'll answer anyway."}).status_code == 403

    owner = _user(app, "founder@claimable.example.com")
    _login(client, owner)
    _claim(client)
    resp = client.post(f"/api/v1/reviews/{review_id}/reply",
                       json={"body": "Fixed in 2.1 — sorry about that, and thanks for the report."})
    assert resp.status_code == 200

    served = client.get("/api/v1/tools/claimable-tool/reviews").get_json()["reviews"][0]
    assert served["maker_reply"].startswith("Fixed in 2.1")
    assert served["maker_reply_at"]
    # The review itself is untouched. A maker answering a review must never
    # be able to soften or hide it.
    assert served["body"] == "It crashed on my monorepo twice."


def test_a_maker_can_take_their_own_reply_down(client, app):
    with app.app_context():
        _tool()
    _leave_review(client, app)
    with app.app_context():
        review_id = Review.query.filter_by(tool_slug="claimable-tool").one().id

    owner = _user(app, "founder@claimable.example.com")
    _login(client, owner)
    _claim(client)
    client.post(f"/api/v1/reviews/{review_id}/reply", json={"body": "First answer."})
    resp = client.post(f"/api/v1/reviews/{review_id}/reply", json={"body": "   "})
    assert resp.status_code == 200

    served = client.get("/api/v1/tools/claimable-tool/reviews").get_json()["reviews"][0]
    assert served["maker_reply"] is None
