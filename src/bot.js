const { Telegraf } = require('telegraf');
const { getSession, resetSession } = require('./sessionStore');
const { extractText } = require('./fileParser');
const { logAction, logDialogue } = require('./adminLogger');
const { upsertUser, logEvent, saveResumeAnalysis, saveInterviewAnswer, savePayment } = require('./db');
const googleSheets = require('./integrations/googleSheets');
const amocrm = require('./integrations/amocrm');
const payments = require('./payments');
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

// Middleware: на каждое сообщение сохраняем/обновляем пользователя в БД
// и прикрепляем его внутренний db-id к ctx.state.dbUserId для использования ниже.
// Если DATABASE_URL не задан — upsertUser вернёт null, и всё остальное просто не пишется в БД.
bot.use(async (ctx, next) => {
  try {
    if (ctx.from) {
      ctx.state.dbUserId = await upsertUser(ctx.from);
    }
  } catch (err) {
    console.error('Ошибка при сохранении пользователя в БД:', err.message);
  }
  return next();
});

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
  logAction(ctx, '▶️ Запустил бота (/start)');
  logEvent(ctx.state.dbUserId, 'start');
  googleSheets.appendRow('Users', [
    new Date().toISOString(),
    ctx.from.username ? `@${ctx.from.username}` : '',
    ctx.from.id,
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
  ]);
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
      `/analyze — анализ и оценка резюме (бесплатно)\n` +
      `/improve — улучшение формулировок (платно, если подключена оплата)\n` +
      `/tailor — адаптация под вакансию (платно, если подключена оплата)\n` +
      `/photo — деловое фото\n` +
      `/interview — тренировка интервью (бесплатно)\n` +
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
    await logAction(ctx, `📄 Загрузил резюме: ${doc.file_name} (${text.length} символов)`);
    await logEvent(ctx.state.dbUserId, 'upload_resume', { fileName: doc.file_name, length: text.length });
    amocrm.createLead(
      {
        name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || ctx.from.username || `TG User ${ctx.from.id}`,
        telegramUsername: ctx.from.username,
      },
      `Resume Bot — ${ctx.from.username ? '@' + ctx.from.username : ctx.from.first_name || ctx.from.id}`,
      `Загрузил резюме через Telegram-бота: ${doc.file_name}, ${text.length} символов`
    );
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
    await logAction(ctx, `🔍 Запросил /analyze — итоговая оценка: ${analysis.total_score}/100`);
    await saveResumeAnalysis(ctx.state.dbUserId, analysis);
    googleSheets.appendRow('ResumeAnalyses', [
      new Date().toISOString(),
      ctx.from.username ? `@${ctx.from.username}` : '',
      ctx.from.id,
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      analysis.total_score,
      analysis.top_recommendation,
    ]);
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

  if (payments.isEnabled()) {
    session.pendingAction = 'improve';
    await ctx.reply(
      `✍️ Улучшение резюме — платная функция (${payments.PRICES.improve.amountRub}₽). Оплати счёт ниже, и я сразу пришлю результат.`
    );
    return payments.sendInvoiceForAction(ctx, 'improve');
  }

  // Платежи не настроены — функция работает бесплатно (для теста/разработки)
  await ctx.reply('✍️ Улучшаю резюме...');
  try {
    const result = await improveResume(session.resumeText, session.resumeAnalysis);
    await logAction(ctx, `✍️ Запросил /improve${result._partial ? ' (частичный результат — резюме слишком длинное)' : ''}`);
    await logEvent(ctx.state.dbUserId, 'improve_resume', { partial: Boolean(result._partial) });
    await ctx.reply(formatImproveForTelegram(result));
    await sendLong(ctx, result.improved_resume);
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// /tailor использует текст вакансии сразу после команды, либо уже сохранённый ранее в сессии
bot.command('tailor', async (ctx) => {
  const session = getSession(ctx.chat.id);
  if (!session.resumeText) {
    return ctx.reply('Сначала пришли файл резюме (PDF/DOCX/TXT) 📄');
  }

  const inlineJobText = ctx.message.text.replace('/tailor', '').trim();
  const jobText = inlineJobText || session.jobDescription;

  if (!jobText) {
    return ctx.reply('Пришли текст вакансии вместе с командой, например:\n/tailor [текст вакансии]\n\nИли просто отправь текст вакансии следующим сообщением, а потом набери /tailor.');
  }

  session.jobDescription = jobText;

  if (payments.isEnabled()) {
    session.pendingAction = 'tailor';
    await ctx.reply(
      `🎯 Адаптация под вакансию — платная функция (${payments.PRICES.tailor.amountRub}₽). Оплати счёт ниже, и я сразу пришлю результат.`
    );
    return payments.sendInvoiceForAction(ctx, 'tailor');
  }

  // Платежи не настроены — функция работает бесплатно (для теста/разработки)
  await ctx.reply('🎯 Адаптирую резюме под вакансию...');
  try {
    const result = await tailorResume(session.resumeText, jobText);
    await logAction(ctx, `🎯 Запросил /tailor — соответствие: ${result.match_score ?? 'н/д'}/100`);
    await logEvent(ctx.state.dbUserId, 'tailor_resume', { matchScore: result.match_score, partial: Boolean(result._partial) });
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
    await logAction(ctx, `🎤 Начал /interview (${questions.length} вопросов)`);
    await logEvent(ctx.state.dbUserId, 'start_interview', { questionCount: questions.length });
    await ctx.reply(
      `Начинаем! Задам ${questions.length} вопросов. Отвечай текстом, после каждого ответа дам фидбек.\n\n` +
        `Вопрос 1/${questions.length}:\n${questions[0].text}`
    );
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// Telegram требует подтвердить готовность принять платёж в течение 10 секунд
bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error('Ошибка pre_checkout_query:', err.message);
  }
});

// Срабатывает сразу после успешной оплаты — запускаем ту функцию, за которую заплатили
bot.on('message', async (ctx, next) => {
  if (!ctx.message.successful_payment) return next();

  const session = getSession(ctx.chat.id);
  const payment = ctx.message.successful_payment;
  const action = payments.parseActionFromPayload(payment.invoice_payload);
  const amountRub = payment.total_amount / 100;

  await logAction(ctx, `💳 Оплатил "${action}" — ${amountRub}₽`);
  await savePayment(ctx.state.dbUserId, action, amountRub, payment.telegram_payment_charge_id);

  if (action === 'improve') {
    await ctx.reply('✅ Оплата прошла! Улучшаю резюме...');
    try {
      const result = await improveResume(session.resumeText, session.resumeAnalysis);
      await logEvent(ctx.state.dbUserId, 'improve_resume', { partial: Boolean(result._partial), paid: true });
      await ctx.reply(formatImproveForTelegram(result));
      await sendLong(ctx, result.improved_resume);
    } catch (err) {
      ctx.reply(`❌ Оплата прошла, но при обработке произошла ошибка: ${err.message}\nНапиши в поддержку, чтобы решить вопрос.`);
    }
  } else if (action === 'tailor') {
    await ctx.reply('✅ Оплата прошла! Адаптирую резюме под вакансию...');
    try {
      const result = await tailorResume(session.resumeText, session.jobDescription);
      await logEvent(ctx.state.dbUserId, 'tailor_resume', { matchScore: result.match_score, partial: Boolean(result._partial), paid: true });
      await ctx.reply(formatTailorForTelegram(result));
      await sendLong(ctx, result.tailored_resume);
    } catch (err) {
      ctx.reply(`❌ Оплата прошла, но при обработке произошла ошибка: ${err.message}\nНапиши в поддержку, чтобы решить вопрос.`);
    }
  }

  session.pendingAction = null;
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
      await logDialogue(
        ctx,
        `[Интервью, вопрос ${currentIndex + 1}] ${currentQuestion.text}\n\nОтвет: ${text}`,
        `Оценка: ${feedback.quick_score}/10. ${feedback.strength}`
      );
      await saveInterviewAnswer(ctx.state.dbUserId, currentQuestion.text, text, feedback);
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
