FROM node:18-bullseye-slim

# تثبيت متطلبات كروم و ffmpeg للصوتيات
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates procps libxss1 \
    libasound2 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libnss3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=8000
EXPOSE 8000

CMD ["node", "index.js"]
