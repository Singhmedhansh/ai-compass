import os
import json
from app.services.study_plan_generator import generate_study_plan_llm

# Set environment variables for testing if needed
# os.environ["GEMINI_API_KEY"] = "..."

print("Running study plan generator test...")
try:
    res = generate_study_plan_llm(
        course_name="Introduction to Python",
        duration_days=5,
        hours_per_day=2,
        topics="Variables, loops, functions, lists",
        priority_topics="functions",
        confidence_level="Beginner"
    )
    print("SUCCESS! Output:")
    print(json.dumps(res, indent=2))
except Exception as e:
    print("FAILED with exception:", str(e))
