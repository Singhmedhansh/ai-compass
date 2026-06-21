from app import create_app, db
from app.models import CatalogTool
import json

app = create_app()
with app.app_context():
    tools = CatalogTool.query.all()
    print(f"Total tools: {len(tools)}")
    github_logo_tools = []
    for t in tools:
        data_dict = json.loads(t.data)
        link = data_dict.get('link') or ''
        icon = data_dict.get('icon') or ''
        if 'github.com' in link.lower() and not icon:
            github_logo_tools.append((t.id, data_dict.get('name'), link, icon))
            
    print(f"Found {len(github_logo_tools)} tools with GitHub logo fallback:")
    for gm in github_logo_tools:
        safe_str = str(gm).encode('ascii', errors='replace').decode('ascii')
        print(safe_str)
