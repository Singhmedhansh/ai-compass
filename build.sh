#!/bin/bash
# Frontend assets are pre-built locally and committed to static/dist/
# so we skip npm install/build here entirely. This keeps Render deploys
# fast and avoids the port-scan timeout on the free tier.
set -e
echo Installing Python dependencies...
pip install -r requirements.txt
echo Build complete!
