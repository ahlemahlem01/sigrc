FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=180 --retries 8 -r requirements.txt
COPY . .
RUN python build_test_model.py
EXPOSE 8001
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8001}"]
