"""Compatibility module for auth route imports.

The app's logout handler lives in app.auth; login/register are now handled
by the React SPA (rendered via the app.routes catch-all) and the JSON API
(app.api_routes: /api/v1/auth/login, /api/v1/auth/register).
This module keeps older imports/scripts that expect app.auth_routes working.
"""

from app.auth import auth_bp, logout

__all__ = ["auth_bp", "logout"]
