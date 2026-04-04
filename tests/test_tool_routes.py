
import pytest
from app import db
from app.models import Tool, Category

@pytest.fixture
def tool_setup(app):
    with app.app_context():
        category = Category.query.filter_by(slug='test-category').first()
        if not category:
            category = Category(slug='test-category', name='Test Category')
            db.session.add(category)
            db.session.commit()
        
        tool = Tool.query.filter_by(slug='sample-tool').first()
        if not tool:
            tool = Tool(slug='sample-tool', name='Sample Tool', description='A test tool', category_id=category.id)
            db.session.add(tool)
            db.session.commit()
            
        yield tool.id
        
        # cleanup
        db.session.delete(tool)
        db.session.commit()
        # Do not delete category as it might be used by other tests

def test_tools_listing(client, tool_setup):
    response = client.get('/tools')
    assert response.status_code == 200

def test_tool_detail(client, tool_setup):
    tool_id = tool_setup
    response = client.get(f'/tool/{tool_id}')
    assert response.status_code == 200
