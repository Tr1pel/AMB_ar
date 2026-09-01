import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const sessionCookies = new Map()
const testPassword = 'Test-Password-2026!'

test('worker submits a report and admin processes server-persisted binaries', async (context) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'amb-ar-server-test-'))
  const databasePath = join(temporaryDirectory, 'flow.sqlite')
  process.env.AMB_AR_API_PORT = '0'
  process.env.AMB_AR_DATABASE_PATH = databasePath
  process.env.AMB_AR_HOST = '127.0.0.1'
  process.env.AMB_AR_INITIAL_PASSWORD = testPassword

  const { server, closeServer, purgeExpiredArchivedReportsNow } = await import('./index.mjs')

  context.after(async () => {
    await closeServer()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  const port = await waitForServer(server)

  const admin = await login(port, '1001')
  const worker = await login(port, '2001')
  const otherWorker = await login(port, '2002')

  assert.equal(admin.status, 200)
  assert.equal(admin.body.role, 'admin')
  assert.equal(worker.body.role, 'worker')
  assert.equal(otherWorker.body.role, 'worker')
  assert.equal('passwordHash' in admin.body, false)

  const demoWorker = await request(port, '/api/auth/demo', {
    method: 'POST',
    body: { role: 'worker' },
  })
  assert.equal(demoWorker.status, 200)
  assert.equal(demoWorker.body.role, 'worker')
  const demoSession = await request(port, '/api/auth/session', {
    accountId: demoWorker.body.id,
  })
  assert.equal(demoSession.status, 200)

  const forgedSession = await request(port, '/api/accounts', {
    headers: { 'X-Account-Id': admin.body.id },
  })
  assert.equal(forgedSession.status, 401)

  const forbiddenAccounts = await request(port, '/api/accounts', {
    accountId: worker.body.id,
  })
  assert.equal(forbiddenAccounts.status, 403)

  const forbiddenGeneratedNumber = await request(port, '/api/accounts/generate-login-number', {
    method: 'POST',
    accountId: worker.body.id,
  })
  assert.equal(forbiddenGeneratedNumber.status, 403)

  const generatedNumber = await request(port, '/api/accounts/generate-login-number', {
    method: 'POST',
    accountId: admin.body.id,
    body: { role: 'worker' },
  })
  assert.equal(generatedNumber.status, 200)
  assert.equal(generatedNumber.body.loginNumber, '2003')

  const generatedAdminNumber = await request(port, '/api/accounts/generate-login-number', {
    method: 'POST',
    accountId: admin.body.id,
    body: { role: 'admin' },
  })
  assert.equal(generatedAdminNumber.status, 200)
  assert.equal(generatedAdminNumber.body.loginNumber, '1002')

  const createdAccountPassword = 'Generated-Test-82!'
  const createdAccount = await request(port, '/api/accounts', {
    method: 'POST',
    accountId: admin.body.id,
    body: {
      loginNumber: '3001',
      fullName: 'Тестовый сотрудник',
      role: 'worker',
      password: createdAccountPassword,
    },
  })
  assert.equal(createdAccount.status, 201)
  assert.equal('passwordHash' in createdAccount.body, false)

  const passwordDatabase = new DatabaseSync(databasePath)
  const storedPasswordHash = passwordDatabase
    .prepare('SELECT password_hash FROM accounts WHERE id = ?')
    .get(createdAccount.body.id).password_hash
  passwordDatabase.close()
  assert.match(storedPasswordHash, /^\$argon2id\$/)
  assert.notEqual(storedPasswordHash, createdAccountPassword)

  const wrongPassword = await request(port, '/api/auth/login', {
    method: 'POST',
    body: { loginNumber: '3001', password: 'wrong-password' },
  })
  assert.equal(wrongPassword.status, 401)

  const createdAccountLogin = await request(port, '/api/auth/login', {
    method: 'POST',
    body: { loginNumber: '3001', password: createdAccountPassword },
  })
  assert.equal(createdAccountLogin.status, 200)

  const editorFlowTemplate = createTemplate()
  editorFlowTemplate.id = 'document-template-editor-flow'
  editorFlowTemplate.name = 'Макет из редактора'
  editorFlowTemplate.status = 'draft'
  delete editorFlowTemplate.publishedAt
  editorFlowTemplate.sections = [{ ...editorFlowTemplate.sections[0], fields: [] }]
  editorFlowTemplate.inputSchema = { version: 1, steps: editorFlowTemplate.sections }
  editorFlowTemplate.renderSpec = {
    ...editorFlowTemplate.renderSpec,
    sections: editorFlowTemplate.renderSpec.sections.map((section) => ({ ...section, fields: [] })),
  }

  const createdEditorDraft = await request(
    port,
    '/api/document-templates/document-template-editor-flow',
    {
      method: 'PUT',
      accountId: admin.body.id,
      body: editorFlowTemplate,
    },
  )
  assert.equal(createdEditorDraft.status, 201)
  assert.equal(createdEditorDraft.body.status, 'draft')
  assert.deepEqual(
    createdEditorDraft.body.inputSchema.steps[0].fields.map((field) => field.dataPath),
    ['mainInfo.orderNumber', 'mainInfo.surveyDate'],
  )
  assert.equal(
    createdEditorDraft.body.inputSchema.steps[0].fields[0].translations.en.label,
    'Order number',
  )
  assert.equal(
    createdEditorDraft.body.inputSchema.steps[0].fields[1].translations.fa.label,
    'بازرسی تاریخ',
  )

  const publishedSystemFieldsTemplate = await request(
    port,
    '/api/document-templates/document-template-editor-flow',
    {
      method: 'PUT',
      accountId: admin.body.id,
      body: { ...createdEditorDraft.body, status: 'active' },
    },
  )
  assert.equal(publishedSystemFieldsTemplate.status, 200)
  assert.equal(publishedSystemFieldsTemplate.body.status, 'active')

  const savedEditorDraft = await request(
    port,
    '/api/document-templates/document-template-editor-flow',
    {
      method: 'PUT',
      accountId: admin.body.id,
      body: {
        ...createdEditorDraft.body,
        inputSchema: {
          version: 1,
          steps: [
            {
              ...createdEditorDraft.body.sections[0],
              fields: [createTemplateField('editor-flow-field', 'custom.editorFlow', 'Поле', 1)],
            },
          ],
        },
        renderSpec: {
          ...createdEditorDraft.body.renderSpec,
          sections: createdEditorDraft.body.renderSpec.sections.map((section) => ({
            ...section,
            fields: [
              {
                dataPath: 'custom.editorFlow',
                label: 'Поле',
                width: 'full',
                display: 'value',
                hideWhenEmpty: false,
                hidden: false,
              },
            ],
          })),
        },
      },
    },
  )
  assert.equal(savedEditorDraft.status, 200)
  assert.equal(savedEditorDraft.body.status, 'draft')
  assert.equal(savedEditorDraft.body.sections[0].fields[0].label, 'Поле')
  assert.equal(
    savedEditorDraft.body.sections[0].fields.some(
      (field) => field.dataPath === 'mainInfo.orderNumber' && field.required,
    ),
    true,
  )

  const protectedFieldUpdate = await request(
    port,
    '/api/document-templates/document-template-editor-flow',
    {
      method: 'PUT',
      accountId: admin.body.id,
      body: {
        ...savedEditorDraft.body,
        inputSchema: {
          ...savedEditorDraft.body.inputSchema,
          steps: savedEditorDraft.body.inputSchema.steps.map((section) => ({
            ...section,
            fields: section.fields
              .filter((field) => field.dataPath !== 'mainInfo.surveyDate')
              .map((field) =>
                field.dataPath === 'mainInfo.orderNumber'
                  ? {
                      ...field,
                      label: 'Подмененное имя',
                      required: false,
                      translations: {
                        ...field.translations,
                        ru: { ...field.translations.ru, label: 'Подмененное имя' },
                      },
                    }
                  : field,
              ),
          })),
        },
      },
    },
  )
  assert.equal(protectedFieldUpdate.status, 200)
  const protectedFields = protectedFieldUpdate.body.inputSchema.steps[0].fields
  assert.equal(
    protectedFields.find((field) => field.dataPath === 'mainInfo.orderNumber').label,
    'Номер заказа',
  )
  assert.equal(
    protectedFields.find((field) => field.dataPath === 'mainInfo.orderNumber').required,
    true,
  )
  assert.equal(
    protectedFields.find((field) => field.dataPath === 'mainInfo.surveyDate').label,
    'Дата инспекции',
  )

  const publishedEditorTemplate = await request(
    port,
    '/api/document-templates/document-template-editor-flow',
    {
      method: 'PUT',
      accountId: admin.body.id,
      body: { ...savedEditorDraft.body, status: 'active', publishedAt: Date.now() },
    },
  )
  assert.equal(publishedEditorTemplate.status, 200)
  assert.equal(publishedEditorTemplate.body.status, 'active')
  assert.ok(publishedEditorTemplate.body.publishedAt)

  const availableTemplates = await request(port, '/api/document-templates', {
    accountId: worker.body.id,
  })
  assert.equal(availableTemplates.status, 200)
  assert.equal(
    availableTemplates.body.some(
      (template) => template.id === 'document-template-editor-flow' && template.status === 'active',
    ),
    true,
  )

  const logout = await request(port, '/api/auth/logout', {
    method: 'POST',
    accountId: createdAccount.body.id,
  })
  assert.equal(logout.status, 200)
  const expiredSession = await request(port, '/api/auth/session', {
    accountId: createdAccount.body.id,
  })
  assert.equal(expiredSession.status, 401)

  const seedTemplate = await request(port, '/api/document-templates/document-template-test-flow', {
    method: 'PUT',
    accountId: admin.body.id,
    body: createTemplate(),
  })
  assert.equal(seedTemplate.status, 201)
  assert.equal(seedTemplate.body.inputSchema.version, 1)
  assert.equal(seedTemplate.body.renderSpec.pageSize, 'A4')
  assert.equal(seedTemplate.body.renderSpec.layout, 'branded')
  assert.equal(seedTemplate.body.renderSpec.sections[0].fields[0].label, 'Номер заказа')
  assert.equal(seedTemplate.body.translations.en.name, 'Integration template')
  assert.equal(seedTemplate.body.inputSchema.steps[0].translations.fa.title, 'اصلی')
  assert.equal(
    seedTemplate.body.inputSchema.steps[0].fields[0].translations.en.label,
    'Order number',
  )
  const persistedTemplate = await request(
    port,
    '/api/document-templates/document-template-test-flow',
    { accountId: admin.body.id },
  )
  assert.equal(persistedTemplate.status, 200)
  assert.equal(persistedTemplate.body.translations.fa.name, 'قالب یکپارچه')
  assert.equal(persistedTemplate.body.inputSchema.steps[0].translations.en.title, 'Main')

  const reportId = 'report-flow'
  const photoBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
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
  assert.equal(savedDraft.body.draft.reportNumber, 'TEST-ORDER-20260817-1')
  assert.equal(savedDraft.body.draft.status, 'draft')
  assert.equal(savedDraft.body.draft.workerAccountId, worker.body.id)
  assert.equal(
    savedDraft.body.draft.customFieldValues['custom.inspectorSignature'],
    worker.body.fullName,
  )
  assert.deepEqual(savedDraft.body.draft.customFieldValues['custom.inspectionMatrix'], {
    'row-temperature': { result: 6.2, accepted: true },
  })
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
      draft: {
        ...createDraft(otherReportId, otherWorker.body.id),
        reportNumber: 'AMB-QC-EVIL-20000101-9999',
      },
      photos: [otherPhoto],
    },
  })
  assert.equal(otherWorkerDraft.status, 200)
  assert.equal(otherWorkerDraft.body.draft.reportNumber, 'TEST-ORDER-20260817-2')

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

  const completedDraft = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft: {
        ...draft,
        status: 'draft',
        mainInfo: {
          ...draft.mainInfo,
          orderNumber: 'ORDER-42',
          placeOfSurvey: 'Склад № 1',
        },
      },
      photos: [photo, secondaryPhoto],
    },
  })
  assert.equal(completedDraft.status, 200)
  assert.equal(completedDraft.body.draft.status, 'draft')
  assert.equal(completedDraft.body.draft.reportNumber, 'ORDER-42-20260817-1')

  const submissionWithoutPreview = await request(port, `/api/reports/${reportId}/submit`, {
    method: 'POST',
    accountId: worker.body.id,
  })
  assert.equal(submissionWithoutPreview.status, 409)

  const firstPreview = await request(port, `/api/reports/${reportId}/documents/generate`, {
    method: 'POST',
    accountId: worker.body.id,
  })
  assert.equal(firstPreview.status, 201)

  const hiddenAfterPreview = await request(port, '/api/reports', { accountId: admin.body.id })
  assert.deepEqual(hiddenAfterPreview.body, [])

  const correctedDraft = await request(port, `/api/reports/${reportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft: {
        ...completedDraft.body.draft,
        mainInfo: { ...completedDraft.body.draft.mainInfo, orderNumber: 'ORDER-42-CORRECTED' },
      },
      photos: [photo, secondaryPhoto],
    },
  })
  assert.equal(correctedDraft.status, 200)
  assert.deepEqual(correctedDraft.body.documents, [])

  const secondPreview = await request(port, `/api/reports/${reportId}/documents`, {
    method: 'POST',
    accountId: worker.body.id,
    body: {
      ...firstPreview.body,
      id: 'document-local-sync',
      draftId: reportId,
      generatedAt: Date.now(),
    },
  })
  assert.equal(secondPreview.status, 201)
  assert.notEqual(secondPreview.body.id, firstPreview.body.id)

  const repeatedPreviewUpload = await request(port, `/api/reports/${reportId}/documents`, {
    method: 'POST',
    accountId: worker.body.id,
    body: {
      ...secondPreview.body,
      blobBase64: firstPreview.body.blobBase64,
    },
  })
  assert.equal(repeatedPreviewUpload.status, 200)
  assert.equal(repeatedPreviewUpload.body.id, secondPreview.body.id)

  const previewDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: worker.body.id,
  })
  assert.deepEqual(
    previewDetails.body.documents.map((item) => item.id),
    [secondPreview.body.id],
  )

  const submitted = await request(port, `/api/reports/${reportId}/submit`, {
    method: 'POST',
    accountId: worker.body.id,
  })
  assert.equal(submitted.status, 200)
  assert.equal(submitted.body.draft.status, 'exported')
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
  assert.deepEqual(
    adminReports.body.map((item) => item.id),
    [reportId],
  )

  const adminDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(adminDetails.status, 200)
  assert.equal(adminDetails.body.photos[0].blobBase64, photoBytes.toString('base64'))

  const photoPreviews = await request(port, `/api/reports/${reportId}/photo-previews`, {
    accountId: admin.body.id,
  })
  assert.equal(photoPreviews.status, 200)
  assert.equal(photoPreviews.body.length, 2)
  assert.equal(photoPreviews.body[0].id, photo.id)
  assert.equal(photoPreviews.body[0].blobBase64, photoBytes.toString('base64'))

  const generatedDocument = await request(port, `/api/reports/${reportId}/documents/generate`, {
    method: 'POST',
    accountId: admin.body.id,
  })
  assert.equal(generatedDocument.status, 201)
  assert.equal(generatedDocument.body.draftId, reportId)
  assert.equal(generatedDocument.body.mimeType, 'application/pdf')
  const generatedDocumentBytes = Buffer.from(generatedDocument.body.blobBase64, 'base64')
  assert.equal(generatedDocumentBytes.subarray(0, 5).toString('ascii'), '%PDF-')
  assert.match(generatedDocumentBytes.toString('latin1'), /\/Font\s*<</)
  assert.equal(
    generatedDocument.body.contentHash,
    createHash('sha256').update(generatedDocumentBytes).digest('hex'),
  )
  const generatedDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(generatedDetails.body.draft.status, 'exported')
  assert.equal(
    generatedDetails.body.documents.some((item) => item.id === generatedDocument.body.id),
    true,
  )

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
  assert.equal(document.body.contentHash, createHash('sha256').update(documentBytes).digest('hex'))
  assert.notEqual(document.body.generatedAt, 1)

  const exportedDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(exportedDetails.body.draft.status, 'exported')
  assert.equal(
    exportedDetails.body.documents.find((item) => item.id === document.body.id)?.blobBase64,
    documentBytes.toString('base64'),
  )

  const database = new DatabaseSync(databasePath, { readOnly: true })
  const photoRow = database
    .prepare('SELECT binary_data, size, template_field_id FROM product_photos WHERE id = ?')
    .get(photo.id)
  const documentRow = database
    .prepare('SELECT binary_data, content_hash FROM generated_documents WHERE id = ?')
    .get(document.body.id)
  const generatedDocumentRow = database
    .prepare('SELECT binary_data, content_hash FROM generated_documents WHERE id = ?')
    .get(generatedDocument.body.id)
  const replacedPreviewRow = database
    .prepare('SELECT deleted_at FROM generated_documents WHERE id = ?')
    .get(firstPreview.body.id)
  const templateRow = database
    .prepare(
      'SELECT translations_json, input_schema_json, render_spec_json FROM document_templates WHERE id = ?',
    )
    .get('document-template-test-flow')

  assert.deepEqual(Buffer.from(photoRow.binary_data), photoBytes)
  assert.equal(photoRow.size, photoBytes.byteLength)
  assert.equal(photoRow.template_field_id, 'field-photo')
  assert.deepEqual(Buffer.from(documentRow.binary_data), documentBytes)
  assert.equal(documentRow.content_hash, document.body.contentHash)
  assert.deepEqual(Buffer.from(generatedDocumentRow.binary_data), generatedDocumentBytes)
  assert.equal(generatedDocumentRow.content_hash, generatedDocument.body.contentHash)
  assert.equal(replacedPreviewRow, undefined)
  assert.equal(JSON.parse(templateRow.input_schema_json).steps[0].id, 'section-main')
  assert.equal(
    JSON.parse(templateRow.input_schema_json).steps[0].fields[0].translations.fa.label,
    'شماره سفارش',
  )
  assert.equal(JSON.parse(templateRow.render_spec_json).sections[0].columns, 2)
  assert.equal(JSON.parse(templateRow.translations_json).en.name, 'Integration template')
  database.close()

  const deleted = await request(port, `/api/reports/${reportId}`, {
    method: 'DELETE',
    accountId: admin.body.id,
  })
  assert.equal(deleted.status, 200)

  const deletedDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(deletedDetails.status, 200)
  assert.equal(deletedDetails.body.draft.status, 'archived')
  assert.equal(deletedDetails.body.photos[0].blobBase64, photoBytes.toString('base64'))
  assert.equal(
    deletedDetails.body.documents.find((item) => item.id === document.body.id)?.blobBase64,
    documentBytes.toString('base64'),
  )

  const workerArchivedDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: worker.body.id,
  })
  assert.equal(workerArchivedDetails.status, 404)

  const archivedReports = await request(port, '/api/reports/archive', {
    accountId: admin.body.id,
  })
  assert.equal(archivedReports.status, 200)
  assert.deepEqual(
    archivedReports.body.map((item) => item.id),
    [reportId],
  )

  const deletedDatabase = new DatabaseSync(databasePath, { readOnly: true })
  const softDeletedReport = deletedDatabase
    .prepare('SELECT status, deleted_at FROM report_drafts WHERE id = ?')
    .get(reportId)
  const softDeletedPhoto = deletedDatabase
    .prepare(
      'SELECT deleted_at, length(binary_data) AS binary_size FROM product_photos WHERE id = ?',
    )
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

  const forbiddenRestore = await request(port, `/api/reports/archive/${reportId}`, {
    method: 'POST',
    accountId: worker.body.id,
  })
  assert.equal(forbiddenRestore.status, 403)

  const restored = await request(port, `/api/reports/archive/${reportId}`, {
    method: 'POST',
    accountId: admin.body.id,
  })
  assert.equal(restored.status, 200)

  const restoredDetails = await request(port, `/api/reports/${reportId}`, {
    accountId: admin.body.id,
  })
  assert.equal(restoredDetails.status, 200)
  assert.equal(restoredDetails.body.draft.status, 'exported')
  assert.equal(restoredDetails.body.photos[0].blobBase64, photoBytes.toString('base64'))
  assert.equal(
    restoredDetails.body.documents.find((item) => item.id === document.body.id)?.blobBase64,
    documentBytes.toString('base64'),
  )

  const restoredDatabase = new DatabaseSync(databasePath, { readOnly: true })
  const restoredReport = restoredDatabase
    .prepare('SELECT status, archived_from_status, deleted_at FROM report_drafts WHERE id = ?')
    .get(reportId)
  assert.equal(restoredReport.status, 'exported')
  assert.equal(restoredReport.archived_from_status, null)
  assert.equal(restoredReport.deleted_at, null)
  assert.equal(
    restoredDatabase.prepare('SELECT deleted_at FROM product_photos WHERE id = ?').get(photo.id)
      .deleted_at,
    null,
  )
  assert.equal(
    restoredDatabase
      .prepare('SELECT deleted_at FROM generated_documents WHERE id = ?')
      .get(document.body.id).deleted_at,
    null,
  )
  restoredDatabase.close()

  const archiveAfterRestore = await request(port, '/api/reports/archive', {
    accountId: admin.body.id,
  })
  assert.equal(
    archiveAfterRestore.body.some((item) => item.id === reportId),
    false,
  )

  const rearchived = await request(port, `/api/reports/${reportId}`, {
    method: 'DELETE',
    accountId: admin.body.id,
  })
  assert.equal(rearchived.status, 200)

  const rearchivedDatabase = new DatabaseSync(databasePath, { readOnly: true })
  const rearchivedReport = rearchivedDatabase
    .prepare('SELECT status, archived_from_status, deleted_at FROM report_drafts WHERE id = ?')
    .get(reportId)
  assert.equal(rearchivedReport.status, 'archived')
  assert.equal(rearchivedReport.archived_from_status, 'exported')
  rearchivedDatabase.close()

  assert.equal(addCalendarMonth(Date.UTC(2026, 0, 31, 12, 30)), Date.UTC(2026, 1, 28, 12, 30))
  assert.equal(addCalendarMonth(Date.UTC(2028, 0, 31, 12, 30)), Date.UTC(2028, 1, 29, 12, 30))

  const archiveDeletionAt = addCalendarMonth(rearchivedReport.deleted_at)
  const purgedEarly = await purgeExpiredArchivedReportsNow(archiveDeletionAt - 1)
  assert.equal(purgedEarly, 0)

  const purgedAfterRetention = await purgeExpiredArchivedReportsNow(archiveDeletionAt)
  assert.equal(purgedAfterRetention, 1)

  const purgedDatabase = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal(
    purgedDatabase.prepare('SELECT id FROM report_drafts WHERE id = ?').get(reportId),
    undefined,
  )
  assert.equal(
    purgedDatabase.prepare('SELECT id FROM product_photos WHERE draft_id = ?').get(reportId),
    undefined,
  )
  assert.equal(
    purgedDatabase.prepare('SELECT id FROM generated_documents WHERE draft_id = ?').get(reportId),
    undefined,
  )
  purgedDatabase.close()

  const archivedControlReport = await request(port, `/api/reports/${otherReportId}`, {
    method: 'DELETE',
    accountId: otherWorker.body.id,
  })
  assert.equal(archivedControlReport.status, 200)

  const manuallyDeletedReportId = 'report-manual-archive-delete'
  const manuallyDeletedPhoto = {
    ...photo,
    id: 'photo-manual-archive-delete',
    draftId: manuallyDeletedReportId,
  }
  const manuallyDeletedDraft = createDraft(manuallyDeletedReportId, worker.body.id)
  const savedForManualDeletion = await request(port, `/api/reports/${manuallyDeletedReportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft: {
        ...manuallyDeletedDraft,
        status: 'ready',
        mainInfo: {
          ...manuallyDeletedDraft.mainInfo,
          orderNumber: 'MANUAL-DELETE',
          placeOfSurvey: 'Тестовый склад',
        },
      },
      photos: [manuallyDeletedPhoto],
    },
  })
  assert.equal(savedForManualDeletion.status, 200)

  const archivedForManualDeletion = await request(port, `/api/reports/${manuallyDeletedReportId}`, {
    method: 'DELETE',
    accountId: admin.body.id,
  })
  assert.equal(archivedForManualDeletion.status, 200)

  const permanentlyDeleted = await request(
    port,
    `/api/reports/archive/${manuallyDeletedReportId}`,
    {
      method: 'DELETE',
      accountId: admin.body.id,
    },
  )
  assert.equal(permanentlyDeleted.status, 200)

  const afterManualDeletionDatabase = new DatabaseSync(databasePath, { readOnly: true })
  assert.equal(
    afterManualDeletionDatabase
      .prepare('SELECT id FROM report_drafts WHERE id = ?')
      .get(manuallyDeletedReportId),
    undefined,
  )
  assert.equal(
    afterManualDeletionDatabase
      .prepare('SELECT id FROM product_photos WHERE draft_id = ?')
      .get(manuallyDeletedReportId),
    undefined,
  )
  afterManualDeletionDatabase.close()

  const archiveAfterManualDeletion = await request(port, '/api/reports/archive', {
    accountId: admin.body.id,
  })
  assert.deepEqual(
    archiveAfterManualDeletion.body.map((item) => item.id),
    [otherReportId],
  )

  const photoOnlyTemplate = createPhotoOnlyTemplate()
  const savedPhotoOnlyTemplate = await request(
    port,
    `/api/document-templates/${photoOnlyTemplate.id}`,
    {
      method: 'PUT',
      accountId: admin.body.id,
      body: photoOnlyTemplate,
    },
  )
  assert.equal(savedPhotoOnlyTemplate.status, 201)

  const photoOnlyReportId = 'report-photo-only'
  const photoOnlyPhoto = {
    ...photo,
    id: 'photo-only-photo',
    draftId: photoOnlyReportId,
    templateFieldId: 'photo-only-field',
  }
  const photoOnlyDraft = createDraft(photoOnlyReportId, worker.body.id)
  const savedPhotoOnlyReport = await request(port, `/api/reports/${photoOnlyReportId}`, {
    method: 'PUT',
    accountId: worker.body.id,
    body: {
      draft: { ...photoOnlyDraft, templateId: photoOnlyTemplate.id },
      photos: [photoOnlyPhoto],
    },
  })
  assert.equal(savedPhotoOnlyReport.status, 200)
  assert.equal(
    savedPhotoOnlyReport.body.draft.reportNumber,
    'TEST-ORDER-20260817-3',
  )
  assert.equal(savedPhotoOnlyReport.body.draft.productId, '')
  assert.equal(savedPhotoOnlyReport.body.draft.productName, photoOnlyTemplate.name)
  assert.equal(savedPhotoOnlyReport.body.draft.mainInfo.productName, photoOnlyTemplate.name)

  const photoOnlyPdf = await request(port, `/api/reports/${photoOnlyReportId}/documents/generate`, {
    method: 'POST',
    accountId: worker.body.id,
  })
  assert.equal(photoOnlyPdf.status, 201)

  const deletedPhotoOnlyDraft = await request(port, `/api/reports/${photoOnlyReportId}`, {
    method: 'DELETE',
    accountId: worker.body.id,
  })
  assert.equal(deletedPhotoOnlyDraft.status, 200)

  const deletedActiveTemplate = await request(
    port,
    '/api/document-templates/document-template-test-flow',
    {
      method: 'DELETE',
      accountId: admin.body.id,
    },
  )
  assert.equal(deletedActiveTemplate.status, 200)

  const deletedActiveTemplateDetails = await request(
    port,
    '/api/document-templates/document-template-test-flow',
    { accountId: admin.body.id },
  )
  assert.equal(deletedActiveTemplateDetails.status, 404)

  const templatesAfterDeletion = await request(port, '/api/document-templates', {
    accountId: admin.body.id,
  })
  assert.equal(
    templatesAfterDeletion.body.some((template) => template.id === 'document-template-test-flow'),
    false,
  )
})

function createTemplate() {
  const now = Date.now()
  const sections = [
    {
      id: 'section-main',
      title: 'Основное',
      description: '',
      translations: {
        ru: { title: 'Основное', description: '' },
        en: { title: 'Main', description: '' },
        fa: { title: 'اصلی', description: '' },
      },
      sortOrder: 1,
      fields: [
        {
          ...createTemplateField('field-order', 'mainInfo.orderNumber', 'Номер заказа', 1),
          translations: {
            ru: {
              label: 'Номер заказа',
              placeholder: 'Введите номер заказа',
              helpText: 'Номер из документа поставщика',
            },
            en: {
              label: 'Order number',
              placeholder: 'Enter the order number',
              helpText: 'Number from the supplier document',
            },
            fa: {
              label: 'شماره سفارش',
              placeholder: 'شماره سفارش را وارد کنید',
              helpText: 'شماره از سند تأمین‌کننده',
            },
          },
        },
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
        {
          ...createTemplateField(
            'field-inspection-matrix',
            'custom.inspectionMatrix',
            'Измерения',
            7,
            'table',
            false,
          ),
          tableColumns: [
            { id: 'result', label: 'Результат', type: 'number' },
            { id: 'accepted', label: 'Принято', type: 'checkbox' },
          ],
          tableRows: [{ id: 'row-temperature', label: 'Температура' }],
        },
      ],
    },
  ]

  return {
    id: 'document-template-test-flow',
    name: 'Интеграционный макет',
    description: 'Интеграционный макет',
    translations: {
      ru: { name: 'Интеграционный макет', description: 'Интеграционный макет' },
      en: { name: 'Integration template', description: 'Integration template' },
      fa: { name: 'قالب یکپارچه', description: 'قالب یکپارچه' },
    },
    status: 'active',
    inputSchema: { version: 1, steps: sections },
    renderSpec: {
      version: 1,
      mode: 'flow',
      layout: 'branded',
      pageSize: 'A4',
      documentTitle: 'Интеграционный отчёт',
      sections: [
        {
          id: 'render-section-main',
          inputSectionId: 'section-main',
          title: 'Основное',
          pageBreakBefore: false,
          columns: 2,
          showDescription: true,
          hidden: false,
          fields: sections[0].fields.map((field) => ({
            dataPath: field.dataPath,
            label: field.label,
            width: field.width,
            display: field.type === 'table' ? 'table' : 'value',
            hideWhenEmpty: false,
            hidden: false,
          })),
        },
      ],
    },
    sections,
    createdByAccountId: 'system',
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  }
}

function createPhotoOnlyTemplate() {
  const template = createTemplate()
  const photoField = createTemplateField(
    'photo-only-field',
    'photos',
    'Фотография',
    1,
    'photo',
    true,
  )
  const sections = [
    {
      id: 'photo-only-section',
      title: 'Фото',
      description: '',
      sortOrder: 1,
      fields: [photoField],
    },
  ]

  return {
    ...template,
    id: 'document-template-photo-only',
    name: 'Фотоотчёт',
    createdByAccountId: 'account-admin',
    inputSchema: { version: 1, steps: sections },
    sections,
    renderSpec: {
      ...template.renderSpec,
      documentTitle: 'Фотоотчёт',
      sections: [
        {
          id: 'photo-only-render-section',
          inputSectionId: 'photo-only-section',
          title: 'Фото',
          pageBreakBefore: false,
          columns: 1,
          showDescription: false,
          hidden: false,
          fields: [
            {
              dataPath: 'photos',
              label: 'Фотография',
              width: 'full',
              display: 'value',
              hideWhenEmpty: false,
              hidden: false,
            },
          ],
        },
      ],
    },
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
    templateId: 'document-template-test-flow',
    workerAccountId,
    productId: 'sweet-red-pepper',
    productName: 'Перец красный',
    inspectorName: 'Инспектор',
    mainInfo: {
      orderNumber: 'TEST-ORDER',
      surveyDate: '2026-08-17',
      placeOfSurvey: '',
      productName: 'Перец красный',
    },
    temperatureInfo: {},
    inspectionResults: {},
    descriptions: {},
    expertConclusion: '',
    customFieldValues: {
      'custom.inspectorSignature': 'Подставное имя',
      'custom.inspectionMatrix': {
        'row-temperature': { result: 6.2, accepted: true },
      },
    },
    sampling: { palletCount: 1, sampleCount: 1, seed: '42', points: [] },
    signatures: {},
    photoIds: ['untrusted-photo-id'],
    createdAt: 1,
    updatedAt: 1,
  }
}

async function request(port, path, options = {}) {
  const headers = { ...options.headers }

  if (options.accountId) {
    headers.Cookie = sessionCookies.get(options.accountId) ?? ''
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
  const setCookie = response.headers.get('set-cookie')

  if (setCookie && body?.id) {
    sessionCookies.set(body.id, setCookie.split(';', 1)[0])
  }

  return { status: response.status, body }
}

function login(port, loginNumber) {
  return request(port, '/api/auth/login', {
    method: 'POST',
    body: { loginNumber, password: testPassword },
  })
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

function addCalendarMonth(timestamp) {
  const date = new Date(timestamp)
  const originalDay = date.getUTCDate()

  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 1)
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))

  return date.getTime()
}
