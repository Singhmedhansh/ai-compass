import os
import sys
import json
import re

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app, db
from app.models import Tool, Category, Tag

def build_slug(name):
    return re.sub(r"[^a-z0-9]+", "-", str(name).strip().lower()).strip("-")

def parse_weekly_users(value):
    text = str(value or "").strip().upper().replace("+", "")
    if not text: return 0
    multiplier = 1
    if text.endswith("M"):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.endswith("K"):
        multiplier = 1_000
        text = text[:-1]
    try:
        return int(float(text.replace(",", "")) * multiplier)
    except ValueError:
        return 0

def main():
    app = create_app()
    with app.app_context():
        data_path = os.path.join(PROJECT_ROOT, "data", "tools.json")
        if not os.path.exists(data_path):
            print("No tools.json found.")
            return

        with open(data_path, 'r', encoding='utf-8') as f:
            tools_data = json.load(f)

        print(f"Migrating {len(tools_data)} tools to the database...")

        category_map = {}
        tag_map = {}

        for t_data in tools_data:
            # 1. Category
            cat_name = str(t_data.get('category', 'Other')).strip()
            cat_slug = build_slug(cat_name) or "other"
            if cat_slug not in category_map:
                cat = Category.query.filter_by(slug=cat_slug).first()
                if not cat:
                    cat = Category(slug=cat_slug, name=cat_name)
                    db.session.add(cat)
                    db.session.flush()
                category_map[cat_slug] = cat

            # 2. Tool
            tool_slug = t_data.get('tool_key') or build_slug(t_data.get('name', ''))
            tool = Tool.query.filter_by(slug=tool_slug).first()
            if not tool:
                price = str(t_data.get('price') or t_data.get('pricing') or t_data.get('pricing_model') or '').strip().lower()
                perk = t_data.get('studentPerk', False)
                if isinstance(perk, str):
                    perk = perk.lower() in ('true', '1', 'yes')
                
                raw_launch = t_data.get('launchYear')
                launch_year = int(raw_launch) if raw_launch else None
                
                tool = Tool(
                    slug=tool_slug,
                    name=t_data.get('name', ''),
                    description=t_data.get('description', ''),
                    link=t_data.get('link') or t_data.get('website', ''),
                    icon=t_data.get('icon', ''),
                    price=price,
                    student_perk=bool(perk),
                    rating=float(t_data.get('rating') or 0.0),
                    weekly_users=parse_weekly_users(t_data.get('weeklyUsers')),
                    launch_year=launch_year,
                    category_id=category_map[cat_slug].id
                )
                db.session.add(tool)

            # 3. Tags
            raw_tags = t_data.get('tags', [])
            if isinstance(raw_tags, str):
                raw_tags = [x.strip() for x in raw_tags.split(',')]
            
            for t_str in raw_tags:
                tag_name = str(t_str).strip()
                if not tag_name: continue
                tag_slug = build_slug(tag_name)
                if not tag_slug: continue
                
                if tag_slug not in tag_map:
                    tag = Tag.query.filter_by(slug=tag_slug).first()
                    if not tag:
                        tag = Tag(slug=tag_slug, name=tag_name)
                        db.session.add(tag)
                        db.session.flush()
                    tag_map[tag_slug] = tag
                
                if tag_map[tag_slug] not in tool.tags:
                    tool.tags.append(tag_map[tag_slug])
            
        db.session.commit()
        print("Data layer migration complete! Tools transitioned to relational models.")

if __name__ == '__main__':
    main()
