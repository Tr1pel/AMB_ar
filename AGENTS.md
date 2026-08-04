# Project rules

Use Vue 3, TypeScript, Vite, Pinia and Composition API.

This project is a server-backed application for quality-control reports in warehouses.

Use the Node.js API and SQLite as the only source of persistent application data.

Do not use IndexedDB, Dexie, local report drafts, or a client-side synchronization queue.

Reports, photos, generated documents, accounts, reference data, and templates must be saved
through the server API.

Use soft deletes for user-managed entities.

Keep binary photo and generated-document data in the server database.

Client requests must surface network and server errors; a save is complete only after the server
confirms it.
