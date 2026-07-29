FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput

RUN chmod +x /app/docker/entrypoint.sh \
    && useradd --create-home appuser \
    && mkdir -p /app/data

# Stays root at container start: docker/entrypoint.sh fixes ownership of the
# bind-mounted ./data volume (which docker creates as root) and then drops
# to "appuser" via gosu before running gunicorn.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:8000/ || exit 1

ENTRYPOINT ["/app/docker/entrypoint.sh"]
