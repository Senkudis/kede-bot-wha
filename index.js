require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');

// استدعاء ملف الأوامر الخارجي
const commands = require('./commands'); 

// --- إعدادات السيرفر ---
const app = express();
const port = process.env.PORT || 8000;
let qrImageUrl = "";

app.get('/', (req, res) => res.send(`<h1>Kede Bot Active</h1><br><img src="${qrImageUrl}" width="300"/>`));
app.listen(port, () => console.log(`Server running on port ${port}`));

// --- المتغيرات البيئية ---
const ENV_KEYS = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-proj-...', // ضع مفاتيحك هنا أو في .env
    IMGBB_KEY: process.env.IMGBB_KEY || '8df2f63e10f44cf4f6f7d99382861e76',
    WEATHER_API_KEY: process.env.WEATHER_API_KEY || '316d0c91eed64b65a15211006251008'
};

// --- إدارة البيانات (Data Store) ---
const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, pendingGames: {}, groupStats: {}, welcomedChats: [] };

if (fs.existsSync(DATA_FILE)) {
    try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } catch (e) {}
}

function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// --- إعداد العميل ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--single-process', '--disable-gpu']
    }
});

client.on('qr', async qr => {
    console.log('📌 QR Generated');
    try {
        const qrPath = path.join(__dirname, 'qr.png');
        await qrcode.toFile(qrPath, qr);
        const form = new FormData();
        form.append('image', fs.createReadStream(qrPath));
        const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${ENV_KEYS.IMGBB_KEY}`, form, { headers: form.getHeaders() });
        if (resp.data?.data?.url) qrImageUrl = resp.data.data.url;
    } catch (err) { console.error('QR Upload Error'); }
});

client.on('ready', () => console.log('✅ Bot Ready'));

client.on('message', async msg => {
    const from = msg.from;
    const body = msg.body.trim();
    
    // تقسيم الرسالة لأمر ونص (مثال: "طقس الخرطوم" -> الأمر: طقس، النص: الخرطوم)
    const splitIndex = body.indexOf(' ');
    const cmd = splitIndex === -1 ? body : body.substring(0, splitIndex);
    const args = splitIndex === -1 ? '' : body.substring(splitIndex + 1);

    // 1. معالجة الإجابات على الألغاز (خاصة)
    if (data.pendingQuiz[from] && ['أ', 'ب'].includes(body)) {
        const isCorrect = body === data.pendingQuiz[from].answer;
        delete data.pendingQuiz[from]; saveData();
        return msg.reply(isCorrect ? '✅ صح!' : '❌ غلط!');
    }

    // 2. البحث عن الأمر في ملف commands.js وتنفيذه
    if (commands[cmd]) {
        try {
            // نمرر للملف الخارجي كل الأدوات اللي ممكن يحتاجها
            await commands[cmd](msg, args, ENV_KEYS, data, saveData);
        } catch (error) {
            console.error(error);
            msg.reply('❌ حصل خطأ أثناء تنفيذ الأمر.');
        }
    } 
    
    // 3. أوامر الاشتراك (ممكن تخليها هنا أو تنقلها للملف الخارجي)
    else if (cmd === 'اشترك') {
        if (!data.subscribers.includes(from)) {
            data.subscribers.push(from); saveData(); msg.reply('✅ تم الاشتراك');
        } else msg.reply('مشترك مسبقاً');
    }
    else if (cmd === 'الغاء') {
        const idx = data.subscribers.indexOf(from);
        if (idx > -1) { data.subscribers.splice(idx, 1); saveData(); msg.reply('✅ تم الإلغاء'); }
    }
});

client.initialize();
