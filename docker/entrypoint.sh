#!/bin/sh
set -e

# The ./data bind mount is created by Docker (owned by root) on first run,
# so fix ownership before dropping to the unprivileged user.
mkdir -p /app/data
chown -R appuser:appuser /app/data

gosu appuser python manage.py migrate --noinput
gosu appuser python manage.py seed_states

exec gosu appuser gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --access-logfile - \
    --error-logfile -
