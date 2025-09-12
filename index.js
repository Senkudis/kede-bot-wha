require('dotenv').config();
const { Client, LocalAuth, MessageMedia, List } = require('whatsapp-web.js');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const Jimp = require('jimp');

// =================================================================================
// ===== إعدادات ومفاتيح API (كل المفاتيح مكتملة الآن) ===========================
// =================================================================================
cconst OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY;
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

// =================================================================================
// ===== تحميل وتهيئة البيانات ===================================================
// =================================================================================
const DATA_FILE = path.join(__dirname, 'data.json');
let data = {};
try {
    if (fs.existsSync(DATA_FILE)) {
        data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
} catch (error) { console.error('❌ خطأ في قراءة ملف البيانات:', error); }

// تهيئة الحقول
data.userProfiles = data.userProfiles || {};
data.reminders = data.reminders || [];
data.subscribers = data.subscribers || [];
data.pendingQuiz = data.pendingQuiz || {};
data.pendingGames = data.pendingGames || {};
data.groupStats = data.groupStats || {};
data.dailyStats = data.dailyStats || {};
data.welcomedChatsPrivate = data.welcomedChatsPrivate || [];
data.welcomedChatsGroups = data.welcomedChatsGroups || [];

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
saveData();
console.log('✅ تم تحميل وتهيئة ملف البيانات');

// =================================================================================
// ===== محتوى البوت ودوال مساعدة ================================================
// =================================================================================
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const jokes = ["قال ليك في مسطول بكتب مع الأستاذ وكل ما الأستاذ يمسح السبوره يشرط الورقة", "مسطول شغال بتاع مرور قبض واحد يفحط قطعة إيصال بثلاثين ألف قام أداه خمسين الف المسطول قالي مامعاي فكه فحط بالعشرين الباقية وتعال.", "طبيب اسنان قال لي زبونو : حسيت بي وجع؟ قال ليهو: مهما كان في الم ما بصل الم الفاتورة الجاياني اسي ."];
const triviaQuestions = [{ q: "ما هي عاصمة السودان؟\nأ) الخرطوم\nب) أم درمان\nج) الأبيض", answer: "أ" }];
const prayerReminders = ["قوموا يا عباد الله إلى الصلاة 🙏", "حيّ على الصلاة، حيّ على الفلاح 🕌", "لا تؤجلوا الصلاة، فالدعاء فيها مستجاب 🙌"];
const greetings = ["صباح الخير يا زول! 🌞", "صبحك الله بالخير!", "صباح النور يا الغالي!"];

// =================================================================================
// ===== دوال مساعدة للميزات ======================================================
// =================================================================================
async function getWeather(city) {
    try {
        const resp = await axios.get(`http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}&lang=ar`);
        const d = resp.data;
        return `🌤️ الطقس في *${d.location.name}*:\n\n- الحالة: ${d.current.condition.text}\n- درجة الحرارة: ${Math.round(d.current.temp_c)}° مئوية\n- ощущается как: ${Math.round(d.current.feelslike_c)}° مئوية\n- الرطوبة: ${d.current.humidity}%\n- سرعة الرياح: ${d.current.wind_kph} كم/س`;
    } catch (error) {
        if (error.response && error.response.status === 404) return `لم أتمكن من العثور على مدينة باسم "${city}".`;
        return 'عذرًا، حدث خطأ أثناء جلب بيانات الطقس.';
    }
}

async function generateImage(prompt) {
    try {
        const response = await axios.post('https://api.openai.com/v1/images/generations', { model: "dall-e-3", prompt, n: 1, size: "1024x1024" }, { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` } });
        return { url: response.data.data[0].url };
    } catch (error) {
        return { error: 'عذرًا، حدث خطأ أثناء إنشاء الصورة.' };
    }
}

async function textToSpeech(text) {
    try {
        const response = await axios.post('https://api.openai.com/v1/audio/speech', { model: "tts-1", input: text, voice: "alloy" }, { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }, responseType: 'arraybuffer' });
        return { audio: Buffer.from(response.data, 'binary').toString('base64') };
    } catch (error) {
        return { error: 'عذرًا، حدث خطأ أثناء تحويل النص إلى صوت.' };
    }
}

async function summarizeUrl(url) {
    try {
        const { data: pageData } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(pageData);
        const mainText = $('article, main, body').text().replace(/\s\s+/g, ' ').trim().substring(0, 4000);
        if (!mainText) return { error: 'لم أتمكن من استخلاص النص من هذا الرابط.' };

        const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [{ role: "system", content: "أنت مساعد متخصص في تلخيص المقالات. لخص النص التالي في 5 نقاط رئيسية باللغة العربية." }, { role: "user", content: mainText }]
        }, { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` } });
        return { summary: resp.data.choices[0].message.content.trim() };
    } catch (error) {
        return { error: 'فشل في الوصول إلى الرابط أو تلخيصه.' };
    }
}

async function createMeme(imageBuffer, topText, bottomText) {
    try {
        const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
        const image = await Jimp.read(imageBuffer);
        image.print(font, 10, 10, { text: topText.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_TOP }, image.bitmap.width - 20);
        image.print(font, 10, 10, { text: bottomText.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM }, image.bitmap.width - 20);
        return await image.getBufferAsync(Jimp.MIME_JPEG);
    } catch (error) {
        return null;
    }
}

// =================================================================================
// ===== نظام التذكيرات والمهام المجدولة ==========================================
// =================================================================================
const recentMessages = {};

setInterval(() => {
    const now = Date.now();
    const remindersToKeep = [];
    data.reminders.forEach((reminder) => {
        if (now >= reminder.time) {
            client.sendMessage(reminder.userId, `🔔 *تذكير:* ${reminder.text}`);
        } else {
            remindersToKeep.push(reminder);
        }
    });
    if (remindersToKeep.length < data.reminders.length) {
        data.reminders = remindersToKeep;
        saveData();
    }
}, 1000 * 30);

cron.schedule('0 0 * * *', () => {
    console.log('🔄 إعادة تعيين الإحصائيات اليومية...');
    data.dailyStats = {};
    saveData();
}, { timezone: 'Africa/Khartoum' });

cron.schedule('0 8 * * *', () => {
    const text = pickRandom(greetings);
    data.subscribers.forEach(id => client.sendMessage(id, text));
}, { timezone: 'Africa/Khartoum' });

// =================================================================================
// ===== تهيئة عميل الواتساب ======================================================
// =================================================================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async qr => {
    console.log('📌 تم توليد QR — جارٍ رفعه...');
    const qrPath = path.join(__dirname, 'qr.png');
    await QRCode.toFile(qrPath, qr);
    const form = new FormData();
    form.append('image', fs.createReadStream(qrPath));
    try {
        const resp = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, { headers: form.getHeaders() });
        if (resp.data?.data?.url) console.log('✅ رابط الـ QR:', resp.data.data.url);
    } catch (err) {
        console.error('❌ خطأ رفع QR:', err.message);
    } finally {
        fs.unlinkSync(qrPath);
    }
});

client.on('ready', () => { console.log('✅ البوت جاهز للعمل'); });

// =================================================================================
// ===== معالجة الرسائل والأوامر ==================================================
// =================================================================================
client.on('message', async msg => {
    const from = msg.from;
    const body = msg.body.trim();
    if (!body) return;

    const lowerBody = body.toLowerCase();
    const isGroup = from.endsWith('@g.us');
    const authorId = msg.author || from;

    // --- نظام النقاط والإحصائيات ---
    if (isGroup) {
        // الإحصائيات العامة
        data.groupStats[from] = data.groupStats[from] || { messages: {} };
        data.groupStats[from].messages[authorId] = (data.groupStats[from].messages[authorId] || 0) + 1;
        // الإحصائيات اليومية
        data.dailyStats[from] = data.dailyStats[from] || {};
        data.dailyStats[from][authorId] = (data.dailyStats[from][authorId] || 0) + 1;
        // نظام النقاط
        data.userProfiles[authorId] = data.userProfiles[authorId] || { points: 0, title: null };
        data.userProfiles[authorId].points += 1;
        saveData();

        // نظام "أنت نار 🔥"
        const now = Date.now();
        recentMessages[authorId] = (recentMessages[authorId] || []).filter(timestamp => now - timestamp < 3600 * 1000);
        recentMessages[authorId].push(now);
        if (recentMessages[authorId].length === 15) {
            const contact = await msg.getContact();
            msg.reply(`يا @${contact.number}، أنت نار الليلة! 🔥 استمر في التفاعل!`, { mentions: [contact] });
        }
    }

    // --- معالجة اختيار المستخدم من القائمة ---
    if (msg.type === 'list_response') {
        const selectedId = msg.selectedRowId;
        let response = '';
        switch (selectedId) {
            case 'ai_creative_menu':
                response = `*🤖 أوامر الذكاء الاصطناعي والإبداع:*\n\n*لخص*: (بالرد على رابط) لتلخيص المقالات.\n*تخيل [وصف]*: لإنشاء صورة بالذكاء الاصطناعي.\n*اقرأ [نص]*: لتحويل النص إلى رسالة صوتية.\n*ميم "نص علوي" "نص سفلي"*: (بالرد على صورة) لإنشاء ميم.\n*ملصق*: (بالرد на صورة) لتحويلها إلى ملصق.`;
                break;
            case 'games_social_menu':
                response = `*🎮 أوامر الألعاب والتفاعل الاجتماعي:*\n\n*نقاطي*: لمعرفة عدد نقاطك ولقبك.\n*متجر*: لعرض الألقاب المتاحة للشراء.\n*شراء لقب [اسم اللقب]*: لشراء لقب جديد.\n*توب*: لعرض قائمة المتفاعلين اليومية.\n*gif [كلمة بحث]*: لإرسال صورة متحركة.\n*نكتة*: لسماع نكتة.\n*لغز*: لحل لغز.`;
                break;
            case 'tools_services_menu':
                response = `*🛠️ أوامر الخدمات والأدوات الشخصية:*\n\n*ذكرني "نص" بعد [وقت] [وحدة]*: لضبط تذكير شخصي.\n*طقس [مدينة]*: لمعرفة حالة الطقس.\n*التاريخ*: لمعرفة تاريخ اليوم.\n*احصائيات*: لعرض الإحصائيات العامة للمجموعة.`;
                break;
        }
        return msg.reply(response);
    }

    // --- معالجة الأوامر النصية ---
    const command = lowerBody.split(' ')[0];
    const args = body.substring(command.length).trim();

    // --- أوامر الرد على الرسائل ---
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (lowerBody === 'لخص' && quotedMsg.body.includes('http')) {
            const url = quotedMsg.body.match(/https?:\/\/[^\s]+/)[0];
            msg.reply(`جارٍ تلخيص الرابط... ⌛`);
            const result = await summarizeUrl(url);
            return msg.reply(result.summary || result.error);
        }
        if (command === 'ميم' && quotedMsg.hasMedia && quotedMsg.type === 'image') {
            const media = await quotedMsg.downloadMedia();
            const texts = args.split('"').filter(t => t.trim());
            const topText = texts[0] || '';
            const bottomText = texts[1] || '';
            const memeBuffer = await createMeme(Buffer.from(media.data, 'base64'), topText, bottomText);
            if (memeBuffer) {
                const memeMedia = new MessageMedia('image/jpeg', memeBuffer.toString('base64'), 'meme.jpg');
                return client.sendMessage(from, memeMedia);
            }
        }
        if (lowerBody === 'ملصق' && quotedMsg.hasMedia && quotedMsg.type === 'image') {
            const media = await quotedMsg.downloadMedia();
            client.sendMessage(from, media, { sendMediaAsSticker: true, stickerAuthor: "كيدي بوت", stickerName: "ملصقات" });
            return;
        }
    }

    // --- الرد الذكي عند ذكر "كيدي" ---
    if (lowerBody.includes('كيدي')) {
        const isCommand = ['ذكاء', 'تخيل', 'طقس', 'اقرأ', 'ذكرني'].includes(command);
        if (!isCommand) {
             msg.react('👋');
        }
    }

    switch (command) {
        case 'اوامر':
            const sections = [{
                title: 'قائمة الأوامر',
                rows: [
                    { title: '🤖 ذكاء اصطناعي وإبداع', description: 'تلخيص روابط، إنشاء صور وميمز، والمزيد', id: 'ai_creative_menu' },
                    { title: '🎮 ألعاب وتفاعل اجتماعي', description: 'نظام النقاط، صور GIF، ألغاز، وألعاب', id: 'games_social_menu' },
                    { title: '🛠️ خدمات وأدوات شخصية', description: 'ضبط تذكيرات، معرفة الطقس، والتاريخ', id: 'tools_services_menu' }
                ]
            }];
            const list = new List('مرحباً بك في قائمة أوامر *كيدي* التفاعلية.', 'عرض الأوامر', sections, '🤖 كيدي بوت | اختر ما يناسبك');
            return client.sendMessage(from, list);

        case 'ذكاء':
            if (!args) return msg.reply('يرجى كتابة سؤال بعد كلمة *ذكاء*.');
            msg.reply('لحظة، أفكر في إجابة... 🤔');
            try {
                const resp = await axios.post('https://api.openai.com/v1/chat/completions', { model: "gpt-3.5-turbo", messages: [{ role: "user", content: args }] }, { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` } });
                msg.reply(resp.data.choices[0].message.content.trim());
            } catch (err) {
                msg.reply('عذرًا، حدث خطأ أثناء التواصل مع الذكاء الاصطناعي.');
            }
            break;

        case 'تخيل':
            if (!args) return msg.reply('يرجى كتابة وصف للصورة بعد كلمة *تخيل*.');
            msg.reply(`🎨 جارٍ تخيل "${args}"...`);
            const imgResult = await generateImage(args);
            if (imgResult.url) {
                const media = await MessageMedia.fromUrl(imgResult.url, { unsafeMime: true });
                await client.sendMessage(from, media, { caption: `تفضل: *${args}*` });
            } else {
                msg.reply(imgResult.error);
            }
            break;

        case 'اقرأ':
            if (!args) return msg.reply('يرجى كتابة النص لتحويله إلى صوت بعد كلمة *اقرأ*.');
            const speechResult = await textToSpeech(args);
            if (speechResult.audio) {
                const audioMedia = new MessageMedia('audio/ogg', speechResult.audio, 'voice.ogg');
                await client.sendMessage(from, audioMedia, { sendAudioAsVoice: true });
            } else {
                msg.reply(speechResult.error);
            }
            break;

        case 'طقس':
            if (!args) return msg.reply('يرجى كتابة اسم المدينة بعد كلمة *طقس*.');
            const weatherInfo = await getWeather(args);
            msg.reply(weatherInfo);
            break;

        case 'gif':
            if (!args) return msg.reply('اكتب كلمة للبحث عنها. مثال: `gif ضحك`');
            try {
                const { data: giphyData } = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(args)}&limit=25&lang=ar`);
                if (giphyData.data.length === 0) return msg.reply(`لم أجد أي صور متحركة عن "${args}"`);
                const randomGif = pickRandom(giphyData.data);
                const media = await MessageMedia.fromUrl(randomGif.images.original.url, { unsafeMime: true });
                await client.sendMessage(from, media, { sendVideoAsGif: true });
            } catch (error) {
                msg.reply('حدث خطأ أثناء البحث عن الصور المتحركة.');
            }
            break;

        case 'نقاطي':
            const userProfile = data.userProfiles[authorId] || { points: 0, title: null };
            const title = userProfile.title ? `\n- اللقب: *${userProfile.title}*` : '';
            return msg.reply(`📈 ملفك الشخصي:\n\n- لديك *${userProfile.points}* نقطة.${title}`);

        case 'متجر':
            return msg.reply(`🏪 متجر الألقاب:\n\nلشراء لقب، اكتب \`شراء لقب [اسم اللقب]\`\n\n- *عضو فضي* (1000 نقطة)\n- *عضو ذهبي* (5000 نقطة)\n- *أسطورة القروب* (10000 نقطة)`);

        case 'شراء':
            if (args.startsWith('لقب')) {
                const titleName = args.substring(4).trim();
                const titles = { "عضو فضي": 1000, "عضو ذهبي": 5000, "أسطورة القروب": 10000 };
                const price = titles[titleName];
                if (!price) return msg.reply('هذا اللقب غير موجود في المتجر.');
                
                const profile = data.userProfiles[authorId] || { points: 0 };
                if (profile.points < price) return msg.reply(`ليس لديك نقاط كافية. تحتاج إلى *${price}* نقطة وأنت تملك *${profile.points}* فقط.`);
                
                profile.points -= price;
                profile.title = titleName;
                saveData();
                return msg.reply(`🎉 تهانينا! لقد اشتريت لقب *${titleName}* بنجاح.`);
            }
            break;

        case 'ذكرني':
            const match = args.match(/"([^"]+)"\s+بعد\s+(\d+)\s+(دقيقة|دقايق|ساعة|ساعات|يوم|ايام)/);
            if (!match) return msg.reply('صيغة الأمر غير صحيحة. مثال: `ذكرني "اجتماع مهم" بعد 30 دقيقة`');
            
            const [, text, value, unit] = match;
            const unitMap = { 'دقيقة': 60 * 1000, 'دقايق': 60 * 1000, 'ساعة': 3600 * 1000, 'ساعات': 3600 * 1000, 'يوم': 24 * 3600 * 1000, 'ايام': 24 * 3600 * 1000 };
            const multiplier = unitMap[unit];
            const reminderTime = Date.now() + parseInt(value) * multiplier;

            data.reminders.push({ userId: authorId, text, time: reminderTime });
            saveData();
            return msg.reply(`✅ تم ضبط التذكير بنجاح. سأذكرك برسالة خاصة.`);
        
        case 'نكتة':
            return msg.reply(pickRandom(jokes));

        case 'احصائيات':
            if (!isGroup) return msg.reply('هذا الأمر يعمل فقط داخل المجموعات.');
            const chat = await msg.getChat();
            const stats = data.groupStats[from] || { messages: {} };
            const sorted = Object.entries(stats.messages).sort((a, b) => b[1] - a[1]);
            if (sorted.length === 0) return msg.reply(`لم يتم تسجيل أي رسائل بعد.`);
            const top5 = await Promise.all(sorted.slice(0, 5).map(async ([id, count]) => {
                const contact = await client.getContactById(id);
                return `*${contact.pushname || contact.number}*: ${count} رسالة`;
            }));
            return msg.reply(`📊 *الإحصائيات العامة للمجموعة:*\n\n🏆 *الأكثر تفاعلاً على الإطلاق:*\n${top5.join('\n')}`);

        case 'توب':
            if (!isGroup) return msg.reply('هذا الأمر يعمل فقط داخل المجموعات.');
            const dailyGroupStats = data.dailyStats[from] || {};
            const dailySorted = Object.entries(dailyGroupStats).sort((a, b) => b[1] - a[1]);
            if (dailySorted.length === 0) return msg.reply(`لم يتم تسجيل أي تفاعل اليوم. كن أول المتفاعلين!`);
            
            const dailyTop5 = await Promise.all(dailySorted.slice(0, 5).map(async ([id, count], index) => {
                const contact = await client.getContactById(id);
                const medal = ['🥇', '🥈', '🥉'][index] || '🔹';
                return `${medal} *${contact.pushname || contact.number}*: ${count} رسالة`;
            }));
            return msg.reply(`🏆 *أبطال التفاعل لليوم:*\n\n${dailyTop5.join('\n')}\n\nتتم إعادة تعيين القائمة يوميًا.`);
    }
});

// =================================================================================
// ===== معالجة أحداث المجموعة (الترحيب) ==========================================
// =================================================================================
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const newMemberId = notification.id.participant;
        const contact = await client.getContactById(newMemberId);
        await chat.sendMessage(`🎉 أهلاً وسهلاً بالمبدع/ة @${contact.number} في مجموعة *${chat.name}*! نتمنى لك وقتاً ممتعاً.\n\nاكتب "اوامر" لعرض قائمة الخدمات.`, { mentions: [contact] });
    } catch (error) {
        console.error("خطأ في الترحيب بالعضو الجديد:", error);
    }
});

// =================================================================================
// ===== بدء تشغيل البوت ==========================================================
// =================================================================================
process.on('SIGINT', () => { console.log('💾 حفظ البيانات قبل الإغلاق...'); saveData(); process.exit(); });

client.initialize();
