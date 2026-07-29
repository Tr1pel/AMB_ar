import type { AccountRole } from '@/types/report'

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
