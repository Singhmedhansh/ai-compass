FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 10000

CMD ["sh", "-c", "gunicorn wsgi:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --worker-class gthread --threads 4 --timeout 120 --access-logfile - --error-logfile -"]
