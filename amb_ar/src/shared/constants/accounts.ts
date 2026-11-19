import type { AccountRole } from '@/types/report'

export const ACCOUNT_ROLE_LABELS: Record<AccountRole, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  worker: 'Специалист',
}

export const ACCOUNT_HOME_ROUTES: Record<AccountRole, string> = {
  admin: 'admin-reports',
  manager: 'manager-reports',
  worker: 'worker-reports',
}

export interface SeedAccount {
  id: string
  loginNumber: string
  fullName: string
  role: AccountRole
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    id: 'account-admin-main',
    loginNumber: '1001',
    fullName: 'Администратор АМБАР',
    role: 'admin',
  },
  {
    id: 'account-worker-ivanov',
    loginNumber: '2001',
    fullName: 'Иванов Иван Иванович',
    role: 'worker',
  },
  {
    id: 'account-worker-petrova',
    loginNumber: '2002',
    fullName: 'Петрова Анна Сергеевна',
    role: 'worker',
  },
]
