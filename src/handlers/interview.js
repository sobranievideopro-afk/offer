const { askClaudeJSON, askClaude } = require('../claudeClient');

const QUESTIONS_SYSTEM_PROMPT = `Ты — опытный HR-интервьюер, готовишь кандидата к реальному собеседованию.

ЗАДАЧА:
Сгенерируй 6 вопросов для тренировочного интервью. Обязательно включи:
- 2 поведенческих вопроса (STAR), привязанных к КОНКРЕТНЫМ пунктам из резюме кандидата (называй проект/компанию из резюме)
- 2 технических/профессиональных вопроса на основе требований вакансии
- 1 вопрос про несоответствие или пробел (если увидишь gap в датах, смену сферы, отсутствие требуемого навыка — спроси об этом; если ничего подозрительного нет, задай вопрос о причине смены работы)
- 1 стандартный, но важный вопрос ("почему хотите работать у нас", "где видите себя через 3 года" и т.п.)

Ответь СТРОГО в JSON:
{
  "questions": [
    {"id": 1, "type": "behavioral", "text": "...", "what_it_tests": "..."},
    {"id": 2, "type": "technical", "text": "...", "what_it_tests": "..."}
  ]
}

Вопросы должны звучать естественно, как их задал бы живой интервьюер, не шаблонно.`;

const FEEDBACK_SYSTEM_PROMPT = `Ты — опытный интервьюер, даёшь конструктивный фидбек кандидату сразу после его ответа на тренировочном интервью.

Дай фидбек по структуре:
1. Что было сильным в ответе (1 пункт, конкретно)
2. Что можно улучшить (1-2 пункта, конкретно)
3. Если ответ на поведенческий вопрос — оцени, есть ли структура STAR (ситуация-задача-действие-результат), укажи какой элемент пропущен
4. Короткий пример, как можно было усилить фразу (1 предложение, не переписывай весь ответ)

Тон: поддерживающий, но честный. Не хвали, если хвалить не за что.
Объём: максимум 4-5 предложений, это чат в Telegram, не эссе.

Ответь СТРОГО в JSON:
{
  "strength": "...",
  "improvement": ["...", "..."],
  "star_check": "...",
  "example_phrase": "...",
  "quick_score": 0-10
}`;

const FINAL_REPORT_SYSTEM_PROMPT = `Ты — карьерный коуч, подводишь итоги тренировочного интервью.

Составь итоговый отчёт:
1. Общая оценка готовности к интервью: 0-100
2. Топ-3 сильные стороны в манере отвечать
3. Топ-3 зоны роста (конкретно, с примерами из его ответов)
4. Паттерн, который повторяется в ответах
5. Один главный совет перед реальным собеседованием

ФОРМАТ: живой текст для Telegram (не JSON), с эмодзи-разделами, короткими абзацами. Максимум 200 слов.`;

async function generateQuestions(resumeText, jobDescription) {
  const userMessage = `Резюме кандидата:\n${resumeText}\n\nОписание вакансии:\n${jobDescription}`;
  const result = await askClaudeJSON(QUESTIONS_SYSTEM_PROMPT, userMessage, 1500);
  return result.questions;
}

async function getFeedback(question, questionType, userAnswer, jobDescriptionShort) {
  const userMessage = `Вопрос: ${question}\nТип вопроса: ${questionType}\nОтвет кандидата: ${userAnswer}\nКонтекст вакансии: ${jobDescriptionShort}`;
  return askClaudeJSON(FEEDBACK_SYSTEM_PROMPT, userMessage, 800);
}

async function getFinalReport(qaHistory) {
  const userMessage = `Вопросы и ответы кандидата с оценками:\n${JSON.stringify(qaHistory, null, 2)}`;
  return askClaude(FINAL_REPORT_SYSTEM_PROMPT, userMessage, 1000);
}

function formatFeedbackForTelegram(feedback) {
  let msg = `📊 Оценка ответа: ${feedback.quick_score}/10\n\n`;
  msg += `✅ ${feedback.strength}\n\n`;
  msg += `⚠️ Можно улучшить:\n`;
  for (const i of feedback.improvement) msg += `• ${i}\n`;
  if (feedback.star_check) msg += `\n🔍 STAR: ${feedback.star_check}\n`;
  if (feedback.example_phrase) msg += `\n💬 Пример усиления: "${feedback.example_phrase}"\n`;
  return msg;
}

module.exports = { generateQuestions, getFeedback, getFinalReport, formatFeedbackForTelegram };
