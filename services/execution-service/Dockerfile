FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    nodejs \
    default-jre \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip config set global.timeout 1000 && pip config set global.retries 10

COPY services/execution-service/requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY shared /app/shared
RUN --mount=type=cache,target=/root/.cache/pip pip install -e /app/shared

COPY services/execution-service /app/
ENV PYTHONPATH=/app

EXPOSE 8005

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
