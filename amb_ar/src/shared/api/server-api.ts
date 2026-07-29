import type { Account, ReportDraft, ReportTemplateOption } from '@/types/report'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchServerAccounts(adminAccountId: string): Promise<Account[]> {
  return apiGet<Account[]>('/api/accounts', adminAccountId)
}

export async function findServerAccountByLoginNumber(loginNumber: string): Promise<Account | null> {
  return apiGet<Account | null>(`/api/accounts/login?loginNumber=${encodeURIComponent(loginNumber)}`)
}

export async function getServerAccount(accountId: string): Promise<Account | null> {
  return apiGet<Account | null>(`/api/accounts/${encodeURIComponent(accountId)}`)
}

export async function createServerAccount(
  input: Pick<Account, 'loginNumber' | 'fullName' | 'role'>,
  adminAccountId: string,
): Promise<Account> {
  return apiPost<Account>('/api/accounts', input, adminAccountId)
}

export async function updateServerAccount(
  accountId: string,
  input: Partial<Pick<Account, 'loginNumber' | 'fullName' | 'role' | 'isActive'>>,
  adminAccountId: string,
): Promise<Account> {
  return apiPatch<Account>(`/api/accounts/${encodeURIComponent(accountId)}`, input, adminAccountId)
}

export async function deleteServerAccount(
  accountId: string,
  adminAccountId: string,
): Promise<void> {
  await apiDelete(`/api/accounts/${encodeURIComponent(accountId)}`, adminAccountId)
}

export async function fetchServerTemplateOptions(): Promise<ReportTemplateOption[]> {
  return apiGet<ReportTemplateOption[]>('/api/template-options')
}

export async function saveServerTemplateOption(
  input: Partial<ReportTemplateOption>,
  adminAccountId: string,
): Promise<ReportTemplateOption> {
  return apiPost<ReportTemplateOption>('/api/template-options', input, adminAccountId)
}

export async function deleteServerTemplateOption(
  optionId: string,
  adminAccountId: string,
): Promise<void> {
  await apiDelete(`/api/template-options/${encodeURIComponent(optionId)}`, adminAccountId)
}

export async function fetchServerReports(adminAccountId: string): Promise<ReportDraft[]> {
  return apiGet<ReportDraft[]>('/api/reports', adminAccountId)
}

export async function fetchServerWorkerReports(workerAccountId: string): Promise<ReportDraft[]> {
  return apiGet<ReportDraft[]>('/api/reports/mine', workerAccountId)
}

export async function uploadServerReport(report: ReportDraft): Promise<void> {
  await apiPost('/api/reports', report)
}

async function apiGet<T>(path: string, accountId?: string): Promise<T> {
  return apiRequest<T>(path, {
    method: 'GET',
    accountId,
  })
}

async function apiPost<T>(path: string, body: unknown, accountId?: string): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body,
    accountId,
  })
}

async function apiPatch<T>(path: string, body: unknown, accountId?: string): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body,
    accountId,
  })
}

async function apiDelete(path: string, accountId?: string): Promise<void> {
  await apiRequest(path, {
    method: 'DELETE',
    accountId,
  })
}

async function apiRequest<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    accountId?: string
  },
): Promise<T> {
  const headers = new Headers()

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.accountId) {
    headers.set('X-Account-Id', options.accountId)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }

    return body.message ?? 'Сервер вернул ошибку'
  } catch {
    return 'Сервер вернул ошибку'
  }
}
