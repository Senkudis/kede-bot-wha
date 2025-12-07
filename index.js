require('dotenv').config();
const express = require('express');
const { Client, RemoteAuth, Location, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const axios = require('axios');
const FormData = require('form-data');

// --- CONFIGURATION ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot';
const PORT = process.env.PORT || 3000;

// HTTP Server for Railway Health Checks
const app = express();
app.get('/', (req, res) => res.status(200).json({ status: 'alive', timestamp: new Date() }));
app.get('/health', (req, res) => res.status(200).send('OK'));
const server = app.listen(PORT, () => console.log(`🚀 HTTP server running on port ${PORT}`));

// --- MONGODB DATA SCHEMA ---
const subscriberSchema = new mongoose.Schema({ chatId: String, subscribedAt: { type: Date, default: Date.now } });
const gameSchema = new mongoose.Schema({ chatId: String, type: String, data: Object });
const quizSchema = new mongoose.Schema({ chatId: String, question: Object });
const groupStatsSchema = new mongoose.Schema({ 
  chatId: String, 
  messages: mongoose.Schema.Types.Mixed,
  participants: [String],
  createdTimestamp: Number
});

const Subscriber = mongoose.model('Subscriber', subscriberSchema);
const Game = mongoose.model('Game', gameSchema);
const Quiz = mongoose.model('Quiz', quizSchema);
const GroupStat = mongoose.model('GroupStat', groupStatsSchema);

// --- DATA INITIALIZATION ---
const jokes = [/* ... keep your existing jokes ... */];
const triviaQuestions = [/* ... keep your existing questions ... */];
const prayerReminders = [/* ... keep your reminders ... */];
const greetings = [/* ... keep your greetings ... */];
const facts = [/* ... keep your facts ... */];
const quotes = [/* ... keep your quotes ... */];
const randomImages = [/* ... keep your images ... */];

async function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// --- HELPER FUNCTIONS ---
async function getContactNameOrNumber(id) {
  try { 
    const c = await client.getContactById(id); 
    return c.pushname || c.name || c.number || id; 
  } catch { return id; }
}

async function getWeather(city) {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey || apiKey === 'YOUR_WEATHER_API_KEY') return '⚠️ لم يتم إعداد مفتاح API للطقس.';
  try {
    const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&lang=ar`);
    const data = resp.data;
    return `الطقس في ${data.location.name}: ${data.current.condition.text}\nدرجة الحرارة: ${data.current.temp_c}°C\nالرطوبة: ${data.current.humidity}%\nالريح: ${data.current.wind_kph} كم/س`;
  } catch {
    return '❌ لم أتمكن من جلب بيانات الطقس.';
  }
}

async function translateText(text, lang) {
  try {
    const resp = await axios.post('https://libretranslate.de/translate', {
      q: text, source: 'auto', target: lang, format: 'text'
    });
    return resp.data?.translatedText || 'خطأ في الترجمة.';
  } catch {
    return '❌ خطأ في الاتصال بخدمة الترجمة.';
  }
}

async function getDates() {
  const today = new Date();
  const hijriDate = new Intl.DateTimeFormat('ar-SA-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(today);
  return `التاريخ اليوم:\n- الميلادي: ${today.toLocaleDateString('en-GB')}\n- الهجري: ${hijriDate}`;
}

async function getNews() {
  return '📰 خدمة الأخبار قيد التطوير. استخدم الأمر لاحقًا.';
}

async function getMarketStatus() {
  return '📈 خدمة السوق قيد التطوير. استخدم الأمر لاحقًا.';
}

function getCommandsList() {
  return `السلام عليكم ورحمة الله معكم كيدي v2.0 من تطوير ضياءالدين ابراهيم
تم تطويري بغرض الترفيه والمرح وجمع المعلومات

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

// --- MONGODB CONNECTION ---
mongoose.connect(MONGODB_URI).then(() => {
  console.log('✅ Connected to MongoDB');
  initializeBot();
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err);
  process.exit(1);
});

// --- WHATSAPP CLIENT INITIALIZATION ---
let client;
function initializeBot() {
  const store = new MongoStore({ mongoose: mongoose });
  
  client = new Client({
    authStrategy: new RemoteAuth({
      store: store,
      backupSyncIntervalMs: 300000 // 5 minutes backup
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--password-store=basic',
        '--use-mock-keychain',
        '--force-webrtc-ip-handling-policy=default_public_interface_only',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--enable-automation',
        '--disable-blink-features=AutomationControlled'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    }
  });

  // QR Code Generation with Dual Logging
  client.on('qr', async qr => {
    console.log('📌 QR Code generated - Scan to authenticate');
    
    // Terminal ASCII QR (always works)
    qrcodeTerminal.generate(qr, { small: true });
    
    // ImgBB Upload (if API key provided)
    if (IMGBB_KEY && IMGBB_KEY !== 'YOUR_IMGBB_API_KEY') {
      try {
        const qrPath = path.join(__dirname, 'qr.png');
        await QRCode.toFile(qrPath, qr);
        const form = new FormData();
        form.append('image', fs.createReadStream(qrPath));
        const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { 
          headers: form.getHeaders(),
          timeout: 10000
        });
        if (resp.data?.data?.url) {
          console.log('✅ QR uploaded to ImgBB:', resp.data.data.url);
          // Optionally send to developer: client.sendMessage('249112046348@c.us', `QR Code: ${resp.data.data.url}`);
        }
        fs.unlinkSync(qrPath);
      } catch (err) {
        console.error('❌ ImgBB upload failed, but terminal QR is available:', err.message);
      }
    }
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp Bot is READY');
    schedulePrayerReminders();
  });

  client.on('authenticated', () => console.log('🔐 Authenticated successfully'));
  client.on('auth_failure', msg => console.error('❌ Auth failure:', msg));
  client.on('disconnected', reason => {
    console.warn('⚠️ Disconnected:', reason);
    setTimeout(() => client.initialize(), 5000); // Auto-reconnect
  });

  client.on('message_create', async (msg) => {
    if (msg.from.endsWith('@g.us')) {
      const chat = await msg.getChat();
      if (chat.participants?.find(p => p.id._serialized === client.info.wid._serialized)) {
        const existingChat = await GroupStat.findOne({ chatId: chat.id._serialized });
        if (!existingChat) {
          await GroupStat.create({ 
            chatId: chat.id._serialized, 
            createdTimestamp: chat.createdTimestamp || Date.now(),
            participants: chat.participants.map(p => p.id._serialized)
          });
          chat.sendMessage(getCommandsList());
        }
      }
    }
  });

  client.on('message', async msg => {
    const from = msg.from, body = msg.body.trim();

    // Welcome message for private chats
    if (!msg.isGroup) {
      const subscriber = await Subscriber.findOne({ chatId: from });
      if (!subscriber) {
        await Subscriber.create({ chatId: from });
        return msg.reply(getCommandsList());
      }
    }

    // Spontaneous replies
    if (body === 'كيدي-بوت-روبوت') {
      const replies = [
        "أها، كيف أقدر أساعدك يا زول؟",
        "حاضر، قول لي الحاصل شنو!",
        "أنا هنا معاك، شنو المطلوب؟"
      ];
      return msg.reply(pickRandom(replies));
    }

    // Group stats update
    if (msg.isGroup) {
      const chat = await msg.getChat();
      const author = msg.author || msg.from;
      
      await GroupStat.updateOne(
        { chatId: chat.id._serialized },
        { 
          $set: { participants: chat.participants.map(p => p.id._serialized) },
          $inc: { [`messages.${author}`]: 1 }
        },
        { upsert: true }
      );
    }

    // Commands
    if (body === 'اوامر') return msg.reply(getCommandsList());

    if (body === 'اشترك') {
      const exists = await Subscriber.findOne({ chatId: from });
      if (exists) return msg.reply('مشترك بالفعل');
      await Subscriber.create({ chatId: from });
      return msg.reply('✅ اشتركت');
    }

    if (body === 'الغاء') {
      const deleted = await Subscriber.deleteOne({ chatId: from });
      return msg.reply(deleted.deletedCount > 0 ? '✅ ألغيت الاشتراك' : 'لست مشتركًا');
    }

    if (body === 'نكتة') return msg.reply(pickRandom(jokes));

    if (body === 'احصائيات القروب') {
      if (!msg.isGroup) return msg.reply('فقط داخل القروبات');
      const chat = await msg.getChat();
      const stats = await GroupStat.findOne({ chatId: chat.id._serialized });
      if (!stats || !stats.messages) return msg.reply('📊 لا بيانات بعد');
      
      const sorted = Object.entries(stats.messages).sort((a,b) => b[1]-a[1]);
      const [topId, topCount] = sorted[0];
      const [bottomId, bottomCount] = sorted[sorted.length-1];
      const topName = await getContactNameOrNumber(topId);
      const bottomName = await getContactNameOrNumber(bottomId);
      const membersCount = chat.participants.length;
      const createdAt = stats.createdTimestamp ? new Date(stats.createdTimestamp).toLocaleString('en-GB', { timeZone: 'Africa/Khartoum' }) : 'غير متوفر';
      
      return msg.reply(
        `📊 تاريخ الإنشاء: ${createdAt}\n👥 الأعضاء: ${membersCount}\n🏆 الأكثر تفاعل: ${topName} (${topCount})\n😴 الأقل تفاعل: ${bottomName} (${bottomCount})`
      );
    }

    if (body === 'العب رقم') {
      await Game.findOneAndUpdate(
        { chatId: from },
        { type: 'guess', data: { number: Math.floor(Math.random()*10)+1, tries: 0 } },
        { upsert: true }
      );
      return msg.reply('اخترت رقم بين 1 و 10، خمّن ما هو!');
    }

    const currentGame = await Game.findOne({ chatId: from, type: 'guess' });
    if (currentGame && /^\d+$/.test(body)) {
      const guess = parseInt(body);
      currentGame.data.tries++;
      if (guess === currentGame.data.number) {
        await Game.deleteOne({ _id: currentGame._id });
        return msg.reply(`🎉 صحيح (${guess}) بعد ${currentGame.data.tries} محاولة`);
      }
      await currentGame.save();
      return msg.reply(guess < currentGame.data.number ? 'أعلى!' : 'أقل!');
    }

    if (body === 'لغز') {
      const q = pickRandom(triviaQuestions);
      await Quiz.findOneAndUpdate(
        { chatId: from },
        { question: q },
        { upsert: true }
      );
      return msg.reply(q.q);
    }

    const currentQuiz = await Quiz.findOne({ chatId: from });
    if (currentQuiz && ['أ','ب','ج','A','B','C','a','b','c'].includes(body.toUpperCase())) {
      const userAnswer = body.toUpperCase().replace('A','أ').replace('B','ب').replace('C','ج');
      const correct = userAnswer === currentQuiz.question.answer;
      await Quiz.deleteOne({ _id: currentQuiz._id });
      return msg.reply(correct ? '✅ صحيح!' : `❌ خطأ. الإجابة الصحيحة هي ${currentQuiz.question.answer}.`);
    }

    if (['حجر','ورق','مقص'].includes(body.toLowerCase())) {
      const b = pickRandom(['حجر','ورق','مقص']);
      let result;
      if (body.toLowerCase() === b) result = 'تعادل!';
      else if ((body === 'حجر' && b === 'مقص') || (body === 'ورق' && b === 'حجر') || (body === 'مقص' && b === 'ورق')) result = 'فزت!';
      else result = 'خسرت!';
      return msg.reply(`أنا اخترت: ${b}\nالنتيجة: ${result}`);
    }

    // New commands
    if (body.startsWith('طقس ')) {
      const city = body.slice(4).trim();
      if (!city) return msg.reply('⚠️ أدخل اسم المدينة. مثال: طقس الخرطوم');
      const weather = await getWeather(city);
      return msg.reply(weather);
    }

    if (body.startsWith('ترجم ')) {
      const parts = body.slice(5).split(' إلى ');
      if (parts.length === 2) {
        const translated = await translateText(parts[0].trim(), parts[1].trim().toLowerCase());
        return msg.reply(translated);
      }
      return msg.reply('⚠️ صيغة الأمر خاطئة. استخدم: ترجم [النص] إلى [en|es|fr]');
    }

    if (body.startsWith('ذكاء ')) {
      const prompt = body.slice(6).trim();
      if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY') {
        return msg.reply('⚠️ لم يتم إعداد مفتاح OpenAI.');
      }
      try {
        const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        }, { 
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          timeout: 15000
        });
        return msg.reply(resp.data.choices[0].message.content.trim());
      } catch {
        return msg.reply('❌ خطأ في OpenAI. حاول مرة أخرى.');
      }
    }

    if (body === 'التاريخ') {
      const dates = await getDates();
      return msg.reply(dates);
    }

    if (body === 'معلومة') return msg.reply(pickRandom(facts));
    if (body === 'اقتباس') return msg.reply(pickRandom(quotes));
    if (body === 'اخبار') return msg.reply(await getNews());
    if (body === 'سوق') return msg.reply(await getMarketStatus());

    if (body === 'صورة') {
      const image = pickRandom(randomImages);
      if (image?.url) {
        try {
          const media = await MessageMedia.fromUrl(image.url);
          return client.sendMessage(from, media, { caption: image.caption });
        } catch {
          return msg.reply('❌ فشل تحميل الصورة.');
        }
      }
      return msg.reply('عذراً، لا توجد صور متاحة حالياً.');
    }

    if (body === 'مساعدة تقنية') {
      return msg.reply('للدعم التقني، يرجى التواصل مع المطور على الرقم: 249112046348');
    }

    if (body.includes('السلام')) return msg.reply('وعليكم السلام يا زول 👋');
  });

  client.initialize().catch(err => {
    console.error('❌ Failed to initialize client:', err);
    process.exit(1);
  });
}

// --- PRAYER REMINDERS ---
let prayerJobs = [];
async function getPrayerTimes() {
  try {
    const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', {
      params: { city: 'Khartoum', country: 'Sudan', method: 5 },
      timeout: 10000
    });
    return res.data?.data?.timings || null;
  } catch { return null; }
}

async function schedulePrayerReminders() {
  prayerJobs.forEach(j => j.stop());
  prayerJobs = [];
  
  const times = await getPrayerTimes();
  if (!times) return;
  
  const map = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  
  for (const [key, name] of Object.entries(map)) {
    const [h, m] = times[key].split(':').map(Number);
    const job = cron.schedule(`${m} ${h} * * *`, async () => {
      const subscribers = await Subscriber.find({});
      const groupChats = await GroupStat.find({});
      const allChats = [...new Set([...subscribers.map(s => s.chatId), ...groupChats.map(g => g.chatId)])];
      
      const text = `${pickRandom(prayerReminders)}\n🕒 ${name} الآن`;
      
      for (const chatId of allChats) {
        try {
          await client.sendMessage(chatId, text);
        } catch (e) {
          console.error(`Failed to send prayer reminder to ${chatId}:`, e.message);
        }
      }
    }, { timezone: 'Africa/Khartoum' });
    
    prayerJobs.push(job);
    console.log(`📅 Scheduled ${name} reminder at ${h}:${m}`);
  }
}

// Schedule daily prayer times refresh
cron.schedule('5 0 * * *', schedulePrayerReminders, { timezone: 'Africa/Khartoum' });

// Morning & Evening messages
cron.schedule('0 8 * * *', async () => {
  const subscribers = await Subscriber.find({});
  for (const sub of subscribers) {
    try {
      await client.sendMessage(sub.chatId, pickRandom(greetings));
    } catch {}
  }
}, { timezone: 'Africa/Khartoum' });

cron.schedule('0 20 * * *', async () => {
  const subscribers = await Subscriber.find({});
  for (const sub of subscribers) {
    try {
      await client.sendMessage(sub.chatId, "مساء الخير! 😄 اكتب 'نكتة' عشان نضحك.");
    } catch {}
  }
}, { timezone: 'Africa/Khartoum' });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close();
  await mongoose.connection.close();
  await client.destroy();
  process.exit(0);
});
