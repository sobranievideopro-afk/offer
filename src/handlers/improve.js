const { askClaudeJSON, extractStringField } = require('../claudeClient');

const IMPROVE_SYSTEM_PROMPT = `Ты — профессиональный резюме-райтер. Твоя задача — переписать резюме кандидата, сохранив ВСЕ факты без выдумывания новой информации.

ПРАВИЛА:
- НИКОГДА не добавляй навыки, проекты, цифры или достижения, которых нет в оригинале
- Если в резюме нет цифр — не выдумывай их, а перепиши буллет так, чтобы была видна суть результата без метрики, и отметь в комментарии, что кандидату стоит добавить реальную цифру
- Слабые формулировки заменяй на глаголы действия (организовал, внедрил, увеличил, а не "отвечал за")
- Убирай клише ("коммуникабельный", "стрессоустойчивый" без подтверждения)
- Сохраняй структуру разделов, если она логична

Ответь СТРОГО в JSON:
{
  "improved_resume": "полный текст улучшенного резюме",
  "changes_summary": [
    {"before": "исходная фраза", "after": "новая фраза", "reason": "почему так лучше, максимум 10 слов"}
  ],
  "missing_data_flags": ["места, где кандидату стоит самому вписать реальную цифру/факт"]
}

ВАЖНО: changes_summary — максимум 8 самых значимых примеров изменений, не больше. Reason — максимум 10 слов. Приоритет — полностью и без сокращений воспроизвести improved_resume, на список изменений не трать лишние токены.`;

const TAILOR_SYSTEM_PROMPT = `Ты — консультант по подбору персонала, подгоняешь резюме кандидата под конкретную вакансию.

ЗАДАЧА:
1. Извлеки из вакансии ключевые требования и слова (hard skills, soft skills, отраслевые термины)
2. Определи, какие из них уже есть в резюме, а какие отсутствуют
3. Переформулируй релевантный опыт кандидата так, чтобы совпадения с вакансией были явными (используя только реальный опыт кандидата, без фабрикации)
4. Предложи, что вынести наверх резюме, а что убрать/сократить

ПРАВИЛА:
- Не приписывай кандидату навыки, которых нет в его резюме
- Если требование вакансии полностью отсутствует в опыте — честно укажи это как gap

Ответь СТРОГО в JSON:
{
  "match_score": 0-100,
  "matched_keywords": ["...", "..."],
  "missing_keywords": ["...", "..."],
  "tailored_resume": "полный текст адаптированного резюме",
  "reorder_suggestions": "что переместить выше/ниже и почему, максимум 2 предложения",
  "honest_gaps": ["требования вакансии, которым кандидат явно не соответствует"]
}

ВАЖНО: приоритет — полностью и без сокращений воспроизвести tailored_resume. Остальные поля максимально сжаты, чтобы не тратить на них токены в ущерб полному тексту резюме.`;

async function improveResume(resumeText, previousAnalysis = null) {
  const userMessage = `Оригинальное резюме:\n${resumeText}\n\n${
    previousAnalysis ? `Предыдущий анализ:\n${JSON.stringify(previousAnalysis)}` : ''
  }`;
  try {
    return await askClaudeJSON(IMPROVE_SYSTEM_PROMPT, userMessage, 8192);
  } catch (err) {
    if (err.rawResponse) {
      const recovered = extractStringField(err.rawResponse, 'improved_resume');
      if (recovered) {
        return {
          improved_resume: recovered,
          changes_summary: [],
          missing_data_flags: [],
          _partial: true, // сигнал боту, что список изменений не пришёл
        };
      }
    }
    throw err;
  }
}

async function tailorResume(resumeText, jobDescription) {
  const userMessage = `Резюме кандидата:\n${resumeText}\n\nОписание вакансии:\n${jobDescription}`;
  try {
    return await askClaudeJSON(TAILOR_SYSTEM_PROMPT, userMessage, 8192);
  } catch (err) {
    if (err.rawResponse) {
      const recovered = extractStringField(err.rawResponse, 'tailored_resume');
      if (recovered) {
        return {
          match_score: null,
          matched_keywords: [],
          missing_keywords: [],
          tailored_resume: recovered,
          reorder_suggestions: '',
          honest_gaps: [],
          _partial: true,
        };
      }
    }
    throw err;
  }
}

function formatImproveForTelegram(result) {
  if (result._partial) {
    return (
      `✍️ *Улучшенное резюме готово*\n\n` +
      `⚠️ Резюме оказалось очень длинным, поэтому список изменений не поместился — но полный улучшенный текст ниже.\n\n` +
      `_Полный текст улучшенного резюме отправлю следующим сообщением._`
    );
  }
  let msg = `✍️ *Улучшенное резюме готово*\n\n`;
  msg += `*Ключевые изменения:*\n`;
  for (const c of result.changes_summary.slice(0, 6)) {
    msg += `\n➖ было: ${c.before}\n➕ стало: ${c.after}\n_${c.reason}_\n`;
  }
  if (result.missing_data_flags && result.missing_data_flags.length > 0) {
    msg += `\n📝 *Впишите сами (нет данных в оригинале):*\n`;
    for (const f of result.missing_data_flags) msg += `• ${f}\n`;
  }
  msg += `\n_Полный текст улучшенного резюме отправлю следующим сообщением._`;
  return msg;
}

function formatTailorForTelegram(result) {
  if (result._partial) {
    return (
      `🎯 *Адаптация под вакансию готова*\n\n` +
      `⚠️ Резюме оказалось очень длинным, поэтому детальный разбор совпадений не поместился — но полный адаптированный текст ниже.\n\n` +
      `_Адаптированный текст резюме отправлю следующим сообщением._`
    );
  }
  let msg = `🎯 *Соответствие вакансии: ${result.match_score}/100*\n\n`;
  msg += `*Совпадающие ключевые слова:*\n${result.matched_keywords.join(', ')}\n\n`;
  msg += `*Отсутствующие ключевые слова:*\n${result.missing_keywords.join(', ')}\n\n`;
  if (result.honest_gaps && result.honest_gaps.length > 0) {
    msg += `⚠️ *Честные пробелы (нет в опыте):*\n`;
    for (const g of result.honest_gaps) msg += `• ${g}\n`;
    msg += `\n`;
  }
  msg += `💡 *Что переставить:* ${result.reorder_suggestions}\n\n`;
  msg += `_Адаптированный текст резюме отправлю следующим сообщением._`;
  return msg;
}

module.exports = { improveResume, tailorResume, formatImproveForTelegram, formatTailorForTelegram };
