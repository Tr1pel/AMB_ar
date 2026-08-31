import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import argon2 from 'argon2'

import { createServerDatabase } from './database.mjs'
import { generateTemplateReportPdf } from './branded-report-pdf.mjs'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(SERVER_DIR, '..')
const DIST_DIR = join(PROJECT_DIR, 'dist')
const DB_PATH = process.env.AMB_AR_DATABASE_PATH
  ? resolve(process.env.AMB_AR_DATABASE_PATH)
  : join(SERVER_DIR, 'amb-ar.sqlite')
const PORT = Number(process.env.AMB_AR_API_PORT ?? 3001)
const HOST = process.env.AMB_AR_HOST?.trim() || '127.0.0.1'
const WAREHOUSE_CODE = normalizeWarehouseCode(process.env.AMB_AR_WAREHOUSE_CODE ?? 'MSC01')
const REPORT_NUMBER_TIME_ZONE = process.env.AMB_AR_REPORT_TIME_ZONE?.trim() || 'Europe/Moscow'
const SESSION_COOKIE_NAME = 'amb_ar_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const INITIAL_ACCOUNT_PASSWORD = process.env.AMB_AR_INITIAL_PASSWORD?.trim() || 'AmbAr-2026!'
const ALLOWED_ORIGIN = process.env.AMB_AR_ALLOWED_ORIGIN?.trim() || 'http://127.0.0.1:5173'
const MAX_BODY_SIZE_BYTES = 100 * 1024 * 1024
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024
const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024
const MAX_PHOTOS_PER_REPORT = 100
const ARCHIVE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000
const WORKER_REPORT_STATUSES = new Set(['draft', 'ready'])
const PHOTO_CATEGORIES = new Set([
  'vehicle',
  'temperature',
  'facade',
  'selection',
  'goods',
  'destructiveTesting',
  'caliber',
  'waste',
  'notStandard',
])

const serverDatabase = createServerDatabase(DB_PATH, {
  warehouseCode: WAREHOUSE_CODE,
  reportNumberTimeZone: REPORT_NUMBER_TIME_ZONE,
})
const {
  readDb,
  writeDb,
  writeDbReplacingGeneratedDocuments,
  purgeExpiredArchivedReports,
  permanentlyDeleteArchivedReport,
  allocateReportSequence,
  createAuthSession,
  findAuthSession,
  deleteAuthSession,
  deleteAccountAuthSessions,
  deleteAccountAuthSessionsExcept,
  purgeExpiredAuthSessions,
} = serverDatabase
let mutationTail = Promise.resolve()

await purgeExpiredArchivedReportsNow()
await ensureSeeds()

const archivePurgeTimer = setInterval(() => {
  void purgeExpiredArchivedReportsNow().catch((error) => {
    console.error('Не удалось очистить просроченные архивные отчеты', error)
  })
}, ARCHIVE_PURGE_INTERVAL_MS)
archivePurgeTimer.unref()

export const server = createServer(async (request, response) => {
  setCorsHeaders(request, response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  try {
    if (requestUrl.pathname === '/api/health') {
      sendJson(response, { ok: true, database: 'sqlite' })
      return
    }

    if (requestUrl.pathname === '/api/bootstrap' && request.method === 'POST') {
      await ensureSeeds()
      sendJson(response, { ok: true })
      return
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      const executeRequest = async () => {
        const db = readDb(getReportResourceId(requestUrl.pathname))
        const handled = await handleApiRequest(request, response, requestUrl, db)

        if (!handled) {
          sendJson(response, { message: 'Not found' }, 404)
        }
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        await mutationTail
        await executeRequest()
      } else {
        await serializeMutation(executeRequest)
      }

      return
    }

    await serveStaticFile(requestUrl.pathname, response)
  } catch (error) {
    const status = Number(error?.statusCode ?? 500)
    const message = error instanceof Error ? error.message : 'Server error'

    if (status >= 500) {
      console.error(error)
    }

    sendJson(response, { message }, status)
  }
})

server.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

server.listen(PORT, HOST, () => {
  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : PORT

  console.log(`AMB_AR server: http://${HOST}:${boundPort}`)
  console.log(`SQLite database: ${DB_PATH}`)
})

export async function closeServer() {
  clearInterval(archivePurgeTimer)

  if (server.listening) {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    })
  }

  await mutationTail
  serverDatabase.close()
}

export async function purgeExpiredArchivedReportsNow(now = Date.now()) {
  return serializeMutation(async () => purgeExpiredArchivedReports(now))
}

async function handleApiRequest(request, response, requestUrl, db) {
  const { pathname } = requestUrl
  const method = request.method ?? 'GET'

  if (pathname === '/api/auth/login' && method === 'POST') {
    const input = await readJsonBody(request)
    const loginNumber = String(input.loginNumber ?? '').trim()
    const password = String(input.password ?? '')
    const account = db.accounts.find(
      (item) => item.loginNumber === loginNumber && item.isActive && isVisibleEntity(item),
    )

    if (!account?.passwordHash || !(await argon2.verify(account.passwordHash, password))) {
      throw createHttpError(401, 'Неверный номер сотрудника или пароль')
    }

    startAccountSession(response, account.id)
    sendJson(response, toPublicAccount(account))
    return true
  }

  if (pathname === '/api/auth/demo' && method === 'POST') {
    const input = await readJsonBody(request)
    const role = input.role === 'admin' ? 'admin' : 'worker'
    const account = db.accounts.find(
      (item) => item.role === role && item.isActive && isVisibleEntity(item),
    )

    if (!account) {
      throw createHttpError(404, 'Демо-аккаунт не найден')
    }

    startAccountSession(response, account.id)
    sendJson(response, toPublicAccount(account))
    return true
  }

  if (pathname === '/api/auth/session' && method === 'GET') {
    sendJson(response, toPublicAccount(requireAccount(request, db)))
    return true
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = getSessionToken(request)

    if (token) {
      deleteAuthSession(hashSessionToken(token))
    }

    clearSessionCookie(response)
    sendJson(response, { ok: true })
    return true
  }

  if (pathname === '/api/accounts' && method === 'GET') {
    requireAdmin(request, db)
    sendJson(response, db.accounts.filter(isVisibleEntity).map(toPublicAccount))
    return true
  }

  if (pathname === '/api/accounts/generate-login-number' && method === 'POST') {
    requireAdmin(request, db)
    const input = await readJsonBody(request)
    const role = input.role === 'admin' ? 'admin' : input.role === 'worker' ? 'worker' : null

    if (!role) {
      throw createHttpError(400, 'Выберите роль для генерации номера')
    }

    const prefix = role === 'admin' ? '1' : '2'
    const loginNumberPattern = new RegExp(`^${prefix}\\d{3}$`)
    const numericLoginNumbers = db.accounts
      .filter(isVisibleEntity)
      .map((account) => account.loginNumber)
      .filter((loginNumber) => loginNumberPattern.test(loginNumber))
      .map((loginNumber) => Number(loginNumber))
      .filter(Number.isSafeInteger)
    const nextNumber = Math.max(Number(`${prefix}000`), ...numericLoginNumbers) + 1

    if (nextNumber > Number(`${prefix}999`)) {
      throw createHttpError(409, 'Свободные номера этой роли закончились')
    }

    sendJson(response, { loginNumber: String(nextNumber) })
    return true
  }

  if (pathname === '/api/accounts' && method === 'POST') {
    const currentAccount = requireAdmin(request, db)
    const input = await readJsonBody(request)
    const loginNumber = String(input.loginNumber ?? '').trim()
    const fullName = String(input.fullName ?? '').trim()
    const password = String(input.password ?? '')

    if (!loginNumber || !fullName) {
      throw createHttpError(400, 'Укажите номер аккаунта и ФИО')
    }

    ensureUniqueLoginNumber(db, loginNumber, input.id)
    const existing = input.id ? db.accounts.find((item) => item.id === input.id) : undefined

    if (input.id && !existing) {
      throw createHttpError(404, 'Аккаунт не найден')
    }

    if (!existing && !password) {
      throw createHttpError(400, 'Укажите или сгенерируйте пароль')
    }

    if (password) {
      validatePassword(password)
    }

    const now = Date.now()
    const role = input.role === 'admin' ? 'admin' : 'worker'
    const isActive = Boolean(input.isActive ?? existing?.isActive ?? true)

    ensureCanChangeAdmin(db, existing, { role, isActive }, currentAccount.id)

    const account = stampEntity({
      ...existing,
      id: existing?.id ?? createEntityId('account'),
      loginNumber,
      passwordHash: password
        ? await argon2.hash(password, { type: argon2.argon2id })
        : existing?.passwordHash,
      fullName,
      role,
      isActive,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      _deletedAt: undefined,
    })

    db.accounts = upsert(db.accounts, account)
    writeDb(db)

    if (password && existing) {
      deleteAccountAuthSessionsExcept(account.id, hashSessionToken(getSessionToken(request)))
    }

    sendJson(response, toPublicAccount(account), existing ? 200 : 201)
    return true
  }

  const accountId = matchId(pathname, '/api/accounts/')

  if (accountId && method === 'GET') {
    const currentAccount = requireAccount(request, db)
    const account = db.accounts.find(
      (item) => item.id === accountId && item.isActive && isVisibleEntity(item),
    )

    if (account && currentAccount.id !== account.id && currentAccount.role !== 'admin') {
      throw createHttpError(403, 'Нет доступа к этому аккаунту')
    }

    sendJson(response, account ? toPublicAccount(account) : null, account ? 200 : 404)
    return true
  }

  if (accountId && method === 'DELETE') {
    const currentAccount = requireAdmin(request, db)

    if (currentAccount.id === accountId) {
      throw createHttpError(400, 'Нельзя удалить аккаунт, под которым выполнен вход')
    }

    ensureCanDeleteAccount(db, accountId)
    const account = db.accounts.find((item) => item.id === accountId)

    if (account) {
      const deletedAt = Date.now()
      db.accounts = upsert(
        db.accounts,
        stampEntity({ ...account, isActive: false, updatedAt: deletedAt, _deletedAt: deletedAt }),
      )
      writeDb(db)
      deleteAccountAuthSessions(accountId)
    }

    sendJson(response, { ok: true })
    return true
  }

  if (pathname === '/api/template-options' && method === 'GET') {
    sendJson(
      response,
      db.reportTemplateOptions
        .filter(isVisibleEntity)
        .sort((first, second) => first.sortOrder - second.sortOrder),
    )
    return true
  }

  if (pathname === '/api/template-options' && method === 'POST') {
    requireAdmin(request, db)
    const input = await readJsonBody(request)
    const label = String(input.label ?? '').trim()

    if (!input.field || !label) {
      throw createHttpError(400, 'Укажите поле и название варианта')
    }

    const existing = input.id
      ? db.reportTemplateOptions.find((option) => option.id === input.id)
      : undefined
    const fieldOptions = db.reportTemplateOptions.filter(
      (option) => option.field === input.field && isVisibleEntity(option),
    )
    const now = Date.now()
    const option = stampEntity({
      ...existing,
      id: existing?.id ?? createEntityId('template-option'),
      field: input.field,
      label,
      value: String(input.value || label).trim(),
      category: String(input.category ?? '').trim(),
      sortOrder: existing?.sortOrder ?? fieldOptions.length + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      _deletedAt: undefined,
    })

    db.reportTemplateOptions = upsert(db.reportTemplateOptions, option)
    writeDb(db)
    sendJson(response, option, existing ? 200 : 201)
    return true
  }

  const templateOptionId = matchId(pathname, '/api/template-options/')

  if (templateOptionId && method === 'DELETE') {
    requireAdmin(request, db)
    const option = db.reportTemplateOptions.find((item) => item.id === templateOptionId)

    if (option) {
      const deletedAt = Date.now()
      db.reportTemplateOptions = upsert(
        db.reportTemplateOptions,
        stampEntity({ ...option, updatedAt: deletedAt, _deletedAt: deletedAt }),
      )
      writeDb(db)
    }

    sendJson(response, { ok: true })
    return true
  }

  if (pathname === '/api/document-templates' && method === 'GET') {
    const templates = db.documentTemplates.filter(isVisibleEntity).sort(sortTemplates)
    sendJson(response, templates)
    return true
  }

  if (pathname === '/api/document-templates/active' && method === 'GET') {
    const activeTemplate =
      db.documentTemplates
        .filter((template) => template.status === 'active' && isVisibleEntity(template))
        .sort((first, second) => (second.publishedAt ?? 0) - (first.publishedAt ?? 0))[0] ?? null

    sendJson(response, activeTemplate, activeTemplate ? 200 : 404)
    return true
  }

  const documentTemplateId = matchId(pathname, '/api/document-templates/')

  if (documentTemplateId && method === 'GET') {
    const template = db.documentTemplates.find(
      (item) => item.id === documentTemplateId && isVisibleEntity(item),
    )
    sendJson(response, template ?? null, template ? 200 : 404)
    return true
  }

  if (documentTemplateId && method === 'PUT') {
    const admin = requireAdmin(request, db)
    const input = await readJsonBody(request)
    const existing = db.documentTemplates.find((item) => item.id === documentTemplateId)
    const now = Date.now()
    const status = input.status ?? existing?.status ?? 'draft'

    if (!['draft', 'active', 'archived'].includes(status)) {
      throw createHttpError(400, 'Некорректный статус макета')
    }

    const inputSchema = validateInputSchema(
      input.inputSchema ??
        existing?.inputSchema ?? {
          version: 1,
          steps: input.sections ?? existing?.sections,
        },
    )
    const renderSpec = validateRenderSpec(input.renderSpec ?? existing?.renderSpec, inputSchema)
    const sections = inputSchema.steps
    const translations = input.translations ?? existing?.translations
    validateTemplateTranslations(translations)

    if (status === 'active' && !sections.some((section) => section.fields.length > 0)) {
      throw createHttpError(400, 'Опубликованный макет должен содержать хотя бы одно поле')
    }

    const template = stampEntity({
      ...existing,
      id: documentTemplateId,
      name: normalizeRequiredText(input.name ?? existing?.name, 'Название макета'),
      description: String(input.description ?? existing?.description ?? '').trim(),
      translations: translations === undefined ? undefined : structuredClone(translations),
      status,
      inputSchema,
      renderSpec,
      sections,
      createdByAccountId: existing?.createdByAccountId ?? admin.id,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
      ...(status === 'active'
        ? { publishedAt: input.publishedAt ?? existing?.publishedAt ?? now }
        : existing?.publishedAt === undefined
          ? {}
          : { publishedAt: existing.publishedAt }),
      _deletedAt: undefined,
    })

    db.documentTemplates = upsert(db.documentTemplates, template)
    writeDb(db)
    sendJson(response, template, existing ? 200 : 201)
    return true
  }

  if (documentTemplateId && method === 'DELETE') {
    requireAdmin(request, db)
    const template = db.documentTemplates.find(
      (item) => item.id === documentTemplateId && isVisibleEntity(item),
    )

    if (template) {
      const deletedAt = Date.now()
      db.documentTemplates = upsert(
        db.documentTemplates,
        stampEntity({ ...template, updatedAt: deletedAt, _deletedAt: deletedAt }),
      )
      writeDb(db)
    }

    sendJson(response, { ok: true })
    return true
  }

  if (pathname === '/api/reports' && method === 'GET') {
    requireAdmin(request, db)
    sendJson(
      response,
      visibleReports(db).filter(
        (report) => report.status === 'ready' || report.status === 'exported',
      ),
    )
    return true
  }

  if (pathname === '/api/reports/archive' && method === 'GET') {
    requireAdmin(request, db)
    sendJson(
      response,
      db.reportDrafts
        .filter((report) => report.status === 'archived' && report._deletedAt !== undefined)
        .sort((first, second) => second._deletedAt - first._deletedAt),
    )
    return true
  }

  const archivedReportMatch = pathname.match(/^\/api\/reports\/archive\/([^/]+)$/)

  if (archivedReportMatch && method === 'POST') {
    requireAdmin(request, db)
    const archivedReportId = decodeURIComponent(archivedReportMatch[1])
    const report = db.reportDrafts.find(
      (item) =>
        item.id === archivedReportId && item.status === 'archived' && item._deletedAt !== undefined,
    )

    if (!report) {
      throw createHttpError(404, 'Архивный отчет не найден')
    }

    const restoredAt = Date.now()
    const restoredStatus =
      report.archivedFromStatus ??
      (db.generatedDocuments.some((document) => document.draftId === archivedReportId)
        ? 'exported'
        : 'ready')

    db.reportDrafts = upsert(
      db.reportDrafts,
      stampEntity({
        ...report,
        status: restoredStatus,
        archivedFromStatus: undefined,
        updatedAt: restoredAt,
        _deletedAt: undefined,
      }),
    )
    const reportPhotoIds = new Set(report.photoIds ?? [])
    db.productPhotos = db.productPhotos.map((photo) =>
      photo.draftId === archivedReportId && reportPhotoIds.has(photo.id)
        ? stampEntity({ ...photo, _deletedAt: undefined })
        : photo,
    )
    db.generatedDocuments = db.generatedDocuments.map((document) =>
      document.draftId === archivedReportId
        ? stampEntity({ ...document, _deletedAt: undefined })
        : document,
    )
    writeDb(db)
    sendJson(response, { ok: true })
    return true
  }

  if (archivedReportMatch && method === 'DELETE') {
    requireAdmin(request, db)
    const archivedReportId = decodeURIComponent(archivedReportMatch[1])
    const report = db.reportDrafts.find(
      (item) =>
        item.id === archivedReportId && item.status === 'archived' && item._deletedAt !== undefined,
    )

    if (!report) {
      throw createHttpError(404, 'Архивный отчет не найден')
    }

    permanentlyDeleteArchivedReport(archivedReportId)
    sendJson(response, { ok: true })
    return true
  }

  if (pathname === '/api/reports/mine' && method === 'GET') {
    const account = requireAccount(request, db)
    sendJson(
      response,
      visibleReports(db).filter((report) => report.workerAccountId === account.id),
    )
    return true
  }

  const generatedDocumentMatch = pathname.match(/^\/api\/reports\/([^/]+)\/documents\/generate$/)

  if (generatedDocumentMatch && method === 'POST') {
    const reportId = decodeURIComponent(generatedDocumentMatch[1])
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account)

    if (draft.status !== 'draft' && draft.status !== 'ready' && draft.status !== 'exported') {
      throw createHttpError(409, 'Для этого отчёта нельзя сформировать PDF')
    }

    if (draft.status === 'draft') {
      if (account.role !== 'worker') {
        throw createHttpError(403, 'Предварительный PDF доступен только инспектору')
      }

      const reportPhotos = db.productPhotos.filter(
        (photo) => photo.draftId === reportId && isVisibleEntity(photo),
      )
      validateReadyReport(draft, reportPhotos)
    }

    const template =
      draft.templateSnapshot ??
      db.documentTemplates.find((item) => item.id === draft.templateId && isVisibleEntity(item)) ??
      db.documentTemplates.find((item) => item.status === 'active' && isVisibleEntity(item))

    if (!template) {
      throw createHttpError(409, 'Макет отчёта не найден')
    }

    const photos = db.productPhotos
      .filter((photo) => photo.draftId === reportId && isVisibleEntity(photo))
      .sort((first, second) => first.sortOrder - second.sortOrder)
    const binary = await generateTemplateReportPdf({ report: draft, photos, template })

    if (binary.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
      throw createHttpError(413, 'Сформированный PDF-файл слишком большой')
    }

    const generatedAt = Date.now()
    const document = stampEntity({
      id: createEntityId('document'),
      draftId: reportId,
      fileName: createGeneratedPdfFileName(draft, generatedAt),
      mimeType: 'application/pdf',
      blobBase64: binary.toString('base64'),
      generatedAt,
      contentHash: createHash('sha256').update(binary).digest('hex'),
      _deletedAt: undefined,
    })
    db.generatedDocuments = db.generatedDocuments.filter(
      (existingDocument) => existingDocument.draftId !== reportId,
    )

    db.generatedDocuments = upsert(db.generatedDocuments, document)

    if (draft.status !== 'draft') {
      db.reportDrafts = upsert(
        db.reportDrafts,
        stampEntity({
          ...draft,
          status: 'exported',
          updatedAt: Date.now(),
        }),
      )
    }

    writeDbReplacingGeneratedDocuments(db, reportId)
    sendJson(response, document, 201)
    return true
  }

  const submitReportMatch = pathname.match(/^\/api\/reports\/([^/]+)\/submit$/)

  if (submitReportMatch && method === 'POST') {
    const reportId = decodeURIComponent(submitReportMatch[1])
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account)

    if (account.role !== 'worker') {
      throw createHttpError(403, 'Отправить отчёт может только инспектор')
    }

    if (draft.status !== 'draft') {
      throw createHttpError(409, 'Отчёт уже отправлен администратору')
    }

    const photos = db.productPhotos
      .filter((photo) => photo.draftId === reportId && isVisibleEntity(photo))
      .sort((first, second) => first.sortOrder - second.sortOrder)
    const documents = db.generatedDocuments
      .filter((document) => document.draftId === reportId && isVisibleEntity(document))
      .sort((first, second) => first.generatedAt - second.generatedAt)
    const latestDocument = documents.at(-1)

    validateReadyReport(draft, photos)

    if (!latestDocument || latestDocument.generatedAt < draft.updatedAt) {
      throw createHttpError(409, 'Сначала сформируйте и проверьте актуальный PDF')
    }

    const submittedDraft = stampEntity({
      ...draft,
      status: 'exported',
      updatedAt: Date.now(),
    })

    db.reportDrafts = upsert(db.reportDrafts, submittedDraft)
    writeDb(db)
    sendJson(response, {
      draft: submittedDraft,
      photos,
      documents,
    })
    return true
  }

  const documentMatch = pathname.match(/^\/api\/reports\/([^/]+)\/documents$/)

  if (documentMatch && method === 'POST') {
    const reportId = decodeURIComponent(documentMatch[1])
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account)
    const input = await readJsonBody(request)

    if (draft.status !== 'draft' && draft.status !== 'ready' && draft.status !== 'exported') {
      throw createHttpError(409, 'Для этого отчёта нельзя сохранить PDF')
    }

    const documentId = normalizeEntityId(input.id, 'Идентификатор документа')
    const existingDocument = db.generatedDocuments.find((item) => item.id === documentId)

    if (!input.blobBase64) {
      throw createHttpError(400, 'Документ и его содержимое обязательны')
    }

    const binary = decodeBase64(input.blobBase64, MAX_DOCUMENT_SIZE_BYTES, 'Документ')
    const mimeType = String(input.mimeType ?? '')
      .trim()
      .toLowerCase()

    if (mimeType !== 'application/pdf') {
      throw createHttpError(400, 'Поддерживаются только PDF-документы')
    }

    const contentHash = createHash('sha256').update(binary).digest('hex')

    if (existingDocument) {
      if (existingDocument.draftId === reportId && existingDocument.contentHash === contentHash) {
        sendJson(response, existingDocument)
        return true
      }

      throw createHttpError(409, 'Документ с таким идентификатором уже существует')
    }

    const document = stampEntity({
      id: documentId,
      draftId: reportId,
      fileName: normalizeRequiredText(input.fileName, 'Имя файла'),
      mimeType,
      blobBase64: input.blobBase64,
      generatedAt: Date.now(),
      contentHash,
      _deletedAt: undefined,
    })
    db.generatedDocuments = upsert(db.generatedDocuments, document)

    if (draft.status !== 'draft') {
      db.reportDrafts = upsert(
        db.reportDrafts,
        stampEntity({
          ...draft,
          status: 'exported',
          updatedAt: Date.now(),
        }),
      )
    }

    writeDb(db)
    sendJson(response, document, 201)
    return true
  }

  const photoPreviewsMatch = pathname.match(/^\/api\/reports\/([^/]+)\/photo-previews$/)

  if (photoPreviewsMatch && method === 'GET') {
    const reportId = decodeURIComponent(photoPreviewsMatch[1])
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account, account.role === 'admin')
    const includeArchivedPhotos = account.role === 'admin' && draft.status === 'archived'

    sendJson(
      response,
      db.productPhotos
        .filter(
          (photo) =>
            photo.draftId === reportId && (includeArchivedPhotos || isVisibleEntity(photo)),
        )
        .sort((first, second) => first.sortOrder - second.sortOrder)
        .slice(0, 3),
    )
    return true
  }

  const reportId = matchId(pathname, '/api/reports/')

  if (reportId && method === 'GET') {
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account, account.role === 'admin')
    const includeArchivedResources = account.role === 'admin' && draft.status === 'archived'
    sendJson(response, {
      draft,
      photos: db.productPhotos
        .filter(
          (photo) =>
            photo.draftId === reportId && (includeArchivedResources || isVisibleEntity(photo)),
        )
        .sort((first, second) => first.sortOrder - second.sortOrder),
      documents: db.generatedDocuments
        .filter(
          (document) =>
            document.draftId === reportId &&
            (includeArchivedResources || isVisibleEntity(document)),
        )
        .sort((first, second) => first.generatedAt - second.generatedAt),
    })
    return true
  }

  if (reportId && method === 'PUT') {
    const account = requireAccount(request, db)
    const input = await readJsonBody(request)
    const incomingDraft = input.draft

    if (!incomingDraft || incomingDraft.id !== reportId) {
      throw createHttpError(400, 'Некорректный отчет')
    }

    normalizeEntityId(reportId, 'Идентификатор отчета')

    if (account.role !== 'worker') {
      throw createHttpError(403, 'Отчеты создаются и редактируются только работниками')
    }

    const existingDraft = db.reportDrafts.find((item) => item.id === reportId)

    if (existingDraft?._deletedAt !== undefined) {
      throw createHttpError(404, 'Отчет не найден')
    }

    if (existingDraft && existingDraft.workerAccountId !== account.id) {
      throw createHttpError(403, 'Нет доступа к этому отчету')
    }

    if (incomingDraft.workerAccountId !== account.id) {
      throw createHttpError(403, 'Нельзя изменить владельца отчета')
    }

    if (existingDraft && existingDraft.status !== 'draft') {
      throw createHttpError(409, 'Отправленный отчет нельзя редактировать')
    }

    const status = String(incomingDraft.status ?? 'draft')

    if (!WORKER_REPORT_STATUSES.has(status)) {
      throw createHttpError(400, 'Работник может сохранить только черновик или отправленный отчет')
    }

    const template = resolveReportTemplate(db, incomingDraft.templateId, existingDraft)
    const templatePhotoFieldIds = getTemplatePhotoFieldIds(template)
    const repeatingPhotoBlockIds = getRepeatingPhotoBlockIds(
      template,
      incomingDraft.customFieldValues,
    )
    const incomingPhotos = Array.isArray(input.photos) ? input.photos : []

    if (incomingPhotos.length > MAX_PHOTOS_PER_REPORT) {
      throw createHttpError(400, `В одном отчете может быть не более ${MAX_PHOTOS_PER_REPORT} фото`)
    }

    const normalizedPhotos = incomingPhotos.map((photo, index) =>
      normalizePhotoInput(
        photo,
        index,
        reportId,
        db.productPhotos,
        templatePhotoFieldIds,
        repeatingPhotoBlockIds,
      ),
    )
    const incomingPhotoIds = new Set(normalizedPhotos.map((photo) => photo.id))

    if (incomingPhotoIds.size !== normalizedPhotos.length) {
      throw createHttpError(400, 'Идентификаторы фотографий не должны повторяться')
    }

    const deletedAt = Date.now()

    db.productPhotos = db.productPhotos.map((photo) =>
      photo.draftId === reportId && isVisibleEntity(photo) && !incomingPhotoIds.has(photo.id)
        ? stampEntity({ ...photo, _deletedAt: deletedAt })
        : photo,
    )

    for (const photoInput of normalizedPhotos) {
      const existingPhoto = db.productPhotos.find((photo) => photo.id === photoInput.id)
      db.productPhotos = upsert(
        db.productPhotos,
        stampEntity({
          ...photoInput,
          draftId: reportId,
          createdAt: existingPhoto?.createdAt ?? photoInput.createdAt ?? Date.now(),
          _deletedAt: undefined,
        }),
      )
    }

    const savedPhotos = db.productPhotos
      .filter((photo) => photo.draftId === reportId && isVisibleEntity(photo))
      .sort((first, second) => first.sortOrder - second.sortOrder)
    const hasProductField = templateHasProductField(template)
    const productId = hasProductField ? String(incomingDraft.productId ?? '').trim() : ''
    const productOption = db.reportTemplateOptions.find(
      (option) =>
        option.field === 'productId' && option.value === productId && isVisibleEntity(option),
    )
    const selectedProductName = hasProductField
      ? String(
          productOption?.label ??
            incomingDraft.productName ??
            incomingDraft.mainInfo?.productName ??
            '',
        ).trim()
      : ''
    const productName =
      productId && selectedProductName ? selectedProductName : (template?.name ?? '')
    const mainInfo = normalizeJsonObject(incomingDraft.mainInfo, 'Основная информация')

    mainInfo.productName = productName

    const now = Date.now()
    const createdAt = existingDraft?.createdAt ?? now
    const incomingUpdatedAt = Number(incomingDraft.updatedAt)
    const draft = stampEntity({
      id: reportId,
      reportNumber: existingDraft?.reportNumber ?? createReportNumber(createdAt),
      status,
      ...(template
        ? { templateId: template.id, templateSnapshot: snapshotTemplate(template) }
        : {}),
      workerAccountId: account.id,
      productId,
      productName,
      inspectorName: account.fullName,
      mainInfo,
      temperatureInfo: normalizeJsonObject(
        incomingDraft.temperatureInfo,
        'Температурная информация',
      ),
      inspectionResults: normalizeJsonObject(
        incomingDraft.inspectionResults,
        'Результаты инспекции',
      ),
      descriptions: normalizeJsonObject(incomingDraft.descriptions, 'Описания'),
      expertConclusion: String(incomingDraft.expertConclusion ?? '').trim(),
      customFieldValues: normalizeFieldValueRecord(incomingDraft.customFieldValues),
      sampling: normalizeJsonObject(incomingDraft.sampling, 'Параметры выборки'),
      signatures: normalizeJsonObject(incomingDraft.signatures, 'Подписи'),
      photoIds: savedPhotos.map((photo) => photo.id),
      createdAt,
      // This timestamp describes the client-side report content, which is also
      // what the generated PDF represents.  Do not replace it with the server
      // receipt time, otherwise a just-uploaded PDF appears out of date.
      updatedAt: Number.isFinite(incomingUpdatedAt) ? incomingUpdatedAt : now,
      _deletedAt: undefined,
    })

    applyInspectorSignatureValues(draft, template)

    if (status === 'ready') {
      validateReadyReport(draft, savedPhotos)
    }

    const invalidatesGeneratedDocuments = status === 'draft' && Boolean(existingDraft)

    if (invalidatesGeneratedDocuments) {
      db.generatedDocuments = db.generatedDocuments.filter(
        (document) => document.draftId !== reportId,
      )
    }

    db.reportDrafts = upsert(db.reportDrafts, draft)
    if (invalidatesGeneratedDocuments) {
      writeDbReplacingGeneratedDocuments(db, reportId)
    } else {
      writeDb(db)
    }
    sendJson(response, {
      draft,
      photos: savedPhotos,
      documents: db.generatedDocuments.filter(
        (document) => document.draftId === reportId && isVisibleEntity(document),
      ),
    })
    return true
  }

  if (reportId && method === 'DELETE') {
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account)

    if (draft.status === 'archived') {
      throw createHttpError(409, 'Отчет уже находится в архиве')
    }

    if (account.role === 'worker' && draft.status !== 'draft') {
      throw createHttpError(409, 'Работник может удалить только черновик')
    }

    const deletedAt = Date.now()

    db.reportDrafts = upsert(
      db.reportDrafts,
      stampEntity({
        ...draft,
        status: 'archived',
        archivedFromStatus: draft.status,
        updatedAt: deletedAt,
        _deletedAt: deletedAt,
      }),
    )
    db.productPhotos = db.productPhotos.map((photo) =>
      photo.draftId === reportId ? stampEntity({ ...photo, _deletedAt: deletedAt }) : photo,
    )
    db.generatedDocuments = db.generatedDocuments.map((document) =>
      document.draftId === reportId
        ? stampEntity({ ...document, _deletedAt: deletedAt })
        : document,
    )
    writeDb(db)
    sendJson(response, { ok: true })
    return true
  }

  return false
}

function normalizePhotoInput(
  input,
  index,
  reportId,
  storedPhotos,
  templatePhotoFieldIds,
  repeatingPhotoBlockIds,
) {
  if (!isPlainObject(input)) {
    throw createHttpError(400, 'Некорректные данные фотографии')
  }

  const id = normalizeEntityId(input.id, 'Идентификатор фотографии')
  const existing = storedPhotos.find((photo) => photo.id === id)

  if (existing && existing.draftId !== reportId) {
    throw createHttpError(409, 'Фотография уже принадлежит другому отчету')
  }

  const category = String(input.category ?? existing?.category ?? '')

  if (!PHOTO_CATEGORIES.has(category)) {
    throw createHttpError(400, 'Некорректная категория фотографии')
  }

  const requestedTemplateFieldId = String(
    input.templateFieldId ?? existing?.templateFieldId ?? '',
  ).trim()
  let templateFieldId

  if (requestedTemplateFieldId) {
    templateFieldId = normalizeEntityId(requestedTemplateFieldId, 'Идентификатор поля фотографии')

    if (!templatePhotoFieldIds.has(templateFieldId)) {
      throw createHttpError(400, 'Поле фотографии отсутствует в выбранном макете')
    }
  } else if (templatePhotoFieldIds.size === 1) {
    templateFieldId = templatePhotoFieldIds.values().next().value
  }

  const requestedRepeatingPhotoBlockId = String(
    input.repeatingPhotoBlockId ?? existing?.repeatingPhotoBlockId ?? '',
  ).trim()
  let repeatingPhotoBlockId

  if (requestedRepeatingPhotoBlockId) {
    repeatingPhotoBlockId = normalizeEntityId(
      requestedRepeatingPhotoBlockId,
      'Идентификатор экземпляра фотографии',
    )
    const allowedBlockIds = templateFieldId
      ? repeatingPhotoBlockIds.get(templateFieldId)
      : undefined

    if (!allowedBlockIds?.has(repeatingPhotoBlockId)) {
      throw createHttpError(400, 'Экземпляр повторяемого фотоблока отсутствует в отчете')
    }
  }

  const mimeType = String(input.mimeType ?? existing?.mimeType ?? '')
    .trim()
    .toLowerCase()

  if (!mimeType.startsWith('image/')) {
    throw createHttpError(400, 'В отчет можно добавить только изображение')
  }

  const blobBase64 = typeof input.blobBase64 === 'string' ? input.blobBase64 : existing?.blobBase64

  if (!blobBase64) {
    throw createHttpError(400, 'Содержимое фотографии обязательно')
  }

  const binary = decodeBase64(blobBase64, MAX_PHOTO_SIZE_BYTES, 'Фотография')
  const sortOrder = Number(input.sortOrder ?? existing?.sortOrder ?? index + 1)

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw createHttpError(400, 'Некорректный порядок фотографии')
  }

  return {
    id,
    draftId: reportId,
    ...(templateFieldId ? { templateFieldId } : {}),
    ...(repeatingPhotoBlockId ? { repeatingPhotoBlockId } : {}),
    category,
    fileName: normalizeRequiredText(input.fileName ?? existing?.fileName, 'Имя фотографии'),
    mimeType,
    size: binary.byteLength,
    blobBase64,
    caption: String(input.caption ?? existing?.caption ?? '')
      .trim()
      .slice(0, 2000),
    sortOrder,
    createdAt: existing?.createdAt ?? Date.now(),
  }
}

function resolveReportTemplate(db, requestedTemplateId, existingDraft) {
  const templateId = String(requestedTemplateId ?? existingDraft?.templateId ?? '').trim()

  if (!templateId) {
    return undefined
  }

  normalizeEntityId(templateId, 'Идентификатор макета')

  const template = db.documentTemplates.find(
    (item) => item.id === templateId && isVisibleEntity(item),
  )

  if (template?.status === 'active') {
    return template
  }

  if (
    existingDraft?.templateId === templateId &&
    isPlainObject(existingDraft.templateSnapshot) &&
    Array.isArray(
      existingDraft.templateSnapshot.inputSchema?.steps ?? existingDraft.templateSnapshot.sections,
    )
  ) {
    const sections = getTemplateSteps(existingDraft.templateSnapshot)
    return {
      id: templateId,
      name: existingDraft.templateSnapshot.name,
      description: existingDraft.templateSnapshot.description,
      translations: existingDraft.templateSnapshot.translations,
      inputSchema: existingDraft.templateSnapshot.inputSchema ?? { version: 1, steps: sections },
      renderSpec: existingDraft.templateSnapshot.renderSpec ?? createDefaultRenderSpec(sections),
      sections,
    }
  }

  throw createHttpError(409, 'Для отчета нужен действующий макет')
}

function snapshotTemplate(template) {
  const sections = getTemplateSteps(template)

  return {
    templateId: template.id,
    name: String(template.name ?? ''),
    description: String(template.description ?? ''),
    translations: structuredClone(template.translations),
    inputSchema: structuredClone(template.inputSchema ?? { version: 1, steps: sections }),
    renderSpec: structuredClone(template.renderSpec ?? createDefaultRenderSpec(sections)),
    sections: structuredClone(sections),
  }
}

function getTemplateSteps(template) {
  return template?.inputSchema?.steps ?? template?.sections ?? []
}

function getTemplatePhotoFieldIds(template) {
  return new Set(
    getTemplateSteps(template).flatMap((section) =>
      (section.fields ?? [])
        .filter(
          (field) =>
            field.type === 'photo' ||
            field.type === 'repeatingPhoto' ||
            field.dataPath === 'photos',
        )
        .map((field) => field.id),
    ),
  )
}

function getRepeatingPhotoBlockIds(template, customFieldValues) {
  const fieldBlocks = new Map()

  for (const field of getTemplateSteps(template).flatMap((section) => section.fields ?? [])) {
    if (field.type !== 'repeatingPhoto') {
      continue
    }

    const blocks = customFieldValues?.[field.dataPath]
    const blockIds = new Set(
      Array.isArray(blocks)
        ? blocks
            .filter((block) => isPlainObject(block) && typeof block.id === 'string')
            .map((block) => block.id)
        : [],
    )
    fieldBlocks.set(field.id, blockIds)
  }

  return fieldBlocks
}

function templateHasProductField(template) {
  return getTemplateSteps(template).some((section) =>
    (section.fields ?? []).some(
      (field) => field.dataPath === 'productId' || field.dataPath === 'mainInfo.productName',
    ),
  )
}

function validateReadyReport(draft, photos) {
  const requiredValues = [['имя инспектора', draft.inspectorName]]

  for (const [label, value] of requiredValues) {
    if (!hasValue(value)) {
      throw createHttpError(400, `Чтобы отправить отчет, заполните поле «${label}»`)
    }
  }

  if (!getTemplateSteps(draft.templateSnapshot).length) {
    throw createHttpError(400, 'Чтобы отправить отчет, выберите действующий макет')
  }

  const photoFieldIds = getTemplatePhotoFieldIds(draft.templateSnapshot)
  const firstPhotoFieldId = photoFieldIds.values().next().value

  for (const section of getTemplateSteps(draft.templateSnapshot)) {
    for (const field of section.fields ?? []) {
      if (!field.required || isProductTemplateField(field)) {
        continue
      }

      const value = getReportFieldValue(draft, photos, field, firstPhotoFieldId)

      if (!hasValue(value)) {
        throw createHttpError(400, `Чтобы отправить отчет, заполните поле «${field.label}»`)
      }
    }
  }
}

function isProductTemplateField(field) {
  return field.dataPath === 'productId' || field.dataPath === 'mainInfo.productName'
}

function getReportFieldValue(draft, photos, field, firstPhotoFieldId) {
  if (field.type === 'signature') {
    return draft.inspectorName
  }

  if (field.type === 'photo' || field.dataPath === 'photos') {
    return photos.filter(
      (photo) =>
        photo.templateFieldId === field.id ||
        (!photo.templateFieldId && field.id === firstPhotoFieldId),
    )
  }

  if (field.type === 'repeatingPhoto') {
    const blocks = draft.customFieldValues?.[field.dataPath]
    const blockIds = new Set(
      Array.isArray(blocks)
        ? blocks
            .filter((block) => isPlainObject(block) && typeof block.id === 'string')
            .map((block) => block.id)
        : [],
    )

    return photos.filter(
      (photo) =>
        photo.templateFieldId === field.id &&
        photo.repeatingPhotoBlockId &&
        blockIds.has(photo.repeatingPhotoBlockId),
    )
  }

  const { dataPath } = field

  if (dataPath === 'mainInfo.productName') {
    return draft.productId
  }

  if (dataPath.startsWith('custom.')) {
    return draft.customFieldValues?.[dataPath]
  }

  return dataPath.split('.').reduce((value, key) => value?.[key], draft)
}

function applyInspectorSignatureValues(draft, template) {
  const signatureFields = getTemplateSteps(template).flatMap((section) =>
    (section.fields ?? []).filter((field) => field.type === 'signature'),
  )

  for (const field of signatureFields) {
    const dataPath = String(field.dataPath ?? '')

    if (dataPath.startsWith('custom.')) {
      draft.customFieldValues[dataPath] = draft.inspectorName
      continue
    }

    if (dataPath.startsWith('signatures.')) {
      const signatureKey = dataPath.slice('signatures.'.length)

      if (signatureKey) {
        draft.signatures[signatureKey] = draft.inspectorName
      }
    }
  }
}

function hasValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (isPlainObject(value)) {
    return Object.values(value).some(hasValue)
  }

  return value !== undefined && value !== null
}

function normalizeJsonObject(value, label) {
  if (!isPlainObject(value)) {
    throw createHttpError(400, `${label}: ожидался объект`)
  }

  return structuredClone(value)
}

function normalizeFieldValueRecord(value) {
  if (value === undefined || value === null) {
    return {}
  }

  if (!isPlainObject(value)) {
    throw createHttpError(400, 'Некорректные дополнительные поля')
  }

  const serialized = JSON.stringify(value)

  if (serialized.length > 1_000_000) {
    throw createHttpError(413, 'Дополнительные поля отчёта слишком большие')
  }

  return JSON.parse(serialized)
}

function validateInputSchema(value) {
  if (!isPlainObject(value) || Number(value.version ?? 1) !== 1) {
    throw createHttpError(400, 'Некорректная схема формы инспектора')
  }

  return {
    version: 1,
    steps: validateTemplateSections(value.steps),
  }
}

function validateRenderSpec(value, inputSchema) {
  const sectionIds = new Set(inputSchema.steps.map((section) => section.id))
  const fallback = createDefaultRenderSpec(inputSchema.steps)
  const fallbackBySectionId = new Map(
    fallback.sections.map((section) => [section.inputSectionId, section]),
  )
  const candidate = value ?? fallback

  if (!isPlainObject(candidate) || !Array.isArray(candidate.sections)) {
    throw createHttpError(400, 'Некорректная схема печатного PDF')
  }

  const renderSections = candidate.sections.map((section, sectionIndex) => {
    if (!isPlainObject(section) || !sectionIds.has(section.inputSectionId)) {
      throw createHttpError(400, 'Печатный раздел не связан с формой инспектора')
    }

    const inputSection = inputSchema.steps.find((item) => item.id === section.inputSectionId)
    const inputPaths = new Set((inputSection?.fields ?? []).map((field) => field.dataPath))
    const fields = Array.isArray(section.fields) ? section.fields : []

    for (const field of fields) {
      if (!isPlainObject(field) || !inputPaths.has(field.dataPath)) {
        throw createHttpError(400, 'Печатное поле не связано с inputSchema')
      }
    }

    return {
      id: normalizeEntityId(
        section.id ?? `render-${section.inputSectionId}`,
        'Идентификатор печатного раздела',
      ),
      inputSectionId: section.inputSectionId,
      title: String(section.title ?? inputSection?.title ?? '').trim(),
      pageBreakBefore: sectionIndex > 0 && Boolean(section.pageBreakBefore),
      columns: Number(section.columns) === 2 ? 2 : 1,
      showDescription: section.showDescription !== false,
      hidden: Boolean(section.hidden),
      fields: structuredClone(
        fields.length ? fields : (fallbackBySectionId.get(section.inputSectionId)?.fields ?? []),
      ),
    }
  })

  return {
    version: 1,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle: String(candidate.documentTitle ?? '').trim(),
    sections: renderSections,
  }
}

function createDefaultRenderSpec(sections) {
  return {
    version: 1,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle: '',
    sections: sections.map((section) => ({
      id: `render-${section.id}`,
      inputSectionId: section.id,
      title: section.title,
      pageBreakBefore: false,
      columns: 1,
      showDescription: true,
      hidden: false,
      fields: (section.fields ?? []).map((field) => ({
        dataPath: field.dataPath,
        label: field.label,
        width: field.width ?? 'full',
        display:
          field.type === 'table'
            ? 'table'
            : field.type === 'checkbox' || field.type === 'passFail'
              ? 'checkmark'
              : 'value',
        hideWhenEmpty: false,
        hidden: false,
      })),
    })),
  }
}

function validateTemplateSections(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw createHttpError(400, 'Макет должен содержать от 1 до 100 разделов')
  }

  let fieldCount = 0
  const sectionIds = new Set()
  const fieldIds = new Set()
  const fieldsByPath = new Map()
  const supportedFieldTypes = new Set([
    'text',
    'number',
    'date',
    'time',
    'select',
    'radio',
    'checkbox',
    'textarea',
    'measurement',
    'passFail',
    'table',
    'calculated',
    'photo',
    'repeatingPhoto',
    'signature',
  ])

  for (const section of value) {
    if (!isPlainObject(section) || !Array.isArray(section.fields)) {
      throw createHttpError(400, 'Некорректная структура разделов макета')
    }

    const sectionId = normalizeEntityId(section.id, 'Идентификатор раздела')

    if (sectionIds.has(sectionId)) {
      throw createHttpError(400, 'Идентификаторы разделов макета не должны повторяться')
    }

    sectionIds.add(sectionId)
    normalizeRequiredText(section.title, 'Название раздела')
    validateSectionTranslations(section.translations)
    fieldCount += section.fields.length

    for (const field of section.fields) {
      if (!isPlainObject(field)) {
        throw createHttpError(400, 'Некорректное поле макета')
      }

      const fieldId = normalizeEntityId(field.id, 'Идентификатор поля')

      if (fieldIds.has(fieldId)) {
        throw createHttpError(400, 'Идентификаторы полей макета не должны повторяться')
      }

      fieldIds.add(fieldId)
      const dataPath = normalizeRequiredText(field.dataPath, 'Путь поля')
      normalizeRequiredText(field.label, 'Название поля')
      validateFieldTranslations(field.translations)

      if (fieldsByPath.has(dataPath)) {
        throw createHttpError(400, 'Пути полей макета не должны повторяться')
      }

      fieldsByPath.set(dataPath, field)

      if (!supportedFieldTypes.has(field.type)) {
        throw createHttpError(400, `Тип поля «${field.type}» не поддерживается`)
      }

      if (field.options !== undefined && !Array.isArray(field.options)) {
        throw createHttpError(400, 'Некорректные варианты поля макета')
      }

      if (field.type === 'table') {
        if (!Array.isArray(field.tableColumns) || !Array.isArray(field.tableRows)) {
          throw createHttpError(400, 'Таблица должна содержать колонки и строки')
        }

        if (field.tableColumns.length > 30 || field.tableRows.length > 200) {
          throw createHttpError(400, 'Таблица макета слишком большая')
        }
      }
    }
  }

  for (const field of fieldsByPath.values()) {
    if (field.type !== 'calculated') {
      continue
    }

    const calculation = field.calculation

    if (
      !isPlainObject(calculation) ||
      !['sum', 'difference', 'average'].includes(calculation.operator) ||
      !Array.isArray(calculation.sourcePaths) ||
      calculation.sourcePaths.length === 0 ||
      calculation.sourcePaths.some((path) => typeof path !== 'string' || !fieldsByPath.has(path)) ||
      new Set(calculation.sourcePaths).size !== calculation.sourcePaths.length ||
      (calculation.precision !== undefined &&
        (!Number.isInteger(calculation.precision) ||
          calculation.precision < 0 ||
          calculation.precision > 10))
    ) {
      throw createHttpError(400, 'Некорректная формула вычисляемого поля')
    }

    if (
      calculation.sourcePaths.some((path) => {
        const sourceField = fieldsByPath.get(path)
        return sourceField.type !== 'number' && sourceField.type !== 'measurement'
      })
    ) {
      throw createHttpError(400, 'Источники вычисляемого поля должны быть числовыми')
    }
  }

  if (fieldCount > 1000) {
    throw createHttpError(400, 'В макете слишком много полей')
  }

  return structuredClone(value)
}

function validateFieldTranslations(value) {
  validateLocalizedTranslations(value, ['label', 'placeholder', 'helpText'], 'поля макета')
}

function validateTemplateTranslations(value) {
  validateLocalizedTranslations(value, ['name', 'description'], 'макета')
}

function validateSectionTranslations(value) {
  validateLocalizedTranslations(value, ['title', 'description'], 'раздела макета')
}

function validateLocalizedTranslations(value, keys, entityLabel) {
  if (value === undefined) {
    return
  }

  if (!isPlainObject(value)) {
    throw createHttpError(400, `Некорректные переводы ${entityLabel}`)
  }

  for (const locale of ['ru', 'en', 'fa']) {
    const translation = value[locale]

    if (!isPlainObject(translation)) {
      throw createHttpError(400, `Перевод ${entityLabel} для языка «${locale}» не заполнен`)
    }

    for (const key of keys) {
      if (typeof translation[key] !== 'string' || translation[key].length > 2_000) {
        throw createHttpError(400, `Некорректный текст перевода «${locale}.${key}»`)
      }
    }
  }
}

function normalizeEntityId(value, label) {
  const id = String(value ?? '').trim()

  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(id)) {
    throw createHttpError(400, `${label}: некорректное значение`)
  }

  return id
}

function normalizeRequiredText(value, label, maximumLength = 500) {
  const text = String(value ?? '').trim()

  if (!text) {
    throw createHttpError(400, `${label}: значение обязательно`)
  }

  if (text.length > maximumLength) {
    throw createHttpError(400, `${label}: слишком длинное значение`)
  }

  return text
}

function decodeBase64(value, maximumSize, label) {
  const base64 = String(value ?? '')

  if (
    !base64 ||
    base64.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    throw createHttpError(400, `${label}: некорректные бинарные данные`)
  }

  const binary = Buffer.from(base64, 'base64')

  if (binary.byteLength === 0) {
    throw createHttpError(400, `${label}: пустой файл`)
  }

  if (binary.byteLength > maximumSize) {
    throw createHttpError(413, `${label}: файл слишком большой`)
  }

  return binary
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function ensureSeeds() {
  const db = readDb()
  let changed = false

  if (!db.accounts.length) {
    db.accounts = createSeedAccounts()
    changed = true
  }

  for (let index = 0; index < db.accounts.length; index += 1) {
    const account = db.accounts[index]

    if (!account.passwordHash) {
      db.accounts[index] = stampEntity({
        ...account,
        passwordHash: await argon2.hash(INITIAL_ACCOUNT_PASSWORD, {
          type: argon2.argon2id,
        }),
      })
      changed = true
    }
  }

  if (!db.reportTemplateOptions.length) {
    db.reportTemplateOptions = createSeedTemplateOptions()
    changed = true
  }

  const legacyTemplate = db.documentTemplates.find(
    (template) => template.id === 'document-template-quality-standard',
  )

  if (legacyTemplate && legacyTemplate._deletedAt === undefined) {
    const deletedAt = Date.now()
    db.documentTemplates = upsert(
      db.documentTemplates,
      stampEntity({ ...legacyTemplate, updatedAt: deletedAt, _deletedAt: deletedAt }),
    )
    changed = true
  }

  if (changed) {
    writeDb(db)
  }
}

function serializeMutation(task) {
  const result = mutationTail.then(task, task)
  mutationTail = result.then(
    () => undefined,
    () => undefined,
  )

  return result
}

function visibleReports(db) {
  return db.reportDrafts
    .filter(isVisibleEntity)
    .sort((first, second) => second.updatedAt - first.updatedAt)
}

function requireReportAccess(db, reportId, account, includeArchived = false) {
  const draft = db.reportDrafts.find(
    (item) =>
      item.id === reportId &&
      (isVisibleEntity(item) ||
        (includeArchived && item.status === 'archived' && item._deletedAt !== undefined)),
  )

  if (!draft) {
    throw createHttpError(404, 'Отчет не найден')
  }

  if (account.role !== 'admin' && draft.workerAccountId !== account.id) {
    throw createHttpError(403, 'Нет доступа к этому отчету')
  }

  if (account.role === 'admin' && draft.status === 'draft') {
    throw createHttpError(404, 'Отчет не найден')
  }

  return draft
}

function requireAdmin(request, db) {
  const account = requireAccount(request, db)

  if (account.role !== 'admin') {
    throw createHttpError(403, 'Требуется учетная запись администратора')
  }

  return account
}

function requireAccount(request, db) {
  const token = getSessionToken(request)
  const session = token ? findAuthSession(hashSessionToken(token), Date.now()) : undefined
  const accountId = session?.account_id
  const account = db.accounts.find(
    (item) => item.id === accountId && item.isActive && isVisibleEntity(item),
  )

  if (!account) {
    throw createHttpError(401, 'Требуется вход в учетную запись')
  }

  return account
}

function ensureUniqueLoginNumber(db, loginNumber, currentAccountId) {
  const duplicate = db.accounts.find(
    (account) =>
      account.id !== currentAccountId &&
      account.loginNumber === loginNumber &&
      isVisibleEntity(account),
  )

  if (duplicate) {
    throw createHttpError(409, 'Этот номер аккаунта уже используется')
  }
}

function ensureCanDeleteAccount(db, accountId) {
  const account = db.accounts.find((item) => item.id === accountId)

  if (account?.role !== 'admin') {
    return
  }

  const activeAdminCount = db.accounts.filter(
    (item) => item.role === 'admin' && item.isActive && isVisibleEntity(item),
  ).length

  if (activeAdminCount <= 1) {
    throw createHttpError(400, 'В системе должен остаться хотя бы один администратор')
  }
}

function ensureCanChangeAdmin(db, existing, next, currentAccountId) {
  if (!existing || existing.role !== 'admin') {
    return
  }

  const removesAdminAccess = next.role !== 'admin' || !next.isActive

  if (!removesAdminAccess) {
    return
  }

  if (existing.id === currentAccountId) {
    throw createHttpError(400, 'Нельзя отключить или понизить текущего администратора')
  }

  const otherActiveAdmins = db.accounts.filter(
    (item) =>
      item.id !== existing.id && item.role === 'admin' && item.isActive && isVisibleEntity(item),
  )

  if (otherActiveAdmins.length === 0) {
    throw createHttpError(400, 'В системе должен остаться хотя бы один администратор')
  }
}

function stampEntity(entity) {
  const now = Date.now()
  const version = `${now}-${randomUUID()}`

  return {
    ...entity,
    _syncStatus: 'synced',
    _lastModified: now,
    _localVersion: version,
    _serverTimestamp: now,
    _serverVersion: version,
  }
}

function upsert(collection, entity) {
  return [entity, ...collection.filter((item) => item.id !== entity.id)]
}

function sortTemplates(first, second) {
  if (first.status === 'active' && second.status !== 'active') {
    return -1
  }

  if (second.status === 'active' && first.status !== 'active') {
    return 1
  }

  return second.updatedAt - first.updatedAt
}

function isVisibleEntity(entity) {
  return entity._deletedAt === undefined
}

function matchId(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return null
  }

  const value = pathname.slice(prefix.length)

  return value && !value.includes('/') ? decodeURIComponent(value) : null
}

function getReportResourceId(pathname) {
  const match = pathname.match(
    /^\/api\/reports\/([^/]+)(?:\/documents(?:\/generate)?|\/photo-previews|\/submit)?$/,
  )
  return match ? decodeURIComponent(match[1]) : undefined
}

function createGeneratedPdfFileName(report, generatedAt) {
  const rawBaseName = String(report.reportNumber || 'quality-report').trim()
  const baseName = Array.from(rawBaseName, (character) =>
    character.charCodeAt(0) <= 31 ? '_' : character,
  )
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
  const timestamp = new Date(generatedAt).toISOString().replace(/[-:]/g, '').slice(0, 13)

  return `${baseName || 'quality-report'}-${timestamp}.pdf`
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length

    if (size > MAX_BODY_SIZE_BYTES) {
      throw createHttpError(413, 'Слишком большой запрос')
    }

    chunks.push(chunk)
  }

  if (!chunks.length) {
    return {}
  }

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    if (!isPlainObject(value)) {
      throw createHttpError(400, 'Тело запроса должно быть JSON-объектом')
    }

    return value
  } catch (error) {
    if (error?.statusCode) {
      throw error
    }

    throw createHttpError(400, 'Некорректный JSON в теле запроса')
  }
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

function setCorsHeaders(request, response) {
  if (request.headers.origin === ALLOWED_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Vary', 'Origin')
  }

  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,HEAD,OPTIONS')
}

function getSessionToken(request) {
  const cookieHeader = String(request.headers.cookie ?? '')

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=')

    if (separatorIndex < 0) {
      continue
    }

    const name = part.slice(0, separatorIndex).trim()

    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim())
    }
  }

  return undefined
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`,
  )
}

function startAccountSession(response, accountId) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  purgeExpiredAuthSessions(now)
  createAuthSession(hashSessionToken(token), accountId, now, now + SESSION_TTL_MS)
  setSessionCookie(response, token)
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`,
  )
}

function toPublicAccount(account) {
  const { passwordHash: _passwordHash, ...publicAccount } = account
  return publicAccount
}

function validatePassword(password) {
  if (password.length < 8 || password.length > 128) {
    throw createHttpError(400, 'Пароль должен содержать от 8 до 128 символов')
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function createEntityId(prefix) {
  return `${prefix}_${randomUUID()}`
}

function createReportNumber(createdAt) {
  const date = formatReportNumberDate(createdAt)
  const prefix = `AMB-QC-${WAREHOUSE_CODE}-${date}-`
  const sequence = allocateReportSequence(WAREHOUSE_CODE, date)

  return `${prefix}${String(sequence).padStart(4, '0')}`
}

function formatReportNumberDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_NUMBER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const valueByType = new Map(parts.map((part) => [part.type, part.value]))

  return `${valueByType.get('year')}${valueByType.get('month')}${valueByType.get('day')}`
}

function normalizeWarehouseCode(value) {
  const code = String(value).trim().toUpperCase()

  if (!/^[A-Z0-9]{2,12}$/.test(code)) {
    throw new Error('AMB_AR_WAREHOUSE_CODE должен содержать 2–12 латинских букв или цифр')
  }

  return code
}

function createSeedAccounts() {
  const createdAt = Date.now()

  return [
    ['account-admin-main', '1001', 'Администратор АМБАР', 'admin'],
    ['account-worker-ivanov', '2001', 'Иванов Иван Иванович', 'worker'],
    ['account-worker-petrov', '2002', 'Петров Петр Петрович', 'worker'],
  ].map(([id, loginNumber, fullName, role]) =>
    stampEntity({
      id,
      loginNumber,
      fullName,
      role,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    }),
  )
}

function createSeedTemplateOptions() {
  const now = Date.now()
  const entries = [
    [
      'template-product-sweet-red-pepper',
      'productId',
      'Перец красный сладкий 1 кг',
      'sweet-red-pepper',
      'Овощи',
    ],
    [
      'template-product-fresh-vegetables',
      'productId',
      'Свежие овощи',
      'fresh-vegetables',
      'Склад холодного хранения',
    ],
    [
      'template-product-dairy',
      'productId',
      'Молочная продукция',
      'dairy',
      'Склад холодного хранения',
    ],
    [
      'template-product-frozen-meat',
      'productId',
      'Замороженное мясо',
      'frozen-meat',
      'Морозильный склад',
    ],
    ['template-product-dry-goods', 'productId', 'Сухие товары', 'dry-goods', 'Основной склад'],
    ['template-package-1kg', 'packageName', '1 кг', '1 кг', 'Фасовка'],
    ['template-package-5kg', 'packageName', '5 кг', '5 кг', 'Фасовка'],
    ['template-packing-box', 'packingKind', 'Картонная коробка', 'Картонная коробка', 'Упаковка'],
    ['template-packing-plastic', 'packingKind', 'Пластиковый ящик', 'Пластиковый ящик', 'Упаковка'],
  ]
  const yesNoFields = [
    'temperatureViolation',
    'thermographPresence',
    'thermographViolation',
    'caliberPassportMatch',
    'varietyPassportMatch',
  ]

  for (const field of yesNoFields) {
    entries.push(
      [`template-${field}-yes`, field, 'Да', 'yes', 'Да / Нет'],
      [`template-${field}-no`, field, 'Нет', 'no', 'Да / Нет'],
    )
  }

  const counters = new Map()

  return entries.map(([id, field, label, value, category]) => {
    const sortOrder = (counters.get(field) ?? 0) + 1
    counters.set(field, sortOrder)

    return stampEntity({
      id,
      field,
      label,
      value,
      category,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
  })
}

async function serveStaticFile(pathname, response) {
  if (!existsSync(DIST_DIR)) {
    sendJson(response, { message: 'Not found' }, 404)
    return
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const normalizedPath = normalize(relativePath)

  if (normalizedPath.startsWith('..')) {
    sendJson(response, { message: 'Not found' }, 404)
    return
  }

  let filePath = join(DIST_DIR, normalizedPath)

  if (!existsSync(filePath)) {
    filePath = join(DIST_DIR, 'index.html')
  }

  const body = await readFile(filePath)
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  })
  response.end(body)
}
