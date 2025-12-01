require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const Groq = require('groq-sdk');
const qrcode = require('qrcode');
const express = require('express');
const app = express();

// --- 1. إعداد السيرفر (Koyeb) ---
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

// --- 2. إعداد Groq AI ---
// تأكد من وضع GROQ_API_KEY في إعدادات Koyeb
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "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" // ضع مفتاحك هنا للاحتياط لو بتجرب محلي
});

// --- 3. تشغيل الواتساب ---
console.log('🚀 Starting WhatsApp...');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--single-process', '--disable-gpu']
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
    console.log('❌ Disconnected');
    isClientReady = false;
    client.initialize();
});

// --- 4. معالجة الرسائل (الأوامر + الذكاء) ---
client.on('message_create', async (msg) => {
    if (msg.fromMe) return;

    const body = msg.body.trim();
    const lowerBody = body.toLowerCase();
    const chat = await msg.getChat();

    // --- القائمة (الأوامر) ---
    if (lowerBody === 'اوامر' || lowerBody === 'أوامر' || lowerBody === 'help') {
        const menu = `🤖 *مرحباً بك في كيدي بوت!* 🚀
أنا مساعد ذكي سريع جداً، ودي الحاجات الأقدر أعملها ليك:

📸 *تحليل الصور وحل المعادلات:*
ارسل أي صورة (مسألة رياضية أو مشهد) واكتب تحتها "كيدي" أو "اشرح".

📝 *الدروس والأسئلة:*
اكتب: *كيدي [سؤالك]*
مثال: "كيدي اشرح لي النسبية باختصار"

🔤 *الترجمة الفورية:*
اكتب: *ترجم [النص]*
مثال: "ترجم I love coding"

🎨 *صناعة الملصقات (Stickers):*
ارسل صورة واكتب معاها: *ملصق* أو *sticker*

⛅ *معلومات عامة:*
اسألني عن أي شي يخطر في بالك!

_تم التطوير بواسطة: ضياء الدين_`;
        
        await msg.reply(menu);
        return;
    }

    // --- صانع الاستيكرات ---
    if (msg.hasMedia && (lowerBody === 'ملصق' || lowerBody === 'sticker' || lowerBody === 'ستيكر')) {
        try {
            const media = await msg.downloadMedia();
            await client.sendMessage(msg.from, media, { sendMediaAsSticker: true, stickerName: "Kede Bot", stickerAuthor: "Groq AI" });
        } catch (e) { msg.reply("❌ فشل عمل الملصق."); }
        return;
    }

    // --- الذكاء الاصطناعي (Groq) ---
    // الشروط: يبدأ بـ كيدي/ترجم/ذكاء ... أو صورة مرسلة في الخاص ... أو صورة مع كلمة كيدي
    const isTrigger = lowerBody.startsWith('كيدي') || lowerBody.startsWith('ترجم') || lowerBody.startsWith('ذكاء');
    const isImage = msg.hasMedia && msg.type === 'image';
    const isDirect = !msg.from.endsWith('@g.us'); // هل هو شات خاص؟

    if (isTrigger || (isImage && isDirect) || (isImage && lowerBody.includes('كيدي'))) {
        await chat.sendStateTyping();

        try {
            let messages = [];
            let userContent = [];
            let prompt = body;

            // تنظيف النص
            if (lowerBody.startsWith('كيدي')) prompt = body.replace(/^كيدي\s*/i, '');
            if (lowerBody.startsWith('ذكاء')) prompt = body.replace(/^ذكاء\s*/i, '');
            if (lowerBody.startsWith('ترجم')) prompt = `Translate the following to Arabic (if foreign) or English (if Arabic): "${body.replace(/^ترجم\s*/i, '')}"`;
            
            // لو صورة بدون نص
            if (!prompt && isImage) prompt = "اشرح لي الصورة دي بالتفصيل، ولو فيها معادلة حلها.";

            // إضافة النص
            userContent.push({ type: "text", text: prompt });

            // تحديد الموديل (نصوص ولا صور؟)
            let selectedModel = "llama-3.3-70b-versatile"; // الموديل القوي للنصوص
            
            if (isImage) {
                const media = await msg.downloadMedia();
                const imageUrl = `data:${media.mimetype};base64,${media.data}`;
                
                userContent.push({
                    type: "image_url",
                    image_url: { url: imageUrl }
                });
                
                // موديل الرؤية (Vision)
                selectedModel = "llama-3.2-11b-vision-preview"; 
            }

            messages.push({ role: "user", content: userContent });

            // إضافة تعليمات للنظام (شخصية البوت)
            const systemMsg = { role: "system", content: "أنت مساعد سوداني ذكي ومرح اسمك 'كيدي'. ردودك مختصرة ومفيدة وباللهجة السودانية." };
            
            // الإرسال لـ Groq
            const completion = await groq.chat.completions.create({
                messages: [systemMsg, ...messages],
                model: selectedModel,
                temperature: 0.6,
                max_tokens: 1024,
            });

            const replyText = completion.choices[0]?.message?.content || "معليش، ما قدرت أفهم.";
            await msg.reply(replyText);

        } catch (error) {
            console.error("Groq Error:", error);
            // msg.reply("خطأ في الاتصال بالذكاء الاصطناعي 🤕");
        }
    }
});

client.initialize();
