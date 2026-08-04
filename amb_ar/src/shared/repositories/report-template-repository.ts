import { apiDelete, apiGet, apiPost } from '@/shared/api/server-api'
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
    await apiPost('/api/bootstrap')
  }

  async list(): Promise<ReportTemplateOption[]> {
    return apiGet<ReportTemplateOption[]>('/api/template-options')
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
