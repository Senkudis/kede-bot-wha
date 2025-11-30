const { GoogleGenerativeAI } = require("@google/generative-ai");

// إعداد الذكاء الاصطناعي
// تأكد أنك وضعت المفتاح في إعدادات السيرفر (Environment Variables)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE");
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أنت مساعد ذكي ومرح اسمك 'كيدي'. تتحدث باللهجة السودانية المحببة. إجاباتك مفيدة ومختصرة."
});

// دالة مساعدة لتحويل الصور لصيغة يفهمها Gemini
function fileToGenerativePart(base64Data, mimeType) {
    return {
        inlineData: {
            data: base64Data,
            mimeType
        },
    };
}

const messageHandler = async (client, msg) => {
    // 1. تجاهل رسائل البوت نفسه أو رسائل الحالة
    if (msg.fromMe || msg.type === 'e2e_notification') return;

    const body = msg.body.toLowerCase().trim();
    const chat = await msg.getChat();

    console.log(`📩 رسالة من ${msg.from}: ${body}`);

    try {
        // --- الميزة الأولى: صانع الملصقات ---
        // الشرط: رسالة فيها صورة + مكتوب معاها "ملصق" أو "sticker"
        if (msg.hasMedia && (body === 'ملصق' || body === 'sticker' || body === 'ستيكر')) {
            await chat.sendStateTyping();
            const media = await msg.downloadMedia();
            
            await client.sendMessage(msg.from, media, { 
                sendMediaAsSticker: true, 
                stickerName: "Kede Bot", 
                stickerAuthor: "Kede" 
            });
            return; // نوقف هنا عشان ما يمشي للذكاء الاصطناعي
        }

        // --- الميزة الثانية والثالثة: الذكاء الاصطناعي (نص وصور) ---
        // الشرط: يبدأ بكلمة "كيدي" أو ".ai" أو لو كان رد على البوت
        if (body.startsWith('كيدي') || body.startsWith('.ai')) {
            await chat.sendStateTyping();

            // تنظيف النص من كلمة الاستدعاء
            let promptText = body.replace('كيدي', '').replace('.ai', '').trim();
            
            // لو المستخدم رسل "كيدي" بس بدون كلام
            if (!promptText && !msg.hasMedia) {
                await msg.reply("أيوه يا مدير؟ آمرني! 🤖");
                return;
            }
            if (!promptText) promptText = "اشرح لي الصورة دي"; // لو رسل صورة بس

            let parts = [promptText];

            // لو الرسالة فيها صورة (Vision)
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                // التأكد أن الملف صورة (وليس فيديو أو صوت حالياً لتخفيف الحمل)
                if (media.mimetype.startsWith('image/')) {
                    parts.push(fileToGenerativePart(media.data, media.mimetype));
                }
            }

            // إرسال الطلب لـ Gemini
            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.text();

            // الرد على المستخدم
            await msg.reply(text);
        }

    } catch (error) {
        console.error('❌ Error:', error);
        // لا ترسل تفاصيل الخطأ للمستخدم، فقط رسالة لطيفة
        // await msg.reply("معليش، حصلت لفة في الشبكة.. جرب تاني 😅");
    }
};

module.exports = messageHandler;
