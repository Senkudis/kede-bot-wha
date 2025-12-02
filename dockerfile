# استخدام صورة Node.js رسمية وخفيفة
FROM node:18-slim

# إعداد متغيرات البيئة لـ Puppeteer لتخطي تحميل كروميوم (سنقوم بتحميل المكتبات اللازمة يدوياً)
# ولكن للكود الخاص بك، سنترك Puppeteer يحمل النسخة المتوافقة معه، ونثبت فقط المكتبات المطلوبة لتشغيلها.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# تحديث النظام وتثبيت المكتبات الضرورية لتشغيل Google Chrome/Puppeteer
# هذه الخطوة ضرورية جداً وإلا سيفشل البوت في فتح المتصفح
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    libasound2 libatk-bridge2.0-0 libgtk-3-0 libnss3 libx11-xcb1 libxss1 libxtst6 lsb-release xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# تحديد مجلد العمل داخل الحاوية
WORKDIR /app

# نسخ ملفات التعريف بالمكتبات أولاً (للاستفادة من التخزين المؤقت للـ Docker layers)
COPY package.json ./

# تثبيت المكتبات
RUN npm install

# نسخ باقي ملفات المشروع (الكود، data.json، إلخ)
COPY . .

# أمر التشغيل
CMD ["npm", "start"]
