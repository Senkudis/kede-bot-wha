require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const fs = require("fs");
const cron = require("node-cron");
const path = require("path");
const QRCode = require("qrcode");
const axios = require("axios");
const FormData = require("form-data");

// ===== 1. تحميل وتهيئة البيانات =====
const DATA_FILE = path.join(__dirname, 'data.json');

let data = {};
if (fs.existsSync(DATA_FILE)) {
    try {
        data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (error) {
        console.error('❌ خطأ في قراءة ملف البيانات:', error);
        data = {};
    }
}

// تهيئة الحقول المفقودة لتجنب الأخطاء
if (!Array.isArray(data.subscribers)) data.subscribers = [];
if (!data.pendingQuiz || typeof data.pendingQuiz !== 'object') data.pendingQuiz = {};
if (!data.pendingGames || typeof data.pendingGames !== 'object') data.pendingGames = {};
if (!data.stats || typeof data.stats !== 'object') data.stats = {};
if (!data.groupStats || typeof data.groupStats !== 'object') data.groupStats = {};
if (!Array.isArray(data.welcomedChatsPrivate)) data.welcomedChatsPrivate = [];
if (!Array.isArray(data.welcomedChatsGroups)) data.welcomedChatsGroups = [];
if (!Array.isArray(data.welcomedChats)) data.welcomedChats = [];

// حفظ التعديلات الأولية
saveData();

console.log('✅ تم تحميل وتهيئة ملف البيانات');

// ===== 2. الإعدادات والمتغيرات =====
const IMGBB_KEY = process.env.IMGBB_KEY; // تأكد من وجود هذا في ملف .env

// دوال مساعدة للحفظ والاختيار العشوائي
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// قوائم البيانات (نكت، تذكيرات، أسئلة)
const jokes = [
    "قال ليك في مسطول بكتب مع الأستاذ وكل ما الأستاذ يمسح السبوره يشرط الورقة",
    "مسطول شغال بتاع مرور قبض واحد يفحط قطعة إيصال بثلاثين ألف قام أداه خمسين الف المسطول قالي مامعاي فكه فحط بالعشرين الباقية وتعال.",
    "طبيب اسنان قال لي زبونو : حسيت بي وجع؟ قال ليهو: مهما كان في الم ما بصل الم الفاتورة الجاياني اسي .",
    "مرة واحد مشى السوق، نسى يرجع!",
    "واحد قال لي صاحبو: عندك ساعة؟ قال ليهو: لا والله الزمن فاتني."
];

const triviaQuestions = [
    { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
    { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) الفرات", answer: "أ" },
    { q: "ما هو العنصر الذي رمزه H؟\nأ) هيليوم\nب) هيدروجين\nج) هافنيوم", answer: "ب" }
];

const prayerReminders = [
    "قوموا يا عباد الله إلى الصلاة 🙏",
    "حيّ على الصلاة، حيّ على الفلاح 🕌",
    "الله أكبر، وقت السجود قد حان 🕋"
];

const greetings = ["صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"];

// ===== 3. دوال الخدمات (API Logic) =====

// دالة الطقس
async function getWeather(city) {
    try {
        const apiKey = '316d0c91eed64b65a15211006251008'; // يفضل وضعه في .env
        const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&lang=ar`);
        const d = resp.data;
        return `الطقس في ${d.location.name}: ${d.current.condition.text}\n🌡️ الحرارة: ${d.current.temp_c}°C\n💧 الرطوبة: ${d.current.humidity}%\n💨 الريح: ${d.current.wind_kph} كم/س`;
    } catch {
        return 'عذرًا، لم أتمكن من جلب بيانات الطقس (تأكد من اسم المدينة).';
    }
}

// دالة الترجمة
async function translateText(text, lang) {
    try {
        // نستخدم API بديل لأن libretranslate قد يتوقف أحياناً
        const resp = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`);
        return resp.data.responseData.translatedText;
    } catch {
        return 'حدث خطأ في خدمة الترجمة.';
    }
}

// === الدوال المفقودة التي تمت إضافتها (Pollinations AI) ===
async function getPollinationsText(prompt) {
    try {
        // استخدام Pollinations.ai للنصوص (مجاني)
        const response = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
        return response.data; // الرد نصي مباشر
    } catch (error) {
        console.error("AI Text Error:", error.message);
        return "عذراً، حدث خطأ أثناء الاتصال بخادم الذكاء الاصطناعي.";
    }
}

async function getPollinationsImage(prompt) {
    try {
        // استخدام Pollinations.ai للصور (مجاني)
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data).toString('base64');
    } catch (error) {
        console.error("AI Image Error:", error.message);
        return null;
    }
}
// =======================================================

async function getDates() {
    const today = new Date();
    return `التاريخ اليوم:\n📅 الميلادي: ${today.toLocaleDateString('en-GB')}`;
}

// ===== 4. إعداد عميل الواتساب =====
const client = new Client({
    authStrategy: new LocalAuth(), // يحفظ الجلسة تلقائياً
  puppeteer: {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu', 
        '--single-process', 
        '--no-zygote'
    ],
    executablePath: '/usr/bin/google-chrome-stable' // أحياناً Railway يحتاج هذا المسار إذا كنت تستخدم Dockerfile
}
    }
});

let prayerJobs = [];

// معالجة QR Code
client.on('qr', async qr => {
    try {
        console.log('📌 تم توليد QR — جارٍ رفعه...');
        const qrPath = path.join(__dirname, 'qr.png');
        await QRCode.toFile(qrPath, qr);
        console.log('Scan the QR code found in root folder: qr.png');
        
        // رفع الصورة إذا توفر المفتاح
        if (IMGBB_KEY) {
            const form = new FormData();
            form.append('image', fs.createReadStream(qrPath));
            const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
            if (resp.data?.data?.url) console.log('✅ رابط الـ QR:', resp.data.data.url);
        }
        // حذف الملف لاحقاً (اختياري، تركته لكي تراه)
        // fs.unlinkSync(qrPath); 
    } catch (err) { console.error('❌ خطأ رفع QR:', err); }
});

client.on('ready', () => {
    console.log('✅ البوت جاهز ومتصل!');
    schedulePrayerReminders();
});

// جدولة الصلاة
async function getPrayerTimes() {
    try {
        const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', { params: { city: 'Khartoum', country: 'Sudan', method: 2 } });
        return res.data?.data?.timings || null;
    } catch { return null; }
}

async function schedulePrayerReminders() {
    prayerJobs.forEach(j => j.stop());
    prayerJobs = [];
    const times = await getPrayerTimes();
    if (!times) return;
    const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
    for (const key in map) {
        const [h, m] = times[key].split(':').map(Number);
        const job = cron.schedule(`${m} ${h} * * *`, () => {
            const text = `${pickRandom(prayerReminders)}\n🕒 ${map[key]} الآن`;
            // إرسال للمشتركين والقروبات النشطة
            const targets = new Set([...data.subscribers, ...Object.keys(data.groupStats)]);
            targets.forEach(id => client.sendMessage(id, text).catch(() => {}));
        }, { timezone: 'Africa/Khartoum' });
        prayerJobs.push(job);
    }
    console.log("🕌 تم جدولة مواقيت الصلاة لليوم.");
}

// جدولة التحديث اليومي للمواقيت والرسائل الصباحية
cron.schedule('5 0 * * *', schedulePrayerReminders, { timezone: 'Africa/Khartoum' });

cron.schedule('0 8 * * *', () => {
    const text = pickRandom(greetings);
    data.subscribers.forEach(id => client.sendMessage(id, text).catch(()=>{}));
}, { timezone: 'Africa/Khartoum' });

// دوال مساعدة للأسماء
async function getContactNameOrNumber(id) {
    try { const c = await client.getContactById(id); return c.pushname || c.name || c.number || id; }
    catch { return id; }
}

function getCommandsList() {
    return `🤖 *أوامر كيدي v1.2*

🔹 *الأساسيات:*
- اشترك / الغاء: لخدمة التذكيرات
- نكتة: للضحك
- معلومة / اقتباس: للفائدة
- التاريخ: تاريخ اليوم

🎮 *الألعاب:*
- العب رقم: تخمين 1-10
- لغز: سؤال وجواب
- حجر، ورق، مقص

🧠 *الذكاء الاصطناعي:*
- ذكاء [سؤالك]: للتحدث معي
- تخيل [وصف]: لرسم صورة
- ترجم [نص] إلى [en/fr..]: ترجمة

📊 *المجموعات:*
- احصائيات: تفاعل الأعضاء
- طقس [المدينة]: حالة الطقس

👨‍💻 المطور: ضياءالدين ابراهيم
`;
}

// ===== 5. معالج الرسائل الموحد (Main Message Handler) =====
client.on('message', async (msg) => {
    const from = msg.from;
    const body = msg.body.trim();
    
    // تجاهل رسائل الحالة (Status)
    if (from === 'status@broadcast') return;

    console.log(`📩 رسالة من ${from}: ${body}`);

    // 1. الترحيب عند الإضافة لقروب
    if (msg.from.endsWith('@g.us')) {
        const chat = await msg.getChat();
        // إذا تمت إشارة البوت أو هو مشارك جديد (تبسيط للمنطق)
        if (!data.welcomedChatsGroups.includes(chat.id._serialized)) {
            // نتحقق إذا البوت موجود في المشاركين (تجاوزنا التحقق الدقيق لتبسيط الكود)
            data.welcomedChatsGroups.push(chat.id._serialized);
            saveData();
            await chat.sendMessage(getCommandsList());
        }
        
        // تحديث إحصائيات القروب
        const g = data.groupStats[from] ||= { messages: {}, createdTimestamp: chat.createdTimestamp || Date.now() };
        const author = msg.author || from;
        g.messages[author] = (g.messages[author] || 0) + 1;
        saveData();
    }

    // 2. الترحيب في الخاص
    if (!msg.from.endsWith('@g.us') && !data.welcomedChatsPrivate.includes(from)) {
        data.welcomedChatsPrivate.push(from);
        saveData();
        await msg.reply(getCommandsList());
    }

    // 3. الردود التلقائية والأوامر
    if (body === 'ping') return msg.reply('pong 🏓');

    if (body === 'كيدي') {
        const replies = ["أها، كيف أقدر أساعدك؟", "موجود، آمرني!", "يا هلا، معاك كيدي."];
        return msg.reply(pickRandom(replies));
    }

    if (body === 'اوامر' || body === 'مساعدة') return msg.reply(getCommandsList());

    // الاشتراكات
    if (body === 'اشترك') {
        if (!data.subscribers.includes(from)) {
            data.subscribers.push(from);
            saveData();
            return msg.reply('✅ تم الاشتراك في التذكيرات اليومية.');
        } else return msg.reply('أنت مشترك بالفعل!');
    }

    if (body === 'الغاء') {
        const index = data.subscribers.indexOf(from);
        if (index > -1) {
            data.subscribers.splice(index, 1);
            saveData();
            return msg.reply('✅ تم إلغاء الاشتراك.');
        } else return msg.reply('أنت لست مشتركاً.');
    }

    // الترفيه
    if (body === 'نكتة') return msg.reply(pickRandom(jokes));
    
    if (body === 'معلومة') {
        const facts = ["قلب الحوت الأزرق بحجم سيارة!", "النحل يميز الوجوه.", "العسل لا يفسد أبداً."];
        return msg.reply(pickRandom(facts));
    }

    if (body === 'اقتباس') {
        const quotes = ["لا تؤجل عمل اليوم إلى الغد.", "الوقت كالسيف إن لم تقطعه قطعك."];
        return msg.reply(pickRandom(quotes));
    }

    // الألعاب
    if (body === 'العب رقم') {
        data.pendingGames[from] = { type: 'guess', number: Math.floor(Math.random()*10)+1, tries: 0 };
        saveData();
        return msg.reply('🔢 اخترت رقم من 1 إلى 10، حاول تخمينه!');
    }

    if (data.pendingGames[from]?.type === 'guess' && /^\d+$/.test(body)) {
        const g = data.pendingGames[from];
        const guess = parseInt(body);
        g.tries++;
        if (guess === g.number) {
            delete data.pendingGames[from];
            saveData();
            return msg.reply(`🎉 برافو! الرقم كان ${guess} (عدد المحاولات: ${g.tries})`);
        }
        saveData();
        return msg.reply(guess < g.number ? '⬆️ أكبر شوية' : '⬇️ أصغر شوية');
    }

    if (body === 'لغز') {
        const q = pickRandom(triviaQuestions);
        data.pendingQuiz[from] = q;
        saveData();
        return msg.reply(q.q);
    }

    if (['أ','ب','ج'].includes(body) || ['A','B','C'].includes(body.toUpperCase())) {
        const p = data.pendingQuiz[from];
        if (p) {
            const answer = body.toLowerCase().replace('a','أ').replace('b','ب').replace('c','ج');
            const isCorrect = answer === p.answer;
            delete data.pendingQuiz[from];
            saveData();
            return msg.reply(isCorrect ? '✅ إجابة صحيحة!' : '❌ خطأ، حظ أوفر.');
        }
    }

    if (['حجر','ورق','مقص'].includes(body)) {
        const choices = ['حجر','ورق','مقص'];
        const botChoice = pickRandom(choices);
        let result = (body === botChoice) ? 'تعادل 😐' : 
                     ((body === 'حجر' && botChoice === 'مقص') || (body === 'ورق' && botChoice === 'حجر') || (body === 'مقص' && botChoice === 'ورق')) ? 'فزت 🎉' : 'خسرت 😢';
        return msg.reply(`أنا اخترت: ${botChoice}\nالنتيجة: ${result}`);
    }

    // أدوات مفيدة
    if (body.startsWith('طقس ')) return msg.reply(await getWeather(body.slice(4).trim()));
    if (body === 'التاريخ') return msg.reply(await getDates());
    
    if (body.startsWith('ترجم ')) {
        const regex = /^ترجم (.+) إلى (\w{2})$/;
        const match = body.match(regex);
        if (!match) return msg.reply('⚠️ الصيغة خطأ. مثال: ترجم مرحبا إلى en');
        return msg.reply(await translateText(match[1], match[2]));
    }

    // إحصائيات القروب
    if (body === 'احصائيات') {
        if (!msg.getChat().then(c => c.isGroup)) return msg.reply('هذا الأمر للمجموعات فقط.');
        const stats = data.groupStats[from]?.messages || {};
        const sorted = Object.entries(stats).sort((a,b) => b[1]-a[1]).slice(0, 5); // أفضل 5
        if (!sorted.length) return msg.reply('لا توجد بيانات كافية بعد.');
        
        let report = '📊 *أكثر الأعضاء تفاعلاً:*\n';
        for (const [id, count] of sorted) {
            const name = await getContactNameOrNumber(id);
            report += `🥇 ${name}: ${count} رسالة\n`;
        }
        return msg.reply(report);
    }

    // الذكاء الاصطناعي (تم إصلاح الدوال)
    if (body.startsWith('ذكاء ')) {
        const prompt = body.slice(5).trim();
        if (!prompt) return msg.reply('اكتب سؤالك، مثال: ذكاء كيف أتعلم البرمجة؟');
        await msg.reply('🧠 جاري التفكير...');
        const aiResponse = await getPollinationsText(prompt);
        return msg.reply(aiResponse);
    }

    if (body.startsWith('تخيل ')) {
        const prompt = body.slice(5).trim();
        if (!prompt) return msg.reply('اكتب الوصف، مثال: تخيل سيارة تطير في المستقبل');
        await msg.reply('🎨 جاري الرسم (قد يستغرق وقتاً)...');
        const base64 = await getPollinationsImage(prompt);
        if (base64) {
            const media = new MessageMedia('image/jpeg', base64);
            return client.sendMessage(from, media, { caption: `🖼️ *تخيل:* ${prompt}` });
        } else {
            return msg.reply('❌ حدث خطأ أثناء توليد الصورة.');
        }
    }
});

// ترحيب بانضمام عضو جديد للقروب
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const contact = await client.getContactById(notification.id.participant);
        await chat.sendMessage(`👋 أهلاً بك @${contact.id.user} في *${chat.name}*!`, { mentions: [contact] });
    } catch (e) { console.error('Error in welcome:', e); }
});

// حفظ عند الإغلاق
process.on('SIGINT', () => {
    console.log('💾 حفظ وإغلاق...');
    saveData();
    client.destroy();
    process.exit();
});
// هذا الكود يخبرك عند نجاح المصادقة
client.on('authenticated', () => {
    console.log('🔑 تم المصادقة بنجاح! (Authenticated)');
});

// هذا الكود يخبرك عند بدء تحميل المحادثات
client.on('auth_failure', msg => {
    console.error('❌ فشل المصادقة:', msg);
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ جاري التحميل: ${percent}% - ${message}`);
});

client.initialize();
