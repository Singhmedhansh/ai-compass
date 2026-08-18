"""One-time seed for the Community feature's cold-start problem: an empty
feed converts nobody. Creates a dedicated "AI Compass Team" account (not
the founder's personal login) and a handful of genuine starter posts.

Deliberately does NOT fabricate votes or comments from other real users —
that would misrepresent them. Starter posts begin at score 0, same as any
real first post. Idempotent: skips if any CommunityPost already exists, so
re-running after real users have posted is a safe no-op.

Usage: python scripts/seed_community.py
"""
from app import create_app, db
from app.models import CommunityPost, User

TEAM_EMAIL = "team@ai-compass.in"
TEAM_DISPLAY_NAME = "AI Compass Team"

POSTS = [
    {
        "title": "Welcome to the AI Compass Community",
        "body": (
            "This is the place to share what you're building, ask for tool "
            "recommendations, post news about AI tools you use, or just talk "
            "shop with other students and devs. A few ground rules: be kind, "
            "keep it relevant to AI tools and student workflows, and no spam. "
            "Upvote what's useful, downvote what's not. Looking forward to "
            "seeing what you post!"
        ),
        "post_type": "discussion",
        "tool_slug": None,
    },
    {
        "title": "Hugging Face keeps shipping useful free-tier models — worth a look if it's been a while",
        "body": (
            "If you haven't checked Hugging Face's free tier recently, it's "
            "worth a revisit — new open models land there constantly and a "
            "lot of them run fine on the free Spaces tier for quick "
            "prototyping. Good one to bookmark for coursework that needs "
            "model experimentation without a compute budget."
        ),
        "post_type": "news",
        "tool_slug": "huggingface",
    },
    {
        "title": "What's your go-to free AI tool for debugging code?",
        "body": (
            "Curious what everyone's actually reaching for when a stack "
            "trace makes no sense at 2am. Tabnine, ChatGPT, Claude, "
            "something else? What's worked best for you and for what kind "
            "of bugs?"
        ),
        "post_type": "question",
        "tool_slug": "tabnine",
    },
    {
        "title": "Built a syllabus-to-study-plan pipeline using the tools on here",
        "body": (
            "Used the Syllabus Parser to pull my course topics, then fed "
            "the weekly breakdown into a couple of the tools in the catalog "
            "to generate practice questions per topic. Saved a lot of setup "
            "time at the start of the semester. Happy to share the rough "
            "workflow if anyone wants to try something similar."
        ),
        "post_type": "showcase",
        "tool_slug": None,
    },
    {
        "title": "Reminder: you can submit a tool if we're missing something you use",
        "body": (
            "If there's an AI tool you rely on that isn't in the catalog "
            "yet, submitting it takes a couple of minutes from the Submit "
            "page. Free submissions go through manual review like "
            "everything else in the catalog — no pay-to-win ranking."
        ),
        "post_type": "news",
        "tool_slug": None,
    },
]


def main():
    app = create_app()
    with app.app_context():
        if CommunityPost.query.count() > 0:
            print("CommunityPost table is not empty — skipping seed (already seeded or has real posts).")
            return

        team_user = User.query.filter_by(email=TEAM_EMAIL).first()
        if not team_user:
            team_user = User(
                email=TEAM_EMAIL,
                display_name=TEAM_DISPLAY_NAME,
                is_verified=True,
            )
            db.session.add(team_user)
            db.session.commit()
            print(f"Created team account: {TEAM_EMAIL} (id={team_user.id})")
        else:
            print(f"Using existing team account: {TEAM_EMAIL} (id={team_user.id})")

        created = 0
        for post_data in POSTS:
            post = CommunityPost(
                user_id=team_user.id,
                title=post_data["title"],
                body=post_data["body"],
                post_type=post_data["post_type"],
                tool_slug=post_data["tool_slug"],
            )
            db.session.add(post)
            created += 1
        db.session.commit()
        print(f"Seeded {created} starter posts.")


if __name__ == "__main__":
    main()
