FROM node:18-bookworm-slim

# Python + OpenCV runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (YOLO/UNet)
COPY requirements.txt ai_model/requirements.txt ./
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir -r requirements.txt -r ai_model/requirements.txt

# Install Node deps (backend + frontend serve)
COPY package.json ./
RUN npm install --omit=dev

# Copy the rest, including weights and frontend assets
COPY . .

# Hugging Face Spaces sets $PORT (usually 7860); Node server reads it
ENV PORT=7860 \
    PYTHON_BIN=python3

EXPOSE 7860

CMD ["npm", "start"]
