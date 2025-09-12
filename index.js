// index.js
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const { handleQRCode } = require('./handlers/qrHandler'); // سننشئه لاحقًا
const { handleReady, handleDisconnect } = require('./handlers/clientHandlers'); // سننشئه لاحقًا
const messageHandler = require('./handlers/messageHandler');

console.log('🚀 [Kede-Bot] Starting up...');

// تهيئة عميل الواتساب
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// ربط الأحداث بالمعالجات الخاصة بها
client.on('qr', handleQRCode);
client.on('ready', handleReady);
client.on('disconnected', handleDisconnect);

// أهم جزء: ربط حدث الرسائل بالمعالج الرئيسي
// نمرر 'client' كمعامل ليستطيع المعالج استخدامه
client.on('message_create', (msg) => messageHandler(client, msg));

// معالجة أحداث الانضمام للمجموعة (يمكن وضعها في ملف خاص لاحقًا)
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const contact = await client.getContactById(notification.id.participant);
        await chat.sendMessage(`🎉 أهلاً وسهلاً بالمبدع/ة @${contact.number} في مجموعة *${chat.name}*! نتمنى لك وقتاً ممتعاً.\n\nاكتب "اوامر" لعرض قائمة الخدمات.`, { mentions: [contact] });
    } catch (error) {
        console.error("❌ Error in group_join handler:", error);
    }
});

// بدء تشغيل البوت
client.initialize();

// حفظ البيانات عند الإغلاق
process.on('SIGINT', () => {
    console.log('💾 [Kede-Bot] Saving data before shutdown...');
    // لا نحتاج لحفظ البيانات هنا لأن كل أمر يحفظ بياناته بنفسه
    process.exit();
});
