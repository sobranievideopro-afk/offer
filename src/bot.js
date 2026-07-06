const { Telegraf } = require('telegraf');
const { getSession, resetSession } = require('./sessionStore');
const { extractText } = require('./fileParser');
const { analyzeResume, formatAnalysisForTelegram } = require('./handlers/analyze');
const {
  improveResume,
  tailorResume,
  formatImproveForTelegram,
  formatTailorForTelegram,
} = require('./handlers/improve');
const {
  generateQuestions,
  getFeedback,
  getFinalReport,
  formatFeedbackForTelegram,
} = require('./handlers/interview');
const { buildImagePrompt, generateImage } = require('./handlers/photo');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- Вспомогательные функции ----------

async function downloadFileAsBuffer(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(link.href);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function chunkMessage(text, maxLen = 3500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

async function sendLong(ctx, text) {
  for (const chunk of chunkMessage(text)) {
    await ctx.reply(chunk);
  }
}

// ---------- Команды ----------

bot.start((ctx) => {
  resetSession(ctx.chat.id);
  ctx.reply(
    `👋 Привет! Я помогу подготовить резюме и потренироваться перед собеседованием.\n\n` +
      `📄 /analyze — пришли резюме файлом (PDF/DOCX/TXT), получишь оценку 0-100 и разбор сильных/слабых сторон\n\n` +
      `✍️ /improve — улучшу формулировки в резюме\n` +
      `🎯 /tailor — подгоню резюме под конкретную вакансию (нужно резюме + текст вакансии)\n\n` +
      `📸 /photo — деловое фото для резюме\n\n` +
      `🎤 /interview — тренировка интервью с фидбеком на каждый ответ\n\n` +
      `Начни с того, что пришли файл резюме 👇`
  );
});

bot.help((ctx) => {
  ctx.reply(
    `Доступные команды:\n\n` +
      `/analyze — анализ и оценка резюме\n` +
      `/improve — улучшение формулировок\n` +
      `/tailor — адаптация под вакансию (пришли текст вакансии после команды)\n` +
      `/photo — деловое фото\n` +
      `/interview — тренировка интервью\n` +
      `/reset — начать заново`
  );
});

bot.command('reset', (ctx) => {
  resetSession(ctx.chat.id);
  ctx.reply('Сессия сброшена. Пришли резюме заново, чтобы начать.');
});

// Приём файла резюме
bot.on('document', async (ctx) => {
  const session = getSession(ctx.chat.id);
  const doc = ctx.message.document;

  try {
    await ctx.reply('📎 Читаю файл...');
    const buffer = await downloadFileAsBuffer(ctx, doc.file_id);
    const text = await extractText(buffer, doc.file_name);

    if (text.length < 50) {
      return ctx.reply('Не удалось извлечь текст из файла (возможно, это скан-изображение). Пришли текстовый PDF/DOCX.');
    }

    session.resumeText = text;
    await ctx.reply(
      `✅ Резюме загружено (${text.length} символов).\n\n` +
        `Что дальше?\n/analyze — оценить резюме\n/improve — улучшить формулировки\n/tailor — адаптировать под вакансию (пришли текст вакансии после команды)\n/interview — потренировать интервью`
    );
  } catch (err) {
    ctx.reply(`❌ Ошибка при чтении файла: ${err.message}`);
  }
});

bot.command('analyze', async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (!session.resumeText) {
    return ctx.reply('Сначала пришли файл резюме (PDF/DOCX/TXT) 📄');
  }

  await ctx.reply('🔍 Анализирую резюме, это займёт 10-20 секунд...');
  try {
    const analysis = await analyzeResume(session.resumeText);
    session.resumeAnalysis = analysis;
    await sendLong(ctx, formatAnalysisForTelegram(analysis));
  } catch (err) {
    ctx.reply(`❌ Ошибка анализа: ${err.message}`);
  }
});

bot.command('improve', async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (!session.resumeText) {
    return ctx.reply('Сначала пришли файл резюме (PDF/DOCX/TXT) 📄');
  }

  await ctx.reply('✍️ Улучшаю резюме...');
  try {
    const result = await improveResume(session.resumeText, session.resumeAnalysis);
    await ctx.reply(formatImproveForTelegram(result));
    await sendLong(ctx, result.improved_resume);
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// /tailor ожидает текст вакансии сразу после команды: "/tailor <текст вакансии>"
bot.command('tailor', async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (!session.resumeText) {
    return ctx.reply('Сначала пришли файл резюме (PDF/DOCX/TXT) 📄');
  }

  const jobText = ctx.message.text.replace('/tailor', '').trim();
  if (!jobText) {
    return ctx.reply('Пришли текст вакансии вместе с командой, например:\n/tailor [текст вакансии]\n\nИли просто отправь текст вакансии следующим сообщением.');
  }

  session.jobDescription = jobText;
  await ctx.reply('🎯 Адаптирую резюме под вакансию...');
  try {
    const result = await tailorResume(session.resumeText, jobText);
    await ctx.reply(formatTailorForTelegram(result));
    await sendLong(ctx, result.tailored_resume);
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

bot.command('photo', async (ctx) => {
  await ctx.reply(
    '📸 Функция генерации фото требует отдельный ключ image-API (не входит в Claude).\n\n' +
      'Опиши коротко себя (пол, стиль) и пришли текстом — я подготовлю промпт. ' +
      'Но для самой генерации картинки нужно подключить сервис вроде OpenAI Images или Stability AI (см. IMAGE_API_KEY в .env).'
  );
});

bot.command('interview', async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (!session.resumeText) {
    return ctx.reply('Сначала пришли файл резюме (PDF/DOCX/TXT) 📄');
  }
  if (!session.jobDescription) {
    return ctx.reply('Пришли текст вакансии, для которой готовимся к интервью (просто отправь текстом).');
  }

  await ctx.reply('🎤 Готовлю вопросы для интервью...');
  try {
    const questions = await generateQuestions(session.resumeText, session.jobDescription);
    session.interview = { questions, currentIndex: 0, qaHistory: [] };
    await ctx.reply(
      `Начинаем! Задам ${questions.length} вопросов. Отвечай текстом, после каждого ответа дам фидбек.\n\n` +
        `Вопрос 1/${questions.length}:\n${questions[0].text}`
    );
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// Обычные текстовые сообщения — либо ответ на интервью, либо текст вакансии
bot.on('text', async (ctx) => {
  const session = getSession(ctx.chat.id);
  const text = ctx.message.text;

  if (text.startsWith('/')) return; // неизвестная команда — игнор

  // Если идёт интервью — это ответ на вопрос
  if (session.interview && session.interview.currentIndex < session.interview.questions.length) {
    const { questions, currentIndex, qaHistory } = session.interview;
    const currentQuestion = questions[currentIndex];

    await ctx.reply('💭 Анализирую ответ...');
    try {
      const feedback = await getFeedback(
        currentQuestion.text,
        currentQuestion.type,
        text,
        session.jobDescription.slice(0, 500)
      );
      qaHistory.push({ question: currentQuestion.text, answer: text, feedback });
      await ctx.reply(formatFeedbackForTelegram(feedback));

      session.interview.currentIndex += 1;

      if (session.interview.currentIndex < questions.length) {
        const nextQ = questions[session.interview.currentIndex];
        await ctx.reply(
          `Вопрос ${session.interview.currentIndex + 1}/${questions.length}:\n${nextQ.text}`
        );
      } else {
        await ctx.reply('📋 Интервью завершено! Готовлю итоговый отчёт...');
        const report = await getFinalReport(qaHistory);
        await sendLong(ctx, report);
        session.interview = null;
      }
    } catch (err) {
      ctx.reply(`❌ Ошибка: ${err.message}`);
    }
    return;
  }

  // Иначе — если нет job description, считаем это текстом вакансии
  if (session.resumeText && !session.jobDescription && text.length > 100) {
    session.jobDescription = text;
    return ctx.reply(
      '✅ Вакансия сохранена.\n\n/tailor — адаптировать резюме\n/interview — начать тренировку интервью'
    );
  }

  ctx.reply('Не понял запрос 🤔 Набери /help чтобы увидеть список команд.');
});

module.exports = bot;
