require('dotenv').config();
// ✅ التعديل 1: تمت إضافة MessageMedia لأنه كان مفقوداً وسيسبب خطأ عند طلب الصور
const { Client, LocalAuth, Location, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY;

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, stats: {}, groupStats: {}, pendingGames: {}, welcomedChats: [] };

if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
} else { saveData(); }

function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// ==================== DATA ARRAYS ====================
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
  "الله أكبر، وقت السجود قد حان 🕋"
];

const greetings = ["صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"];
const facts = ["أكبر صحراء في العالم هي الصحراء الكبرى.", "السودان يقع في شمال شرق أفريقيا."];
const quotes = ["كن التغيير الذي تريد أن تراه في العالم.", "العقل زينة."];
const randomImages = [{ url: 'https://picsum.photos/400/400', caption: 'صورة عشوائية' }];

// ==================== FUNCTIONS ====================
async function getWeather(city) {
  const apiKey = process.env.WEATHER_API_KEY; 
  if (!apiKey) return 'عذرًا، لم يتم إعداد مفتاح API للطقس.';
  try {
    const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&lang=ar`);
    const d = resp.data;
    return `الطقس في ${d.location.name}: ${d.current.condition.text}\n🌡 ${d.current.temp_c}°C\n💧 ${d.current.humidity}%\n💨 ${d.current.wind_kph} كم/س`;
  } catch { return 'عذرًا، لم أتمكن من جلب بيانات الطقس.'; }
}

async function translateText(text, lang) {
  try {
    const resp = await axios.post('https://libretranslate.de/translate', { q: text, source: 'auto', target: lang, format: 'text' });
    return resp.data?.translatedText || 'خطأ في الترجمة.';
  } catch { return 'خطأ في الترجمة.'; }
}

async function getDates() {
  const today = new Date();
  const hijri = new Intl.DateTimeFormat('ar-SA-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(today);
  return `📅 اليوم:\n- الميلادي: ${today.toLocaleDateString('ar-EG')}\n- الهجري: ${hijri}`;
}

async function getContactNameOrNumber(id) {
  try { const c = await client.getContactById(id); return c.pushname || c.name || id.replace('@c.us', ''); }
  catch { return id.replace('@c.us', ''); }
}

// ==================== CLIENT SETUP (THE FIX) ====================
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "kidi-final-fix-v2", // ✅ تغيير الاسم لإنشاء جلسة جديدة نظيفة
    dataPath: "./.wwebjs_auth"
  }),
  // ✅ التعديل 2: هذا الكود يجبر البوت على استخدام نسخة واتساب ويب محددة تعمل مع المكتبة
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
client.on('qr', async qr => {
  try {
    console.log('📌 تم توليد QR — جارٍ رفعه...');
    if (IMGBB_KEY) {
      const qrPath = path.join(__dirname, 'qr.png');
      await QRCode.toFile(qrPath, qr);
      const form = new FormData();
      form.append('image', fs.createReadStream(qrPath));
      const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
      if (resp.data?.data?.url) console.log('✅ رابط الـ QR:', resp.data.data.url);
      if(fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
    } else { console.log('✅ QR Code (Terminal):', qr); }
  } catch (err) { console.error('❌ خطأ رفع QR:', err.message); }
});

client.on('loading_screen', (percent, message) => {
    console.log('⏳ جاري التحميل:', percent, '%', message);
});

client.on('ready', () => {
  console.log('✅✅ البوت جاهز ويستقبل الرسائل الآن! ✅✅');
  schedulePrayerReminders();
});

// ==================== LOGIC ====================
async function schedulePrayerReminders() {
  prayerJobs.forEach(j => j.stop());
  prayerJobs = [];
  try {
    const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', { params: { city: 'Khartoum', country: 'Sudan', method: 2 } });
    const times = res.data?.data?.timings;
    if (!times) return;
    
    const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
    for (const key in map) {
      const [h, m] = times[key].split(':').map(Number);
      const job = cron.schedule(`${m} ${h} * * *`, () => {
        const text = `${pickRandom(prayerReminders)}\n🕒 ${map[key]} الآن`;
        [...new Set([...data.subscribers])].forEach(id => client.sendMessage(id, text).catch(() => {}));
      }, { timezone: 'Africa/Khartoum' });
      prayerJobs.push(job);
    }
  } catch (e) { console.error('Error fetching prayer times'); }
}

cron.schedule('5 0 * * *', schedulePrayerReminders, { timezone: 'Africa/Khartoum' });
cron.schedule('0 8 * * *', () => { data.subscribers.forEach(id => client.sendMessage(id, pickRandom(greetings)).catch(()=>{})); }, { timezone: 'Africa/Khartoum' });

// ==================== MESSAGE HANDLER ====================
client.on('message', async msg => {
  const from = msg.from;
  const body = msg.body.trim();

  // ✅ لوج عشان نتأكد إن الرسائل واصلة
  console.log(`📩 رسالة من ${from}: ${body}`);

  if (msg.fromMe) return;

  // Auto-Welcome
  if (!msg.isGroup && !data.welcomedChats.includes(from)) {
    data.welcomedChats.push(from); saveData();
    await msg.reply(getCommandsList());
  }

  // Spontaneous
  if (body === 'كيدي-بوت-روبوت') return msg.reply("مرحباً بك! أنا هنا للمساعدة.");

  // Group Stats
  if (msg.isGroup) {
    const chat = await msg.getChat();
    const g = data.groupStats[chat.id._serialized] ||= { messages: {}, createdTimestamp: chat.createdTimestamp, participants: [] };
    g.participants = chat.participants.map(p => p.id._serialized);
    const author = msg.author || msg.from;
    g.messages[author] = (g.messages[author] || 0) + 1;
    saveData();
  }

  // Commands
  if (body === 'اوامر') return msg.reply(getCommandsList());
  if (body === 'اشترك') return msg.reply(data.subscribers.includes(from) ? 'مشترك بالفعل' : (data.subscribers.push(from), saveData(), '✅ تم الاشتراك'));
  if (body === 'الغاء') return msg.reply(data.subscribers.includes(from) ? (data.subscribers.splice(data.subscribers.indexOf(from),1), saveData(), '✅ تم الإلغاء') : 'لست مشتركاً');
  if (body === 'نكتة') return msg.reply(pickRandom(jokes));
  
  if (body === 'احصائيات القروب' && msg.isGroup) {
    const stats = data.groupStats[from] || { messages: {} };
    const sorted = Object.entries(stats.messages).sort((a,b) => b[1]-a[1]);
    if (!sorted.length) return msg.reply('لا توجد بيانات.');
    const topName = await getContactNameOrNumber(sorted[0][0]);
    return msg.reply(`🏆 الأكثر تفاعل: ${topName} (${sorted[0][1]})`);
  }

  // Games
  if (body === 'العب رقم') {
    data.pendingGames[from] = { type: 'guess', number: Math.floor(Math.random()*10)+1, tries: 0 }; saveData();
    return msg.reply('اخترت رقم (1-10)، خمن!');
  }
  if (data.pendingGames[from]?.type === 'guess' && /^\d+$/.test(body)) {
    const g = data.pendingGames[from];
    g.tries++;
    if (+body === g.number) { delete data.pendingGames[from]; saveData(); return msg.reply(`🎉 صح!`); }
    saveData(); return msg.reply(+body < g.number ? '⬆ أعلى' : '⬇ أقل');
  }

  // Utility
  if (body === 'التاريخ') return msg.reply(await getDates());
  if (body === 'معلومة') return msg.reply(pickRandom(facts));
  if (body === 'اقتباس') return msg.reply(pickRandom(quotes));
  
  if (body === 'صورة') {
    const img = pickRandom(randomImages);
    // ✅ هنا كان سيحدث خطأ في كودك القديم بسبب نقص MessageMedia
    try {
        const media = await MessageMedia.fromUrl(img.url);
        return client.sendMessage(from, media, { caption: img.caption });
    } catch (e) { return msg.reply('خطأ في جلب الصورة'); }
  }

  if (body.startsWith('ذكاء ')) {
    if(!OPENAI_API_KEY) return msg.reply('الخدمة غير مفعلة.');
    try {
        const r = await axios.post('https://api.openai.com/v1/chat/completions', { model: 'gpt-3.5-turbo', messages: [{role:'user', content:body.slice(6)}] }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
        return msg.reply(r.data.choices[0].message.content);
    } catch { return msg.reply('خطأ AI'); }
  }

  if (body.includes('السلام')) return msg.reply('وعليكم السلام 👋');
});

function getCommandsList() {
    return `مرحباً! أنا كيدي v1.2 🤖\nاكتب "اوامر" لرؤية القائمة الكاملة.`;
}

client.initialize();
