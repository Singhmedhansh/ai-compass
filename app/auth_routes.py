"""Compatibility module for auth route imports.

The app's login/register/logout handlers live in app.auth.
This module keeps older imports/scripts that expect app.auth_routes working.
"""

from app.auth import auth_bp, login, logout, register

__all__ = ["auth_bp", "login", "logout", "register"]
