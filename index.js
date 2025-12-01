const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const qrcode = require('qrcode');
const express = require('express');
const app = express();

const port = process.env.PORT || 8000;
let qrCodeImage = "<h1>جاري الاتصال...</h1>";

app.get('/', (req, res) => res.send(`
    <html><body><div style="text-align:center; padding:50px;">
    <h2>Kede Bot Status</h2>
    <div>${qrCodeImage}</div>
    </div></body></html>
`));

app.listen(port, () => console.log(`Server running on ${port}`));

// -----------------------------------------------------------
// 🔥 هام جداً: امسح النص الموجود والصق مفتاحك الجديد هنا
// -----------------------------------------------------------
const API_KEY = "AIzaSyDKOCf8PsMnZUBWlbRv7Dg847g3SrjVYdM"; 

const genAI = new GoogleGenerativeAI(API_KEY);

// استخدمنا هذا الموديل لأنه الأكثر استقراراً الآن
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", 
    systemInstruction: "أنت كيدي، مساعد سوداني ذكي ومرح."
});

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
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) qrCodeImage = `<img src="${url}" width="300">`;
    });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Ready!');
    qrCodeImage = "<h1>✅ تم الربط بنجاح!</h1>";
});

client.on('message_create', async (msg) => {
    if (msg.fromMe) return;

    const body = msg.body.toLowerCase().trim();
    console.log(`📩 New msg: ${body}`);

    if (body.startsWith('كيدي') || body.startsWith('.ai')) {
        const prompt = body.replace('كيدي', '').replace('.ai', '').trim() || "مرحبا";
        
        try {
            const result = await model.generateContent(prompt);
            await msg.reply(result.response.text());
        } catch (error) {
            console.error('Gemini Error:', error);
            // رسالة توضح نوع الخطأ للمستخدم
            await msg.reply("معليش، حصلت مشكلة في المفتاح أو الموديل.");
        }
    }
});

client.initialize();
