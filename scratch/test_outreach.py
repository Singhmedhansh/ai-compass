import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app, db
from app.models import OutreachCandidate, OutreachEmailLog
from app.outreach import infer_tone, get_domain_from_url, is_valid_email

def test_pipeline():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context():
        # Setup temp DB
        db.create_all()
        
        # Test helpers
        assert get_domain_from_url("https://airtop.ai/some/page") == "airtop.ai"
        assert is_valid_email("founder@airtop.ai") is True
        assert is_valid_email("sentry-error@airtop.ai") is False
        assert infer_tone("funded by Y Combinator", "") == "formal"
        assert infer_tone("a simple study note taker", "") == "peer"
        
        # Test database inserts
        c = OutreachCandidate(
            product_name="Test Product",
            website_url="https://test.ai",
            founder_name="Founder name",
            email="founder@test.ai",
            status="draft_ready",
            draft_subject="Mock Subject",
            draft_body="Mock Body"
        )
        db.session.add(c)
        db.session.commit()
        
        candidates = OutreachCandidate.query.all()
        assert len(candidates) == 1
        assert candidates[0].product_name == "Test Product"
        print("OutreachCandidate DB insert verified successfully!")
        
        # Test email logging
        log_entry = OutreachEmailLog(
            candidate_id=c.id,
            email=c.email,
            subject=c.draft_subject,
            body=c.draft_body,
            status="success"
        )
        db.session.add(log_entry)
        db.session.commit()
        
        logs = OutreachEmailLog.query.all()
        assert len(logs) == 1
        assert logs[0].status == "success"
        print("OutreachEmailLog DB insert verified successfully!")
        
        # Cleanup
        db.drop_all()

if __name__ == "__main__":
    test_pipeline()
    print("All checks completed successfully!")
