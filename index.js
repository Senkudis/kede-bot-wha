require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

// ==================== CONFIGURATION ====================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '316d0c91eed64b65a15211006251008';

const DATA_FILE = path.join(__dirname, 'data.json');

// ==================== DATA MANAGEMENT ====================
let data = {
    subscribers: [],
    pendingQuiz: {},
    pendingGames: {},
    groupStats: {},
    welcomedChats: new Set()
};

// Load data
if (fs.existsSync(DATA_FILE)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        loaded.welcomedChats = Array.isArray(loaded.welcomedChats) ? new Set(loaded.welcomedChats) : new Set();
        data = loaded;
    } catch (e) {
        console.error('❌ خطأ في قراءة data.json', e);
    }
}

function saveData() {
    try {
        const dataToSave = {
            ...data,
            welcomedChats: Array.from(data.welcomedChats)
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (e) {
        console.error('❌ خطأ في حفظ data.json', e);
    }
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ==================== CONTENT ====================
const jokes = [
    "قال ليك في مسطول بكتب مع الأستاذ وكل ما الأستاذ يمسح السبوره يشرط الورقة",
    "مسطول شغال بتاع مرور قبض واحد يفحط قطعة إيصال بثلاثين ألف قام أداه خمسين الف المسطول قالي مامعاي فكه فحط بالعشرين الباقية وتعال.",
    "المزاج زي الفجر — لو صحّيت عليه تتمنى اليوم كله جميل.",
    "مرة واحد قالي أحبك، قلت: حاضر بس خلّيني أخلص شاي الصباح.",
    "قالوا الدنيا جزئين: قهوة وناس طيبة — خلّينا نضيف جزء: ضحكة مع أحبابك."
];

const triviaQuestions = [
    { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
    { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" },
    { q: "ما هو العنصر الذي رمزه H؟\nأ) هيليوم\nب) هيدروجين\nج) هافنيوم", answer: "ب" }
];

const prayerReminders = [
    "قوموا يا عباد الله إلى الصلاة 🙏",
    "حيّ على الصلاة، حيّ على الفلاح 🕌",
    "لا تؤجلوا الصلاة، فالدعاء فيها مستجاب 🙌",
    "الله أكبر، وقت السجود قد حان 🕋",
    "الصلاة نور وراحة للروح، لا تفوّتوها",
    "هلمّوا إلى ذكر الله ولقاء الرحمن",
    "قوموا إلى الصلاة قبل فوات الأوان",
    "اجعل الصلاة عادة، والفوز لك إن شاء الله",
    "يا زول، الصلاة تنور القلب وتصفّي البال",
    "أسرعوا قبل أن يأتي الأجر",
    "اذهب إلى الصلاة واطمئن، الله مع المبادرين"
];

const greetings = ["صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"];
const facts = ["أكبر صحراء في العالم هي الصحراء الكبرى.", "اللغة العربية هي خامس أكثر لغة تحدثًا."];
const quotes = ["كن التغيير الذي تريد أن تراه في العالم.", "العقل زينة."];

// ==================== SERVICE FUNCTIONS ====================
async function getWeather(city) {
    try {
        const resp = await axios.get(`https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&lang=ar`, { timeout: 5000 });
        const d = resp.data;
        return `الطقس في ${d.location.name}:\n🌡 ${d.current.condition.text}\n🌡 ${d.current.temp_c}°C\n💧 ${d.current.humidity}%\n💨 ${d.current.wind_kph} كم/س`;
    } catch (err) {
        return 'عذرًا، لم أتمكن من جلب بيانات الطقس.';
    }
}

async function translateText(text, targetLang) {
    try {
        const resp = await axios.post('https://libretranslate.de/translate', { q: text, source: 'auto', target: targetLang, format: 'text' }, { timeout: 5000 });
        return resp.data.translatedText;
    } catch (err) { return 'خطأ في الترجمة.'; }
}

async function getRandomImage() {
    try {
        const resp = await axios.get('https://picsum.photos/400/400', { timeout: 5000 });
        return resp.request.res.responseUrl;
    } catch (err) { return null; }
}

async function getContactNameOrNumber(id) {
    try {
        const c = await client.getContactById(id);
        return c.pushname || c.name || c.shortName || id.replace('@c.us', '');
    } catch { return id.replace('@c.us', ''); }
}

// ==================== WHATSAPP CLIENT (THE FIX) ====================
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "kidi-ultra-fix", // اسم جديد لجلسة نظيفة تماماً
        dataPath: "./.wwebjs_auth"
    }),
    // ✅✅ هذا هو الكود الذي يحل مشكلة التعليق عند 100% ✅✅
    webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let prayerJobs = [];

// ==================== EVENTS ====================
client.on('loading_screen', (percent, message) => {
    console.log('⏳ جاري التحميل:', percent, '%', message);
});

client.on('authenticated', () => {
    console.log('🔑 تم التوثيق (Authenticated)');
});

client.on('ready', () => {
    console.log('✅✅ البوت جاهز وتخطى مشكلة التعليق (READY) ✅✅');
    schedulePrayerReminders();
});

client.on('qr', async qr => {
    console.log('📌 QR Generated');
    try {
        const qrPath = path.join(__dirname, 'qr.png');
        await QRCode.toFile(qrPath, qr);
        const form = new FormData();
        form.append('image', fs.createReadStream(qrPath));
        const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
        console.log('✅ QR URL:', resp.data.data.url);
        if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
    } catch (err) {
        console.log('QR Code String:', qr);
    }
});

// ==================== PRAYER & SCHEDULES ====================
async function getPrayerTimes() {
    try {
        const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', { params: { city: 'Khartoum', country: 'Sudan', method: 2 }, timeout: 5000 });
        return res.data?.data?.timings || null;
    } catch (err) { return null; }
}

async function schedulePrayerReminders() {
    prayerJobs.forEach(j => j.stop());
    prayerJobs = [];
    const times = await getPrayerTimes();
    if (!times) return;
    
    const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
    for (const [key, arabicName] of Object.entries(map)) {
        const [h, m] = times[key].split(':').map(Number);
        if (h >= 0) {
            prayerJobs.push(cron.schedule(`${m} ${h} * * *`, () => sendBroadcast(`${pickRandom(prayerReminders)}\n🕒 ${arabicName} الآن`), { timezone: 'Africa/Khartoum' }));
        }
    }
}

cron.schedule('5 0 * * *', schedulePrayerReminders, { timezone: 'Africa/Khartoum' });
cron.schedule('0 8 * * *', () => sendBroadcast(pickRandom(greetings)), { timezone: 'Africa/Khartoum' });
cron.schedule('0 20 * * *', () => sendBroadcast('مساء الخير! 😄 اكتب "نكتة"'), { timezone: 'Africa/Khartoum' });

async function sendBroadcast(message) {
    const allIds = new Set([...data.subscribers, ...Object.keys(data.groupStats)]);
    for (const id of allIds) {
        try { await client.sendMessage(id, message); } catch (err) {}
    }
}

// ==================== COMMANDS ====================
function getCommandsList() {
    return `السلام عليكم ورحمة الله معكم كيدي v1.2
الأوامر المتاحة:
- اشترك / الغاء
- نكتة
- احصائيات القروب
- العب رقم
- لغز
- حجر، ورق، مقص
- ذكاء [سؤالك]
- طقس [المدينة]
- ترجم [نص] إلى [لغة]
- التاريخ / معلومة / اقتباس / صورة`;
}

// ==================== MESSAGES ====================
client.on('message_create', async (msg) => {
    if (msg.from.endsWith('@g.us')) {
        const chat = await msg.getChat();
        const botId = client.info.wid._serialized;
        if (chat.participants.some(p => p.id._serialized === botId) && !data.welcomedChats.has(chat.id._serialized)) {
            data.welcomedChats.add(chat.id._serialized);
            saveData();
            await chat.sendMessage(getCommandsList());
        }
    }
});

client.on('message', async msg => {
    const from = msg.from;
    const body = msg.body.trim();
    if (msg.fromMe) return;

    if (!from.endsWith('@g.us') && !data.welcomedChats.has(from)) {
        data.welcomedChats.add(from);
        saveData();
        await msg.reply(getCommandsList());
        return;
    }

    if (body === 'كيدي-بوت-روبوت') return msg.reply("أهلاً بيك يا زول!");
    
    // Group Stats
    if (msg.isGroup) {
        const chat = await msg.getChat();
        if (!data.groupStats[from]) data.groupStats[from] = { messages: {}, createdTimestamp: chat.createdTimestamp, participants: [] };
        data.groupStats[from].participants = chat.participants.map(p => p.id._serialized);
        const author = msg.author || msg.from;
        data.groupStats[from].messages[author] = (data.groupStats[from].messages[author] || 0) + 1;
        saveData();
    }

    if (body === 'اوامر') return msg.reply(getCommandsList());
    
    if (body === 'اشترك') {
        if (!data.subscribers.includes(from)) { data.subscribers.push(from); saveData(); return msg.reply('✅ تم الاشتراك'); }
        return msg.reply('✅ مشترك بالفعل');
    }
    if (body === 'الغاء') {
        const idx = data.subscribers.indexOf(from);
        if (idx > -1) { data.subscribers.splice(idx, 1); saveData(); return msg.reply('✅ تم الإلغاء'); }
    }

    if (body === 'نكتة') return msg.reply(pickRandom(jokes));
    
    if (body === 'احصائيات القروب' && msg.isGroup) {
        const stats = data.groupStats[from];
        if (!stats) return msg.reply('لا توجد بيانات.');
        const sorted = Object.entries(stats.messages).sort((a,b) => b[1] - a[1]);
        if (!sorted.length) return msg.reply('لا توجد رسائل.');
        const top = await getContactNameOrNumber(sorted[0][0]);
        return msg.reply(`🏆 الأكثر تفاعل: ${top} (${sorted[0][1]} رسالة)`);
    }

    // Games & Tools
    if (body === 'العب رقم') {
        data.pendingGames[from] = { type: 'guess', number: Math.floor(Math.random()*10)+1, tries: 0 };
        saveData();
        return msg.reply('اخترت رقم من 1-10، خمن!');
    }
    if (data.pendingGames[from]?.type === 'guess' && /^\d+$/.test(body)) {
        const g = data.pendingGames[from];
        const val = parseInt(body);
        g.tries++;
        if (val === g.number) { delete data.pendingGames[from]; saveData(); return msg.reply(`✅ صح! بعد ${g.tries} محاولات`); }
        return msg.reply(val < g.number ? '⬆ اعلى' : '⬇ اقل');
    }

    if (body === 'لغز') {
        const q = pickRandom(triviaQuestions);
        data.pendingQuiz[from] = q;
        saveData();
        return msg.reply(q.q);
    }
    if (['أ','ب','ج'].some(x => body.includes(x)) && data.pendingQuiz[from]) {
        const q = data.pendingQuiz[from];
        delete data.pendingQuiz[from]; saveData();
        return msg.reply(body.includes(q.answer) ? '✅ صح' : `❌ خطأ، الإجابة: ${q.answer}`);
    }

    if (body.startsWith('ذكاء ')) {
        if (!OPENAI_API_KEY) return msg.reply('ميزة الذكاء غير مفعلة (نقص API).');
        try {
            const r = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo', messages: [{role:'user', content: body.slice(5)}]
            }, { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` } });
            return msg.reply(r.data.choices[0].message.content);
        } catch (e) { return msg.reply('خطأ في الاتصال.'); }
    }

    if (body.startsWith('طقس ')) return msg.reply(await getWeather(body.slice(4).trim()));
    if (body === 'صورة') {
        const url = await getRandomImage();
        if (url) return msg.reply(await MessageMedia.fromUrl(url));
    }
});

client.initialize();

process.on('SIGINT', async () => {
    prayerJobs.forEach(j => j.stop());
    await client.destroy();
    process.exit(0);
});
