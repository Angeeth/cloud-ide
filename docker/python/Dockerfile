FROM python:3.11-slim
WORKDIR /workspace
RUN useradd -m -u 1000 sandboxuser
USER sandboxuser
CMD ["python", "main.py"]
