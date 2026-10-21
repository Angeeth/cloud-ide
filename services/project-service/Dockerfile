FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip config set global.timeout 1000 && pip config set global.retries 10

COPY services/project-service/requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY shared /app/shared
RUN --mount=type=cache,target=/root/.cache/pip pip install -e /app/shared

COPY services/project-service /app/
ENV PYTHONPATH=/app

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
