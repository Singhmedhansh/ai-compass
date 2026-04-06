#!/bin/bash
set -e
echo Building React frontend...
cd frontend
npm install
npm run build
cd ..
echo Build complete!
