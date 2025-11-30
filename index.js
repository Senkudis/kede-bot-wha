const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const app = express();

// --- إعدادات السيرفر وصفحة الويب ---
const port = process.env.PORT || 8000;
let qrCodeImage = "<h1>جاري تشغيل البوت... يرجى الانتظار دقيقة</h1>";

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Kede Bot QR</title>
                <meta http-equiv="refresh" content="5"> <style>
                    body { font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f0f2f5; }
                    .container { background: white; padding: 20px; border-radius: 10px; display: inline-block; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h2 { color: #333; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>اربط كيدي الآن 🤖</h2>
                    <div>${qrCodeImage}</div>
                    <p>امسح الكود بواسطة واتساب في هاتفك</p>
                    <small>يتم تحديث الصفحة تلقائياً</small>
                </div>
            </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`🌍 Server running on port ${port}`);
});

// --- استدعاء المعالجات الخارجية ---
// تأكد من وجود مجلد handlers والملفات بداخله
const { handleReady, handleDisconnect } = require('./handlers/clientHandlers');
const messageHandler = require('./handlers/messageHandler');

console.log('🚀 [Kede-Bot] Initializing...');

// --- إعداد عميل الواتساب (Puppeteer) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ]
    }
});

// 1. معالجة الباركود (تحويله لصورة وعرضه في الموقع)
client.on('qr', (qr) => {
    console.log('⚡ QR Code received (Available on Web)');
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
            qrCodeImage = `<img src="${url}" width="300" height="300">`;
        } else {
            console.error('Error generating QR image', err);
        }
    });
});

// 2. ربط باقي الأحداث
client.on('ready', () => {
    handleReady();
    qrCodeImage = "<h1>✅ تم الاتصال بنجاح! كيدي جاهز.</h1>";
});

client.on('disconnected', handleDisconnect);

client.on('message_create', (msg) => messageHandler(client, msg));

client.initialize();
