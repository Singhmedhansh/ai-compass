import urllib.request
import json
import datetime

# Categories and keywords relevant for students
STUDENT_KEYWORDS = ["education", "student", "learning", "study", "summarization", "text-to-speech", "code generation", "writing", "research"]

def fetch_trending_spaces(limit=50):
    url = f"https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit={limit}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            return data
    except Exception as e:
        print(f"Error fetching data: {e}")
        return []

def filter_for_students(spaces):
    student_tools = []
    for space in spaces:
        tags = [tag.lower() for tag in space.get("tags", [])]
        # Check if any student keyword is in the space's tags or title
        is_relevant = any(keyword in tags for keyword in STUDENT_KEYWORDS)
        
        if is_relevant:
            student_tools.append({
                "id": space["id"],
                "author": space.get("author", "Unknown"),
                "likes": space.get("likes", 0),
                "url": f"https://huggingface.co/spaces/{space['id']}"
            })
    return student_tools

if __name__ == "__main__":
    print(f"Fetching trending Hugging Face spaces for students ({datetime.date.today()})...")
    trending_spaces = fetch_trending_spaces(limit=100)
    student_spaces = filter_for_students(trending_spaces)
    
    if student_spaces:
        print(f"\nFound {len(student_spaces)} relevant tools for students:")
        for idx, tool in enumerate(student_spaces, 1):
            print(f"{idx}. {tool['id']} (Likes: {tool['likes']})")
            print(f"   URL: {tool['url']}")
            print("-" * 40)
    else:
        print("No heavily student-focused trending tools found in the top 100 right now. Try expanding tags!")
