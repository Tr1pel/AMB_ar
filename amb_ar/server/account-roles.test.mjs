import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import { createServerDatabase } from './database.mjs'

for (const hasPasswordColumn of [true, false]) {
  test(`manager migration preserves existing data (password column: ${hasPasswordColumn})`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'amb-ar-roles-test-'))
    const databasePath = join(directory, 'roles.sqlite')
    let serverDatabase

    try {
      serverDatabase = createServerDatabase(databasePath)
      const now = Date.now()
      const metadata = {
        _lastModified: now,
        _localVersion: 'preserved-local-version',
        _serverTimestamp: now,
        _serverVersion: 'preserved-server-version',
      }
      const data = serverDatabase.readDb()
      const account = {
        id: 'existing-specialist',
        loginNumber: '2001',
        fullName: 'Существующий специалист',
        role: 'worker',
        passwordHash: 'preserved-password-hash',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...metadata,
      }
      data.accounts.push(account, {
        ...account,
        id: 'deleted-admin',
        loginNumber: '1001',
        role: 'admin',
        isActive: false,
        _deletedAt: now,
      })
      data.reportDrafts.push({
        id: 'existing-report',
        reportNumber: 'ORDER-20261119-1',
        status: 'exported',
        workerAccountId: account.id,
        productId: '',
        productName: 'Товар',
        inspectorName: account.fullName,
        mainInfo: { orderNumber: 'ORDER' },
        temperatureInfo: {},
        inspectionResults: {},
        descriptions: {},
        expertConclusion: '',
        sampling: {},
        signatures: {},
        photoIds: ['existing-photo'],
        createdAt: now,
        updatedAt: now,
        ...metadata,
      })
      data.productPhotos.push({
        id: 'existing-photo',
        draftId: 'existing-report',
        category: 'goods',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 3,
        blobBase64: Buffer.from([1, 2, 3]).toString('base64'),
        caption: '',
        sortOrder: 1,
        createdAt: now,
        ...metadata,
      })
      data.generatedDocuments.push({
        id: 'existing-document',
        draftId: 'existing-report',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        blobBase64: Buffer.from('%PDF-preserved').toString('base64'),
        contentHash: 'preserved-hash',
        generatedAt: now,
        ...metadata,
      })
      serverDatabase.writeDb(data)
      serverDatabase.createAuthSession('existing-session', account.id, now, now + 60_000)
      serverDatabase.close()
      serverDatabase = undefined

      // Reproduce the previous CHECK constraint with live foreign-key references.
      const legacyDatabase = new DatabaseSync(databasePath)
      try {
        const { sql } = legacyDatabase
          .prepare("SELECT sql FROM sqlite_schema WHERE name = 'accounts'")
          .get()
        legacyDatabase.exec('PRAGMA foreign_keys = OFF')
        legacyDatabase.exec(`
          ${sql
            .replace('CREATE TABLE accounts', 'CREATE TABLE accounts_legacy')
            .replace("'admin', 'manager', 'worker'", "'admin', 'worker'")};
          INSERT INTO accounts_legacy SELECT * FROM accounts;
          DROP TABLE accounts;
          ALTER TABLE accounts_legacy RENAME TO accounts;
          PRAGMA user_version = 7;
        `)
        if (!hasPasswordColumn) {
          legacyDatabase.exec('ALTER TABLE accounts DROP COLUMN password_hash')
        }
      } finally {
        legacyDatabase.close()
      }

      serverDatabase = createServerDatabase(databasePath)
      const migrated = serverDatabase.readDb('existing-report')
      assert.deepEqual(
        migrated.reportDrafts,
        data.reportDrafts.map((report) => ({ ...report, _syncStatus: 'synced' })),
      )
      assert.equal(migrated.productPhotos[0].blobBase64, data.productPhotos[0].blobBase64)
      assert.equal(migrated.generatedDocuments[0].blobBase64, data.generatedDocuments[0].blobBase64)
      assert.equal(migrated.accounts[0].role, 'worker')
      assert.equal(
        migrated.accounts[0].passwordHash,
        hasPasswordColumn ? account.passwordHash : undefined,
      )
      assert.equal(migrated.accounts[0]._localVersion, metadata._localVersion)
      assert.equal(migrated.accounts[1]._deletedAt, now)
      assert.equal(serverDatabase.findAuthSession('existing-session', now).account_id, account.id)

      migrated.accounts.push({
        ...account,
        id: 'new-manager',
        loginNumber: '3001',
        role: 'manager',
      })
      serverDatabase.writeDb(migrated)
      assert.equal(
        serverDatabase.readDb().accounts.find((item) => item.id === 'new-manager').role,
        'manager',
      )
      serverDatabase.close()
      serverDatabase = undefined

      // Reopening must be idempotent and leave all foreign keys and indexes active.
      serverDatabase = createServerDatabase(databasePath)
      assert.equal(serverDatabase.findAuthSession('existing-session', now).account_id, account.id)
      const inspection = new DatabaseSync(databasePath)
      try {
        assert.deepEqual(inspection.prepare('PRAGMA foreign_key_check').all(), [])
        assert.equal(inspection.prepare('PRAGMA user_version').get().user_version, 8)
        assert.throws(() =>
          inspection.exec("UPDATE accounts SET role = 'owner' WHERE id = 'new-manager'"),
        )
        assert.throws(() =>
          inspection.exec("UPDATE accounts SET login_number = '2001' WHERE id = 'new-manager'"),
        )
      } finally {
        inspection.close()
      }
    } finally {
      serverDatabase?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
}
