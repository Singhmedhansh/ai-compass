import os

from app import create_app

app = create_app()

if __name__ == '__main__':
    try:
        port = int(os.environ.get("PORT", 8080))
    except (TypeError, ValueError):
        port = 8080
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
