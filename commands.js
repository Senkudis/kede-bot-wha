const { MessageMedia } = require('whatsapp-web.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

// إعداد Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyDKOCf8PsMnZUBWlbRv7Dg847g3SrjVYdM");
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: `
        أنت 'كيدي'، مساعد تعليمي وشخصي ذكي جداً باللهجة السودانية.
        - في وضع الدراسة: اشرح خطوة بخطوة، حل المعادلات بوضوح، ولخص الدروس.
        - في الترجمة: ترجم بدقة مع الحفاظ على المعنى.
        - أسلوبك: مرح، مشجع، وتستخدم الإيموجي 📚✨.
    `
});

// دوال مساعدة لتحويل الملفات لـ Gemini
function fileToGenerativePart(base64Data, mimeType) {
    return { inlineData: { data: base64Data, mimeType } };
}

module.exports = {
    // 1. الميزة التعليمية (حل معادلات - شرح صور - تلخيص صوت)
    'ai_handler': async (msg, userPrompt) => {
        let parts = [];
        
        // لو المستخدم كاتب نص، ضيفه
        if (userPrompt) parts.push(userPrompt);
        else if (!msg.hasMedia) parts.push("اشرح لي المادة دي او حل لي المعادلة دي"); // افتراضي

        // معالجة الوسائط (صور / صوت)
        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                // دعم الصور (حل معادلات) والصوت (شرح أسئلة صوتية)
                if (media.mimetype.startsWith('image/') || media.mimetype.startsWith('audio/')) {
                    parts.push(fileToGenerativePart(media.data, media.mimetype));
                    await msg.reply("جري تحليل الملف... 🧠");
                } else {
                    return msg.reply("حالياً بدعم الصور (للمعادلات) والصوت (للأسئلة) بس 🚫");
                }
            } catch (e) {
                console.error(e);
                return msg.reply("فشلت في تحميل الصورة/الصوت ❌");
            }
        }

        try {
            const result = await model.generateContent(parts);
            const response = await result.response;
            await msg.reply(response.text());
        } catch (e) {
            console.error(e);
            msg.reply("معليش، المخ ضرب شوية.. حاول تاني 😅");
        }
    },

    // 2. الطقس (مربوط بـ AI عشان ينسق الرد)
    'طقس': async (msg, city) => {
        if (!city) return msg.reply("اكتب: طقس [اسم المدينة]");
        try {
            // استخدام API قوي ومجاني (Open-Meteo) لا يحتاج مفتاح
            // أولاً نجيب الإحداثيات
            const geo = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ar&format=json`);
            
            if (!geo.data.results) return msg.reply(`ما عرفت المدينة دي "${city}"، تأكد من الاسم 🗺️`);
            
            const { latitude, longitude, name, country } = geo.data.results[0];
            
            // ثانياً نجيب الطقس
            const weather = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`);
            const curr = weather.data.current;

            const reply = `🌤 *الطقس في ${name}, ${country}*:
🌡 الحرارة: ${curr.temperature_2m}°C
💧 الرطوبة: ${curr.relative_humidity_2m}%
💨 الرياح: ${curr.wind_speed_10m} كم/س`;
            
            msg.reply(reply);
        } catch (e) {
            console.error(e);
            msg.reply("فشل في جلب الطقس ☁️");
        }
    },

    // 3. الترجمة الذكية (Auto-Detect)
    'ترجم': async (msg, text) => {
        if (!text) return msg.reply("اكتب: ترجم [النص]");
        // نرسل لـ Gemini ونقول ليه ترجم
        const prompt = `Translate the following text to Arabic if it's English (or other), and to English if it's Arabic. Detect automatically: "${text}"`;
        try {
            const result = await model.generateContent(prompt);
            msg.reply(`🔤 *الترجمة:*\n${result.response.text()}`);
        } catch (e) { msg.reply("فشلت الترجمة ❌"); }
    },

    // 4. أوامر عشوائية (معلومات متجددة من الـ AI)
    'معلومة': async (msg) => {
        const result = await model.generateContent("اديني معلومة علمية غريبة ومفيدة وقصيرة باللهجة السودانية");
        msg.reply(`💡 *معلومة:* ${result.response.text()}`);
    },
    
    'نكتة': async (msg) => {
        const result = await model.generateContent("احكي لي نكتة سودانية جديدة تموت من الضحك");
        msg.reply(`😂 ${result.response.text()}`);
    }
};
