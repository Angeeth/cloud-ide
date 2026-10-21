FROM python:3.11-slim

WORKDIR /app

RUN pip config set global.timeout 1000 && pip config set global.retries 10

COPY services/history-service/requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY shared /app/shared
RUN --mount=type=cache,target=/root/.cache/pip pip install -e /app/shared

COPY services/history-service /app/
ENV PYTHONPATH=/app

EXPOSE 8009

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8009"]
