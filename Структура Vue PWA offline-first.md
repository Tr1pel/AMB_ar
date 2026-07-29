# Структура Vue 3 PWA offline-first для контроля качества в амбаре

## Главный принцип

Приложение работает local-first: IndexedDB через Dexie является основным источником данных во время работы пользователя. Любое изменение отчета, фото, подписи или сгенерированного документа сначала сохраняется локально. Сервер не участвует в редактировании и используется только как цель фоновой синхронизации.

Сеть не должна блокировать интерфейс. Пользователь может создать отчет, добавить фото, сгенерировать PDF/DOCX и скачать документ без интернета.

## Технологический стек

- Vue 3 + TypeScript + Composition API.
- Vite.
- Pinia только для состояния интерфейса, сети, текущей сессии и статусов синхронизации.
- Vue Router для экранов приложения.
- Dexie как typed wrapper над IndexedDB.
- vite-plugin-pwa + Workbox для app shell offline.
- Web Worker для сжатия фото и генерации тяжелых документов, чтобы не блокировать UI.
- Background Sync API как дополнительный механизм, но не как единственная гарантия. Обязателен fallback через `online` event и ручной запуск очереди.

## Предлагаемая структура папок

```text
src/
  app/
    App.vue
    main.ts
    router.ts
    pwa.ts
    providers/
      offline-provider.ts
  assets/
  components/
    app-shell/
      AppHeader.vue
      AppNavigation.vue
      SyncIndicator.vue
      StorageWarning.vue
    form/
      SelectField.vue
      NumberField.vue
      TextField.vue
      DateField.vue
      SignatureField.vue
    feedback/
      EmptyState.vue
      InlineError.vue
      LoadingState.vue
  db/
    database.ts
    schema.ts
    migrations.ts
    sync-metadata.ts
    storage-manager.ts
    tab-coordinator.ts
  modules/
    reports/
      components/
        ReportCard.vue
        ReportEditor.vue
        QualityMetricsForm.vue
        ReportPhotoGrid.vue
        ReportStatusBadge.vue
      composables/
        use-report.ts
        use-report-list.ts
        use-report-autosave.ts
        use-report-validation.ts
      repositories/
        report-repository.ts
        report-photo-repository.ts
        report-document-repository.ts
      services/
        report-factory.ts
        report-readiness.ts
        report-export.ts
      types.ts
      routes.ts
    dictionaries/
      repositories/
        dictionary-repository.ts
      services/
        dictionary-sync.ts
      types.ts
    documents/
      components/
        DocumentPreview.vue
        TemplateVersionBadge.vue
      repositories/
        document-template-repository.ts
      services/
        document-generator.ts
        document-template-loader.ts
      workers/
        document-generator.worker.ts
      types.ts
    photos/
      components/
        PhotoCapture.vue
        PhotoPreview.vue
      services/
        photo-compressor.ts
        photo-storage.ts
      workers/
        photo-compressor.worker.ts
      types.ts
    sync/
      components/
        ConflictResolver.vue
        SyncQueuePanel.vue
      repositories/
        conflict-repository.ts
        sync-queue-repository.ts
        sync-cursor-repository.ts
      services/
        api-client.ts
        backoff.ts
        conflict-resolver.ts
        network-monitor.ts
        sync-engine.ts
        sync-queue.ts
      types.ts
  stores/
    app-store.ts
    network-store.ts
    sync-store.ts
    session-store.ts
  views/
    DashboardView.vue
    ReportListView.vue
    ReportEditorView.vue
    ReportPreviewView.vue
    ConflictsView.vue
    SettingsView.vue
  workers/
    worker-messages.ts
```

## Роуты

```text
/                         DashboardView
/reports                  ReportListView
/reports/new              ReportEditorView
/reports/:reportId        ReportEditorView
/reports/:reportId/preview ReportPreviewView
/conflicts                ConflictsView
/settings                 SettingsView
```

Главный экран должен сразу показывать рабочую поверхность: список локальных отчетов, кнопку создания отчета, состояние сети и количество операций в очереди.

## Слои приложения

### UI components

Компоненты не обращаются к серверу напрямую. Они вызывают composables или repositories, которые всегда пишут в Dexie.

### Composables

`use-report`, `use-report-list`, `use-report-autosave` читают данные из Dexie reactive-подписками. Для Vue можно сделать тонкую обертку над `Dexie.liveQuery`, которая возвращает `ref`, `isLoading` и `error`.

### Repositories

Repositories являются единственной точкой записи бизнес-данных. Они:

- сохраняют данные в IndexedDB;
- обновляют sync metadata;
- используют soft delete вместо удаления;
- добавляют операции в sync queue только когда сущность должна уйти на сервер;
- не вызывают сетевые запросы внутри IndexedDB transaction.

### Services

Services содержат бизнес-операции: создание отчета, проверка готовности, генерация документов, сжатие фото, запуск синхронизации.

### Pinia stores

Pinia не является долговременным хранилищем отчетов. В stores держим:

- текущий выбранный экран и UI-фильтры;
- network status: `online/offline/slow`;
- pending sync count;
- текущего пользователя;
- флаги генерации документа и фоновой синхронизации.

## IndexedDB/Dexie схема

Все syncable entities имеют sync metadata:

```ts
export type SyncStatus = "synced" | "pending" | "conflicted" | "error";

export interface SyncMetadata {
  _syncStatus: SyncStatus;
  _lastModified: number;
  _localVersion: string;
  _serverVersion?: string;
  _serverTimestamp?: number;
  _deletedAt?: number;
}
```

Пользовательский статус отчета отделен от технического статуса синхронизации:

```ts
export type ReportStatus = "draft" | "ready" | "generated" | "synced" | "error";
```

Черновик может иметь `reportStatus: "draft"` и `_syncStatus: "pending"`, но не попадать в очередь отправки, пока пользователь не нажал "Готов к отправке".

### Таблицы

```ts
reports: `
  id,
  reportStatus,
  warehouseId,
  factoryId,
  productId,
  batchNumber,
  reportDate,
  userId,
  templateVersion,
  _syncStatus,
  _lastModified,
  _deletedAt,
  [reportStatus+_lastModified],
  [warehouseId+reportDate]
`

reportPhotos: `
  id,
  reportId,
  uploadStatus,
  _syncStatus,
  _lastModified,
  _deletedAt,
  [reportId+_deletedAt]
`

reportDocuments: `
  id,
  reportId,
  format,
  templateVersion,
  generationStatus,
  _syncStatus,
  _lastModified,
  _deletedAt,
  [reportId+format]
`

documentTemplates: `
  id,
  templateKey,
  version,
  isActive,
  _syncStatus,
  _lastModified,
  _deletedAt,
  [templateKey+version]
`

warehouses: `id, name, _syncStatus, _lastModified, _deletedAt`
factories: `id, name, _syncStatus, _lastModified, _deletedAt`
products: `id, name, _syncStatus, _lastModified, _deletedAt`
qualityMetricDefinitions: `id, productId, sortOrder, _syncStatus, _lastModified, _deletedAt`

syncQueue: `id, entityType, entityId, operation, status, nextAttemptAt, createdAt, retryCount`
syncCursors: `collection, lastServerTimestamp, lastServerId`
conflicts: `id, entityType, entityId, status, createdAt, resolvedAt`
appMeta: `key`
```

### Основные сущности

```ts
export interface QualityReport extends SyncMetadata {
  id: string;
  reportStatus: ReportStatus;
  warehouseId: string;
  factoryId: string;
  productId: string;
  reportDate: string;
  batchNumber: string;
  qualityMetrics: Record<string, string | number | boolean | null>;
  responsibleName: string;
  signatureBlobId?: string;
  templateVersion: string;
  createdAt: number;
  userId: string;
}

export interface ReportPhoto extends SyncMetadata {
  id: string;
  reportId: string;
  blob: Blob;
  thumbnailBlob?: Blob;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  uploadStatus: "local" | "queued" | "uploaded" | "error";
  createdAt: number;
}

export interface ReportDocument extends SyncMetadata {
  id: string;
  reportId: string;
  format: "pdf" | "docx";
  blob: Blob;
  fileName: string;
  templateVersion: string;
  generationStatus: "generated" | "error";
  createdAt: number;
}
```

## Локальный сценарий отчета

1. Пользователь открывает приложение. Service Worker отдает app shell даже без сети.
2. Dexie открывает локальную базу, Pinia показывает сетевой статус и счетчик очереди.
3. При создании отчета `report-factory` генерирует client-side UUID и сразу сохраняет `QualityReport` в `reports`.
4. Autosave пишет каждое изменение в Dexie через `report-repository`.
5. Фото сжимается в worker до 1280-1920 px по ширине, сохраняется как Blob в `reportPhotos`.
6. Документ генерируется локально из `documentTemplates`, сохраняется в `reportDocuments`, после этого доступен для скачивания.
7. Когда отчет переведен в `ready`, repository добавляет операции в `syncQueue`: отчет, фото, документ.
8. `sync-engine` отправляет очередь в фоне, обновляет `_syncStatus`, `_serverVersion`, `_serverTimestamp`.

## Sync Queue

Очередь хранится в IndexedDB и переживает закрытие браузера.

```ts
export interface SyncQueueItem {
  id: string;
  entityType: "report" | "reportPhoto" | "reportDocument" | "dictionary" | "template";
  entityId: string;
  operation: "upsert" | "delete" | "uploadBlob" | "finalizeReport";
  payload?: unknown;
  status: "queued" | "processing" | "retry" | "failed";
  retryCount: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}
```

Правила очереди:

- операции выполняются по `createdAt`;
- отчет отправляется до фото и документа;
- `finalizeReport` выполняется последним;
- каждая операция идемпотентна через client-generated `id` и `Idempotency-Key`;
- retry использует exponential backoff with jitter;
- после лимита попыток операция остается в `failed`, а отчет получает видимый статус ошибки;
- пользователь может нажать "Повторить синхронизацию".

Backoff:

```ts
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const JITTER_FACTOR = 0.5;
const MAX_RETRY_ATTEMPTS = 5;
```

## Network monitoring

`network-monitor` не доверяет только `navigator.onLine`.

Источники статуса:

- события `online/offline`;
- периодический `HEAD /api/health`;
- timeout для health check;
- статус `slow`, если latency выше порога.

UI показывает:

- "Оффлайн, данные сохранены локально";
- "Есть N операций к отправке";
- "Синхронизация";
- "Конфликт";
- "Ошибка синхронизации, можно повторить".

## Service Worker и PWA

Service Worker отвечает за доступность приложения, а не за хранение отчетов.

Workbox:

- precache app shell: JS, CSS, icons, manifest;
- runtime cache для статических ассетов;
- API-запросы бизнес-данных не считать источником истины;
- для `/api/health` использовать network-only;
- Background Sync API использовать только как бонус для Chromium, обязательно оставить fallback в `sync-engine`.

## Хранение фото

Фото сохраняются в IndexedDB как Blob.

Пайплайн:

1. `PhotoCapture.vue` получает файл с камеры или загрузки.
2. `photo-compressor.worker.ts` нормализует ориентацию, ограничивает ширину до 1280-1920 px, сжимает JPEG/WebP.
3. `report-photo-repository` сохраняет полный сжатый Blob и thumbnail Blob.
4. UI читает thumbnail для сетки, полный Blob для предпросмотра и документа.
5. При soft delete проставляется `_deletedAt`, физическое удаление разрешено только для synced tombstones старше retention period.

## Генерация документов

`documentTemplates` хранят активные версии шаблонов локально. Отчет фиксирует `templateVersion`, чтобы повторная генерация была воспроизводимой.

Пайплайн:

1. На старте при наличии сети приложение подтягивает новые шаблоны, но старые версии не удаляет сразу.
2. `document-generator.worker.ts` получает report, photos, template.
3. PDF/DOCX создается локально.
4. Blob документа сохраняется в `reportDocuments`.
5. Пользователь скачивает документ сразу.
6. После `ready` документ уходит на сервер как часть sync queue.

## Конфликты

Для отчетов нельзя тихо перетирать локальные изменения сервером.

Стратегия:

- справочники и шаблоны: server-wins, потому что пользователь их не редактирует;
- отчеты: field-level merge, если разные поля изменены независимо;
- если одно поле изменено и локально, и на сервере, создать запись в `conflicts`;
- фото: добавления объединяются, удаления через tombstones;
- документ: если отчет изменился после генерации, документ помечается устаревшим и генерируется заново локально.

`ConflictResolver.vue` показывает локальное и серверное значение по полям и сохраняет выбранное решение обратно в Dexie, после чего ставит `_syncStatus: "pending"` и добавляет операцию в очередь.

## Backend API contract

Минимальный контракт сервера:

```text
HEAD /api/health

GET  /api/bootstrap?since=<cursor>
POST /api/reports
PUT  /api/reports/:id
POST /api/reports/:id/photos
POST /api/reports/:id/documents
POST /api/reports/:id/finalize
GET  /api/sync/:collection?since=<cursor>&limit=100
```

Требования к API:

- принимать client-generated UUID;
- поддерживать idempotency key;
- возвращать `_serverVersion` и `_serverTimestamp`;
- принимать tombstones для soft delete;
- отдавать изменения справочников и шаблонов через cursor/delta sync;
- не требовать постоянной сети во время редактирования.

## Поток синхронизации

```text
App starts
  -> open Dexie
  -> request persistent storage
  -> render local reports
  -> check /api/health
  -> pull dictionaries/templates if online
  -> process syncQueue if online

User edits report
  -> save local report/photo/document
  -> UI updates from Dexie
  -> no network wait

User marks report ready
  -> validate required fields
  -> generate document if needed
  -> enqueue report/photos/document/finalize
  -> process queue in background if online
```

## Что реализовать первым

1. Vite Vue 3 TS scaffold, Router, Pinia, vite-plugin-pwa.
2. Dexie schema, migrations, sync metadata helpers.
3. Report repository with local-first save, autosave and soft delete.
4. Basic report editor: амбар, завод, продукт, дата, партия, показатели, ФИО.
5. Photo capture + compression + IndexedDB Blob storage.
6. Local document generation stub, затем полноценный PDF/DOCX.
7. Sync queue with retry/backoff/jitter and network monitor.
8. Conflict UI and server delta sync.
