const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Отправляет один запрос к Claude API и возвращает текст ответа.
 * @param {string} systemPrompt - системная инструкция (роль/задача)
 * @param {string} userMessage - конкретные данные для обработки
 * @param {number} maxTokens
 * @returns {Promise<string>}
 */
async function askClaude(systemPrompt, userMessage, maxTokens = 2000) {
  if (!API_KEY) {
    throw new Error('ANTHROPIC_API_KEY не задан в .env');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

/**
 * Вызывает Claude и парсит ответ как JSON.
 * Убирает возможные markdown-обёртки ```json ... ```
 */
async function askClaudeJSON(systemPrompt, userMessage, maxTokens = 2000) {
  const raw = await askClaude(systemPrompt, userMessage, maxTokens);
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const parseError = new Error(`Не удалось распарсить JSON от Claude: ${err.message}`);
    parseError.rawResponse = cleaned;
    throw parseError;
  }
}

/**
 * Аварийное восстановление: если JSON от Claude обрезался на середине
 * (не хватило max_tokens), пытаемся вытащить хотя бы значение одного
 * ключевого поля (например improved_resume) из сырого текста регуляркой,
 * вместо того чтобы полностью падать с ошибкой.
 */
function extractStringField(raw, fieldName) {
  const marker = `"${fieldName}"`;
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) return null;

  const colonIndex = raw.indexOf(':', markerIndex + marker.length);
  if (colonIndex === -1) return null;

  let i = colonIndex + 1;
  while (raw[i] === ' ' || raw[i] === '\n') i += 1;
  if (raw[i] !== '"') return null;
  i += 1;

  let value = '';
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      value += JSON.parse(`"${ch}${raw[i + 1]}"`); // корректно разэкранируем \n, \", \\ и т.п.
      i += 2;
      continue;
    }
    if (ch === '"') break; // конец строки, всё воспроизвелось нормально
    value += ch;
    i += 1;
  }
  return value;
}

module.exports = { askClaude, askClaudeJSON, extractStringField };
