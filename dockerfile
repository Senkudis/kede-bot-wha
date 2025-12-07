# استخدام صورة جاهزة من فريق Puppeteer تحتوي على كروم وكل المكتبات اللازمة
FROM ghcr.io/puppeteer/puppeteer:latest

# تبديل المستخدم إلى root لتثبيت الحزم وضبط الصلاحيات
USER root

# تحديد مسار العمل
WORKDIR /usr/src/app

# نسخ ملفات تعريف المشروع
COPY package*.json ./

# تخطي تحميل متصفح كروم لأن الصورة تحتوي عليه بالفعل (لتوفير المساحة والوقت)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# تثبيت مكتبات Node.js
RUN npm install

# نسخ باقي ملفات المشروع
COPY . .

# منح صلاحيات الكتابة للمستخدم pptruser (مهم جداً لملف data.json و qr.png)
RUN chown -R pptruser:pptruser /usr/src/app

# العودة للمستخدم العادي للأمان وتشغيل البوت
USER pptruser

# أمر التشغيل
CMD [ "node", "index.js" ]
