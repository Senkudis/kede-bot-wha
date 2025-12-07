# استخدام نسخة Node.js الرسمية والمستقرة (LTS)
# اخترنا نسخة slim لأنها خفيفة وسريعة
FROM node:20-slim

# (اختياري) تثبيت مكتبات النظام الضرورية
# إذا كان البوت يستخدم صور أو صوتيات (ffmpeg)، قم بإزالة علامة # من السطر التالي
# RUN apt-get update && apt-get install -y ffmpeg python3 make g++

# تحديد مسار العمل داخل الحاوية
WORKDIR /usr/src/app

# نسخ ملفات تعريف المشروع أولاً (للاستفادة من الكاش وتسريع البناء)
COPY package*.json ./

# تثبيت الحزم والمكاتب
RUN npm install --production

# نسخ باقي ملفات البوت
COPY . .

# أمر تشغيل البوت
# تأكد أن الأمر يطابق السكربت الموجود في package.json
CMD ["npm", "start"]
