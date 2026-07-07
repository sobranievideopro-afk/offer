require('dotenv').config();
const bot = require('./src/bot');
const { initSchema } = require('./src/db');
const { createServer } = require('./src/server');

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => bot.launch())
  .then(() => {
    console.log('✅ Бот запущен и слушает сообщения (polling mode)');
    const app = createServer();
    app.listen(PORT, () => {
      console.log(`✅ HTTP API для сайта запущен на порту ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Ошибка при запуске:', err);
    process.exit(1);
  });

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
