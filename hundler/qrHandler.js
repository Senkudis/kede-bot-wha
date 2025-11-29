const qrcode = require('qrcode');

const handleQRCode = async (qr) => {
    console.log('⚡ QR Code Received');
    
    // طباعة الكود كنص في التيرمينال (عشان تنسخه لموقع خارجي لو السيرفر ما فيه شاشة)
    console.log('QR String:', qr);

    // طباعة الباركود في التيرمينال (يحتاج مكتبة qrcode-terminal لو عايز تشوفه رسمة)
    // لكن بما أنك تستخدم qrcode فقط، سنقوم بطباعته كنص يمكن تحويله
    try {
        const url = await qrcode.toDataURL(qr);
        console.log('Scan the QR code to log in.');
        // هنا ممكن نضيف كود لرفع الصورة أو عرضها لو عندك سيرفر ويب
    } catch (err) {
        console.error(err);
    }
};

module.exports = { handleQRCode };
