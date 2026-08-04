import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('worker submits a report and admin processes server-persisted binaries', async (context) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'amb-ar-server-test-'))
  const databasePath = join(temporaryDirectory, 'flow.sqlite')
  process.env.AMB_AR_API_PORT = '0'
  process.env.AMB_AR_DATABASE_PATH = databasePath
  process.env.AMB_AR_HOST = '127.0.0.1'

  const { server, closeServer } = await import('./index.mjs')

  context.after(async () => {
    await closeServer()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  const port = await waitForServer(server)

  const admin = await request(port, '/api/accounts/login?loginNumber=1001')
  const worker = await request(port, '/api/accounts/login?loginNumber=2001')
  const otherWorker = await request(port, '/api/accounts/login?loginNumber=2002')

  assert.equal(admin.status, 200)
  assert.equal(admin.body.role, 'admin')
  assert.equal(worker.body.role, 'worker')
  assert.equal(otherWorker.body.role, 'worker')

  const forbiddenAccounts = await request(port, '/api/accounts', {
    accountId: worker.body.id,
  })
  assert.equal(forbiddenAccounts.status, 403)

  const seedTemplate = await request(port, '/api/document-templates/seed', {
    method: 'POST',
    body: createTemplate(),
  })
  assert.equal(seedTemplate.status, 200)

  const reportId = 'report-flow'
  const photoBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x02, 0x03, 0x04])
  const photo = {
    id: 'photo-flow',
    draftId: reportId,
    templateFieldId: 'field-photo',
    category: 'goods',
    fileName: 'goods.jpg',
    mimeType: 'image/jpeg',
    size: 999,
    blobBase64: photoBytes.toString('base64'),
    caption: 'Партия товара',
    sortOrder: 1,
    createdAt: Date.now(),
  }
  const secondaryPhoto = {
    ...photo,
    id: 'photo-flow-secondary',
    templateFieldId: 'field-photo-secondary',
    fileName: 'secondary.jpg',
    caption: 'Дополнительное фото',
    sortOrder: 2,
  }
  const draft = createDraft(reportId, worker.body.id)

  const savedDraft = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: { draft, photos: [photo, secondaryPhoto] },
  })
  assert.equal(savedDraft.status, 200)
  assert.equal(savedDraft.body.draft.status, 'draft')
  assert.equal(savedDraft.body.draft.workerAccountId, worker.body.id)
  assert.equal(
    savedDraft.body.draft.customFieldValues['custom.inspectorSignature'],
    worker.body.fullName,
  )
  assert.equal(savedDraft.body.photos[0].size, photoBytes.byteLength)
  assert.equal(savedDraft.body.photos[0].templateFieldId, 'field-photo')
  assert.equal(savedDraft.body.photos[1].templateFieldId, 'field-photo-secondary')

  const unknownPhotoField = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft,
      photos: [
        {
          ...photo,
          id: 'photo-unknown-field',
          templateFieldId: 'field-not-in-template',
        },
      ],
    },
  })
  assert.equal(unknownPhotoField.status, 400)

  const hiddenAdminList = await request(port, '/api/reports', { accountId: admin.body.id })
  assert.equal(hiddenAdminList.status, 200)
  assert.deepEqual(hiddenAdminList.body, [])

  const hiddenAdminDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(hiddenAdminDetails.status, 404)

  const forbiddenDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: otherWorker.body.id,
  })
  assert.equal(forbiddenDetails.status, 403)

  const otherReportId = 'report-other-worker'
  const otherPhoto = {
    ...photo,
    id: 'photo-other-worker',
    draftId: otherReportId,
  }
  const otherWorkerDraft = await request(port, `/api/reports/${otherReportId}`, {
    method: 'PUT',
    accountId: otherWorker.body.id,
    body: {
      draft: createDraft(otherReportId, otherWorker.body.id),
      photos: [otherPhoto],
    },
  })
  assert.equal(otherWorkerDraft.status, 200)

  const foreignPhotoCollision = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft,
      photos: [otherPhoto],
    },
  })
  assert.equal(foreignPhotoCollision.status, 409)

  const ownerTransfer = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft: { ...draft, workerAccountId: otherWorker.body.id },
      photos: [photo, secondaryPhoto],
    },
  })
  assert.equal(ownerTransfer.status, 403)

  const forbiddenStatus = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: { draft: { ...draft, status: 'exported' }, photos: [photo] },
  })
  assert.equal(forbiddenStatus.status, 400)

  const incompleteSubmission = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: { draft: { ...draft, status: 'ready' }, photos: [photo] },
  })
  assert.equal(incompleteSubmission.status, 400)

  const submitted = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft: {
        ...draft,
        status: 'ready',
        mainInfo: {
          ...draft.mainInfo,
          orderNumber: 'ORDER-42',
          placeOfSurvey: 'Склад № 1',
        },
      },
      photos: [photo, secondaryPhoto],
    },
  })
  assert.equal(submitted.status, 200)
  assert.equal(submitted.body.draft.status, 'ready')
  assert.deepEqual(submitted.body.draft.photoIds, [photo.id, secondaryPhoto.id])

  const immutableSubmission = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: { draft: { ...submitted.body.draft, status: 'draft' }, photos: [photo] },
  })
  assert.equal(immutableSubmission.status, 409)

  const workerDeleteSubmission = await request(port, `/api/reports/${reportId}`, {
    method: 'DELETE',
    accountId: worker.body.id,
  })
  assert.equal(workerDeleteSubmission.status, 409)

  const adminReports = await request(port, '/api/reports', { accountId: admin.body.id })
  assert.equal(adminReports.status, 200)
  assert.deepEqual(adminReports.body.map((item) => item.id), [reportId])

  const adminDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(adminDetails.status, 200)
  assert.equal(adminDetails.body.photos[0].blobBase64, photoBytes.toString('base64'))

  const documentBytes = Buffer.from('%PDF-1.7\nAMB-AR integration test\n%%EOF', 'utf8')
  const document = await request(port, `/api/reports/${reportId}/documents`, {
    method: 'POST',
    accountId: admin.body.id,
    body: {
      id: 'document-flow',
      draftId: 'spoofed-report',
      fileName: 'quality-report.pdf',
      mimeType: 'application/pdf',
      blobBase64: documentBytes.toString('base64'),
      generatedAt: 1,
      contentHash: 'untrusted-client-hash',
    },
  })
  assert.equal(document.status, 201)
  assert.equal(document.body.draftId, reportId)
  assert.equal(
    document.body.contentHash,
    createHash('sha256').update(documentBytes).digest('hex'),
  )
  assert.notEqual(document.body.generatedAt, 1)

  const exportedDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(exportedDetails.body.draft.status, 'exported')
  assert.equal(exportedDetails.body.documents[0].blobBase64, documentBytes.toString('base64'))

  const database = new DatabaseSync(databasePath, { readOnly: true })
  const photoRow = database
    .prepare('SELECT binary_data, size, template_field_id FROM product_photos WHERE id = ?')
    .get(photo.id)
  const documentRow = database
    .prepare('SELECT binary_data, content_hash FROM generated_documents WHERE id = ?')
    .get(document.body.id)

  assert.deepEqual(Buffer.from(photoRow.binary_data), photoBytes)
  assert.equal(photoRow.size, photoBytes.byteLength)
  assert.equal(photoRow.template_field_id, 'field-photo')
  assert.deepEqual(Buffer.from(documentRow.binary_data), documentBytes)
  assert.equal(documentRow.content_hash, document.body.contentHash)
  database.close()

  const deleted = await request(port, `/api/reports/${reportId}`, {
    method: 'DELETE',
    accountId: admin.body.id,
  })
  assert.equal(deleted.status, 200)

  const deletedDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(deletedDetails.status, 404)

  const deletedDatabase = new DatabaseSync(databasePath, { readOnly: true })
  const softDeletedReport = deletedDatabase
    .prepare('SELECT status, deleted_at FROM report_drafts WHERE id = ?')
    .get(reportId)
  const softDeletedPhoto = deletedDatabase
    .prepare('SELECT deleted_at, length(binary_data) AS binary_size FROM product_photos WHERE id = ?')
    .get(photo.id)
  const softDeletedDocument = deletedDatabase
    .prepare(
      'SELECT deleted_at, length(binary_data) AS binary_size FROM generated_documents WHERE id = ?',
    )
    .get(document.body.id)

  assert.equal(softDeletedReport.status, 'archived')
  assert.equal(typeof softDeletedReport.deleted_at, 'number')
  assert.equal(softDeletedPhoto.binary_size, photoBytes.byteLength)
  assert.equal(softDeletedDocument.binary_size, documentBytes.byteLength)
  assert.equal(typeof softDeletedPhoto.deleted_at, 'number')
  assert.equal(typeof softDeletedDocument.deleted_at, 'number')
  deletedDatabase.close()
})

function createTemplate() {
  const now = Date.now()

  return {
    id: 'document-template-quality-standard',
    name: 'Стандартный отчет ОКК',
    description: 'Интеграционный макет',
    status: 'active',
    sections: [
      {
        id: 'section-main',
        title: 'Основное',
        description: '',
        sortOrder: 1,
        fields: [
          createTemplateField('field-order', 'mainInfo.orderNumber', 'Номер заказа', 1),
          createTemplateField('field-place', 'mainInfo.placeOfSurvey', 'Место инспекции', 2),
          createTemplateField('field-product', 'mainInfo.productName', 'Товар', 3),
          createTemplateField('field-photo', 'photos', 'Фотографии', 4),
          createTemplateField(
            'field-photo-secondary',
            'custom.secondaryPhotos',
            'Дополнительные фотографии',
            5,
            'photo',
            false,
          ),
          createTemplateField(
            'field-inspector-signature',
            'custom.inspectorSignature',
            'Подпись инспектора',
            6,
            'signature',
            true,
          ),
        ],
      },
    ],
    createdByAccountId: 'system',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  }
}

function createTemplateField(
  id,
  dataPath,
  label,
  sortOrder,
  type = dataPath === 'photos' ? 'photo' : 'text',
  required = true,
) {
  return {
    id,
    dataPath,
    label,
    type,
    required,
    placeholder: '',
    helpText: '',
    width: 'full',
    sortOrder,
    options: [],
  }
}

function createDraft(id, workerAccountId) {
  return {
    id,
    status: 'draft',
    templateId: 'document-template-quality-standard',
    workerAccountId,
    productId: 'sweet-red-pepper',
    productName: 'Перец красный',
    inspectorName: 'Инспектор',
    mainInfo: {
      orderNumber: '',
      placeOfSurvey: '',
      productName: 'Перец красный',
    },
    temperatureInfo: {},
    inspectionResults: {},
    descriptions: {},
    expertConclusion: '',
    customFieldValues: { 'custom.inspectorSignature': 'Подставное имя' },
    sampling: { palletCount: 1, sampleCount: 1, seed: '42', points: [] },
    signatures: {},
    photoIds: ['untrusted-photo-id'],
    createdAt: 1,
    updatedAt: 1,
  }
}

async function request(port, path, options = {}) {
  const headers = {}

  if (options.accountId) {
    headers['X-Account-Id'] = options.accountId
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const body = await response.json()

  return { status: response.status, body }
}

async function waitForServer(server) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const address = server.address()

    if (server.listening && typeof address === 'object' && address) {
      try {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/health`)

        if (response.ok) {
          return address.port
        }
      } catch {
        // The server may have bound its port before the request handler is ready.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Server did not start in time')
}
