const handleReady = () => {
    console.log('✅ [Kede-Bot] Client is ready!');
};

const handleDisconnect = (reason) => {
    console.log('❌ [Kede-Bot] Disconnected:', reason);
};

module.exports = { handleReady, handleDisconnect };
