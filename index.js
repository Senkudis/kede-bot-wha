const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode');
const express = require('express');
const app = express();

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
// 2. دالة الاتصال الذكية (تجرب عدة موديلات)
// ------------------------------------------------------------------
async function askGemini(prompt, imageBase64 = null, mimeType = null) {
    
    // قائمة الموديلات اللي حيجربها بالترتيب
    // لو الأول فشل، يدخل على الثاني، وهكذا
    const modelsToTry = [
        "gemini-1.5-flash",    // الأسرع
        "gemini-1.5-pro",      // الأذكى
        "gemini-1.0-pro",      // الأكثر استقراراً (قديم)
        "gemini-pro"           // الاسم الكلاسيكي
    ];

    const systemPrompt = "أنت 'كيدي'، مساعد شخصي سوداني ذكي ومرح. ردودك مختصرة ومفيدة وتستخدم الإيموجي.\n\nالسؤال: ";
    const finalPrompt = systemPrompt + (prompt || "صف هذه الصورة");

    // تجهيز البيانات
    let parts = [{ text: finalPrompt }];
    if (imageBase64) {
        parts.push({
            inline_data: {
                mime_type: mimeType,
                data: imageBase64
            }
        });
    }

    const payload = { contents: [{ parts: parts }] };

    // حلقة تكرار تجرب الموديلات واحد واحد
    for (const modelName of modelsToTry) {
        try {
            console.log(`🔄 Trying model: ${modelName}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
            
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000 
            });

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.log(`✅ Success with ${modelName}`);
                return response.data.candidates[0].content.parts[0].text;
            }
        } catch (error) {
            console.error(`❌ Failed with ${modelName}: ${error.response?.status || error.message}`);
            // لو فشل، اللوب حتكمل للموديل البعده طوالي
        }
    }

    return "معليش يا مدير، جربت كل الطرق والشبكة ما ساعدتني 😅. حاول تاني بعد شوية.";
}

// ------------------------------------------------------------------
// 3. إعداد الواتساب
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
    qrCodeImage = "<h1>✅ تم الربط بنجاح! كيدي جاهز.</h1>";
});

client.on('disconnected', (reason) => {
    console.log('❌ Disconnected:', reason);
    isClientReady = false;
    client.initialize(); 
});

client.on('message_create', async (msg) => {
    if (msg.fromMe) return;

    const body = msg.body.toLowerCase().trim();

    try {
        if (msg.hasMedia && (body === 'ملصق' || body === 'sticker' || body === 'ستيكر')) {
            const media = await msg.downloadMedia();
            await client.sendMessage(msg.from, media, { 
                sendMediaAsSticker: true, stickerName: "Kede", stickerAuthor: "Bot" 
            });
            return;
        }

        if (body.startsWith('كيدي') || body.startsWith('.ai')) {
            const chat = await msg.getChat();
            chat.sendStateTyping(); 

            let promptText = body.replace('كيدي', '').replace('.ai', '').trim();
            let imageBase64 = null;
            let mimeType = null;

            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media.mimetype.startsWith('image/')) {
                    imageBase64 = media.data;
                    mimeType = media.mimetype;
                }
            } else if (!promptText) {
                await msg.reply("حبابك! دايرني في شنو؟ 🤖");
                return;
            }

            const responseText = await askGemini(promptText, imageBase64, mimeType);
            await msg.reply(responseText);
        }
        
        if (body === '!ping') await msg.reply('Pong! 🚀');

    } catch (error) {
        console.error('Error:', error.message);
    }
});

client.initialize();
