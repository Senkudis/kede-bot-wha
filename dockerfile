FROM node:18-bullseye-slim

# 1. تثبيت أساسيات النظام ومتطلبات Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 2. إعداد المسار
WORKDIR /app

# 3. نسخ التبعيات والتثبيت
COPY package*.json ./
RUN npm install

# 4. نسخ باقي الكود
COPY . .

# 5. فتح البورت (ضروري لـ Koyeb)
ENV PORT=8000
EXPOSE 8000

# 6. التشغيل
CMD ["node", "index.js"]
