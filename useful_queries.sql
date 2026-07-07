-- Полезные запросы для просмотра данных бота.
-- Выполнять через вкладку "Data" в Railway (там есть встроенный SQL-редактор для Postgres),
-- либо через любой Postgres-клиент, подключившись по DATABASE_URL.

-- Все пользователи и когда пришли
SELECT id, telegram_id, username, first_name, last_name, created_at
FROM users
ORDER BY created_at DESC;

-- Сколько всего уникальных пользователей
SELECT COUNT(*) FROM users;

-- Лента всех событий с юзернеймом (аналог общего лога)
SELECT u.username, u.first_name, e.action, e.details, e.created_at
FROM events e
JOIN users u ON u.id = e.user_id
ORDER BY e.created_at DESC
LIMIT 100;

-- Средний score по всем анализам резюме
SELECT AVG(total_score), COUNT(*) FROM resume_analyses;

-- Все анализы конкретного пользователя (по username)
SELECT ra.total_score, ra.analysis, ra.created_at
FROM resume_analyses ra
JOIN users u ON u.id = ra.user_id
WHERE u.username = 'ivan_petrov'
ORDER BY ra.created_at DESC;

-- Все ответы на интервью с оценками (для контроля качества фидбека)
SELECT u.username, ia.question, ia.answer, ia.quick_score, ia.created_at
FROM interview_answers ia
JOIN users u ON u.id = ia.user_id
ORDER BY ia.created_at DESC
LIMIT 50;

-- Самые активные пользователи (по числу событий)
SELECT u.username, u.first_name, COUNT(*) as actions_count
FROM events e
JOIN users u ON u.id = e.user_id
GROUP BY u.id, u.username, u.first_name
ORDER BY actions_count DESC
LIMIT 20;

-- Воронка: сколько человек дошло до каждого шага
SELECT action, COUNT(DISTINCT user_id) as unique_users
FROM events
GROUP BY action
ORDER BY unique_users DESC;
