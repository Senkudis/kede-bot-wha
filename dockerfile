FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /usr/src/app

COPY package*.json ./

# نكتفي بتخطي التحميل، ولا نحدد المسار يدوياً لأن الصورة الأصلية تعرف مكانه
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN npm install

COPY . .

# ضبط الصلاحيات مهم جداً
RUN chown -R pptruser:pptruser /usr/src/app

USER pptruser
CMD [ "node", "index.js" ]
