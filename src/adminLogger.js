/**
 * Пересылает действия пользователей в приватный админский чат/канал,
 * чтобы владелец бота видел, кто и что делает, без доступа к серверу.
 *
 * Как настроить:
 * 1. Создай приватную группу или канал в Telegram
 * 2. Добавь туда своего бота (в канал — как администратора)
 * 3. Напиши в этот чат любое сообщение
 * 4. Открой в браузере: https://api.telegram.org/bot<ТВОЙ_BOT_TOKEN>/getUpdates
 * 5. Найди в ответе "chat":{"id": -1001234567890, ...} — это и есть ADMIN_CHAT_ID
 * 6. Вставь это значение в переменную ADMIN_CHAT_ID в Railway/.env
 */

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

function userLabel(ctx) {
  const from = ctx.from || {};
  const username = from.username ? `@${from.username}` : '(без юзернейма)';
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
  return `${username} ${fullName ? `(${fullName})` : ''} — ID: ${from.id}`;
}

async function logAction(ctx, actionText) {
  if (!ADMIN_CHAT_ID) return; // логирование не настроено — тихо пропускаем

  const message = `👤 ${userLabel(ctx)}\n${actionText}`;

  try {
    await ctx.telegram.sendMessage(ADMIN_CHAT_ID, message);
  } catch (err) {
    console.error('Не удалось отправить лог в админский чат:', err.message);
  }
}

/**
 * Логирует полный диалог: и сообщение пользователя, и ответ бота.
 * Используй, когда важно видеть не только факт действия, но и содержание.
 */
async function logDialogue(ctx, userMessage, botResponsePreview) {
  if (!ADMIN_CHAT_ID) return;

  const truncatedUser = userMessage.length > 500 ? userMessage.slice(0, 500) + '…' : userMessage;
  const truncatedBot = botResponsePreview.length > 500 ? botResponsePreview.slice(0, 500) + '…' : botResponsePreview;

  const message =
    `👤 ${userLabel(ctx)}\n\n` +
    `💬 Сообщение:\n${truncatedUser}\n\n` +
    `🤖 Ответ бота:\n${truncatedBot}`;

  try {
    await ctx.telegram.sendMessage(ADMIN_CHAT_ID, message);
  } catch (err) {
    console.error('Не удалось отправить лог в админский чат:', err.message);
  }
}

module.exports = { logAction, logDialogue };
