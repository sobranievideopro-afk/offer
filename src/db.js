const { Pool } = require('pg');

// Railway автоматически создаёт переменную DATABASE_URL при подключении плагина Postgres
const connectionString = process.env.DATABASE_URL;

let pool = null;

function getPool() {
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

/**
 * Создаёт таблицы при первом запуске, если их ещё нет.
 * Безопасно вызывать при каждом старте бота — CREATE TABLE IF NOT EXISTS.
 */
async function initSchema() {
  const p = getPool();
  if (!p) {
    console.log('⚠️ DATABASE_URL не задан — работаю без базы данных (только in-memory сессии)');
    return;
  }

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      action TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS resume_analyses (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      total_score INT,
      analysis JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS interview_answers (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      question TEXT,
      answer TEXT,
      quick_score INT,
      feedback JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      action TEXT NOT NULL,
      amount_rub INT NOT NULL,
      telegram_payment_charge_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS web_leads (
      id BIGSERIAL PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      total_score INT,
      analysis JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log('✅ Схема базы данных проверена/создана');
}

/**
 * Создаёт пользователя, если его ещё нет, и возвращает его внутренний id.
 * Если базы нет (DATABASE_URL не задан) — возвращает null, и все остальные
 * функции ниже просто ничего не делают.
 */
async function upsertUser(telegramUser) {
  const p = getPool();
  if (!p) return null;

  const { id: telegramId, username, first_name, last_name } = telegramUser;

  const result = await p.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id)
     DO UPDATE SET username = $2, first_name = $3, last_name = $4
     RETURNING id`,
    [telegramId, username || null, first_name || null, last_name || null]
  );

  return result.rows[0].id;
}

async function logEvent(userId, action, details = {}) {
  const p = getPool();
  if (!p || !userId) return;
  await p.query(`INSERT INTO events (user_id, action, details) VALUES ($1, $2, $3)`, [
    userId,
    action,
    JSON.stringify(details),
  ]);
}

async function saveResumeAnalysis(userId, analysis) {
  const p = getPool();
  if (!p || !userId) return;
  await p.query(
    `INSERT INTO resume_analyses (user_id, total_score, analysis) VALUES ($1, $2, $3)`,
    [userId, analysis.total_score, JSON.stringify(analysis)]
  );
}

async function saveInterviewAnswer(userId, question, answer, feedback) {
  const p = getPool();
  if (!p || !userId) return;
  await p.query(
    `INSERT INTO interview_answers (user_id, question, answer, quick_score, feedback)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, question, answer, feedback.quick_score, JSON.stringify(feedback)]
  );
}

async function savePayment(userId, action, amountRub, telegramChargeId) {
  const p = getPool();
  if (!p || !userId) return;
  await p.query(
    `INSERT INTO payments (user_id, action, amount_rub, telegram_payment_charge_id) VALUES ($1, $2, $3, $4)`,
    [userId, action, amountRub, telegramChargeId]
  );
}

async function saveWebLead(lead) {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `INSERT INTO web_leads (name, email, phone, source, total_score, analysis)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [lead.name || null, lead.email || null, lead.phone || null, lead.source || 'website', lead.totalScore, JSON.stringify(lead.analysis)]
  );
  return result.rows[0].id;
}

module.exports = {
  initSchema,
  upsertUser,
  logEvent,
  saveResumeAnalysis,
  saveInterviewAnswer,
  savePayment,
  saveWebLead,
  isEnabled: () => Boolean(connectionString),
};
