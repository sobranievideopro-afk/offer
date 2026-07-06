require('dotenv').config();
const bot = require('./src/bot');

bot.launch().then(() => {
  console.log('✅ Бот запущен и слушает сообщения (polling mode)');
});

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
