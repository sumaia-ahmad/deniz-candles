#!/bin/sh
# Bring the database up to date, then start the production server.
set -e
flask --app app db upgrade
exec gunicorn --workers "${GUNICORN_WORKERS:-2}" --bind 0.0.0.0:8000 --access-logfile - "app:create_app()"
