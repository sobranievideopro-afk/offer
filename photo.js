/**
 * Генерация делового фото требует ОТДЕЛЬНОГО image-API (Claude текст не генерирует изображения).
 * Варианты подключения: OpenAI (gpt-image-1), Stability AI, Replicate (flux/face-swap модели) и т.п.
 *
 * Эта функция строит промпт через Claude (текстовая часть),
 * а сам вызов image-API нужно подставить в generateImage() ниже —
 * в зависимости от того, какой сервис вы выберете.
 */
const { askClaudeJSON } = require('../claudeClient');

const PROMPT_BUILDER_SYSTEM = `Ты формируешь промпт для генерации профессионального делового портрета.

ЗАДАЧА:
Составь детальный промпт для image-генерации делового headshot:
- Нейтральный однотонный фон (серый/синий градиент)
- Деловая одежда, соответствующая стилю
- Естественное освещение студийного типа
- Уверенная, дружелюбная поза и выражение лица
- Портретный кадр (голова и плечи)

Ответь СТРОГО в JSON:
{
  "image_prompt": "детальный промпт на английском для image-модели",
  "negative_prompt": "что исключить: искажения лица, лишние объекты, неестественные цвета"
}`;

async function buildImagePrompt(userDescription, style) {
  const userMessage = `Описание пользователя: ${userDescription}\nВыбранный стиль: ${style}`;
  return askClaudeJSON(PROMPT_BUILDER_SYSTEM, userMessage, 500);
}

/**
 * ЗАГЛУШКА: сюда нужно подставить реальный вызов image-API.
 * Например для OpenAI Images API:
 *
 * const resp = await fetch('https://api.openai.com/v1/images/generations', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${process.env.IMAGE_API_KEY}`, 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ model: 'gpt-image-1', prompt: imagePrompt, size: '1024x1024' })
 * });
 */
async function generateImage(imagePrompt) {
  if (!process.env.IMAGE_API_KEY) {
    return null; // сигнал боту показать заглушку-сообщение
  }
  throw new Error('generateImage() не реализован — подставьте вызов вашего image-API здесь.');
}

module.exports = { buildImagePrompt, generateImage };
