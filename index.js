require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require('qrcode');
const express = require('express');
const axios = require('axios');
const app = express();

// --- 1. إعداد السيرفر (Koyeb) ---
const port = process.env.PORT || 8000;
let qrCodeImage = "<h1>⏳ جاري تحميل كيدي...</h1>";
let isClientReady = false;

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Kede Edu Bot</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: sans-serif; text-align: center; padding-top: 50px; background: #e0f7fa; }
                    .box { background: white; padding: 20px; border-radius: 15px; display: inline-block; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                    h2 { color: #006064; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h2>📚 كيدي البوت التعليمي</h2>
                    <p>الحالة: <b>${isClientReady ? '✅ متصل' : '🔴 غير متصل'}</b></p>
                    <div>${qrCodeImage}</div>
                    <p>يتم التحديث كل 5 ثواني</p>
                </div>
            </body>
        </html>
    `);
});
app.listen(port, () => console.log(`Server running on port ${port}`));

// --- 2. إعداد Gemini (المخ) ---
// تأكد من إضافة GEMINI_API_KEY في إعدادات Koyeb
const genAI = new GoogleGenerativeAI("AIzaSyDKOCf8PsMnZUBWlbRv7Dg847g3SrjVYdM");
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", // الموديل السريع اللي بيدعم الصور والصوت
    systemInstruction: `أنت 'كيدي'، مساعد شخصي ومعلم خصوصي ذكي باللهجة السودانية.
    - دورك: شرح الدروس، حل المعادلات من الصور، والترجمة.
    - أسلوبك: واضح، مختصر، ومرح. استخدم الإيموجي المناسب.
    - لو أتاك سؤال عن الطقس أو الترجمة جاوب بدقة.`
});

function fileToGenerativePart(base64Data, mimeType) {
    return { inlineData: { data: base64Data, mimeType } };
}

// --- 3. تشغيل الواتساب ---
console.log('🚀 Starting WhatsApp...');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--single-process', '--disable-gpu'
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
    console.log('❌ Disconnected');
    isClientReady = false;
    client.initialize();
});

// --- 4. معالجة الرسائل (الأوامر والذكاء) ---
client.on('message_create', async (msg) => {
    if (msg.fromMe) return;

    const body = msg.body.trim(); // النص الأصلي (للحفاظ على حالة الأحرف في الإنجليزي)
    const lowerBody = body.toLowerCase();
    const chat = await msg.getChat();

    console.log(`📩 رسالة: ${body}`);

    try {
        // --- أ: الاستيكرات ---
        if (msg.hasMedia && (lowerBody === 'ملصق' || lowerBody === 'sticker' || lowerBody === 'ستيكر')) {
            const media = await msg.downloadMedia();
            await client.sendMessage(msg.from, media, { sendMediaAsSticker: true, stickerName: "Kede", stickerAuthor: "Bot" });
            return;
        }

        // --- ب: الطقس (باستخدام نظام ذكي) ---
        if (lowerBody.startsWith('طقس ')) {
            const city = body.substring(4).trim();
            try {
                // 1. نجيب الإحداثيات
                const geo = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ar&format=json`);
                if (!geo.data.results) return msg.reply(`🧐 ما عرفت المدينة دي "${city}". جرب اكتب الاسم بالإنجليزي أو مدينة مشهورة.`);
                
                const { latitude, longitude, name, country } = geo.data.results[0];
                
                // 2. نجيب الطقس
                const weather = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,is_day&timezone=auto`);
                const curr = weather.data.current;
                
                msg.reply(`🌤 *الطقس في ${name}, ${country}*:
🌡 الحرارة: ${curr.temperature_2m}°C
💧 الرطوبة: ${curr.relative_humidity_2m}%
💨 الرياح: ${curr.wind_speed_10m} كم/س
${curr.is_day ? '☀️ نهار' : '🌑 ليل'}`);
            } catch (e) { msg.reply("❌ حصل خطأ في جلب الطقس."); }
            return;
        }

        // --- ج: الذكاء الاصطناعي (تعليم - ترجمة - صور - صوت) ---
        // الشروط: يبدأ بـ "كيدي" أو "ترجم" أو "ذكاء" ... أو لو في صورة/صوت (بدون شروط)
        const isTriggerWord = lowerBody.startsWith('كيدي') || lowerBody.startsWith('ترجم') || lowerBody.startsWith('ذكاء');
        const isMedia = msg.hasMedia && (msg.type === 'image' || msg.type === 'audio' || msg.type === 'ptt');
        
        // لو المستخدم راسل للبوت مباشرة (في الخاص) ما بنحتاج كلمة "كيدي"
        const isDirectChat = !msg.from.endsWith('@g.us'); 

        if (isTriggerWord || (isMedia && isDirectChat) || (isMedia && lowerBody.includes('كيدي'))) {
            await chat.sendStateTyping();

            let prompt = body;
            
            // تنظيف الأمر عشان Gemini يفهم
            if (lowerBody.startsWith('كيدي')) prompt = body.replace(/^كيدي\s*/i, '');
            if (lowerBody.startsWith('ذكاء')) prompt = body.replace(/^ذكاء\s*/i, '');
            if (lowerBody.startsWith('ترجم')) prompt = `Translate this text to Arabic if it is English, and to English if it is Arabic: "${body.replace(/^ترجم\s*/i, '')}"`;

            // لو ماف نص، ورسل صورة بس
            if (!prompt && isMedia) prompt = "اشرح لي الصورة دي أو حل المعادلة الموجودة فيها بالتفصيل";

            let parts = [prompt];

            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                // دعم الصور والصوت
                if (media.mimetype.startsWith('image/') || media.mimetype.startsWith('audio/')) {
                    parts.push(fileToGenerativePart(media.data, media.mimetype));
                }
            }

            const result = await model.generateContent(parts);
            const response = await result.response;
            await msg.reply(response.text());
        }

        // --- د: أوامر بسيطة ---
        if (lowerBody === 'اوامر') {
            msg.reply(`🤖 *أوامر كيدي التعليمي:*
            
📸 *حل المعادلات:* ارسل صورة المسألة (في الخاص) وحلها ليك.
🎤 *شرح صوتي:* ارسل ريكورد بسؤالك.
🔤 *ترجم [النص]:* للترجمة الفورية.
🌤 *طقس [المدينة]:* لمعرفة الجو.
🎨 *ملصق:* (مع صورة) لعمل ستيكر.
🗣 *كيدي [سؤالك]:* للمونسة والمعلومات.`);
        }

    } catch (e) {
        console.error('Error:', e);
        // msg.reply("معليش، حصلت مشكلة بسيطة 🤕");
    }
});

client.initialize();
