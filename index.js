require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');

// --- إعدادات السيرفر (عشان Koyeb) ---
const app = express();
const port = process.env.PORT || 8000;
let qrImageUrl = "";

app.get('/', (req, res) => {
    res.send(`<h1>Kede Bot is Running</h1><br><img src="${qrImageUrl}" alt="QR Code waiting..." />`);
});
app.listen(port, () => console.log(`Server running on port ${port}`));

// --- المفاتيح (يفضل وضعها في Environment Variables) ---
// مفتاح OpenAI ومفتاح ImgBB ومفتاح الطقس
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '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';
const IMGBB_KEY = process.env.IMGBB_KEY || '8df2f63e10f44cf4f6f7d99382861e76';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '316d0c91eed64b65a15211006251008'; 

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { subscribers: [], pendingQuiz: {}, stats: {}, groupStats: {}, pendingGames: {}, welcomedChats: [] };

// تحميل البيانات
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE)); } 
  catch (e) { console.error('خطأ في قراءة data.json', e); }
}
if (!Array.isArray(data.welcomedChats)) data.welcomedChats = [];

function saveData(){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// --- البيانات والمحتوى ---
const jokes = [
  "مسطول سألوه: ما هو أقدم حيوان؟ قال: الحمار الوحشي لأنه أبيض وأسود.",
  "واحد كسلان دخل الامتحان، وقع منه القلم سلم الورقة.",
  "سوداني كسلان جداً، شاف بيته بيتحرق، عمل رنة للمطافئ وقفل."
];

const triviaQuestions = [
  { q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" },
  { q: "كم عدد ألوان قوس قزح؟\nأ) 5\nب) 7\nج) 6", answer: "ب" }
];

const facts = [
  "أكبر صحراء في العالم هي الصحراء الكبرى.",
  "النمل لا ينام أبداً.",
  "السودان كان أكبر دولة في أفريقيا قبل الانفصال."
];

const quotes = [
  "لا تؤجل عمل اليوم إلى الغد.",
  "العلم نور والجهل ظلام.",
  "كن أنت التغيير الذي تريد أن تراه في العالم."
];

// --- الدوال المساعدة ---
async function getWeather(city) {
  try {
    const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&lang=ar`);
    const d = resp.data;
    return `🌤 *الطقس في ${d.location.name}*:\nالـحالة: ${d.current.condition.text}\n🌡 الحرارة: ${d.current.temp_c}°C\n💧 الرطوبة: ${d.current.humidity}%\n💨 الرياح: ${d.current.wind_kph} كم/س`;
  } catch (e) { return '❌ تأكد من اسم المدينة أو مفتاح API.'; }
}

async function translateText(text, targetLang = 'en') {
  try {
    // نستخدم API مجاني للترجمة (قد يكون بطيئاً)
    const resp = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ar|${targetLang}`);
    return `🔤 الترجمة: ${resp.data.responseData.translatedText}`;
  } catch { return '❌ فشل الترجمة.'; }
}

async function getAIResponse(prompt) {
    try {
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', 
        { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }] }, 
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );
      return resp.data.choices[0].message.content.trim();
    } catch { return '❌ خطأ في الاتصال بالذكاء الاصطناعي (تحقق من المفتاح).'; }
}

// --- إعداد العميل ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-accelerated-2d-canvas','--no-first-run','--no-zygote','--single-process','--disable-gpu']
  }
});

// --- الأحداث ---
client.on('qr', async qr => {
  console.log('📌 QR Code Generated');
  // رفع QR لـ ImgBB وعرضه في السيرفر
  try {
      const qrPath = path.join(__dirname, 'qr.png');
      await QRCode.toFile(qrPath, qr);
      
      const form = new FormData();
      form.append('image', fs.createReadStream(qrPath));
      const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
      
      if (resp.data?.data?.url) {
          qrImageUrl = resp.data.data.url;
          console.log('✅ رابط الـ QR:', qrImageUrl);
      }
  } catch (err) { console.error('Error uploading QR'); }
});

client.on('ready', () => console.log('✅ البوت جاهز ويعمل!'));

client.on('message_create', async (msg) => {
    // منطق الترحيب في المجموعات
    if (msg.from.endsWith('@g.us')) {
        const chat = await msg.getChat();
        // الترحيب مرة واحدة فقط
        if (!data.welcomedChats.includes(chat.id._serialized)) {
             // (تم إيقاف الترحيب التلقائي المزعج، يمكن تفعيله هنا)
        }
    }
});

client.on('message', async msg => {
  const from = msg.from;
  const body = msg.body.trim(); // بدون toLowerCase عشان الترجمة والمدن

  // 1. الأوامر الأساسية
  if (body === 'اوامر') {
      return msg.reply(`🤖 *قائمة أوامر كيدي*
1️⃣ *اشترك* / *الغاء*: لتذكيرات الصلاة
2️⃣ *نكتة*: للضحك
3️⃣ *لغز* / *العب رقم* / *حجر ورق مقص*: ألعاب
4️⃣ *طقس [المدينة]*: (مثال: طقس الخرطوم)
5️⃣ *ترجم [النص]*: (يترجم للإنجليزية)
6️⃣ *ذكاء [سؤالك]*: اسأل الـ AI
7️⃣ *معلومة* / *اقتباس*: ثقافة عامة
8️⃣ *صورة*: صورة عشوائية
9️⃣ *التاريخ*: تاريخ اليوم
🔟 *احصائيات*: (داخل القروبات)`);
  }

  // 2. الاشتراكات
  if (body === 'اشترك') return msg.reply(data.subscribers.includes(from) ? 'مشترك مسبقاً' : (data.subscribers.push(from), saveData(), '✅ تم الاشتراك'));
  if (body === 'الغاء') return msg.reply(data.subscribers.includes(from) ? (data.subscribers.splice(data.subscribers.indexOf(from),1), saveData(), '✅ تم الإلغاء') : 'لست مشتركاً');

  // 3. الترفيه والمعلومات
  if (body === 'نكتة') return msg.reply(pickRandom(jokes));
  if (body === 'معلومة') return msg.reply(`💡 *هل تعلم؟*\n${pickRandom(facts)}`);
  if (body === 'اقتباس') return msg.reply(`📜 *اقتباس:*\n"${pickRandom(quotes)}"`);
  
  if (body === 'التاريخ') {
      const today = new Date();
      return msg.reply(`📅 التاريخ: ${today.toLocaleDateString('en-GB')}`);
  }

  // 4. الخدمات (طقس - ترجمة - صورة)
  if (body.startsWith('طقس ')) {
      const city = body.replace('طقس ', '');
      const weatherInfo = await getWeather(city);
      return msg.reply(weatherInfo);
  }

  if (body.startsWith('ترجم ')) {
      const text = body.replace('ترجم ', '');
      const translation = await translateText(text);
      return msg.reply(translation);
  }

  if (body === 'صورة') {
      // صورة عشوائية من picsum
      try {
        const media = await MessageMedia.fromUrl('https://picsum.photos/400', { unsafeMime: true });
        return msg.reply(media, undefined, { caption: '🖼 صورة عشوائية لك!' });
      } catch { return msg.reply('❌ فشل تحميل الصورة.'); }
  }

  // 5. الألعاب
  if (body === 'لغز') { 
      const q = pickRandom(triviaQuestions); 
      data.pendingQuiz[from] = q; saveData(); 
      return msg.reply(`❓ *سؤال:*\n${q.q}`); 
  }
  if (data.pendingQuiz[from] && ['أ','ب','ج'].includes(body)) {
      const isCorrect = body === data.pendingQuiz[from].answer;
      delete data.pendingQuiz[from]; saveData();
      return msg.reply(isCorrect ? '✅ إجابة صحيحة!' : '❌ إجابة خاطئة.');
  }

  if (body === 'العب رقم') { 
      data.pendingGames[from] = { type: 'guess', number: Math.floor(Math.random()*10)+1, tries: 0 }; 
      saveData(); 
      return msg.reply('🔢 اخترت رقم من 1 لـ 10. خمن!'); 
  }
  if (data.pendingGames[from]?.type === 'guess' && !isNaN(body)) {
      const g = data.pendingGames[from];
      const guess = parseInt(body);
      g.tries++;
      if (guess === g.number) {
          delete data.pendingGames[from]; saveData();
          return msg.reply(`🎉 مبروك! الرقم هو ${guess} (محاولات: ${g.tries})`);
      }
      return msg.reply(guess < g.number ? '🔼 أكبر' : '🔽 أصغر');
  }

  if (['حجر','ورق','مقص'].includes(body)) {
      const botChoice = pickRandom(['حجر','ورق','مقص']);
      const res = (body===botChoice) ? 'تعادل 🤝' : 
        ((body==='حجر'&&botChoice==='مقص')||(body==='ورق'&&botChoice==='حجر')||(body==='مقص'&&botChoice==='ورق')) ? 'فزت 🎉' : 'خسرت 😝';
      return msg.reply(`أنا اخترت: ${botChoice}\nالنتيجة: ${res}`);
  }

  // 6. الذكاء الاصطناعي
  if (body.startsWith('ذكاء ')) {
      const prompt = body.replace('ذكاء ', '');
      const aiReply = await getAIResponse(prompt);
      return msg.reply(aiReply);
  }

  // 7. احصائيات القروب
  if (body === 'احصائيات' && msg.isGroup) {
      const stats = data.groupStats[from] || { messages: {} };
      const sorted = Object.entries(stats.messages).sort((a,b) => b[1]-a[1]);
      if (!sorted.length) return msg.reply('لا توجد بيانات.');
      // نكتفي بأعلى شخص
      return msg.reply(`🏆 أكثر شخص متفاعل: ${sorted[0][0].replace('@c.us','')} برصيد ${sorted[0][1]} رسالة.`);
  }

  // تحديث الإحصائيات مع كل رسالة في القروب
  if (msg.isGroup) {
      const g = data.groupStats[from] ||= { messages: {} };
      const author = msg.author || from;
      g.messages[author] = (g.messages[author] || 0) + 1;
      saveData();
  }

});

client.initialize();
