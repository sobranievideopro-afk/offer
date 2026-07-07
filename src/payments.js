/**
 * Платные функции через встроенный Telegram Payments API.
 *
 * НАСТРОЙКА (один раз):
 * 1. Напиши @BotFather в Telegram → /mypayments → выбери своего бота
 * 2. Подключи платёжного провайдера. Для России обычно доступна "ЮKassa" (YooKassa) —
 *    выбери её в списке, следуй инструкциям BotFather (там нужно будет подключить
 *    свой аккаунт ЮKassa/юрлицо для приёма платежей)
 * 3. BotFather выдаст "Payment provider token" — длинную строку
 * 4. В Railway Variables добавь:
 *    PAYMENT_PROVIDER_TOKEN = токен из BotFather
 *    PRICE_IMPROVE_RUB = 199   (цена за /improve в рублях, целое число)
 *    PRICE_TAILOR_RUB = 299    (цена за /tailor в рублях, целое число)
 *
 * ВАЖНО: Telegram передаёт сумму в минимальных единицах валюты (копейках для RUB),
 * поэтому в коде ниже цена умножается на 100 автоматически — тебе указывать
 * нужно именно рубли, не копейки.
 *
 * Если в твоём регионе/тарифе ЮKassa недоступна — можно выбрать любого другого
 * провайдера из списка BotFather (Тинькофф, CloudPayments и т.д.), логика кода
 * не изменится, меняется только сам провайдер и токен.
 */

const PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN;
const PRICE_IMPROVE_RUB = parseInt(process.env.PRICE_IMPROVE_RUB || '199', 10);
const PRICE_TAILOR_RUB = parseInt(process.env.PRICE_TAILOR_RUB || '299', 10);

const PRICES = {
  improve: { amountRub: PRICE_IMPROVE_RUB, title: 'Улучшение резюме', description: 'Профессиональная доработка формулировок в вашем резюме' },
  tailor: { amountRub: PRICE_TAILOR_RUB, title: 'Адаптация под вакансию', description: 'Адаптация резюме под конкретную вакансию с анализом соответствия' },
};

function isEnabled() {
  return Boolean(PROVIDER_TOKEN);
}

/**
 * Отправляет пользователю счёт на оплату конкретной платной функции.
 * payload используется, чтобы при успешной оплате понять, что именно оплатили.
 */
async function sendInvoiceForAction(ctx, action) {
  const config = PRICES[action];
  if (!config) throw new Error(`Неизвестное платное действие: ${action}`);

  await ctx.replyWithInvoice({
    title: config.title,
    description: config.description,
    payload: `${action}:${ctx.chat.id}:${Date.now()}`,
    provider_token: PROVIDER_TOKEN,
    currency: 'RUB',
    prices: [{ label: config.title, amount: config.amountRub * 100 }],
  });
}

/**
 * Разбирает payload успешного платежа и возвращает, какое действие было оплачено.
 */
function parseActionFromPayload(payload) {
  const [action] = payload.split(':');
  return action;
}

module.exports = { isEnabled, sendInvoiceForAction, parseActionFromPayload, PRICES };
