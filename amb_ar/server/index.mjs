import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.AMB_AR_API_PORT ?? 3001)
const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), 'server-db.json')

const templateFieldLabels = {
  productId: 'Тип товара',
  packageName: 'Фасовка',
  packingKind: 'Вид упаковки',
  temperatureViolation: 'Нарушение температуры',
  thermographPresence: 'Наличие термографов',
  thermographViolation: 'Нарушение термографов',
  caliberPassportMatch: 'Калибр соответствует ПК',
  varietyPassportMatch: 'Сорт соответствует ПК',
}

const seedProducts = [
  ['sweet-red-pepper', 'Перец красный сладкий 1 кг', 'Овощи'],
  ['fresh-vegetables', 'Свежие овощи', 'Склад холодного хранения'],
  ['dairy', 'Молочная продукция', 'Склад холодного хранения'],
  ['frozen-meat', 'Замороженное мясо', 'Морозильный склад'],
  ['dry-goods', 'Сухие товары', 'Основной склад'],
]

const yesNoFields = [
  'temperatureViolation',
  'thermographPresence',
  'thermographViolation',
  'caliberPassportMatch',
  'varietyPassportMatch',
]

const server = createServer(async (request, response) => {
  setCorsHeaders(response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  try {
    if (requestUrl.pathname === '/api/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
      return
    }

    const db = await readDb()

    if (requestUrl.pathname === '/api/accounts' && request.method === 'GET') {
      requireAdmin(request, db)
      sendJson(response, db.accounts.filter(isVisibleEntity))
      return
    }

    if (requestUrl.pathname === '/api/accounts/login' && request.method === 'GET') {
      const loginNumber = requestUrl.searchParams.get('loginNumber')?.trim()
      const account = db.accounts.find(
        (item) => item.loginNumber === loginNumber && item.isActive && isVisibleEntity(item),
      )

      sendJson(response, account ?? null, account ? 200 : 404)
      return
    }

    if (requestUrl.pathname.startsWith('/api/accounts/') && request.method === 'GET') {
      const accountId = decodeURIComponent(requestUrl.pathname.replace('/api/accounts/', ''))
      const account = db.accounts.find(
        (item) => item.id === accountId && item.isActive && isVisibleEntity(item),
      )

      sendJson(response, account ?? null, account ? 200 : 404)
      return
    }

    if (requestUrl.pathname === '/api/accounts' && request.method === 'POST') {
      requireAdmin(request, db)

      const input = await readJsonBody(request)
      const now = Date.now()
      const account = {
        id: input.id || createEntityId('account'),
        loginNumber: String(input.loginNumber ?? '').trim(),
        fullName: String(input.fullName ?? '').trim(),
        role: input.role === 'admin' ? 'admin' : 'worker',
        isActive: input.isActive !== false,
        createdAt: now,
        updatedAt: now,
        ...createServerMetadata(),
      }

      if (!account.loginNumber || !account.fullName) {
        throw createHttpError(400, 'loginNumber and fullName are required')
      }

      ensureUniqueLoginNumber(db, account.loginNumber)
      db.accounts.push(account)
      await writeDb(db)
      sendJson(response, account, 201)
      return
    }

    if (requestUrl.pathname.startsWith('/api/accounts/') && request.method === 'PATCH') {
      requireAdmin(request, db)

      const accountId = decodeURIComponent(requestUrl.pathname.replace('/api/accounts/', ''))
      const account = db.accounts.find((item) => item.id === accountId)

      if (!account) {
        sendJson(response, null, 404)
        return
      }

      const input = await readJsonBody(request)
      const nextLoginNumber = input.loginNumber ? String(input.loginNumber).trim() : account.loginNumber

      ensureUniqueLoginNumber(db, nextLoginNumber, accountId)

      const updatedAccount = {
        ...account,
        loginNumber: nextLoginNumber,
        fullName: input.fullName ? String(input.fullName).trim() : account.fullName,
        role: input.role === 'admin' || input.role === 'worker' ? input.role : account.role,
        isActive: typeof input.isActive === 'boolean' ? input.isActive : account.isActive,
        updatedAt: Date.now(),
        ...createServerMetadata(),
      }

      db.accounts = db.accounts.map((item) => (item.id === accountId ? updatedAccount : item))
      await writeDb(db)
      sendJson(response, updatedAccount)
      return
    }

    if (requestUrl.pathname.startsWith('/api/accounts/') && request.method === 'DELETE') {
      requireAdmin(request, db)

      const accountId = decodeURIComponent(requestUrl.pathname.replace('/api/accounts/', ''))
      ensureCanDeleteAccount(db, accountId)

      const deletedAt = Date.now()
      db.accounts = db.accounts.map((item) =>
        item.id === accountId
          ? { ...item, isActive: false, _deletedAt: deletedAt, updatedAt: deletedAt, ...createServerMetadata() }
          : item,
      )
      await writeDb(db)
      sendJson(response, { ok: true })
      return
    }

    if (requestUrl.pathname === '/api/template-options' && request.method === 'GET') {
      sendJson(response, db.reportTemplateOptions.filter(isVisibleEntity))
      return
    }

    if (requestUrl.pathname === '/api/template-options' && request.method === 'POST') {
      requireAdmin(request, db)

      const input = await readJsonBody(request)
      const now = Date.now()
      const existingOption = input.id
        ? db.reportTemplateOptions.find((option) => option.id === input.id)
        : null
      const fieldOptions = db.reportTemplateOptions.filter(
        (option) => option.field === input.field && isVisibleEntity(option),
      )
      const option = {
        id: existingOption?.id ?? createEntityId('templateOption'),
        field: input.field,
        label: String(input.label ?? '').trim(),
        value: String(input.value || input.label || '').trim(),
        category: String(input.category ?? '').trim(),
        sortOrder: existingOption?.sortOrder ?? fieldOptions.length + 1,
        createdAt: existingOption?.createdAt ?? now,
        updatedAt: now,
        ...createServerMetadata(),
      }

      if (!templateFieldLabels[option.field] || !option.label || !option.value) {
        throw createHttpError(400, 'field, label and value are required')
      }

      db.reportTemplateOptions = existingOption
        ? db.reportTemplateOptions.map((item) => (item.id === option.id ? option : item))
        : [...db.reportTemplateOptions, option]
      await writeDb(db)
      sendJson(response, option, existingOption ? 200 : 201)
      return
    }

    if (requestUrl.pathname.startsWith('/api/template-options/') && request.method === 'DELETE') {
      requireAdmin(request, db)

      const optionId = decodeURIComponent(requestUrl.pathname.replace('/api/template-options/', ''))
      const deletedAt = Date.now()
      db.reportTemplateOptions = db.reportTemplateOptions.map((option) =>
        option.id === optionId
          ? { ...option, _deletedAt: deletedAt, updatedAt: deletedAt, ...createServerMetadata() }
          : option,
      )
      await writeDb(db)
      sendJson(response, { ok: true })
      return
    }

    if (requestUrl.pathname === '/api/reports' && request.method === 'GET') {
      requireAdmin(request, db)
      sendJson(response, db.reportDrafts.filter(isVisibleEntity))
      return
    }

    if (requestUrl.pathname === '/api/reports/mine' && request.method === 'GET') {
      const account = requireAccount(request, db)
      const reports = db.reportDrafts.filter(
        (report) => report.workerAccountId === account.id && isVisibleEntity(report),
      )

      sendJson(response, reports)
      return
    }

    if (requestUrl.pathname === '/api/reports' && request.method === 'POST') {
      const input = await readJsonBody(request)

      if (!input.id || !input.workerAccountId) {
        throw createHttpError(400, 'Report id and workerAccountId are required')
      }

      db.reportDrafts = [
        sanitizeReportDraft(input),
        ...db.reportDrafts.filter((report) => report.id !== input.id),
      ]
      await writeDb(db)
      sendJson(response, { ok: true }, 201)
      return
    }

    sendJson(response, { message: 'Not found' }, 404)
  } catch (error) {
    const status = error.statusCode ?? 500
    sendJson(response, { message: error.message ?? 'Server error' }, status)
  }
})

server.on('error', async (error) => {
  if (error.code !== 'EADDRINUSE') {
    console.error(error)
    process.exit(1)
  }

  if (await isExistingServerHealthy()) {
    console.log(`AMB_AR API server already running: http://127.0.0.1:${PORT}`)
    return
  }

  console.error(`Port ${PORT} is already in use by another process.`)
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', async () => {
  await ensureDb()
  console.log(`AMB_AR API server: http://127.0.0.1:${PORT}`)
  console.log(`Database file: ${DB_PATH}`)
})

async function isExistingServerHealthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/health`)

    return response.ok
  } catch {
    return false
  }
}

async function ensureDb() {
  const db = await readDb()

  if (!db.reportTemplateOptions.length) {
    db.reportTemplateOptions = createSeedTemplateOptions()
    await writeDb(db)
  }
}

async function readDb() {
  const content = await readFile(DB_PATH, 'utf8')
  const db = JSON.parse(content)

  return {
    accounts: Array.isArray(db.accounts) ? db.accounts : [],
    reportTemplateOptions: Array.isArray(db.reportTemplateOptions)
      ? db.reportTemplateOptions
      : [],
    reportDrafts: Array.isArray(db.reportDrafts) ? db.reportDrafts : [],
  }
}

async function writeDb(db) {
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf8')
}

function createSeedTemplateOptions() {
  const now = Date.now()
  const productOptions = seedProducts.map(([value, label, category], index) => ({
    id: `template-product-${value}`,
    field: 'productId',
    label,
    value,
    category,
    sortOrder: index + 1,
    createdAt: now,
    updatedAt: now,
    ...createServerMetadata(),
  }))
  const staticOptions = [
    ['template-package-1kg', 'packageName', '1 кг', '1 кг', 'Фасовка', 1],
    ['template-package-5kg', 'packageName', '5 кг', '5 кг', 'Фасовка', 2],
    ['template-packing-box', 'packingKind', 'Картонная коробка', 'Картонная коробка', 'Упаковка', 1],
    ['template-packing-plastic', 'packingKind', 'Пластиковый ящик', 'Пластиковый ящик', 'Упаковка', 2],
  ].map(([id, field, label, value, category, sortOrder]) => ({
    id,
    field,
    label,
    value,
    category,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    ...createServerMetadata(),
  }))
  const yesNoOptions = yesNoFields.flatMap((field) => [
    {
      id: `template-${field}-no`,
      field,
      label: 'Нет',
      value: 'Нет',
      category: templateFieldLabels[field],
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      ...createServerMetadata(),
    },
    {
      id: `template-${field}-yes`,
      field,
      label: 'Да',
      value: 'Да',
      category: templateFieldLabels[field],
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      ...createServerMetadata(),
    },
  ])

  return [...productOptions, ...staticOptions, ...yesNoOptions]
}

function requireAdmin(request, db) {
  const account = requireAccount(request, db)

  if (account.role !== 'admin') {
    throw createHttpError(403, 'Admin account is required')
  }
}

function requireAccount(request, db) {
  const accountId = request.headers['x-account-id']
  const account = db.accounts.find((item) => item.id === accountId)

  if (!account || !account.isActive || !isVisibleEntity(account)) {
    throw createHttpError(403, 'Active account is required')
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
    throw createHttpError(409, 'Account login number must be unique')
  }
}

function ensureCanDeleteAccount(db, accountId) {
  const account = db.accounts.find((item) => item.id === accountId)

  if (!account) {
    return
  }

  if (account.role !== 'admin') {
    return
  }

  const activeAdminCount = db.accounts.filter(
    (item) => item.role === 'admin' && item.isActive && isVisibleEntity(item),
  ).length

  if (activeAdminCount <= 1) {
    throw createHttpError(400, 'Cannot delete the last active admin account')
  }
}

function sanitizeReportDraft(input) {
  return {
    ...input,
    photoIds: Array.isArray(input.photoIds) ? input.photoIds : [],
    _syncStatus: 'synced',
    _serverTimestamp: Date.now(),
    _serverVersion: createLocalVersion(),
  }
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (!chunks.length) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Account-Id')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS')
}

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode

  return error
}

function createEntityId(prefix) {
  return `${prefix}_${randomUUID()}`
}

function createLocalVersion() {
  return `${Date.now()}-${randomUUID()}`
}

function createServerMetadata() {
  return {
    _syncStatus: 'synced',
    _lastModified: Date.now(),
    _localVersion: createLocalVersion(),
  }
}

function isVisibleEntity(entity) {
  return entity._deletedAt === undefined
}
