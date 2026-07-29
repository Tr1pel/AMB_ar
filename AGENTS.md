\# Project rules



Use Vue 3, TypeScript, Vite, Pinia and Composition API.



This project is an offline-first PWA for quality-control reports in warehouses.



Use the web-pwa-offline-first skill when designing:

\- local report drafts;

\- photo storage;

\- sync queue;

\- document generation;

\- network monitoring;

\- conflict resolution;

\- IndexedDB schema.



All report data must be saved locally first.

The server is only a sync target, not the primary source during editing.



Use IndexedDB via Dexie.

Use soft deletes.

Use sync metadata on every syncable entity.

Use retry with exponential backoff and jitter.

Do not block UI on network requests.

