/**
 * Простое in-memory хранилище сессий по chatId.
 * ВАЖНО: при перезапуске бота все сессии теряются.
 * Для продакшена стоит заменить на Redis/Postgres.
 */
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      resumeText: null,
      resumeAnalysis: null,
      jobDescription: null,
      interview: null, // { questions, currentIndex, qaHistory }
    });
  }
  return sessions.get(chatId);
}

function resetSession(chatId) {
  sessions.delete(chatId);
}

module.exports = { getSession, resetSession };
