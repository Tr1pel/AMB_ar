import { apiDelete, apiGet, apiPost } from '@/shared/api/server-api'
import { SEED_REPORT_TEMPLATE_OPTIONS } from '@/shared/constants/report-template-options'
import {
  cacheReportTemplateOptions,
  offlineDatabase,
} from '@/shared/offline/offline-database'
import { createSyncMetadata } from '@/shared/sync/sync-metadata'
import type { ReportTemplateField, ReportTemplateOption } from '@/types/report'

export interface SaveReportTemplateOptionInput {
  id?: string
  field: ReportTemplateField
  label: string
  value: string
  category: string
}

export class ReportTemplateRepository {
  async ensureSeeds(): Promise<void> {
    const now = Date.now()
    const cachedIds = new Set(await offlineDatabase.reportTemplateOptions.toCollection().primaryKeys())
    const missingOptions: ReportTemplateOption[] = SEED_REPORT_TEMPLATE_OPTIONS
      .filter((option) => !cachedIds.has(option.id))
      .map((option) => ({
        ...option,
        createdAt: now,
        updatedAt: now,
        ...createSyncMetadata('synced'),
      }))

    if (missingOptions.length) {
      await offlineDatabase.reportTemplateOptions.bulkPut(missingOptions)
    }

    if (navigator.onLine) {
      try {
        await apiPost('/api/bootstrap')
      } catch (error) {
        if ((await offlineDatabase.reportTemplateOptions.count()) === 0) {
          throw error
        }
      }
    }
  }

  async list(): Promise<ReportTemplateOption[]> {
    if (navigator.onLine) {
      try {
        const options = await apiGet<ReportTemplateOption[]>('/api/template-options')
        await cacheReportTemplateOptions(options)
      } catch (error) {
        if ((await offlineDatabase.reportTemplateOptions.count()) === 0) {
          throw error
        }
      }
    }

    return offlineDatabase.reportTemplateOptions.toArray()
  }

  async listByField(field: ReportTemplateField): Promise<ReportTemplateOption[]> {
    const options = await this.list()

    return options
      .filter((option) => option.field === field)
      .sort((first, second) => first.sortOrder - second.sortOrder)
  }

  async save(
    input: SaveReportTemplateOptionInput,
    adminAccountId: string,
  ): Promise<ReportTemplateOption> {
    return apiPost<ReportTemplateOption>('/api/template-options', input, adminAccountId)
  }

  async softDelete(optionId: string, adminAccountId: string): Promise<void> {
    await apiDelete(`/api/template-options/${encodeURIComponent(optionId)}`, adminAccountId)
  }
}

export const reportTemplateRepository = new ReportTemplateRepository()

export async function ensureSeedReportTemplateOptions(): Promise<void> {
  await reportTemplateRepository.ensureSeeds()
}

export async function listReportTemplateOptions(): Promise<ReportTemplateOption[]> {
  return reportTemplateRepository.list()
}

export async function listReportTemplateOptionsByField(
  field: ReportTemplateField,
): Promise<ReportTemplateOption[]> {
  return reportTemplateRepository.listByField(field)
}

export async function saveReportTemplateOption(
  input: SaveReportTemplateOptionInput,
  adminAccountId: string,
): Promise<ReportTemplateOption> {
  return reportTemplateRepository.save(input, adminAccountId)
}

export async function softDeleteReportTemplateOption(
  optionId: string,
  adminAccountId: string,
): Promise<void> {
  await reportTemplateRepository.softDelete(optionId, adminAccountId)
}
