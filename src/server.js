/**
 * HTTP API для встраиваемого виджета на сайте (Tilda и любой другой).
 * Работает в том же Node-процессе, что и Telegram-бот, на порту из Railway (process.env.PORT).
 *
 * Основной эндпоинт: POST /api/analyze
 * Принимает multipart/form-data:
 *   - resume: файл (.pdf, .docx, .txt)
 *   - name, email, phone: контактные данные (email или phone обязателен — это и есть лид)
 *   - targetRole: (опционально) целевая должность/сфера
 *
 * Возвращает JSON с оценкой резюме, попутно сохраняя лида в БД, Google Sheets и amoCRM.
 */
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { extractText } = require('./fileParser');
const { analyzeResume, formatAnalysisForTelegram } = require('./handlers/analyze');
const { saveWebLead } = require('./db');
const googleSheets = require('./integrations/googleSheets');
const amocrm = require('./integrations/amocrm');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function createServer() {
  const app = express();

  // CORS: по умолчанию разрешаем все источники (проще для старта).
  // Для продакшена лучше ограничить конкретным доменом Tilda через переменную CORS_ORIGIN.
  const allowedOrigin = process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: allowedOrigin }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
      const { name, email, phone, targetRole } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'Файл резюме не найден в запросе (поле "resume")' });
      }
      if (!email && !phone) {
        return res.status(400).json({ error: 'Укажите email или телефон' });
      }

      const resumeText = await extractText(req.file.buffer, req.file.originalname);
      if (resumeText.length < 50) {
        return res.status(400).json({ error: 'Не удалось извлечь текст из файла. Убедитесь, что это текстовый PDF/DOCX, а не скан.' });
      }

      const analysis = await analyzeResume(resumeText, targetRole);

      // Сохраняем лида — параллельно во все подключённые системы, не блокируя ответ пользователю
      saveWebLead({ name, email, phone, source: 'tilda_website', totalScore: analysis.total_score, analysis });
      googleSheets.appendRow('WebLeads', [
        new Date().toISOString(),
        name || '',
        email || '',
        phone || '',
        analysis.total_score,
        analysis.top_recommendation,
      ]);
      amocrm.createLead(
        { name, email, phone },
        `Сайт: анализ резюме — ${name || email || phone}`,
        `Оценка резюме: ${analysis.total_score}/100. Главная рекомендация: ${analysis.top_recommendation}`
      );

      res.json({ success: true, analysis });
    } catch (err) {
      console.error('Ошибка /api/analyze:', err.message);
      res.status(500).json({ error: 'Не удалось проанализировать резюме. Попробуйте ещё раз.' });
    }
  });

  return app;
}

module.exports = { createServer };
