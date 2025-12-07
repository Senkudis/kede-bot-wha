# نستخدم نسخة Node.js خفيفة (Slim) لتسريع الرفع وتجنب تعليق السيرفر
FROM node:18-slim

# 1. تثبيت متصفح Chromium والمكتبات الضرورية لتشغيله يدوياً
# هذا يضمن أن المتصفح موجود 100% في المسار المعروف
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. إعداد مجلد العمل
WORKDIR /usr/src/app

# 3. إعداد متغيرات البيئة ليعرف البوت مكان المتصفح الذي ثبتناه
# هذا السطر هو الذي سيحل مشكلة "Did not find executable"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 4. نسخ ملفات المشروع وتثبيت المكتبات
COPY package*.json ./
RUN npm install

COPY . .

# 5. أمر التشغيل
CMD [ "node", "index.js" ]
