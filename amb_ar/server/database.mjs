import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const COLLECTIONS = [
  'accounts',
  'reportTemplateOptions',
  'documentTemplates',
  'reportDrafts',
  'productPhotos',
  'generatedDocuments',
]

export function createServerDatabase(databasePath) {
  const database = new DatabaseSync(databasePath)

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      login_number TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
      is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      last_modified INTEGER NOT NULL,
      local_version TEXT NOT NULL,
      server_timestamp INTEGER,
      server_version TEXT
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS accounts_active_login_idx
      ON accounts (login_number)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS accounts_role_active_idx
      ON accounts (role, is_active)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS report_template_options (
      id TEXT PRIMARY KEY,
      field TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      last_modified INTEGER NOT NULL,
      local_version TEXT NOT NULL,
      server_timestamp INTEGER,
      server_version TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS report_template_options_field_sort_idx
      ON report_template_options (field, sort_order)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
      sections_json TEXT NOT NULL CHECK (json_valid(sections_json)),
      input_schema_json TEXT CHECK (
        input_schema_json IS NULL OR json_valid(input_schema_json)
      ),
      render_spec_json TEXT CHECK (
        render_spec_json IS NULL OR json_valid(render_spec_json)
      ),
      created_by_account_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER,
      deleted_at INTEGER,
      last_modified INTEGER NOT NULL,
      local_version TEXT NOT NULL,
      server_timestamp INTEGER,
      server_version TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS document_templates_status_updated_idx
      ON document_templates (status, updated_at DESC)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS report_drafts (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'exported', 'archived')),
      archived_from_status TEXT CHECK (
        archived_from_status IS NULL OR archived_from_status IN ('draft', 'ready', 'exported')
      ),
      template_id TEXT,
      template_snapshot_json TEXT CHECK (
        template_snapshot_json IS NULL OR json_valid(template_snapshot_json)
      ),
      worker_account_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      inspector_name TEXT NOT NULL,
      main_info_json TEXT NOT NULL CHECK (json_valid(main_info_json)),
      temperature_info_json TEXT NOT NULL CHECK (json_valid(temperature_info_json)),
      inspection_results_json TEXT NOT NULL CHECK (json_valid(inspection_results_json)),
      descriptions_json TEXT NOT NULL CHECK (json_valid(descriptions_json)),
      expert_conclusion TEXT NOT NULL,
      custom_field_values_json TEXT CHECK (
        custom_field_values_json IS NULL OR json_valid(custom_field_values_json)
      ),
      sampling_json TEXT NOT NULL CHECK (json_valid(sampling_json)),
      signatures_json TEXT NOT NULL CHECK (json_valid(signatures_json)),
      photo_ids_json TEXT NOT NULL CHECK (json_valid(photo_ids_json)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      last_modified INTEGER NOT NULL,
      local_version TEXT NOT NULL,
      server_timestamp INTEGER,
      server_version TEXT,
      FOREIGN KEY (worker_account_id) REFERENCES accounts (id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS report_drafts_worker_updated_idx
      ON report_drafts (worker_account_id, updated_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS report_drafts_status_updated_idx
      ON report_drafts (status, updated_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS report_drafts_product_idx
      ON report_drafts (product_id)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS product_photos (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      template_field_id TEXT,
      category TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL CHECK (size >= 0),
      binary_data BLOB NOT NULL,
      caption TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      last_modified INTEGER NOT NULL,
      local_version TEXT NOT NULL,
      server_timestamp INTEGER,
      server_version TEXT,
      FOREIGN KEY (draft_id) REFERENCES report_drafts (id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS product_photos_draft_category_sort_idx
      ON product_photos (draft_id, category, sort_order)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS generated_documents (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      binary_data BLOB NOT NULL,
      generated_at INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      deleted_at INTEGER,
      last_modified INTEGER NOT NULL,
      local_version TEXT NOT NULL,
      server_timestamp INTEGER,
      server_version TEXT,
      FOREIGN KEY (draft_id) REFERENCES report_drafts (id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS generated_documents_draft_generated_idx
      ON generated_documents (draft_id, generated_at DESC)
      WHERE deleted_at IS NULL;
  `)

  migrateProductPhotoTemplateField(database)
  migrateDocumentTemplateSchemas(database)
  migrateReportArchiveStatus(database)

  const statements = prepareStatements(database)

  migrateLegacyEntities(database, statements)
  database.exec('PRAGMA user_version = 5')

  return {
    path: databasePath,
    readDb: (binaryDraftId) => readDb(statements, binaryDraftId),
    writeDb: (data) => writeDb(database, statements, data),
    writeDbReplacingGeneratedDocuments: (data, reportId) =>
      writeDb(database, statements, data, { replaceGeneratedDocumentsForReportId: reportId }),
    purgeExpiredArchivedReports: (nowTimestamp) =>
      purgeExpiredArchivedReports(database, nowTimestamp),
    permanentlyDeleteArchivedReport: (reportId) =>
      permanentlyDeleteArchivedReport(database, reportId),
    close: () => database.close(),
  }
}

function migrateDocumentTemplateSchemas(database) {
  const columns = database.prepare('PRAGMA table_info(document_templates)').all()

  if (!columns.some((column) => column.name === 'input_schema_json')) {
    database.exec('ALTER TABLE document_templates ADD COLUMN input_schema_json TEXT')
  }

  if (!columns.some((column) => column.name === 'render_spec_json')) {
    database.exec('ALTER TABLE document_templates ADD COLUMN render_spec_json TEXT')
  }
}

function migrateProductPhotoTemplateField(database) {
  const columns = database.prepare('PRAGMA table_info(product_photos)').all()

  if (!columns.some((column) => column.name === 'template_field_id')) {
    database.exec('ALTER TABLE product_photos ADD COLUMN template_field_id TEXT')
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS product_photos_draft_template_field_sort_idx
      ON product_photos (draft_id, template_field_id, sort_order)
      WHERE deleted_at IS NULL
  `)
}

function migrateReportArchiveStatus(database) {
  const columns = database.prepare('PRAGMA table_info(report_drafts)').all()

  if (!columns.some((column) => column.name === 'archived_from_status')) {
    database.exec('ALTER TABLE report_drafts ADD COLUMN archived_from_status TEXT')
  }
}

function prepareStatements(database) {
  return {
    accounts: {
      select: database.prepare('SELECT * FROM accounts'),
      upsert: database.prepare(`
        INSERT INTO accounts (
          id, login_number, full_name, role, is_active, created_at, updated_at, deleted_at,
          last_modified, local_version, server_timestamp, server_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          login_number = excluded.login_number,
          full_name = excluded.full_name,
          role = excluded.role,
          is_active = excluded.is_active,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          last_modified = excluded.last_modified,
          local_version = excluded.local_version,
          server_timestamp = excluded.server_timestamp,
          server_version = excluded.server_version
        WHERE excluded.last_modified <> accounts.last_modified
           OR excluded.deleted_at IS NOT accounts.deleted_at
      `),
    },
    reportTemplateOptions: {
      select: database.prepare('SELECT * FROM report_template_options'),
      upsert: database.prepare(`
        INSERT INTO report_template_options (
          id, field, label, value, category, sort_order, created_at, updated_at, deleted_at,
          last_modified, local_version, server_timestamp, server_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          field = excluded.field,
          label = excluded.label,
          value = excluded.value,
          category = excluded.category,
          sort_order = excluded.sort_order,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          last_modified = excluded.last_modified,
          local_version = excluded.local_version,
          server_timestamp = excluded.server_timestamp,
          server_version = excluded.server_version
        WHERE excluded.last_modified <> report_template_options.last_modified
           OR excluded.deleted_at IS NOT report_template_options.deleted_at
      `),
    },
    documentTemplates: {
      select: database.prepare('SELECT * FROM document_templates'),
      upsert: database.prepare(`
        INSERT INTO document_templates (
          id, name, description, status, sections_json, input_schema_json, render_spec_json,
          created_by_account_id, created_at,
          updated_at, published_at, deleted_at, last_modified, local_version, server_timestamp,
          server_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          status = excluded.status,
          sections_json = excluded.sections_json,
          input_schema_json = excluded.input_schema_json,
          render_spec_json = excluded.render_spec_json,
          created_by_account_id = excluded.created_by_account_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          published_at = excluded.published_at,
          deleted_at = excluded.deleted_at,
          last_modified = excluded.last_modified,
          local_version = excluded.local_version,
          server_timestamp = excluded.server_timestamp,
          server_version = excluded.server_version
        WHERE excluded.last_modified <> document_templates.last_modified
           OR excluded.deleted_at IS NOT document_templates.deleted_at
      `),
    },
    reportDrafts: {
      select: database.prepare('SELECT * FROM report_drafts'),
      upsert: database.prepare(`
        INSERT INTO report_drafts (
          id, status, archived_from_status, template_id, template_snapshot_json, worker_account_id, product_id,
          product_name, inspector_name, main_info_json, temperature_info_json,
          inspection_results_json, descriptions_json, expert_conclusion,
          custom_field_values_json, sampling_json, signatures_json, photo_ids_json, created_at,
          updated_at, deleted_at, last_modified, local_version, server_timestamp, server_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          status = excluded.status,
          archived_from_status = excluded.archived_from_status,
          template_id = excluded.template_id,
          template_snapshot_json = excluded.template_snapshot_json,
          worker_account_id = excluded.worker_account_id,
          product_id = excluded.product_id,
          product_name = excluded.product_name,
          inspector_name = excluded.inspector_name,
          main_info_json = excluded.main_info_json,
          temperature_info_json = excluded.temperature_info_json,
          inspection_results_json = excluded.inspection_results_json,
          descriptions_json = excluded.descriptions_json,
          expert_conclusion = excluded.expert_conclusion,
          custom_field_values_json = excluded.custom_field_values_json,
          sampling_json = excluded.sampling_json,
          signatures_json = excluded.signatures_json,
          photo_ids_json = excluded.photo_ids_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          last_modified = excluded.last_modified,
          local_version = excluded.local_version,
          server_timestamp = excluded.server_timestamp,
          server_version = excluded.server_version
        WHERE excluded.last_modified <> report_drafts.last_modified
           OR excluded.deleted_at IS NOT report_drafts.deleted_at
      `),
    },
    productPhotos: {
      select: database.prepare(`
        SELECT
          id, draft_id, template_field_id, category, file_name, mime_type, size, caption, sort_order, created_at,
          deleted_at, last_modified, local_version, server_timestamp, server_version
        FROM product_photos
      `),
      selectBinaryByDraft: database.prepare(`
        SELECT id, binary_data
        FROM product_photos
        WHERE draft_id = ?
      `),
      upsert: database.prepare(`
        INSERT INTO product_photos (
          id, draft_id, template_field_id, category, file_name, mime_type, size, binary_data, caption, sort_order,
          created_at, deleted_at, last_modified, local_version, server_timestamp, server_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          draft_id = excluded.draft_id,
          template_field_id = excluded.template_field_id,
          category = excluded.category,
          file_name = excluded.file_name,
          mime_type = excluded.mime_type,
          size = excluded.size,
          binary_data = CASE WHEN ? THEN excluded.binary_data ELSE product_photos.binary_data END,
          caption = excluded.caption,
          sort_order = excluded.sort_order,
          created_at = excluded.created_at,
          deleted_at = excluded.deleted_at,
          last_modified = excluded.last_modified,
          local_version = excluded.local_version,
          server_timestamp = excluded.server_timestamp,
          server_version = excluded.server_version
        WHERE excluded.last_modified <> product_photos.last_modified
           OR excluded.deleted_at IS NOT product_photos.deleted_at
      `),
    },
    generatedDocuments: {
      select: database.prepare(`
        SELECT
          id, draft_id, file_name, mime_type, generated_at, content_hash, deleted_at,
          last_modified, local_version, server_timestamp, server_version
        FROM generated_documents
      `),
      selectBinaryByDraft: database.prepare(`
        SELECT id, binary_data
        FROM generated_documents
        WHERE draft_id = ?
      `),
      upsert: database.prepare(`
        INSERT INTO generated_documents (
          id, draft_id, file_name, mime_type, binary_data, generated_at, content_hash, deleted_at,
          last_modified, local_version, server_timestamp, server_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          draft_id = excluded.draft_id,
          file_name = excluded.file_name,
          mime_type = excluded.mime_type,
          binary_data = CASE
            WHEN ? THEN excluded.binary_data
            ELSE generated_documents.binary_data
          END,
          generated_at = excluded.generated_at,
          content_hash = excluded.content_hash,
          deleted_at = excluded.deleted_at,
          last_modified = excluded.last_modified,
          local_version = excluded.local_version,
          server_timestamp = excluded.server_timestamp,
          server_version = excluded.server_version
        WHERE excluded.last_modified <> generated_documents.last_modified
           OR excluded.deleted_at IS NOT generated_documents.deleted_at
      `),
    },
  }
}

function readDb(statements, binaryDraftId) {
  const photoBinaryById = binaryDraftId
    ? new Map(
        statements.productPhotos.selectBinaryByDraft
          .all(binaryDraftId)
          .map((row) => [row.id, row.binary_data]),
      )
    : new Map()
  const documentBinaryById = binaryDraftId
    ? new Map(
        statements.generatedDocuments.selectBinaryByDraft
          .all(binaryDraftId)
          .map((row) => [row.id, row.binary_data]),
      )
    : new Map()

  return {
    accounts: statements.accounts.select.all().map(accountFromRow),
    reportTemplateOptions: statements.reportTemplateOptions.select
      .all()
      .map(reportTemplateOptionFromRow),
    documentTemplates: statements.documentTemplates.select.all().map(documentTemplateFromRow),
    reportDrafts: statements.reportDrafts.select.all().map(reportDraftFromRow),
    productPhotos: statements.productPhotos.select
      .all()
      .map((row) => productPhotoFromRow(row, photoBinaryById.get(row.id))),
    generatedDocuments: statements.generatedDocuments.select
      .all()
      .map((row) => generatedDocumentFromRow(row, documentBinaryById.get(row.id))),
  }
}

function writeDb(database, statements, input, options = {}) {
  const data = normalizeDb(input)

  database.exec('BEGIN IMMEDIATE')

  try {
    if (options.replaceGeneratedDocumentsForReportId) {
      database
        .prepare('DELETE FROM generated_documents WHERE draft_id = ?')
        .run(options.replaceGeneratedDocumentsForReportId)
    }

    for (const account of data.accounts) {
      statements.accounts.upsert.run(...accountToParameters(account))
    }

    for (const option of data.reportTemplateOptions) {
      statements.reportTemplateOptions.upsert.run(...reportTemplateOptionToParameters(option))
    }

    for (const template of data.documentTemplates) {
      statements.documentTemplates.upsert.run(...documentTemplateToParameters(template))
    }

    for (const report of data.reportDrafts) {
      statements.reportDrafts.upsert.run(...reportDraftToParameters(report))
    }

    for (const photo of data.productPhotos) {
      statements.productPhotos.upsert.run(...productPhotoToParameters(photo))
    }

    for (const document of data.generatedDocuments) {
      statements.generatedDocuments.upsert.run(...generatedDocumentToParameters(document))
    }

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function purgeExpiredArchivedReports(database, nowTimestamp) {
  const expiredReportIds = database
    .prepare(
      `
      SELECT id, deleted_at
      FROM report_drafts
      WHERE status = 'archived' AND deleted_at IS NOT NULL
    `,
    )
    .all()
    .filter((report) => addCalendarMonth(report.deleted_at) <= nowTimestamp)
    .map((report) => report.id)

  if (!expiredReportIds.length) {
    return 0
  }

  database.exec('BEGIN IMMEDIATE')

  try {
    const deleteDocuments = database.prepare(
      'DELETE FROM generated_documents WHERE draft_id = ?',
    )
    const deletePhotos = database.prepare('DELETE FROM product_photos WHERE draft_id = ?')
    const deleteReport = database.prepare(
      "DELETE FROM report_drafts WHERE id = ? AND status = 'archived'",
    )
    let deletedReportCount = 0

    for (const reportId of expiredReportIds) {
      deleteDocuments.run(reportId)
      deletePhotos.run(reportId)
      deletedReportCount += Number(deleteReport.run(reportId).changes)
    }

    database.exec('COMMIT')
    return deletedReportCount
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
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

function permanentlyDeleteArchivedReport(database, reportId) {
  database.exec('BEGIN IMMEDIATE')

  try {
    database
      .prepare(
        `
        DELETE FROM generated_documents
        WHERE draft_id = ? AND EXISTS (
          SELECT 1 FROM report_drafts WHERE id = ? AND status = 'archived'
        )
      `,
      )
      .run(reportId, reportId)
    database
      .prepare(
        `
        DELETE FROM product_photos
        WHERE draft_id = ? AND EXISTS (
          SELECT 1 FROM report_drafts WHERE id = ? AND status = 'archived'
        )
      `,
      )
      .run(reportId, reportId)
    const result = database
      .prepare("DELETE FROM report_drafts WHERE id = ? AND status = 'archived'")
      .run(reportId)

    database.exec('COMMIT')
    return Number(result.changes)
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function migrateLegacyEntities(database, statements) {
  const legacyTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entities'")
    .get()

  if (!legacyTable) {
    return
  }

  const migrated = normalizeDb({})
  const rows = database.prepare('SELECT collection, data_json, binary_data FROM entities').all()

  for (const row of rows) {
    if (!COLLECTIONS.includes(row.collection)) {
      continue
    }

    const entity = JSON.parse(row.data_json)

    if (row.binary_data) {
      entity.blobBase64 = Buffer.from(row.binary_data).toString('base64')
    }

    migrated[row.collection].push(entity)
  }

  writeDb(database, statements, migrated)
  database.exec('DROP TABLE entities')
}

function accountToParameters(entity) {
  return [
    entity.id,
    entity.loginNumber,
    entity.fullName,
    entity.role,
    entity.isActive ? 1 : 0,
    entity.createdAt,
    entity.updatedAt,
    nullable(entity._deletedAt),
    metadata(entity),
  ].flat()
}

function reportTemplateOptionToParameters(entity) {
  return [
    entity.id,
    entity.field,
    entity.label,
    entity.value,
    entity.category,
    entity.sortOrder,
    entity.createdAt,
    entity.updatedAt,
    nullable(entity._deletedAt),
    metadata(entity),
  ].flat()
}

function documentTemplateToParameters(entity) {
  const sections = entity.inputSchema?.steps ?? entity.sections ?? []

  return [
    entity.id,
    entity.name,
    entity.description,
    entity.status,
    JSON.stringify(sections),
    JSON.stringify(entity.inputSchema ?? { version: 1, steps: sections }),
    JSON.stringify(entity.renderSpec ?? createLegacyRenderSpec(entity.name, sections)),
    entity.createdByAccountId,
    entity.createdAt,
    entity.updatedAt,
    nullable(entity.publishedAt),
    nullable(entity._deletedAt),
    metadata(entity),
  ].flat()
}

function reportDraftToParameters(entity) {
  return [
    entity.id,
    entity.status,
    nullable(entity.archivedFromStatus),
    nullable(entity.templateId),
    jsonOrNull(entity.templateSnapshot),
    entity.workerAccountId,
    entity.productId,
    entity.productName,
    entity.inspectorName,
    JSON.stringify(entity.mainInfo ?? {}),
    JSON.stringify(entity.temperatureInfo ?? {}),
    JSON.stringify(entity.inspectionResults ?? {}),
    JSON.stringify(entity.descriptions ?? {}),
    entity.expertConclusion ?? '',
    jsonOrNull(entity.customFieldValues),
    JSON.stringify(entity.sampling ?? {}),
    JSON.stringify(entity.signatures ?? {}),
    JSON.stringify(entity.photoIds ?? []),
    entity.createdAt,
    entity.updatedAt,
    nullable(entity._deletedAt),
    metadata(entity),
  ].flat()
}

function productPhotoToParameters(entity) {
  const hasBinary = typeof entity.blobBase64 === 'string'

  return [
    entity.id,
    entity.draftId,
    nullable(entity.templateFieldId),
    entity.category,
    entity.fileName,
    entity.mimeType,
    entity.size,
    hasBinary ? Buffer.from(entity.blobBase64, 'base64') : Buffer.alloc(0),
    entity.caption,
    entity.sortOrder,
    entity.createdAt,
    nullable(entity._deletedAt),
    metadata(entity),
    hasBinary ? 1 : 0,
  ].flat()
}

function generatedDocumentToParameters(entity) {
  const hasBinary = typeof entity.blobBase64 === 'string'

  return [
    entity.id,
    entity.draftId,
    entity.fileName,
    entity.mimeType,
    hasBinary ? Buffer.from(entity.blobBase64, 'base64') : Buffer.alloc(0),
    entity.generatedAt,
    entity.contentHash,
    nullable(entity._deletedAt),
    metadata(entity),
    hasBinary ? 1 : 0,
  ].flat()
}

function accountFromRow(row) {
  return withMetadata(row, {
    id: row.id,
    loginNumber: row.login_number,
    fullName: row.full_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function reportTemplateOptionFromRow(row) {
  return withMetadata(row, {
    id: row.id,
    field: row.field,
    label: row.label,
    value: row.value,
    category: row.category,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function documentTemplateFromRow(row) {
  const legacySections = JSON.parse(row.sections_json)
  const inputSchema = row.input_schema_json
    ? JSON.parse(row.input_schema_json)
    : { version: 1, steps: legacySections }
  const storedRenderSpec = row.render_spec_json
    ? JSON.parse(row.render_spec_json)
    : createLegacyRenderSpec(row.name, inputSchema.steps)
  const renderSpec = {
    ...storedRenderSpec,
    mode: 'flow',
    layout: 'branded',
  }

  return withMetadata(row, {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    inputSchema,
    renderSpec,
    sections: inputSchema.steps,
    createdByAccountId: row.created_by_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.published_at === null ? {} : { publishedAt: row.published_at }),
  })
}

function createLegacyRenderSpec(documentTitle, sections) {
  return {
    version: 1,
    mode: 'flow',
    layout: 'branded',
    pageSize: 'A4',
    documentTitle: String(documentTitle ?? ''),
    sections: (sections ?? []).map((section) => ({
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

function reportDraftFromRow(row) {
  return withMetadata(row, {
    id: row.id,
    status: row.status,
    ...(row.archived_from_status === null
      ? {}
      : { archivedFromStatus: row.archived_from_status }),
    ...(row.template_id === null ? {} : { templateId: row.template_id }),
    ...(row.template_snapshot_json === null
      ? {}
      : { templateSnapshot: JSON.parse(row.template_snapshot_json) }),
    workerAccountId: row.worker_account_id,
    productId: row.product_id,
    productName: row.product_name,
    inspectorName: row.inspector_name,
    mainInfo: JSON.parse(row.main_info_json),
    temperatureInfo: JSON.parse(row.temperature_info_json),
    inspectionResults: JSON.parse(row.inspection_results_json),
    descriptions: JSON.parse(row.descriptions_json),
    expertConclusion: row.expert_conclusion,
    ...(row.custom_field_values_json === null
      ? {}
      : { customFieldValues: JSON.parse(row.custom_field_values_json) }),
    sampling: JSON.parse(row.sampling_json),
    signatures: JSON.parse(row.signatures_json),
    photoIds: JSON.parse(row.photo_ids_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function productPhotoFromRow(row, binaryData) {
  return withMetadata(row, {
    id: row.id,
    draftId: row.draft_id,
    ...(row.template_field_id === null ? {} : { templateFieldId: row.template_field_id }),
    category: row.category,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size,
    ...(binaryData ? { blobBase64: Buffer.from(binaryData).toString('base64') } : {}),
    caption: row.caption,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  })
}

function generatedDocumentFromRow(row, binaryData) {
  return withMetadata(row, {
    id: row.id,
    draftId: row.draft_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    ...(binaryData ? { blobBase64: Buffer.from(binaryData).toString('base64') } : {}),
    generatedAt: row.generated_at,
    contentHash: row.content_hash,
  })
}

function metadata(entity) {
  const now = Date.now()
  const localVersion = entity._localVersion ?? `${now}-${randomUUID()}`

  return [
    entity._lastModified ?? now,
    localVersion,
    nullable(entity._serverTimestamp),
    nullable(entity._serverVersion),
  ]
}

function withMetadata(row, entity) {
  return {
    ...entity,
    _syncStatus: 'synced',
    _lastModified: row.last_modified,
    _localVersion: row.local_version,
    ...(row.server_timestamp === null ? {} : { _serverTimestamp: row.server_timestamp }),
    ...(row.server_version === null ? {} : { _serverVersion: row.server_version }),
    ...(row.deleted_at === null ? {} : { _deletedAt: row.deleted_at }),
  }
}

function normalizeDb(input) {
  return Object.fromEntries(
    COLLECTIONS.map((collection) => [
      collection,
      Array.isArray(input?.[collection]) ? input[collection] : [],
    ]),
  )
}

function nullable(value) {
  return value === undefined ? null : value
}

function jsonOrNull(value) {
  return value === undefined ? null : JSON.stringify(value)
}
