/**
 * Экспорт данных в Google Таблицу через сервисный аккаунт Google.
 *
 * НАСТРОЙКА (один раз):
 * 1. Зайди на https://console.cloud.google.com → создай новый проект (или используй существующий)
 * 2. В "APIs & Services" → "Library" включи "Google Sheets API"
 * 3. В "APIs & Services" → "Credentials" → "Create Credentials" → "Service Account"
 * 4. Создай сервисный аккаунт, скачай JSON-ключ (кнопка "Keys" → "Add Key" → "JSON")
 * 5. Открой скачанный JSON — там есть "client_email" и "private_key"
 * 6. Создай Google Таблицу вручную, скопируй её ID из URL:
 *    https://docs.google.com/spreadsheets/d/ЭТОТ_ID/edit
 * 7. В самой таблице нажми "Настройки доступа" → "Предоставить доступ" →
 *    вставь client_email из JSON-ключа (это как обычный email) → дай права "Редактор"
 * 8. В Railway Variables добавь:
 *    GOOGLE_SERVICE_ACCOUNT_EMAIL = client_email из JSON
 *    GOOGLE_PRIVATE_KEY = private_key из JSON (см. примечание про переносы строк ниже)
 *    GOOGLE_SHEET_ID = ID таблицы из шага 6
 *
 * ВАЖНО про GOOGLE_PRIVATE_KEY: в JSON-файле ключ содержит символы \n (перенос строки).
 * При вставке в Railway Variables вставляй ключ ЦЕЛИКОМ КАК ЕСТЬ, включая \n —
 * код ниже сам заменит их на настоящие переносы строк.
 */
const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : null;

let sheetsClient = null;

function isEnabled() {
  return Boolean(SHEET_ID && SERVICE_EMAIL && PRIVATE_KEY);
}

async function getClient() {
  if (!isEnabled()) return null;
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.JWT(SERVICE_EMAIL, null, PRIVATE_KEY, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Добавляет строку в конец указанного листа. Если листа с таким именем нет —
 * Google Sheets API вернёт ошибку; лист нужно создать заранее вручную в таблице
 * (вкладки внизу таблицы, например "Users", "ResumeAnalyses", "InterviewAnswers").
 */
async function appendRow(sheetName, rowValues) {
  const client = await getClient();
  if (!client) return; // интеграция не настроена — тихо пропускаем

  try {
    await client.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  } catch (err) {
    console.error(`Ошибка записи в Google Sheets (${sheetName}):`, err.message);
  }
}

module.exports = { appendRow, isEnabled };
