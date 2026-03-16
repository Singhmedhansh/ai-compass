# AI Compass

A high-performance AI tool directory built with Python (Flask) and Tailwind CSS.

## Features
- Modular Flask architecture
- Uses a JSON file as a database (data/tools.json)
- Modern Tailwind CSS workflow
- Student Mode toggle support

## Project Structure
```
ai-compass/
├── app.py                 # Entry point & Routes
├── data/
│   └── tools.json         # JSON database for AI tools
├── static/
│   ├── css/
│   │   ├── input.css      # Tailwind source
│   │   └── style.css      # Compiled output
│   └── js/
│       └── main.js        # Interactivity & Toggle logic
├── templates/
│   └── index.html         # Main Dashboard
├── .github/
│   └── copilot-instructions.md
├── requirements.txt
└── tailwind.config.js
```

## Setup
1. Install Python dependencies:
   ```sh
   pip install -r requirements.txt
   ```
2. Install Tailwind CSS (requires Node.js):
   ```sh
   npm install -D tailwindcss
   npx tailwindcss -i ./static/css/input.css -o ./static/css/style.css --watch
   ```
3. Run the Flask app:
   ```sh
   python app.py
   ```

## Student Mode
- The data structure in `tools.json` supports a `student_mode` toggle.
- The toggle button in the UI currently only simulates the change (backend update required for persistence).

---

For project standards, see [.github/copilot-instructions.md](.github/copilot-instructions.md).
