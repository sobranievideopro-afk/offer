const { askClaudeJSON } = require('../claudeClient');

const SYSTEM_PROMPT = `Ты — эксперт по подбору персонала с 15-летним опытом, специализируешься на оценке резюме для российского и международного рынка труда.

ЗАДАЧА:
Проведи детальный анализ резюме по 5 критериям, каждый оцени от 0 до 20 (итого максимум 100):

1. Структура и оформление (0-20) — логичность разделов, читаемость, длина
2. Конкретность достижений (0-20) — есть ли цифры, метрики, результаты, или только обязанности
3. ATS-совместимость (0-20) — стандартные заголовки разделов, отсутствие таблиц/графики, ключевые слова
4. Релевантность опыта (0-20) — насколько опыт соответствует заявленной цели/сфере
5. Язык и подача (0-20) — активные глаголы, отсутствие клише и воды, профессиональный тон

Не завышай и не занижай искусственно. Средний адекватный кандидат должен получать 50-65, отличное резюме — 85+, никогда не ставь 100 без исключительных оснований.

Ответь СТРОГО в JSON, без преамбулы и markdown-разметки:
{
  "total_score": 0-100,
  "criteria": [
    {"name": "Структура и оформление", "score": 0-20, "comment": "1-2 предложения"},
    {"name": "Конкретность достижений", "score": 0-20, "comment": "..."},
    {"name": "ATS-совместимость", "score": 0-20, "comment": "..."},
    {"name": "Релевантность опыта", "score": 0-20, "comment": "..."},
    {"name": "Язык и подача", "score": 0-20, "comment": "..."}
  ],
  "strengths": ["конкретный пункт 1", "конкретный пункт 2", "конкретный пункт 3"],
  "weaknesses": ["конкретный пункт 1", "конкретный пункт 2", "конкретный пункт 3"],
  "top_recommendation": "одна главная вещь, которую стоит исправить в первую очередь",
  "ats_red_flags": ["если есть проблемы для ATS-сканеров, перечисли; если нет — пустой массив"]
}

strengths/weaknesses должны ссылаться на КОНКРЕТНЫЕ формулировки из резюме, не на абстрактные советы.`;

async function analyzeResume(resumeText, targetRole = null) {
  const userMessage = `Текст резюме кандидата:\n${resumeText}\n\n${
    targetRole ? `Целевая вакансия/сфера: ${targetRole}` : ''
  }`;
  return askClaudeJSON(SYSTEM_PROMPT, userMessage, 2000);
}

function formatAnalysisForTelegram(analysis) {
  const scoreEmoji = analysis.total_score >= 80 ? '🟢' : analysis.total_score >= 55 ? '🟡' : '🔴';

  let msg = `${scoreEmoji} *Оценка резюме: ${analysis.total_score}/100*\n\n`;
  msg += `*По критериям:*\n`;
  for (const c of analysis.criteria) {
    msg += `• ${c.name}: ${c.score}/20 — ${c.comment}\n`;
  }

  msg += `\n✅ *Сильные стороны:*\n`;
  for (const s of analysis.strengths) msg += `• ${s}\n`;

  msg += `\n⚠️ *Слабые стороны:*\n`;
  for (const w of analysis.weaknesses) msg += `• ${w}\n`;

  msg += `\n💡 *Главная рекомендация:*\n${analysis.top_recommendation}\n`;

  if (analysis.ats_red_flags && analysis.ats_red_flags.length > 0) {
    msg += `\n🚩 *Проблемы для ATS-систем:*\n`;
    for (const flag of analysis.ats_red_flags) msg += `• ${flag}\n`;
  }

  return msg;
}

module.exports = { analyzeResume, formatAnalysisForTelegram };
