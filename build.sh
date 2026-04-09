#!/bin/bash
# In Render dashboard add this env var:
# RENDER_EXTERNAL_URL=https://ai-compass-1.onrender.com
set -e
echo Building React frontend...
cd frontend
npm install
npm run build
cd ..
echo Installing Python dependencies...
pip install -r requirements.txt
echo Build complete!
