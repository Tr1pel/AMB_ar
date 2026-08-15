# Project rules

Use Vue 3, TypeScript, Vite, Pinia and Composition API.

This project is a server-backed application for quality-control reports in warehouses.

Use the Node.js API and SQLite as the authoritative server-side data store.

Inspector workflows must be offline-first. Use IndexedDB through Dexie for local report drafts,
photos, generated PDF documents, cached accounts/reference data/templates, and a persistent
client-side synchronization queue.

When connectivity returns, upload the report, photos, and PDF through the server API and keep
the report in a pending state until the server confirms the complete submission.

Use soft deletes for user-managed entities.

Keep binary photo and generated-document data in the server database.

Client requests must surface network and server errors. Local saves must be identified as local;
server synchronization is complete only after the server confirms it.
