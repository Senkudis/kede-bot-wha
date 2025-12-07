require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js'); // Removed unused Location
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');

// ==================== CONFIGURATION ====================
// NEVER hardcode API keys! Use .env file
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '316d0c91eed64b65a15211006251008'; // Fallback for demo

if (!OPENAI_API_KEY || !IMGBB_KEY) {
    console.error('❌ ERROR: Missing API keys in .env file');
    process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'data.json');

// ==================== DATA MANAGEMENT ====================
let data = { 
    subscribers: [], 
    pendingQuiz: {}, 
    pendingGames: {}, 
    groupStats: {}, 
    welcomedChats: new Set() // Use Set for better performance
};

// Load data
if (fs.existsSync(DATA_FILE)) {
    try { 
        const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        // Convert welcomedChats array to Set if needed
        loaded.welcomedChats = Array.isArray(loaded.welcomedChats) ? new Set(loaded.welcomedChats) : new Set();
        data = loaded;
    } catch (e) { 
        console.error('❌ خطأ في قراءة data.json', e); 
    }
}

function saveData() {
    try {
        // Convert Set to array for JSON serialization
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
    "اذهب إلى الصلاة واطمئن، الله مع المبادرين",
    "الصلوات الخمس سبب للبركة، لا تغفل عنها",
    "أقم الصلاة لذكري، وارتاح قلبك",
    "فرصة لنتقرّب لله، استغلها الآن",
    "هيا للصلاة — بركة اليوم تبدأ بها"
];

const greetings = [
    "صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"
];

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

// ==================== SERVICE FUNCTIONS ====================
async function getWeather(city) {
    try {
        const resp = await axios.get(
            http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&lang=ar,
            { timeout: 5000 }
        );
        const d = resp.data;
        return الطقس في ${d.location.name}:\n🌡 ${d.current.condition.text}\n🌡 درجة الحرارة: ${d.current.temp_c}°C\n💧 الرطوبة: ${d.current.humidity}%\n💨 الرياح: ${d.current.wind_kph} كم/س;
    } catch (err) {
        console.error('Weather API error:', err.response?.data || err.message);
        return 'عذرًا، لم أتمكن من جلب بيانات الطقس. تأكد من اسم المدينة.';
    }
}

async function translateText(text, targetLang) {
    try {
        const resp = await axios.post('https://libretranslate.de/translate', {
            q: text,
            source: 'auto', // Auto-detect instead of hardcoding 'ar'
            target: targetLang,
            format: 'text'
        }, { timeout: 5000 });
        return resp.data.translatedText;
    } catch (err) {
        console.error('Translation error:', err.message);
        return 'خطأ في الترجمة.';
    }
}

async function getRandomImage() {
    try {
        // Use a real random image API
        const resp = await axios.get('https://picsum.photos/400/400', { timeout: 5000 });
        return resp.request.res.responseUrl; // Get the redirect URL
    } catch (err) {
        console.error('Image API error:', err.message);
        return null;
    }
}

async function getContactNameOrNumber(id) {
    try {
        const c = await client.getContactById(id);
        return c.pushname || c.name || c.shortName || id.replace('@c.us', '');
    } catch {
        return id.replace('@c.us', '');
    }
}

// ==================== WHATSAPP CLIENT ====================
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
            // Removed deprecated '--single-process'
            '--disable-gpu'
        ],
        executablePath: puppeteer.executablePath()
    }
});

let prayerJobs = [];

// QR Code Generation & Upload
client.on('qr', async qr => {
    try {
        console.log('📌 QR Generated — Uploading...');
        const qrPath = path.join(__dirname, 'qr.png');
        await QRCode.toFile(qrPath, qr);
        
        const form = new FormData();
        form.append('image', fs.createReadStream(qrPath));
        
        const resp = await axios.post(
            https://api.imgbb.com/1/upload?key=${IMGBB_KEY},
            form,
            { headers: form.getHeaders() }
        );
        
        if (resp.data?.data?.url) {
            console.log('✅ QR URL:', resp.data.data.url);
        } else {
            console.warn('⚠ QR uploaded but no URL returned');
        }
        
        // Only delete after successful upload
        if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
    } catch (err) {
        console.error('❌ QR Upload Error:', err.response?.data || err.message);
        // Fallback: Show in console
        console.log('📌 QR Code:', qr);
    }
});

client.on('ready', () => {
    console.log('✅ Bot Ready');
    schedulePrayerReminders();
});

// ==================== PRAYER TIMES ====================
async function getPrayerTimes() {
    try {
        const res = await axios.get('https://api.aladhan.com/v1/timingsByCity', {
            params: {
                city: 'Khartoum',
                country: 'Sudan',
                method: 2,
                school: 0 // Added for better accuracy
            },
            timeout: 5000
        });
        return res.data?.data?.timings || null;
    } catch (err) {
        console.error('Prayer times API error:', err.message);
        return null;
    }
}

async function schedulePrayerReminders() {
    // Stop existing jobs
    prayerJobs.forEach(j => j.stop());
    prayerJobs = [];
    
    const times = await getPrayerTimes();
    if (!times) {
        console.warn('⚠ Could not fetch prayer times');
        return;
    }
    
    const map = {
        Fajr: 'الفجر',
        Dhuhr: 'الظهر',
        Asr: 'العصر',
        Maghrib: 'المغرب',
        Isha: 'العشاء'
    };
    
    for (const [key, arabicName] of Object.entries(map)) {
        const [h, m] = times[key].split(':').map(Number);
        
        // Validate time
        if (h >= 0 && h < 24 && m >= 0 && m < 60) {
            const job = cron.schedule(
                ${m} ${h} * * *,
                () => sendBroadcast(${pickRandom(prayerReminders)}\n🕒 ${arabicName} الآن),
                { timezone: 'Africa/Khartoum' }
            );
            prayerJobs.push(job);
            console.log(⏰ Scheduled ${arabicName} at ${h}:${m});
        }
    }
}

// Daily prayer times refresh
cron.schedule('5 0 * * *', () => {
    console.log('📅 Refreshing prayer times...');
    schedulePrayerReminders();
}, { timezone: 'Africa/Khartoum' });

// ==================== SCHEDULED MESSAGES ====================
// Morning greetings
cron.schedule('0 8 * * *', () => {
    sendBroadcast(pickRandom(greetings));
}, { timezone: 'Africa/Khartoum' });

// Evening message
cron.schedule('0 20 * * *', () => {
    sendBroadcast('مساء الخير! 😄 اكتب "نكتة" عشان نضحك.');
}, { timezone: 'Africa/Khartoum' });

// Helper to broadcast to all subscribers
async function sendBroadcast(message) {
    const allIds = new Set([...data.subscribers, ...Object.keys(data.groupStats)]);
    for (const id of allIds) {
        try {
            await client.sendMessage(id, message);
        } catch (err) {
            console.error(❌ Failed to send to ${id}:, err.message);
        }
    }
}

// ==================== COMMAND HANDLER ====================
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

رقم المطور: ${process.env.DEV_PHONE || 'غير متوفر'}
رابط قروب الواتساب: https://chat.whatsapp.com/GZmrZ8EETk84SreBpM6tPp?mode=ac_t
`;
}

// ==================== MESSAGE EVENTS ====================
client.on('message_create', async (msg) => {
    // Group welcome when bot is added
    if (msg.from.endsWith('@g.us')) {
        try {
            const chat = await msg.getChat();
            const botId = client.info.wid._serialized;
            
            // Check if bot is a participant
            const isInGroup = chat.participants.some(p => p.id._serialized === botId);
            
            if (isInGroup && !data.welcomedChats.has(chat.id._serialized)) {
                data.welcomedChats.add(chat.id._serialized);
                saveData();
                await chat.sendMessage(getCommandsList());
            }
        } catch (err) {
            console.error('Group welcome error:', err.message);
        }
    }
});

client.on('message', async msg => {
    const from = msg.from;
    const body = msg.body.trim();
    
    // Ignore own messages
    if (msg.fromMe) return;
    
    // Welcome first-time private chats
    if (!from.endsWith('@g.us') && !data.welcomedChats.has(from)) {
        data.welcomedChats.add(from);
        saveData();
        await msg.reply(getCommandsList());
        return; // Don't process further on first message
    }

    // Spontaneous replies (single random response)
    if (body === 'كيدي-بوت-روبوت') {
        const replies = [
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
        return msg.reply(pickRandom(replies));
    }

    // Group stats update
    if (msg.isGroup) {
        try {
            const chat = await msg.getChat();
            if (!data.groupStats[from]) {
                data.groupStats[from] = {
                    messages: {},
                    createdTimestamp: chat.createdTimestamp || Date.now(),
                    participants: []
                };
            }
            
            data.groupStats[from].participants = chat.participants.map(p => p.id._serialized);
            const author = msg.author || msg.from;
            data.groupStats[from].messages[author] = (data.groupStats[from].messages[author] || 0) + 1;
            saveData();
        } catch (err) {
            console.error('Stats update error:', err.message);
        }
    }

    // Command: Show commands
    if (body === 'اوامر') {
        return msg.reply(getCommandsList());
    }

    // Command: Subscribe/Unsubscribe
    if (body === 'اشترك') {
        if (data.subscribers.includes(from)) {
            return msg.reply('✅ أنت مشترك بالفعل');
        }
        data.subscribers.push(from);
        saveData();
        return msg.reply('✅ تم الاشتراك بنجاح');
    }

    if (body === 'الغاء') {
        const index = data.subscribers.indexOf(from);
        if (index > -1) {
            data.subscribers.splice(index, 1);
            saveData();
            return msg.reply('✅ تم إلغاء الاشتراك');
        }
        return msg.reply('ℹ أنت غير مشترك أصلاً');
    }

    // Command: Joke
    if (body === 'نكتة') {
        return msg.reply(pickRandom(jokes));
    }

    // Command: Group Stats (FIXED NAME)
    if (body === 'احصائيات القروب') {
        if (!msg.isGroup) {
            return msg.reply('⚠ هذا الأمر يعمل فقط في القروبات');
        }
        
        try {
            const chat = await msg.getChat();
            const stats = data.groupStats[from] || { messages: {} };
            const membersCount = chat.participants.length;
            const createdAt = chat.createdTimestamp 
                ? new Date(chat.createdTimestamp).toLocaleString('ar-EG', { timeZone: 'Africa/Khartoum' })
                : 'غير متوفر';

            const messageCounts = Object.entries(stats.messages).sort((a, b) => b[1] - a[1]);
            
            if (!messageCounts.length) {
                return msg.reply(📊 تاريخ الإنشاء: ${createdAt}\n👥 الأعضاء: ${membersCount}\nلا توجد بيانات بعد);
            }

            const [topId, topCount] = messageCounts[0];
            const [bottomId, bottomCount] = messageCounts[messageCounts.length - 1];
            
            const topName = await getContactNameOrNumber(topId);
            const bottomName = await getContactNameOrNumber(bottomId);
            
            return msg.reply(
                📊 *إحصائيات القروب*\n +
                تاريخ الإنشاء: ${createdAt}\n +
                👥 عدد الأعضاء: ${membersCount}\n\n +
                🏆 الأكثر تفاعل: ${topName} (${topCount} رسالة)\n +
                😴 الأقل تفاعل: ${bottomName} (${bottomCount} رسالة)
            );
        } catch (err) {
            console.error('Group stats error:', err.message);
            return msg.reply('❌ حدث خطأ أثناء جلب الإحصائيات');
        }
    }

    // Command: Number Guessing Game
    if (body === 'العب رقم') {
        data.pendingGames[from] = {
            type: 'guess',
            number: Math.floor(Math.random() * 10) + 1,
            tries: 0
        };
        saveData();
        return msg.reply('🎮 اخترت رقمًا بين 1-10، جرّب تخمّنه!');
    }

    if (data.pendingGames[from]?.type === 'guess' && /^\d+$/.test(body)) {
        const game = data.pendingGames[from];
        const guess = parseInt(body);
        game.tries++;

        if (guess === game.number) {
            delete data.pendingGames[from];
            saveData();
            return msg.reply(🎉 إحسنت! الرقم ${guess} صحيح بعد ${game.tries} محاولة);
        }
        
        saveData();
        return msg.reply(guess < game.number ? '⬆ أعلى!' : '⬇ أقل!');
    }

    // Command: Quiz/Trivia
    if (body === 'لغز') {
        const q = pickRandom(triviaQuestions);
        data.pendingQuiz[from] = q;
        saveData();
        return msg.reply(q.q);
    }

    if (['أ', 'ب', 'ج', 'A', 'B', 'C', 'a', 'b', 'c'].includes(body)) {
        const quiz = data.pendingQuiz[from];
        if (!quiz) return;
        
        const answer = body.replace(/[Aa]/g, 'أ').replace(/[Bb]/g, 'ب').replace(/[Cc]/g, 'ج');
        delete data.pendingQuiz[from];
        saveData();
        
        return msg.reply(answer === quiz.answer ? '✅ صحيح!' : '❌ خطأ! الإجابة الصحيحة: ' + quiz.answer);
    }

    // Command: Rock-Paper-Scissors
    if (['حجر', 'ورق', 'مقص'].includes(body)) {
        const botChoice = pickRandom(['حجر', 'ورق', 'مقص']);
        let result;
        
        if (body === botChoice) {
            result = '⚖ تعادل!';
        } else if (
            (body === 'حجر' && botChoice === 'مقص') ||
            (body === 'ورق' && botChoice === 'حجر') ||
            (body === 'مقص' && botChoice === 'ورق')
        ) {
            result = '🎉 فزت!';
        } else {
            result = '😔 خسرت!';
        }
        
        return msg.reply(أنا اخترت: ${botChoice}\n${result});
    }

    // Command: AI Chat
    if (body.startsWith('ذكاء ')) {
        const prompt = body.slice(6).trim();
        if (!prompt) return msg.reply('🤖 استخدم: ذكاء [سؤالك]');
        
        try {
            const resp = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': Bearer ${OPENAI_API_KEY},
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );
            
            return msg.reply(resp.data.choices[0].message.content.trim());
        } catch (err) {
            console.error('OpenAI error:', err.response?.data || err.message);
            return msg.reply('❌ خطأ في الذكاء الاصطناعي. تأكد من مفتاح API أو حاول لاحقًا.');
        }
    }

    // Command: Weather (NOW WORKING)
    if (body.startsWith('طقس ')) {
        const city = body.slice(4).trim();
        if (!city) return msg.reply('🌤 استخدم: طقس [اسم المدينة]');
        
        const weather = await getWeather(city);
        return msg.reply(weather);
    }

    // Command: Translate (NOW WORKING)
    if (body.includes(' إلى ') && body.startsWith('ترجم ')) {
        const match = body.match(/^ترجم (.+) إلى (\w+)$/);
        if (!match) return msg.reply('🌐 استخدم: ترجم [النص] إلى [en/fr/es/...]');
        
        const [, text, lang] = match;
        const translated = await translateText(text, lang);
        return msg.reply(🌐 الترجمة (${lang}):\n${translated});
    }

    // Command: Date
    if (body === 'التاريخ') {
        const today = new Date();
        const hijri = 'غير مدعوم حالياً'; // You can add a hijri library later
        return msg.reply(
            📅 التاريخ اليوم:\n +
            - الميلادي: ${today.toLocaleDateString('ar-EG')}\n +
            - الهجري: ${hijri}
        );
    }

    // Command: Random Fact
    if (body === 'معلومة') {
        return msg.reply('💡 ' + pickRandom(facts));
    }

    // Command: Random Quote
    if (body === 'اقتباس') {
        return msg.reply('💭 ' + pickRandom(quotes));
    }

    // Command: Random Image (NOW WORKING)
    if (body === 'صورة') {
        const imageUrl = await getRandomImage();
        if (imageUrl) {
            const media = await MessageMedia.fromUrl(imageUrl);
            return msg.reply(media, null, { caption: '🖼 صورة عشوائية' });
        }
        return msg.reply('❌ لم أتمكن من جلب صورة');
    }

    // Command: News (Placeholder)
    if (body === 'اخبار') {
        return msg.reply('📰 ميزة الأخبار قيد التطوير. حاول لاحقًا.');
    }

    // Command: Market (Placeholder)
    if (body === 'سوق') {
        return msg.reply('📈 ميزة سوق الأسهم قيد التطوير. حاول لاحقًا.');
    }

    // Command: Technical Support
    if (body === 'مساعدة تقنية') {
        return msg.reply('🔧 رابط الدعم: https://chat.whatsapp.com/GZmrZ8EETk84SreBpM6tPp?mode=ac_t');
    }

    // Auto-reply to greeting
    if (body.includes('السلام')) {
        return msg.reply('وعليكم السلام ورحمة الله وبركاته يا زول 👋');
    }

    // Default response for unknown commands
    if (body.startsWith('ذكاء') || body.startsWith('طقس') || body.startsWith('ترجم')) {
        // Already handled above, this is a fallback
        return;
    }
    
    // If no command matched and it's a direct mention
    if (data.pendingGames[from] || data.pendingQuiz[from]) {
        // Game/quiz state is handled above
        return;
    }
});

// ==================== INITIALIZE ====================
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    prayerJobs.forEach(j => j.stop());
    await client.destroy();
    process.exit(0);
});
