import { SEED_REPORT_TEMPLATE_OPTIONS } from '@/shared/constants/report-template-options'
import {
  deleteServerTemplateOption,
  fetchServerTemplateOptions,
  saveServerTemplateOption,
} from '@/shared/api/server-api'
import { appDb } from '@/shared/db/app-db'
import { createEntityId, createSyncMetadata } from '@/shared/sync/sync-metadata'
import type { ReportTemplateField, ReportTemplateOption } from '@/types/report'

export interface SaveReportTemplateOptionInput {
  id?: string
  field: ReportTemplateField
  label: string
  value: string
  category: string
}

export async function ensureSeedReportTemplateOptions(): Promise<void> {
  try {
    const serverOptions = await fetchServerTemplateOptions()

    if (serverOptions.length) {
      await appDb.reportTemplateOptions.bulkPut(serverOptions)
      return
    }
  } catch {
    // Keep the latest local template cache available when the server is offline.
  }

  const now = Date.now()
  const existingCount = await appDb.reportTemplateOptions.count()

  if (existingCount > 0) {
    return
  }

  await appDb.reportTemplateOptions.bulkPut(
    SEED_REPORT_TEMPLATE_OPTIONS.map<ReportTemplateOption>((option) => ({
      id: option.id,
      field: option.field,
      label: option.label,
      value: option.value,
      category: option.category,
      sortOrder: option.sortOrder,
      createdAt: now,
      updatedAt: now,
      ...createSyncMetadata('synced'),
    })),
  )
}

export async function listReportTemplateOptions(): Promise<ReportTemplateOption[]> {
  return appDb.reportTemplateOptions
    .orderBy('sortOrder')
    .filter((option) => option._deletedAt === undefined)
    .toArray()
}

export async function listReportTemplateOptionsByField(
  field: ReportTemplateField,
): Promise<ReportTemplateOption[]> {
  return appDb.reportTemplateOptions
    .where('field')
    .equals(field)
    .filter((option) => option._deletedAt === undefined)
    .sortBy('sortOrder')
}

export async function saveReportTemplateOption(
  input: SaveReportTemplateOptionInput,
  adminAccountId: string,
): Promise<ReportTemplateOption> {
  const serverOption = await saveServerTemplateOption(input, adminAccountId)

  await appDb.reportTemplateOptions.put(serverOption)

  return serverOption
}

export async function saveLocalReportTemplateOption(
  input: SaveReportTemplateOptionInput,
): Promise<ReportTemplateOption> {
  const now = Date.now()
  const existingOption = input.id ? await appDb.reportTemplateOptions.get(input.id) : null
  const fieldOptions = await listReportTemplateOptionsByField(input.field)
  const label = input.label.trim()
  const value = input.value.trim() || label
  const category = input.category.trim()
  const option: ReportTemplateOption = {
    id: existingOption?.id ?? createEntityId('templateOption'),
    field: input.field,
    label,
    value,
    category,
    sortOrder: existingOption?.sortOrder ?? fieldOptions.length + 1,
    createdAt: existingOption?.createdAt ?? now,
    updatedAt: now,
    ...createSyncMetadata('synced'),
  }

  await appDb.reportTemplateOptions.put(option)

  return option
}

export async function softDeleteReportTemplateOption(
  optionId: string,
  adminAccountId: string,
): Promise<void> {
  await deleteServerTemplateOption(optionId, adminAccountId)

  const option = await appDb.reportTemplateOptions.get(optionId)

  if (!option) {
    return
  }

  const deletedAt = Date.now()

  await appDb.reportTemplateOptions.put({
    ...option,
    _deletedAt: deletedAt,
    updatedAt: deletedAt,
    ...createSyncMetadata('synced'),
  })
}
