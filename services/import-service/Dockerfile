FROM python:3.11-slim

WORKDIR /app

RUN pip config set global.timeout 1000 && pip config set global.retries 10

COPY services/import-service/requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY shared /app/shared
RUN --mount=type=cache,target=/root/.cache/pip pip install -e /app/shared

COPY services/import-service /app/
ENV PYTHONPATH=/app

EXPOSE 8004

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
