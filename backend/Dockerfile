FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    INSTANCE_PATH=/data \
    PORT=1488

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app \
    && mkdir -p /data \
    && chown app:app /data

COPY --chown=app:app app.py ./
COPY --chown=app:app tengeflow ./tengeflow
COPY --chown=app:app migrations ./migrations

USER app

EXPOSE 1488

CMD ["sh", "-c", "flask --app app db upgrade && exec gunicorn --bind 0.0.0.0:${PORT:-1488} --workers ${WEB_CONCURRENCY:-1} --access-logfile - --error-logfile - app:app"]