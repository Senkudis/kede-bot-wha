require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const Groq = require('groq-sdk');
const qrcode = require('qrcode');
const express = require('express');
const app = express();

// --- 1. WEB SERVER ---
const port = process.env.PORT || 8000;
let qrCodeImage = "<h1>⏳ جاري تجهيز كيدي...</h1>";
let isClientReady = false;

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Kede Bot</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: sans-serif; text-align: center; padding-top: 50px; background: #e8eaf6; }
                    .box { background: white; padding: 20px; border-radius: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                    h2 { color: #283593; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h2>🚀 كيدي (Groq AI)</h2>
                    <p>الحالة: <b>${isClientReady ? '✅ متصل وجاهز' : '⏳ جاري الاتصال...'}</b></p>
                    <div>${qrCodeImage}</div>
                    <p>يتم التحديث كل 5 ثواني</p>
                </div>
            </body>
        </html>
    `);
});
app.listen(port, () => console.log(`Server running on port ${port}`));


// --- 2. GROQ AI ---
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});


// --- 3. WHATSAPP CLIENT ---
console.log('🚀 Starting WhatsApp...');
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
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('⚡ QR Code Received');
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) qrCodeImage = `<img src="${url}" width="300">`;
    });
});

client.on('ready', () => {
    console.log('✅ Bot is Ready!');
    isClientReady = true;
    qrCodeImage = "<h1>✅ تم الربط بنجاح!</h1>";
});

client.on('disconnected', () => {
    console.log('❌ Disconnected — إعادة تشغيل...');
    isClientReady = false;
    client.destroy();
    setTimeout(() => client.initialize(), 2000);
});


// --- 4. MESSAGE HANDLER ---
client.on('message', async (msg) => {

    const body = msg.body.trim();
    const lowerBody = body.toLowerCase();
    const chat = await msg.getChat();

    // --- أوامر البوت ---
    if (['اوامر', 'أوامر', 'help', 'menu'].includes(lowerBody)) {
        const menu = `🤖 *مرحباً بك في كيدي بوت!* 🚀

📸 *تحليل الصور وحل المسائل:*
ارسل صورة وقل "كيدي".

🎨 *صناعة الملصقات:*
ارسل صورة واكتب: *ملصق*

🔤 *الترجمة:*
اكتب: *ترجم + النص*

💬 *الذكاء الاصطناعي:*
اكتب: *كيدي + سؤالك*`;
        
        await msg.reply(menu);
        return;
    }


    // --- صانع الملصقات ---
    if (msg.hasMedia && ['ملصق', 'sticker', 'ستيكر'].includes(lowerBody)) {

        try {
            const media = await msg.downloadMedia();
            await client.sendMessage(msg.from, media, {
                sendMediaAsSticker: true,
                stickerName: "Kede Bot",
                stickerAuthor: "Groq AI"
            });
        } catch (err) {
            console.log("Sticker Error:", err);
            await msg.reply("❌ فشل صنع الملصق.");
        }

        return;
    }


    // --- الذكاء الاصطناعي + الصور ---
    const isTriggerText =
        lowerBody.startsWith("كيدي") ||
        lowerBody.startsWith("ذكاء") ||
        lowerBody.startsWith("ترجم");

    const isImage = msg.hasMedia && msg.type === "image";

    // لو صورة بدون كلام → تجاهل
    if (!isTriggerText && isImage === false) return;

    await chat.sendStateTyping();


    try {
        let prompt = body;
        let messages = [];
        let content = [];

        // معالجة أوامر النصوص
        if (lowerBody.startsWith('كيدي')) {
            prompt = body.replace(/^كيدي\s*/i, '');
        }

        if (lowerBody.startsWith('ذكاء')) {
            prompt = body.replace(/^ذكاء\s*/i, '');
        }

        if (lowerBody.startsWith('ترجم')) {
            prompt = `Translate to Arabic/English: "${body.replace(/^ترجم\s*/i, '')}"`;
        }

        // لو صورة
        let model = "llama-3.3-70b-versatile";

        content.push({ type: "text", text: prompt || "اشرح الصورة دي." });

        if (isImage) {
            const media = await msg.downloadMedia();
            const imageUrl = `data:${media.mimetype};base64,${media.data}`;

            content.push({
                type: "image_url",
                image_url: imageUrl
            });

            model = "llama-3.2-11b-vision-preview";
        }

        messages.push({ role: "user", content });

        // إرسال الطلب لـ Groq
        const completion = await groq.chat.completions.create({
            messages,
            model,
            max_tokens: 1200,
            temperature: 0.6
        });

        const reply = completion.choices[0]?.message?.content || "❌ ما قدرت أفهم الكلام.";

        await msg.reply(reply);

    } catch (err) {
        console.log("Groq Error:", err);
        await msg.reply("❌ حصل خطأ أثناء المعالجة.");
    }

});


client.initialize();
