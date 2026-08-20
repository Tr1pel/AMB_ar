# AMB_AR — передача проекта следующему агенту

## Назначение и текущее состояние

**AMB_AR QC** — PWA для инспекторов склада: они создают отчёты контроля качества с фото и PDF, в том числе без сети. Администратор управляет сотрудниками, справочниками и макетами, просматривает только полностью отправленные отчёты и работает с архивом.

Рабочий код находится в `amb_ar/`. Репозиторий на момент подготовки документа не содержит незакоммиченных изменений. Основной README: `amb_ar/README.md`; этот файл дополняет его практической картой кода и критичными инвариантами.

## Технологии и запуск

- Клиент: Vue 3, TypeScript, Composition API, Pinia, Vue Router, Vite.
- Офлайн-хранилище: Dexie / IndexedDB.
- Сервер: нативный Node.js HTTP-сервер (`server/index.mjs`), SQLite (через `node:sqlite`).
- PDF: PDFKit; общий рендерер используется браузером и сервером.
- Аутентификация: Argon2id-пароли, сессия в `HttpOnly` cookie.

Требуется Node.js 22.12+.

```sh
cd amb_ar
npm install
npm run dev       # Vite + API (5173 и 3001)
npm test          # server/*.test.mjs
npm run build     # vue-tsc + Vite
```

В development Vite проксирует `/api` на `http://127.0.0.1:3001`. В production `npm start` раздаёт `dist/` и API одним Node-процессом.

Конфигурация: `AMB_AR_DATABASE_PATH`, `AMB_AR_HOST`, `AMB_AR_API_PORT`, `AMB_AR_WAREHOUSE_CODE`, `AMB_AR_REPORT_TIME_ZONE`, `AMB_AR_INITIAL_PASSWORD`, `AMB_AR_ALLOWED_ORIGIN`. База по умолчанию: `amb_ar/server/amb-ar.sqlite` (её не следует коммитить или удалять при обычной разработке).

## Карта исходного кода

| Область | Основные файлы | Роль |
| --- | --- | --- |
| Вход клиентского приложения | `src/main.ts`, `src/App.vue`, `src/router/index.ts` | Pinia, router, регистрация SW, прогрев PDF-ресурсов, разграничение маршрутов по ролям. |
| Экранная логика | `src/views/` | Вход, журнал инспектора, выбор макета, форма/карточка отчёта, админские журналы, аккаунты, макеты. |
| Состояние UI | `src/stores/` | Pinia stores для авторизации, отчётов, синхронизации, аккаунтов, макетов и справочников. |
| Предметные типы | `src/types/report.ts` | Единая TypeScript-модель аккаунтов, отчёта, фото, PDF и макета. |
| Репозитории | `src/shared/repositories/` | Граница между stores и API/IndexedDB; здесь создаются черновики и ставятся задачи в очередь. |
| Офлайн-слой | `src/shared/offline/` | Dexie-схема, очередь синхронизации, проверка доступности API. |
| API-клиент | `src/shared/api/server-api.ts` | Cookie-запросы с таймаутом 5 с, сериализация Blob ⇄ base64, понятные ошибки. |
| Макеты/PDF | `src/shared/templates/`, `src/shared/reports/`, `server/branded-report-pdf.mjs` | Схема редактируемых форм и общий branded PDF renderer. |
| Сервер | `server/index.mjs`, `server/database.mjs` | HTTP API, авторизация, валидация, SQLite-миграции/транзакции. |
| PWA | `public/sw.js`, `src/shared/pwa/` | App shell cache; API намеренно не кешируется service worker-ом. |

## Роли, маршруты и доступ

- `worker`: `/reports/new`, `/reports/:reportId/edit`, `/reports/history`, карточка своего отчёта. Черновики доступны только автору.
- `admin`: `/admin/reports`, `/admin/reports/archive`, `/admin/accounts`, `/admin/templates`, карточки доступных отчётов.
- Роутер в `src/router/index.ts` сначала вызывает `authStore.initialize()`, затем перенаправляет по `meta.requiresAuth` и `meta.roles`.
- На сервере права определяются только по cookie-сессии. Передаваемый из клиента `accountId` не является механизмом авторизации — он нужен клиентским репозиториям/очереди.

Начальные записи создаёт сервер: администратор `1001`, инспекторы `2001`, `2002`; пароль задаётся `AMB_AR_INITIAL_PASSWORD`. Демо-вход доступен через `POST /api/auth/demo`.

## Модель хранения

### Сервер — источник истины

SQLite содержит таблицы `accounts`, `auth_sessions`, `report_template_options`, `document_templates`, `report_drafts`, `report_number_counters`, `product_photos`, `generated_documents`.

- Фото и PDF хранятся BLOB-ами в SQLite, не в файловой системе.
- Поля отчёта, снимок макета и схема макета — валидируемый JSON.
- Предметные записи несут служебные поля `_syncStatus`, `_lastModified`, `_localVersion`, `_serverTimestamp`, `_serverVersion`, `_deletedAt`.
- Для обычных пользовательских удалений применяется soft delete. Архивный отчёт физически удаляется администратором либо серверной задачей через календарный месяц после `deleted_at` (проверка на старте и затем раз в 6 часов); вместе с ним удаляются PDF и фото.
- Изменяющие API-запросы сериализованы через `mutationTail`, а SQLite-запись выполняется транзакционно.

### Клиент — локальная рабочая копия

Dexie-база называется `amb-ar-offline`. В `src/shared/offline/offline-database.ts` имеются таблицы:

- `reports`, `photos`, `documents` — черновики и бинарные данные;
- `documentTemplates`, `reportTemplateOptions`, `accounts` — кэш справочных данных/сессии;
- `syncQueue` — **постоянная** очередь синхронизации.

Локальный текущий аккаунт также запоминается в `localStorage` ключом `amb-ar-current-account-id`. Это позволяет открыть кэшированную рабочую область без сети, но не заменяет серверную авторизацию.

## Главный offline-first сценарий

1. Репозиторий собирает `ReportDraft`, сжимает новые фото (`photo-compression-service.ts`) и сохраняет отчёт, фото и PDF атомарно в IndexedDB.
2. Новые сущности получают `_syncStatus: 'pending'`; для нового отчёта используется временный номер `LOCAL-…`.
3. `enqueueReportSync()` кладёт одну запись на пару `accountId:reportId`; намерения усиливаются: `save < submit < delete`.
4. `sync-engine.ts` запускается при старте, `online`, фокусе, возврате вкладки и каждые 30 секунд. Доступность проверяется `HEAD /api/health`, а не только `navigator.onLine`.
5. При `save` очередь отправляет `PUT /api/reports/:id` с черновиком и фото. Сервер возвращает нормализованные данные и постоянный номер отчёта.
6. При `submit` сначала выполняется тот же `save`, затем `POST /documents` с актуальным PDF и только потом `POST /submit`.
7. Очередь удаляется только при подтверждении всей цепочки. При ошибке сохраняются текст ошибки, счётчик и экспоненциальная задержка (до 5 минут, с jitter).

Не обходить эту последовательность прямыми API-вызовами из view/store: иначе легко показать отчёт как синхронизированный до фактической загрузки фото/PDF. Для изменения отчёта используйте `report-draft-repository.ts`.

## Жизненный цикл отчёта

`draft` → `ready` (локально ожидает отправки) → `exported` (сервер подтвердил весь пакет).

- Работник может сохранять на сервере только `draft` и `ready`.
- Отчёт становится доступен администратору только в `ready`/`exported`; финализация переводит его в `exported`.
- Перед отправкой сервер проверяет обязательные поля активного/снимочного макета и наличие актуального PDF (`generatedAt >= draft.updatedAt`).
- Любое серверное сохранение существующего черновика инвалидирует старые generated documents; PDF нужно сформировать заново.
- После финализации работник не может редактировать или удалить отчёт.
- Устойчивый бизнес-номер (`AMB-QC-{warehouse}-{YYYYMMDD}-{NNNN}`) выделяется при первом серверном сохранении; счётчик отдельный на склад и дату. Не считайте `LOCAL-*` финальным номером.
- Удаление переводит отчёт, его фото и документы в `archived`, запоминая предыдущий статус. Администратор может восстановить архив или окончательно удалить его.

## Макеты и PDF

`DocumentTemplate` состоит из двух частей:

- `inputSchema.steps`: разделы и поля, из которых динамически строится форма;
- `renderSpec.sections`: правила вывода на PDF (порядок, колонки, перенос страницы, скрытие, представление поля).

Есть совместимый устаревший `sections`, но новый код должен использовать `inputSchema` и `renderSpec`. При старте отчёта активный макет копируется в `draft.templateSnapshot`: исторический PDF отчёта не должен изменяться после редактирования исходного макета.

Клиент генерирует черновой PDF через `src/shared/reports/browser-report-pdf.ts`, сервер — через `server/branded-report-pdf.mjs`; оба используют `src/shared/reports/branded-report-pdf-core.mjs`. Не создавайте второй рендерер: общая реализация нужна для идентичного результата онлайн и офлайн. PDF и фото можно проверить в существующем просмотрщике карточки отчёта.

## Основные API-группы

Полный контракт читается непосредственно в `server/index.mjs`; ниже — карта маршрутов.

| Группа | Маршруты |
| --- | --- |
| Служебные | `GET/HEAD /api/health`, `POST /api/bootstrap` |
| Аутентификация | `POST /api/auth/login`, `/demo`, `GET /session`, `POST /logout` |
| Аккаунты (admin) | `GET/POST /api/accounts`, `POST /api/accounts/generate-login-number`, `GET/DELETE /api/accounts/:id` |
| Справочник полей (admin write) | `GET/POST /api/template-options`, `PUT/DELETE /api/template-options/:id` |
| Макеты | `GET/POST /api/document-templates`, `GET /active`, `GET/PUT/DELETE /:id` |
| Отчёты | `GET /api/reports` (admin), `GET /mine` (worker), `GET /archive` (admin), `GET/PUT/DELETE /:id` |
| Ресурсы отчёта | `POST /:id/documents/generate`, `POST /:id/documents`, `GET /:id/photo-previews`, `POST /:id/submit` |
| Архив | `POST/DELETE /api/reports/archive/:id` (admin) |

Размеры на сервере: JSON body до 100 MB, одно фото до 15 MB, PDF до 50 MB, максимум 100 фото на отчёт. Бинарные поля передаются base64 в JSON; это важно учитывать при изменении лимитов и оценке payload.

## PWA и сеть

- `public/sw.js` кеширует app shell и статические ресурсы. Навигация имеет fallback на `index.html`.
- API не кешируется: сетевой сбой должен остаться видимым API-клиенту, а не маскироваться устаревшим ответом.
- Service worker не регистрируется в dev (`register-service-worker.ts`). Проверять офлайн-PWA нужно production-сборкой.
- После online-старта `warmOfflineReportResources()` заранее подгружает PDFKit/детали отчёта; это позволяет создать PDF после последующего отключения сети.

## Тесты и безопасное продолжение работы

- `npm test` покрывает server flow, статусный жизненный цикл, архив, права и PDF.
- `server/browser-report-pdf.test.mjs` проверяет запуск общего renderer в браузерной сборке PDFKit.
- `server/fixed-report-pdf.test.mjs` проверяет вёрстку (например, перенос фото и таблицы).
- Перед сдачей изменений минимум запускайте `npm run build` и `npm test`; при изменении UI вручную проверяйте online и offline создание/отправку отчёта.

Ключевые ловушки:

1. Не хранить фото/PDF только в памяти, `localStorage` или на серверном диске: нужны IndexedDB и SQLite BLOB.
2. Не помечать данные как `synced` до ответа сервера и не удалять задачу очереди до завершения `submit`-цепочки.
3. Не менять отправленный отчёт и не давать админу доступ к `draft`.
4. Не переписывать `templateSnapshot` уже созданного отчёта при обновлении шаблона.
5. Не удалять сущности физически в обычном UI-потоке; сохранять soft-delete/архивную семантику.
6. В ошибках сохранять и показывать пользователю проблему сети/сервера: `server-api.ts` и stores уже формируют русскоязычные сообщения.

