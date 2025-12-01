const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // المكتبة الجديدة للاتصال
const qrcode = require('qrcode');
const express = require('express');
const app = express();

// مفتاحك الخاص (مدمج)
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
// 2. دالة الاتصال المباشر بـ Gemini (بدون مكتبة)
// ------------------------------------------------------------------
async function askGemini(prompt, imageBase64 = null, mimeType = null) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
    
    let contentsPart = { text: prompt };
    
    // لو في صورة، نضيفها للطلب
    if (imageBase64) {
        contentsPart = [
            { text: prompt || "صف هذه الصورة" },
            {
                inline_data: {
                    mime_type: mimeType,
                    data: imageBase64
                }
            }
        ];
    } else {
        contentsPart = [{ text: prompt }];
    }

    const payload = {
        contents: [{ parts: contentsPart }],
        // تعليمات النظام (الشخصية)
        system_instruction: {
            parts: [{ text: "أنت 'كيدي'، مساعد شخصي سوداني ذكي ومرح. تتحدث باللهجة السودانية وتستخدم الإيموجي." }]
        }
    };

    try {
        const response = await axios.post(url, payload);
        // استخراج النص من رد قوقل
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Gemini API Error:", error.response ? error.response.data : error.message);
        return "معليش يا مدير، الشبكة طشّت شوية 😅";
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
                // لو ماف نص وماف صورة
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
