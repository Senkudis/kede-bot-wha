
require('dotenv').config();
const { Client, LocalAuth, Location } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');
// Note: It's highly recommended to use environment variables for sensitive keys.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY;

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, stats: {}, groupStats: {}, pendingGames: {}, welcomedChats: [] };
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
} else { saveData(); } // Create data.json if it doesn't exist
function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// نكات
const jokes = [
  "قال ليك في مسطول بكتب مع الأستاذ وكل ما الأستاذ يمسح السبوره يشرط الورقة",
  "مسطول شغال بتاع مرور قبض واحد يفحط قطعة إيصال بثلاثين ألف قام أداه خمسين الف المسطول قالي مامعاي فكه فحط بالعشرين الباقية وتعال.",
  "المزاج زي الفجر — لو صحّيت عليه تتمنى اليوم كله جميل.",
  "مرة واحد قالي أحبك، قلت: حاضر بس خلّيني أخلص شاي الصباح.",
  "قالوا الدنيا جزئين: قهوة وناس طيبة — خلّينا نضيف جزء: ضحكة مع أحبابك."
];

// تريفيا
const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "ما هو النهر الأشهر في السودان؟\nأ) النيل\nب) الدمحله\nج) السنجة", answer: "أ" },
  { q: "ما هو العنصر الذي رمزه H؟\nأ) هيليوم\nب) هيدروجين\nج) هافنيوم", answer: "ب" }
];

// تذكيرات الصلاة
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
  "اذهب إلى الصلاة واطمئن، الله مع المبادرين",
  "الصلوات الخمس سبب للبركة، لا تغفل عنها",
  "أقم الصلاة لذكري، وارتاح قلبك",
  "فرصة لنتقرّب لله، استغلها الآن",
  "هيا للصلاة — بركة اليوم تبدأ بها"
];

const greetings = [
  "صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"
];

// معلومات إضافية للأوامر الجديدة
const facts = [
  "أكبر صحراء في العالم هي الصحراء الكبرى.",
  "اللغة العربية هي خامس أكثر لغة تحدثًا في العالم.",
  "السودان يقع في شمال شرق أفريقيا ويطل على البحر الأحمر."
];

const quotes = [
  "كن التغيير الذي تريد أن تراه في العالم. - مهاتما غاندي",
  "العقل زينة، والقلب دليل.",
  "السعادة ليست محطة تصل إليها، بل طريقة للسفر."
];

const randomImages = [
  { url: 'https://i.imgur.com/XYZ123.jpg', caption: 'صورة عشوائية جميلة 1' },
  { url: 'https://i.imgur.com/ABC456.jpg', caption: 'صورة عشوائية جميلة 2' }
];

// دوال مساعدة للأوامر الجديدة
async function getWeather(city) {
  const apiKey = process.env.WEATHER_API_KEY || 'YOUR_WEATHER_API_KEY'; // Use environment variable for API key
  if (apiKey === 'YOUR_WEATHER_API_KEY') return 'عذرًا، لم يتم إعداد مفتاح API للطقس.';
  try {
    const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&lang=ar`);
    const data = resp.data;
    return `الطقس في ${data.location.name}: ${data.current.condition.text}\nدرجة الحرارة: ${data.current.temp_c}°C\nالرطوبة: ${data.current.humidity}%\nالريح: ${data.current.wind_kph} كم/س`;
  } catch {
    return 'عذرًا، لم أتمكن من جلب بيانات الطقس.';
  }
}

async function translateText(text, lang) {
  const libreTranslateUrl = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.de/translate';
  try {
    const resp = await axios.post(libreTranslateUrl, {
      q: text,
      source: 'ar',
      target: lang,
      format: 'text'
    });
    if (resp.data && resp.data.translatedText)
    return resp.data.translatedText;
  } catch {
    return 'خطأ في الترجمة.';
  }
}

async function getDates() {
  const today = new Date();
  // For Hijri date, you'd typically need a library or an API.
  // Example using a simple approximation or a placeholder:
  const hijriDate = new Intl.DateTimeFormat('ar-SA-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(today);
  return `التاريخ اليوم:\n- الميلادي: ${today.toLocaleDateString('en-GB')}\n- الهجري: ${hijriDate}`;
}

async function getNews() {
  // This would require a news API (e.g., News API, GNews API).
  // For now, it's a placeholder.
  return 'آخر الأخبار: لا تتوفر خدمة الأخبار حاليًا. (ميزة قيد التطوير)';
}

async function getMarketStatus() {
  // This would require a financial data API (e.g., Alpha Vantage, Yahoo Finance API).
  return 'سوق الأسهم اليوم: لا تتوفر بيانات السوق حاليًا. (ميزة قيد التطوير)';
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas','--no-first-run','--no-zygote',
      '--single-process','--disable-gpu'
    ],
    executablePath: puppeteer.executablePath()
  }
});

let prayerJobs = [];

// رفع QR
client.on('qr', async qr => {
  try {
    console.log('📌 تم توليد QR — جارٍ رفعه...');
    // Only upload QR if IMGBB_KEY is provided
    if (IMGBB_KEY && IMGBB_KEY !== 'YOUR_IMGBB_API_KEY') { // Assuming IMGBB_KEY might be a placeholder
      const qrPath = path.join(__dirname, 'qr.png');
      await QRCode.toFile(qrPath, qr);
      const form = new FormData();
      form.append('image', fs.createReadStream(qrPath));
      const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
      if (resp.data?.data?.url) console.log('✅ رابط الـ QR:', resp.data.data.url);
      fs.unlinkSync(qrPath); // Clean up the QR image file
    } else { console.log('✅ QR Code:', qr); } // Log QR to console if no IMGBB key
  } catch (err) { console.error('❌ خطأ رفع QR:', err); }
});

client.on('ready', () => {
  console.log('✅ البوت جاهز');
  schedulePrayerReminders();
});

async function getPrayerTimes() {
  try {
    // Using a more robust method for prayer times (e.g., method 5 for Egypt General Authority of Survey)
    const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', { params: { city: 'Khartoum', country: 'Sudan', method: 5 } });
    return res.data?.data?.timings || null;
  } catch { return null; }
}

async function schedulePrayerReminders() {
  prayerJobs.forEach(j => j.stop());
  prayerJobs = [];
  const times = await getPrayerTimes();
  if (!times) return;
  const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  // Ensure all subscribers and group chats receive reminders
  for (const key in map) {
    const [h, m] = times[key].split(':').map(Number);
    const job = cron.schedule(`${m} ${h} * * *`, () => {
      const text = `${pickRandom(prayerReminders)}\n🕒 ${map[key]} الآن`;
      // Send to individual subscribers and all group chats where the bot is present
      [...new Set([...data.subscribers, ...data.welcomedChats.filter(id => id.endsWith('@g.us'))])].forEach(id => client.sendMessage(id, text).catch(e => console.error(`Failed to send prayer reminder to ${id}:`, e.message)));
    }, { timezone: 'Africa/Khartoum' });
    prayerJobs.push(job);
  }
}
cron.schedule('5 0 * * *', schedulePrayerReminders, { timezone: 'Africa/Khartoum' });

// رسائل صباحية ومسائية
cron.schedule('0 8 * * *', () => {
  const text = pickRandom(greetings); // Send to all subscribed individuals
  data.subscribers.forEach(id => client.sendMessage(id, text).catch(e => console.error(`Failed to send morning greeting to ${id}:`, e.message)));
}, { timezone: 'Africa/Khartoum' });

cron.schedule('0 20 * * *', () => {
  const text = "مساء الخير! 😄 اكتب 'نكتة' عشان نضحك.";
  data.subscribers.forEach(id => client.sendMessage(id, text).catch(e => console.error(`Failed to send evening message to ${id}:`, e.message)));
}, { timezone: 'Africa/Khartoum' });

async function getContactNameOrNumber(id) {
  try { const c = await client.getContactById(id); return c.pushname || c.name || c.number || id; }
  catch { return id; }
}

// رسالة الترحيب وقائمة الأوامر
function getCommandsList() {
  return `السلام عليكم ورحمة الله معكم كيدي v1.2 من تطوير ضياءالدين ابراهيم
تم تطويري بغرض الترفيه والمرح وجمع المعلومات
إليك طرق استخدامي ولكي تظهر لك هذه اللائحة اكتب فقط "اوامر"

الأوامر المتاحة:
- اشترك: للاشتراك في التذكيرات
- الغاء: لإلغاء الاشتراك
- نكتة: للحصول على نكتة عفوية
- احصائيات القروب: عرض إحصائيات القروب
- العب رقم: لعبة تخمين رقم من 1-10
- لغز: سؤال تريفيا
- حجر، ورق، مقص: لعبة حجر ورق مقص
- ذكاء [سؤالك]: تفاعل مع ذكاء اصطناعي
- طقس [اسم المدينة]: لمعرفة حالة الطقس
- ترجم [النص] إلى [اللغة]: لترجمة النص
- التاريخ: لمعرفة التاريخ اليوم
- معلومة: معلومة عشوائية
- اقتباس: اقتباس عشوائي
- اخبار: آخر الأخبار (قيد التطوير)
- سوق: حالة السوق (قيد التطوير)
- صورة: إرسال صورة عشوائية
- مساعدة تقنية: رابط الدعم التقني

رقم المطور: 249112046348
رابط قروب الواتساب: https://chat.whatsapp.com/GZmrZ8EETk84SreBpM6tPp?mode=ac_t
`;
}

client.on('message_create', async (msg) => {
  // رسالة ترحيب عند إضافة البوت لقروب
  if (msg.from.endsWith('@g.us')) {
    const chat = await msg.getChat(); // Ensure chat object is available
    // Check if the bot is a participant and if it hasn't welcomed this chat yet
    if (chat.participants && chat.participants.find(p => p.id._serialized === client.info.wid._serialized)) {
      if (!data.welcomedChats.includes(chat.id._serialized)) { // Use chat.id._serialized for group chats
        data.welcomedChats.push(chat.id._serialized); saveData();
        chat.sendMessage(getCommandsList());
      }
    }
  }
});

client.on('message', async msg => {
  const from = msg.from, body = msg.body.trim();

  // ترحيب أول رسالة مباشرة (للفرد)
  if (!msg.isGroup && !data.welcomedChats.includes(from)) { // Check if it's a private chat
    data.welcomedChats.push(from);
    saveData();
    msg.reply(getCommandsList());
  }

  // ردود عفوية على كلمة النداء "كيدي-بوت-روبوت"
  if (body === 'كيدي-بوت-روبوت') {
    const spontaneousReplies = [
      "أها، كيف أقدر أساعدك يا زول؟",
      "حاضر، قول لي الحاصل شنو!",
      "أنا هنا معاك، شنو المطلوب؟",
      "يا سلام عليك! داير شنو مني؟",
      "سعدت بسؤالك، أطلب ما تشاء!",
      "تفضل يا زول، أنا في الخدمة.",
      "هاك، قولي شنو الأخبار؟",
      "كيدي بوت جاهز يرد على سؤالك!",
      "معاك الروبوت العجيب، قل لي كيف أساعدك.",
      "يا مرحب بيك، قول لي أخبارك!"
    ];
    return msg.reply(spontaneousReplies.join('\n\n'));
  }

  // تحديث احصائيات القروب
  if (msg.isGroup) {
    const chat = await msg.getChat();
    const chatId = chat.id._serialized; // Use serialized chat ID for consistency
    const g = data.groupStats[chatId] ||= { messages: {}, createdTimestamp: chat.createdTimestamp || Date.now(), participants: [] };
    // Update participants list more reliably
    g.participants = (chat.participants || []).map(p => p.id._serialized); 
    const author = msg.author || msg.from;
    // Ensure author is a string key
    g.messages[author] = (g.messages[author] || 0) + 1;
    saveData();
  }

  // أوامر
  if (body === 'اوامر') return msg.reply(getCommandsList());

  if (body === 'اشترك') return msg.reply(data.subscribers.includes(from) ? 'مشترك بالفعل' : (data.subscribers.push(from), saveData(), '✅ اشتركت'));
  if (body === 'الغاء') return msg.reply(data.subscribers.includes(from) ? (data.subscribers.splice(data.subscribers.indexOf(from),1), saveData(), '✅ ألغيت الاشتراك') : 'لست مشتركًا');
  if (body === 'نكتة') return msg.reply(pickRandom(jokes)); // Corrected typo from 'نكتة' to 'نكتة'
  if (body === 'احصائيات القروب') { // Changed command to match getCommandsList
    if (!msg.isGroup) return msg.reply('فقط داخل القروبات');
    const chat = await msg.getChat();
    const chatId = chat.id._serialized;
    const stats = data.groupStats[chatId] || { messages: {} };
    const membersCount = chat.participants ? chat.participants.length : 0; // Handle cases where participants might be undefined
    const createdAt = chat.createdTimestamp ? new Date(chat.createdTimestamp).toLocaleString('en-GB', { timeZone: 'Africa/Khartoum' }) : 'غير متوفر';
    const sorted = Object.entries(stats.messages).sort((a,b) => b[1]-a[1]);
    if (!sorted.length) return msg.reply(`📊 تاريخ الإنشاء: ${createdAt}\n👥 الأعضاء: ${membersCount}\nلا بيانات`);
    const [topId, topCount] = sorted[0];
    const [bottomId, bottomCount] = sorted[sorted.length-1];
    const topName = await getContactNameOrNumber(topId), bottomName = await getContactNameOrNumber(bottomId);
    return msg.reply(`📊 تاريخ الإنشاء: ${createdAt}\n👥 الأعضاء: ${membersCount}\n🏆 الأكثر تفاعل: ${topName} (${topCount})\n😴 الأقل تفاعل: ${bottomName} (${bottomCount})`);
  }
  if (body === 'العب رقم') {
    data.pendingGames[from] = { type: 'guess', number: Math.floor(Math.random()*10)+1, tries: 0 };
    saveData();
    return msg.reply('اخترت رقم بين 1 و 10، خمّن ما هو!');
  }
  if (data.pendingGames[from]?.type === 'guess' && /^\d+$/.test(body)) {
    const g = data.pendingGames[from], guess = +body;
    g.tries++;
    if (guess === g.number) { delete data.pendingGames[from]; saveData(); return msg.reply(`🎉 صحيح (${guess}) بعد ${g.tries} محاولة`); }
    saveData(); return msg.reply(guess < g.number ? 'أعلى!' : 'أقل!');
  }
  if (body === 'لغز') {
    const q = pickRandom(triviaQuestions);
    data.pendingQuiz[from] = q;
    saveData();
    return msg.reply(q.q);
  }
  // Check for trivia answer
  if (data.pendingQuiz[from] && ['أ','ب','ج','A','B','C','a','b','c'].includes(body.toUpperCase())) {
    const p = data.pendingQuiz[from];
    const userAnswer = body.toUpperCase().replace('A','أ').replace('B','ب').replace('C','ج');
    delete data.pendingQuiz[from]; saveData();
    return msg.reply(userAnswer === p.answer ? '✅ صحيح!' : `❌ خطأ. الإجابة الصحيحة هي ${p.answer}.`);
  }
  if (['حجر','ورق','مقص'].includes(body.toLowerCase())) { // Make case-insensitive
    const b = pickRandom(['حجر','ورق','مقص']);
    let result;
    if (body.toLowerCase() === b) { result = 'تعادل!'; }
    else if (
      (body.toLowerCase() === 'حجر' && b === 'مقص') ||
      (body.toLowerCase() === 'ورق' && b === 'حجر') ||
      (body.toLowerCase() === 'مقص' && b === 'ورق')
    ) { result = 'فزت!'; }
    else { result = 'خسرت!'; }
    return msg.reply(`أنا اخترت: ${b}\nالنتيجة: ${result}`);
  }

  // New commands
  if (body.startsWith('طقس ')) {
    const city = body.slice(4).trim();
    const weather = await getWeather(city);
    return msg.reply(weather);
  }
  if (body.startsWith('ترجم ')) {
    const parts = body.slice(5).split(' إلى ');
    if (parts.length === 2) {
      const textToTranslate = parts[0].trim();
      const targetLang = parts[1].trim().toLowerCase(); // e.g., 'en', 'es'
      const translated = await translateText(textToTranslate, targetLang);
      return msg.reply(translated);
    } return msg.reply('صيغة الأمر خاطئة. استخدم: ترجم [النص] إلى [اللغة]');
  }
  if (body.startsWith('ذكاء ')) {
    const prompt = body.slice(6).trim();
    try {
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }] }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
      return msg.reply(resp.data.choices[0].message.content.trim());
    } catch { return msg.reply('خطأ في OpenAI'); }
  }
  if (body === 'التاريخ') {
    const dates = await getDates();
    return msg.reply(dates);
  }
  if (body === 'معلومة') {
    return msg.reply(pickRandom(facts));
  }
  if (body === 'اقتباس') {
    return msg.reply(pickRandom(quotes));
  }
  if (body === 'اخبار') {
    const news = await getNews();
    return msg.reply(news);
  }
  if (body === 'سوق') {
    const marketStatus = await getMarketStatus();
    return msg.reply(marketStatus);
  }
  if (body === 'صورة') {
    const image = pickRandom(randomImages);
    if (image && image.url) {
      const media = await MessageMedia.fromUrl(image.url);
      return client.sendMessage(from, media, { caption: image.caption });
    } return msg.reply('عذراً، لا توجد صور متاحة حالياً.');
  }
  if (body === 'مساعدة تقنية') {
    return msg.reply('للدعم التقني، يرجى التواصل مع المطور على الرقم: 249112046348');
  }

  if (body.includes('السلام')) return msg.reply('وعليكم السلام يا زول 👋');
});

client.initialize();
