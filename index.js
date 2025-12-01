const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // تأكد إنك ضفت axios في package.json
const qrcode = require('qrcode');
const express = require('express');
const app = express();

// مفتاحك الخاص
const API_KEY = "AIzaSyA7yAQNsB3FsBJxaL86pUFErcJmcFFsbBk";

// ------------------------------------------------------------------
// 1. إعداد سيرفر الويب
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
// 2. دالة الاتصال المباشر بـ Gemini (المصححة)
// ------------------------------------------------------------------
async function askGemini(prompt, imageBase64 = null, mimeType = null) {
    // نستخدم gemini-pro للنصوص، و gemini-1.5-flash للصور
    let modelName = "gemini-pro";
    
    // لو في صورة، لازم نستخدم موديل رؤية
    if (imageBase64) modelName = "gemini-1.5-flash"; 

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
    
    // دمج شخصية كيدي مع الرسالة
    const systemInstruction = "أنت 'كيدي'، مساعد شخصي سوداني ذكي ومرح. تتحدث باللهجة السودانية وتستخدم الإيموجي. ردك يجب أن يكون مفيداً ومختصراً.\n\nالسؤال: ";
    const finalPrompt = systemInstruction + (prompt || "صف هذه الصورة");

    let parts = [{ text: finalPrompt }];
    
    // إعداد الصورة لو وجدت
    if (imageBase64) {
        parts = [
            { text: finalPrompt },
            {
                inline_data: {
                    mime_type: mimeType,
                    data: imageBase64
                }
            }
        ];
    }

    const payload = {
        contents: [{ parts: parts }]
    };

    try {
        const response = await axios.post(url, payload);
        // استخراج النص
        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            return "معليش، ما قدرت أفهم الرسالة دي 😅";
        }
    } catch (error) {
        console.error("Gemini Error Details:", JSON.stringify(error.response?.data || error.message));
        return "حصلت مشكلة في الاتصال بموديل الذكاء الاصطناعي (404) أو النت ضعيف.";
    }
}

// ------------------------------------------------------------------
// 3. إعداد عميل الواتساب
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

client.on('qr', (qr) => {
    console.log('⚡ QR Code Received');
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) qrCodeImage = `<img src="${url}" width="300">`;
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp is Ready!');
    isClientReady = true;
    qrCodeImage = "<h1>✅ تم الربط بنجاح! كيدي جاهز للعمل.</h1>";
});

client.on('disconnected', (reason) => {
    console.log('❌ Disconnected:', reason);
    isClientReady = false;
    qrCodeImage = "<h1>❌ انقطع الاتصال. جاري إعادة المحاولة...</h1>";
    client.initialize(); 
});

// ------------------------------------------------------------------
// 4. معالجة الرسائل
// ------------------------------------------------------------------
client.on('message_create', async (msg) => {
    if (msg.fromMe) return;

    const body = msg.body.toLowerCase().trim();
    const chat = await msg.getChat();

    console.log(`📩 New Message from ${msg.from}: ${body}`);

    try {
        // --- ميزة الاستيكرات ---
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

        // --- ميزة الذكاء الاصطناعي (كيدي) ---
        if (body.startsWith('كيدي') || body.startsWith('.ai')) {
            await chat.sendStateTyping();

            let promptText = body.replace('كيدي', '').replace('.ai', '').trim();
            
            let imageBase64 = null;
            let mimeType = null;

            // لو في صورة
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media.mimetype.startsWith('image/')) {
                    imageBase64 = media.data;
                    mimeType = media.mimetype;
                }
            } else if (!promptText) {
                await msg.reply("حبابك يا مدير! دايرني في شنو؟ 🤖");
                return;
            }

            // الاتصال بـ Gemini
            const responseText = await askGemini(promptText, imageBase64, mimeType);
            
            // الرد
            await msg.reply(responseText);
            console.log('🤖 AI Replied');
        }

        // --- ميزة الفحص ---
        if (body === '!ping') {
            await msg.reply('Pong! 🏓 أنا شغال وسرعتي فل.');
        }

    } catch (error) {
        console.error('❌ Error handling message:', error);
    }
});

client.initialize();
