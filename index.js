const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require('qrcode');
const express = require('express');
const app = express();

// ------------------------------------------------------------------
// 1. إعداد سيرفر الويب (عشان Koyeb والبوت يفضل شغال)
// ------------------------------------------------------------------
const port = process.env.PORT || 8000;
let qrCodeImage = "<h1>جاري تشغيل كيدي... يرجى الانتظار ⏳</h1>";
let isClientReady = false;

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Kede Bot</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: sans-serif; text-align: center; padding-top: 50px; background: #f0f2f5; }
                    .card { background: white; padding: 20px; border-radius: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                    h2 { color: #075e54; }
                    .status { color: ${isClientReady ? 'green' : 'orange'}; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>🤖 Kede WhatsApp Bot</h2>
                    <p>الحالة: <span class="status">${isClientReady ? '✅ متصل وجاهز' : '⏳ جاري التشغيل...'}</span></p>
                    <div style="margin: 20px;">${qrCodeImage}</div>
                    <p>يتم تحديث الصفحة كل 5 ثواني</p>
                </div>
            </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`🌍 Server is running on port ${port}`);
});

// ------------------------------------------------------------------
// 2. إعداد الذكاء الاصطناعي (Gemini)
// ------------------------------------------------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "ضع_مفتاحك_هنا_للتجربة_المحلية");
const model = genAI.getGenerativeModel({ 
    model: "gemini-pro", // غيرنا الاسم هنا
    systemInstruction: "أنت 'كيدي'، مساعد شخصي سوداني ذكي ومرح. تتحدث باللهجة السودانية وتستخدم الإيموجي."
});

function fileToGenerativePart(base64Data, mimeType) {
    return { inlineData: { data: base64Data, mimeType } };
}

// ------------------------------------------------------------------
// 3. إعداد عميل الواتساب (WhatsApp Client)
// ------------------------------------------------------------------
console.log('🚀 Starting WhatsApp Client...');

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

// --- معالجة الباركود ---
client.on('qr', (qr) => {
    console.log('⚡ QR Code Received');
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
            qrCodeImage = `<img src="${url}" width="300">`;
        }
    });
});

// --- عند الجاهزية ---
client.on('ready', () => {
    console.log('✅ WhatsApp is Ready!');
    isClientReady = true;
    qrCodeImage = "<h1>✅ تم الربط بنجاح! كيدي جاهز للعمل.</h1>";
});

// --- عند الانفصال ---
client.on('disconnected', (reason) => {
    console.log('❌ Disconnected:', reason);
    isClientReady = false;
    qrCodeImage = "<h1>❌ انقطع الاتصال. جاري إعادة المحاولة...</h1>";
    client.initialize(); // محاولة إعادة تشغيل
});

// ------------------------------------------------------------------
// 4. معالجة الرسائل (المخ والمنطق)
// ------------------------------------------------------------------
client.on('message_create', async (msg) => {
    // تجاهل رسائل البوت
    if (msg.fromMe) return;

    const body = msg.body.toLowerCase().trim();
    const chat = await msg.getChat();

    console.log(`📩 New Message from ${msg.from}: ${body}`);

    try {
        // --- ميزة 1: الاستيكرات (ملصق/sticker) ---
        if (msg.hasMedia && (body === 'ملصق' || body === 'sticker' || body === 'ستيكر')) {
            const media = await msg.downloadMedia();
            await client.sendMessage(msg.from, media, { 
                sendMediaAsSticker: true, 
                stickerName: "Kede Bot", 
                stickerAuthor: "By Kede" 
            });
            console.log('🖼️ Sticker sent!');
            return;
        }

        // --- ميزة 2: الذكاء الاصطناعي (كيدي/AI) ---
        if (body.startsWith('كيدي') || body.startsWith('.ai')) {
            // إظهار جارِ الكتابة...
            await chat.sendStateTyping();

            let promptText = body.replace('كيدي', '').replace('.ai', '').trim();
            if (!promptText && !msg.hasMedia) {
                await msg.reply("حبابك يا مدير! دايرني في شنو؟ 🤖");
                return;
            }
            if (!promptText) promptText = "اشرح لي الصورة دي";

            let parts = [promptText];

            // لو في صورة
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media.mimetype.startsWith('image/')) {
                    parts.push(fileToGenerativePart(media.data, media.mimetype));
                }
            }

            // إرسال لـ Gemini
            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.text();

            // الرد
            await msg.reply(text);
            console.log('🤖 AI Replied');
        }

        // --- ميزة 3: فحص الاتصال (Ping) ---
        if (body === '!ping') {
            await msg.reply('Pong! 🏓 أنا شغال وسرعتي فل.');
        }

    } catch (error) {
        console.error('❌ Error handling message:', error);
        // await msg.reply("معليش، حصل خطأ بسيط. حاول تاني.");
    }
});

// تشغيل البوت
client.initialize();
