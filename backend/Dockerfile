# Backend image: Flask API served by Gunicorn.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY migrations ./migrations
COPY docker-entrypoint.sh .

# Run as a normal user, not root. /app/instance holds uploaded photos and receipts (a volume).
RUN useradd --create-home deniz \
    && mkdir -p /app/instance \
    && chown -R deniz:deniz /app
USER deniz

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
