# Размещение собственного backend TengeFlow

Backend — отдельное Python-приложение на Flask с SQLAlchemy и миграциями Alembic. Локальный запуск описан в [LOCAL_BACKEND.md](LOCAL_BACKEND.md). Эта инструкция предназначена для публикации: внешний backend, база и SMTP ещё не развёрнуты.

## 1. Подготовить серверные сервисы

Нужны Python-хостинг, постоянная PostgreSQL-база, Redis для общих лимитов запросов и SMTP для подтверждения email и восстановления пароля. Frontend остаётся статической сборкой на Vercel. Локальный файл SQLite не переносится автоматически на сервер.

В настройках хостинга задайте переменные backend. Значения ниже — примеры; замените домены и секреты своими:

```dotenv
APP_ENV=production
JWT_SECRET_KEY=replace-with-a-long-random-secret
DATABASE_URL=postgresql+psycopg://user:password@db-host:5432/tengeflow
FRONTEND_URL=https://your-project.vercel.app
CORS_ORIGINS=https://your-project.vercel.app
RATELIMIT_STORAGE_URI=rediss://default:password@redis-host:6379/0
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_STARTTLS=1
SMTP_SSL=0
MAIL_FROM=TengeFlow <hello@your-domain.example>
TRUSTED_PROXY_HOPS=0
```

`JWT_SECRET_KEY` должен быть случайным и содержать не меньше 32 символов. Его можно создать локально командой `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'` и сохранить в секретах хостинга. Ключ подписи, пароль базы и данные SMTP не попадают в `REACT_APP_*`, Git или frontend.

`FRONTEND_URL` определяет адреса ссылок в письмах. `CORS_ORIGINS` — список точных разрешённых HTTPS origin через запятую, без путей и `*`; основной адрес frontend должен входить в этот список. Добавляйте preview-домены только если их действительно используете. `DATABASE_URL` принимает также схему `postgresql://` и нормализует её к драйверу psycopg.

Для SMTP с TLS на порту 465 используйте `SMTP_SSL=1` и `SMTP_STARTTLS=0`. Настройки домена отправителя зависят от почтового провайдера. В production приложение требует SMTP, Redis, явный URL базы и HTTPS origins; локальный inbox в этом режиме недоступен.

`TRUSTED_PROXY_HOPS` оставьте равным `0`, пока не определили количество доверенных прокси перед приложением. Настраивайте его по фактической схеме своего хостинга. Не доверяйте произвольным заголовкам `X-Forwarded-*` от клиента.

## 2. Зависимости, миграции и процесс

### Быстрый запуск Docker на хосте

Скопируйте `backend/.env.production.example` в `backend/.env.production`, заполните PostgreSQL, Redis, SMTP и сгенерируйте `JWT_SECRET_KEY`. Затем из каталога `backend/` выполните:

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

Контейнер слушает порт `1488` на loopback-интерфейсе хоста, миграции базы выполняются при старте, данные экземпляра хранятся в Docker volume `tengeflow-data`. Настройте HTTPS reverse proxy на `127.0.0.1:1488`; не открывайте порт `1488` для внешнего трафика и не публикуйте backend по HTTP.

После получения публичного HTTPS-домена backend настройте Vercel rewrite на него командой из раздела «Подключить Vercel» ниже. Сам домен backend нельзя угадать до выбора/настройки хоста.

### Запуск без Docker

Рабочая директория Python-сервиса — `backend/`:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/flask --app app db upgrade
.venv/bin/gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 app:app
```

В хостинге установку зависимостей задайте как build-команду, миграцию — как отдельный release/pre-deploy шаг, Gunicorn — как start-команду. Не выполняйте миграции одновременно в нескольких worker-процессах. Переменные окружения должны быть доступны и миграциям, и серверу. Для production используйте Gunicorn за HTTPS-прокси хостинга; встроенный Flask-сервер предназначен для разработки. [Документация Flask о Gunicorn](https://flask.palletsprojects.com/en/stable/deploying/gunicorn/).

База и Redis должны быть доступны backend по защищённым соединениям. Настройте резервное копирование PostgreSQL средствами выбранного хостинга. Замена `JWT_SECRET_KEY` делает ранее выданные access tokens недействительными; сохраняйте один стабильный ключ между перезапусками.

## 3. Подключить Vercel

Браузер обращается к тому же origin по `/api`. Vercel передаёт эти запросы размещённому backend; это позволяет refresh cookie работать в пределах сайта. Для локальной разработки ту же роль выполняет прокси CRA.

В корне проекта настройте внешний API rewrite, указав настоящий HTTPS-адрес backend без `/api`:

```sh
npm run deploy:api -- https://your-backend.example
```

Команда меняет `vercel.json`: API rewrite должен находиться перед SPA fallback. Маршруты локального inbox не должны публиковаться. На самом backend обязательно остаётся `APP_ENV=production`.

В Vercel укажите:

| Настройка | Значение |
| --- | --- |
| Build Command | `npm run build` |
| Output Directory | `build` |
| Environment Variable | `REACT_APP_API_URL=/api` |

После изменения конфигурации создайте новый deployment. Frontend не содержит секретных API-ключей; права проверяет сервер по сессии. Не задавайте localhost в настройках опубликованного сайта. Механизм внешнего проксирования описан в [документации Vercel rewrites](https://vercel.com/docs/routing/rewrites).

## 4. Проверить опубликованную версию

1. Откройте главную, `/login` и `/app/transactions` напрямую с обновлением страницы. Неавторизованный пользователь должен перейти к входу.
2. Зарегистрируйте новый аккаунт, получите настоящее письмо и подтвердите адрес. Новый аккаунт должен перейти в `/onboarding`.
3. Задайте имя, бюджет и лимиты; проверьте пустую историю расходов после настройки.
4. Добавьте расход, перезагрузите страницу и войдите повторно. Данные должны сохраниться; повторная настройка не нужна.
5. Проверьте второй аккаунт: записи первого ему недоступны.
6. Пройдите восстановление пароля через настоящее письмо. Уже использованная ссылка не должна приниматься снова.
7. Убедитесь, что `/api/dev/inbox` недоступен с опубликованных frontend и backend.
8. Проверьте поведение при разрыве сети: форма не должна объявлять успех без ответа сервера.

Локальные проверки не заменяют проверку SMTP, HTTPS, cookie и проксирования на опубликованных доменах. Production-режим требует серверной инфраструктуры; демо продолжает работать отдельно в браузере.
