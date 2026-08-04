import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServerDatabase } from './database.mjs'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(SERVER_DIR, '..')
const DIST_DIR = join(PROJECT_DIR, 'dist')
const DB_PATH = process.env.AMB_AR_DATABASE_PATH
  ? resolve(process.env.AMB_AR_DATABASE_PATH)
  : join(SERVER_DIR, 'amb-ar.sqlite')
const PORT = Number(process.env.AMB_AR_API_PORT ?? 3001)
const HOST = process.env.AMB_AR_HOST?.trim() || '127.0.0.1'
const MAX_BODY_SIZE_BYTES = 100 * 1024 * 1024
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024
const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024
const MAX_PHOTOS_PER_REPORT = 100
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

const serverDatabase = createServerDatabase(DB_PATH)
const { readDb, writeDb } = serverDatabase
let mutationTail = Promise.resolve()

await ensureSeeds()

export const server = createServer(async (request, response) => {
  setCorsHeaders(response)

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
  if (server.listening) {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    })
  }

  serverDatabase.close()
}

async function handleApiRequest(request, response, requestUrl, db) {
  const { pathname } = requestUrl
  const method = request.method ?? 'GET'

  if (pathname === '/api/accounts/login' && method === 'GET') {
    const loginNumber = requestUrl.searchParams.get('loginNumber')?.trim()
    const account = db.accounts.find(
      (item) => item.loginNumber === loginNumber && item.isActive && isVisibleEntity(item),
    )

    sendJson(response, account ?? null, account ? 200 : 404)
    return true
  }

  if (pathname === '/api/accounts/demo' && method === 'GET') {
    const role = requestUrl.searchParams.get('role')
    const account = db.accounts.find(
      (item) => item.role === role && item.isActive && isVisibleEntity(item),
    )

    sendJson(response, account ?? null, account ? 200 : 404)
    return true
  }

  if (pathname === '/api/accounts' && method === 'GET') {
    requireAdmin(request, db)
    sendJson(response, db.accounts.filter(isVisibleEntity))
    return true
  }

  if (pathname === '/api/accounts' && method === 'POST') {
    const currentAccount = requireAdmin(request, db)
    const input = await readJsonBody(request)
    const loginNumber = String(input.loginNumber ?? '').trim()
    const fullName = String(input.fullName ?? '').trim()

    if (!loginNumber || !fullName) {
      throw createHttpError(400, 'Укажите номер аккаунта и ФИО')
    }

    ensureUniqueLoginNumber(db, loginNumber, input.id)
    const existing = input.id ? db.accounts.find((item) => item.id === input.id) : undefined
    const now = Date.now()
    const role = input.role === 'admin' ? 'admin' : 'worker'
    const isActive = Boolean(input.isActive ?? existing?.isActive ?? true)

    ensureCanChangeAdmin(db, existing, { role, isActive }, currentAccount.id)

    const account = stampEntity({
      ...existing,
      id: existing?.id ?? createEntityId('account'),
      loginNumber,
      fullName,
      role,
      isActive,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      _deletedAt: undefined,
    })

    db.accounts = upsert(db.accounts, account)
    writeDb(db)
    sendJson(response, account, existing ? 200 : 201)
    return true
  }

  const accountId = matchId(pathname, '/api/accounts/')

  if (accountId && method === 'GET') {
    const account = db.accounts.find(
      (item) => item.id === accountId && item.isActive && isVisibleEntity(item),
    )
    sendJson(response, account ?? null, account ? 200 : 404)
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

  if (pathname === '/api/document-templates/seed' && method === 'POST') {
    if (!db.documentTemplates.some(isVisibleEntity)) {
      const input = await readJsonBody(request)

      if (input.id !== 'document-template-quality-standard') {
        throw createHttpError(400, 'Некорректный системный макет')
      }

      const sections = validateTemplateSections(input.sections)

      db.documentTemplates = upsert(
        db.documentTemplates,
        stampEntity({
          id: input.id,
          name: normalizeRequiredText(input.name, 'Название макета'),
          description: String(input.description ?? '').trim(),
          sections,
          status: 'active',
          createdByAccountId: 'system',
          createdAt: input.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          publishedAt: Date.now(),
          _deletedAt: undefined,
        }),
      )
      writeDb(db)
    }

    sendJson(
      response,
      db.documentTemplates.find(
        (template) => template.id === 'document-template-quality-standard',
      ) ?? null,
    )
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

    const sections = validateTemplateSections(input.sections ?? existing?.sections)

    if (status === 'active' && !sections.some((section) => section.fields.length > 0)) {
      throw createHttpError(400, 'Опубликованный макет должен содержать хотя бы одно поле')
    }

    const template = stampEntity({
      ...existing,
      id: documentTemplateId,
      name: normalizeRequiredText(input.name ?? existing?.name, 'Название макета'),
      description: String(input.description ?? existing?.description ?? '').trim(),
      status,
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
    const template = db.documentTemplates.find((item) => item.id === documentTemplateId)

    if (template && template.status !== 'draft') {
      throw createHttpError(400, 'Можно удалить только черновик макета')
    }

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
      visibleReports(db).filter((report) => report.status === 'ready' || report.status === 'exported'),
    )
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

  const documentMatch = pathname.match(/^\/api\/reports\/([^/]+)\/documents$/)

  if (documentMatch && method === 'POST') {
    const reportId = decodeURIComponent(documentMatch[1])
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account)
    const input = await readJsonBody(request)

    if (draft.status !== 'ready' && draft.status !== 'exported') {
      throw createHttpError(409, 'Сначала отправьте отчет администратору')
    }

    const documentId = normalizeEntityId(input.id, 'Идентификатор документа')
    const existingDocument = db.generatedDocuments.find((item) => item.id === documentId)

    if (existingDocument) {
      throw createHttpError(409, 'Документ с таким идентификатором уже существует')
    }

    if (!input.blobBase64) {
      throw createHttpError(400, 'Документ и его содержимое обязательны')
    }

    const binary = decodeBase64(input.blobBase64, MAX_DOCUMENT_SIZE_BYTES, 'Документ')
    const mimeType = String(input.mimeType ?? '').trim().toLowerCase()

    if (mimeType !== 'application/pdf') {
      throw createHttpError(400, 'Поддерживаются только PDF-документы')
    }

    const document = stampEntity({
      id: documentId,
      draftId: reportId,
      fileName: normalizeRequiredText(input.fileName, 'Имя файла'),
      mimeType,
      blobBase64: input.blobBase64,
      generatedAt: Date.now(),
      contentHash: createHash('sha256').update(binary).digest('hex'),
      _deletedAt: undefined,
    })
    const updatedDraft = stampEntity({
      ...draft,
      status: 'exported',
      updatedAt: Date.now(),
    })

    db.generatedDocuments = upsert(db.generatedDocuments, document)
    db.reportDrafts = upsert(db.reportDrafts, updatedDraft)
    writeDb(db)
    sendJson(response, document, 201)
    return true
  }

  const reportId = matchId(pathname, '/api/reports/')

  if (reportId && method === 'GET') {
    const account = requireAccount(request, db)
    const draft = requireReportAccess(db, reportId, account)
    sendJson(response, {
      draft,
      photos: db.productPhotos
        .filter((photo) => photo.draftId === reportId && isVisibleEntity(photo))
        .sort((first, second) => first.sortOrder - second.sortOrder),
      documents: db.generatedDocuments
        .filter((document) => document.draftId === reportId && isVisibleEntity(document))
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
    const incomingPhotos = Array.isArray(input.photos) ? input.photos : []

    if (incomingPhotos.length > MAX_PHOTOS_PER_REPORT) {
      throw createHttpError(400, `В одном отчете может быть не более ${MAX_PHOTOS_PER_REPORT} фото`)
    }

    const normalizedPhotos = incomingPhotos.map((photo, index) =>
      normalizePhotoInput(photo, index, reportId, db.productPhotos, templatePhotoFieldIds),
    )
    const incomingPhotoIds = new Set(normalizedPhotos.map((photo) => photo.id))

    if (incomingPhotoIds.size !== normalizedPhotos.length) {
      throw createHttpError(400, 'Идентификаторы фотографий не должны повторяться')
    }

    const deletedAt = Date.now()

    db.productPhotos = db.productPhotos.map((photo) =>
      photo.draftId === reportId &&
      isVisibleEntity(photo) &&
      !incomingPhotoIds.has(photo.id)
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
    const productId = String(incomingDraft.productId ?? '').trim()
    const productOption = db.reportTemplateOptions.find(
      (option) =>
        option.field === 'productId' && option.value === productId && isVisibleEntity(option),
    )
    const productName = String(
      productOption?.label ?? incomingDraft.productName ?? incomingDraft.mainInfo?.productName ?? '',
    ).trim()
    const mainInfo = normalizeJsonObject(incomingDraft.mainInfo, 'Основная информация')

    mainInfo.productName = productName

    const now = Date.now()
    const draft = stampEntity({
      id: reportId,
      status,
      ...(template ? { templateId: template.id, templateSnapshot: snapshotTemplate(template) } : {}),
      workerAccountId: account.id,
      productId,
      productName,
      inspectorName: account.fullName,
      mainInfo,
      temperatureInfo: normalizeJsonObject(incomingDraft.temperatureInfo, 'Температурная информация'),
      inspectionResults: normalizeJsonObject(incomingDraft.inspectionResults, 'Результаты инспекции'),
      descriptions: normalizeJsonObject(incomingDraft.descriptions, 'Описания'),
      expertConclusion: String(incomingDraft.expertConclusion ?? '').trim(),
      customFieldValues: normalizeStringRecord(incomingDraft.customFieldValues),
      sampling: normalizeJsonObject(incomingDraft.sampling, 'Параметры выборки'),
      signatures: normalizeJsonObject(incomingDraft.signatures, 'Подписи'),
      photoIds: savedPhotos.map((photo) => photo.id),
      createdAt: existingDraft?.createdAt ?? now,
      updatedAt: now,
      _deletedAt: undefined,
    })

    applyInspectorSignatureValues(draft, template)

    if (status === 'ready') {
      validateReadyReport(draft, savedPhotos)
    }

    db.reportDrafts = upsert(db.reportDrafts, draft)
    writeDb(db)
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

    if (account.role === 'worker' && draft.status !== 'draft') {
      throw createHttpError(409, 'Работник может удалить только черновик')
    }

    const deletedAt = Date.now()

    db.reportDrafts = upsert(
      db.reportDrafts,
      stampEntity({ ...draft, status: 'archived', updatedAt: deletedAt, _deletedAt: deletedAt }),
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

function normalizePhotoInput(input, index, reportId, storedPhotos, templatePhotoFieldIds) {
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
    templateFieldId = normalizeEntityId(
      requestedTemplateFieldId,
      'Идентификатор поля фотографии',
    )

    if (!templatePhotoFieldIds.has(templateFieldId)) {
      throw createHttpError(400, 'Поле фотографии отсутствует в выбранном макете')
    }
  } else if (templatePhotoFieldIds.size === 1) {
    templateFieldId = templatePhotoFieldIds.values().next().value
  }

  const mimeType = String(input.mimeType ?? existing?.mimeType ?? '').trim().toLowerCase()

  if (!mimeType.startsWith('image/')) {
    throw createHttpError(400, 'В отчет можно добавить только изображение')
  }

  const blobBase64 =
    typeof input.blobBase64 === 'string' ? input.blobBase64 : existing?.blobBase64

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
    category,
    fileName: normalizeRequiredText(input.fileName ?? existing?.fileName, 'Имя фотографии'),
    mimeType,
    size: binary.byteLength,
    blobBase64,
    caption: String(input.caption ?? existing?.caption ?? '').trim().slice(0, 2000),
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
    Array.isArray(existingDraft.templateSnapshot.sections)
  ) {
    return {
      id: templateId,
      name: existingDraft.templateSnapshot.name,
      sections: existingDraft.templateSnapshot.sections,
    }
  }

  throw createHttpError(409, 'Для отчета нужен действующий макет')
}

function snapshotTemplate(template) {
  return {
    templateId: template.id,
    name: String(template.name ?? ''),
    sections: structuredClone(template.sections),
  }
}

function getTemplatePhotoFieldIds(template) {
  return new Set(
    (template?.sections ?? []).flatMap((section) =>
      (section.fields ?? [])
        .filter((field) => field.type === 'photo' || field.dataPath === 'photos')
        .map((field) => field.id),
    ),
  )
}

function validateReadyReport(draft, photos) {
  const requiredValues = [
    ['товар', draft.productId],
    ['имя инспектора', draft.inspectorName],
  ]

  for (const [label, value] of requiredValues) {
    if (!hasValue(value)) {
      throw createHttpError(400, `Чтобы отправить отчет, заполните поле «${label}»`)
    }
  }

  if (!draft.templateSnapshot?.sections?.length) {
    throw createHttpError(400, 'Чтобы отправить отчет, выберите действующий макет')
  }

  const photoFieldIds = getTemplatePhotoFieldIds(draft.templateSnapshot)
  const firstPhotoFieldId = photoFieldIds.values().next().value

  for (const section of draft.templateSnapshot.sections) {
    for (const field of section.fields ?? []) {
      if (!field.required) {
        continue
      }

      const value = getReportFieldValue(draft, photos, field, firstPhotoFieldId)

      if (!hasValue(value)) {
        throw createHttpError(400, `Чтобы отправить отчет, заполните поле «${field.label}»`)
      }
    }
  }
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
  const signatureFields = (template?.sections ?? []).flatMap((section) =>
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

  return value !== undefined && value !== null
}

function normalizeJsonObject(value, label) {
  if (!isPlainObject(value)) {
    throw createHttpError(400, `${label}: ожидался объект`)
  }

  return structuredClone(value)
}

function normalizeStringRecord(value) {
  if (value === undefined || value === null) {
    return {}
  }

  if (!isPlainObject(value)) {
    throw createHttpError(400, 'Некорректные дополнительные поля')
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [key, String(fieldValue ?? '').trim()]),
  )
}

function validateTemplateSections(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw createHttpError(400, 'Макет должен содержать от 1 до 100 разделов')
  }

  let fieldCount = 0
  const sectionIds = new Set()
  const fieldIds = new Set()

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
      normalizeRequiredText(field.dataPath, 'Путь поля')
      normalizeRequiredText(field.label, 'Название поля')

      if (field.options !== undefined && !Array.isArray(field.options)) {
        throw createHttpError(400, 'Некорректные варианты поля макета')
      }
    }
  }

  if (fieldCount > 1000) {
    throw createHttpError(400, 'В макете слишком много полей')
  }

  return structuredClone(value)
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

  if (!db.reportTemplateOptions.length) {
    db.reportTemplateOptions = createSeedTemplateOptions()
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

function requireReportAccess(db, reportId, account) {
  const draft = db.reportDrafts.find((item) => item.id === reportId && isVisibleEntity(item))

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
  const accountId = request.headers['x-account-id']
  const account = db.accounts.find(
    (item) => item.id === accountId && item.isActive && isVisibleEntity(item),
  )

  if (!account) {
    throw createHttpError(403, 'Требуется активная учетная запись')
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
      item.id !== existing.id &&
      item.role === 'admin' &&
      item.isActive &&
      isVisibleEntity(item),
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
  const match = pathname.match(/^\/api\/reports\/([^/]+)(?:\/documents)?$/)
  return match ? decodeURIComponent(match[1]) : undefined
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

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Account-Id')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,HEAD,OPTIONS')
}

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function createEntityId(prefix) {
  return `${prefix}_${randomUUID()}`
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
    ['template-product-sweet-red-pepper', 'productId', 'Перец красный сладкий 1 кг', 'sweet-red-pepper', 'Овощи'],
    ['template-product-fresh-vegetables', 'productId', 'Свежие овощи', 'fresh-vegetables', 'Склад холодного хранения'],
    ['template-product-dairy', 'productId', 'Молочная продукция', 'dairy', 'Склад холодного хранения'],
    ['template-product-frozen-meat', 'productId', 'Замороженное мясо', 'frozen-meat', 'Морозильный склад'],
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
