/**
 * Создание лидов/контактов в amoCRM через REST API v4.
 *
 * НАСТРОЙКА (один раз):
 * 1. Зайди в свой аккаунт amoCRM → Настройки → Интеграции → "Создать интеграцию"
 *    (или используй готовый способ ниже — через долгоживущий токен, это проще для одного бота)
 * 2. Самый простой путь для одного бота (без сложного OAuth):
 *    Настройки → Интеграции → своя интеграция → вкладка "Ключи и доступы" →
 *    сгенерируй "Долгосрочный токен" (Long-lived token) — так делает amoCRM для приватных интеграций
 * 3. Скопируй:
 *    - домен твоего амо, например: mycompany.amocrm.ru
 *    - сам токен (длинная строка)
 * 4. В Railway Variables добавь:
 *    AMOCRM_BASE_URL = https://mycompany.amocrm.ru
 *    AMOCRM_ACCESS_TOKEN = твой_долгосрочный_токен
 *
 * Если такого пункта меню нет в твоём тарифе amoCRM — используется OAuth-интеграция,
 * это сложнее (нужен redirect_uri и обмен кода на токен); в таком случае лучше
 * подключить готовый amoCRM-коннектор через сервисы вроде Albato/Make/Zapier,
 * это быстрее, чем писать полный OAuth-флоу вручную.
 */

const BASE_URL = process.env.AMOCRM_BASE_URL; // например https://mycompany.amocrm.ru
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN;

function isEnabled() {
  return Boolean(BASE_URL && ACCESS_TOKEN);
}

async function amoFetch(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`amoCRM API error ${response.status}: ${errText}`);
  }

  // amoCRM иногда возвращает пустое тело при успехе (204)
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Создаёт контакт и лид в amoCRM.
 * contactInfo: { name, email, phone, telegramUsername } — любые поля опциональны,
 * но нужно хотя бы одно, чтобы контакт был осмысленным.
 */
async function createLead(contactInfo, leadName, note) {
  if (!isEnabled()) return null;

  try {
    const contactName = contactInfo.name || contactInfo.email || contactInfo.phone || 'Новый лид';

    const customFields = [];
    if (contactInfo.email) {
      customFields.push({
        field_code: 'EMAIL',
        values: [{ value: contactInfo.email, enum_code: 'WORK' }],
      });
    }
    if (contactInfo.phone) {
      customFields.push({
        field_code: 'PHONE',
        values: [{ value: contactInfo.phone, enum_code: 'WORK' }],
      });
    }

    // 1. Создаём контакт
    const contactResult = await amoFetch('/api/v4/contacts', {
      method: 'POST',
      body: JSON.stringify([
        {
          name: contactName,
          custom_fields_values: customFields.length > 0 ? customFields : undefined,
        },
      ]),
    });
    const contactId = contactResult._embedded.contacts[0].id;

    // 2. Создаём лид, привязанный к контакту
    const leadResult = await amoFetch('/api/v4/leads', {
      method: 'POST',
      body: JSON.stringify([
        {
          name: leadName,
          _embedded: { contacts: [{ id: contactId }] },
        },
      ]),
    });
    const leadId = leadResult._embedded.leads[0].id;

    // 3. Добавляем примечание с деталями
    if (note) {
      await amoFetch(`/api/v4/leads/${leadId}/notes`, {
        method: 'POST',
        body: JSON.stringify([
          {
            note_type: 'common',
            params: { text: note },
          },
        ]),
      });
    }

    return { contactId, leadId };
  } catch (err) {
    console.error('Ошибка создания лида в amoCRM:', err.message);
    return null;
  }
}

module.exports = { createLead, isEnabled };
