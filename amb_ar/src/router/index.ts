import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'
import type { AccountRole } from '@/types/report'
import HomeView from '@/views/HomeView.vue'
import ReportFormView from '@/views/ReportFormView.vue'
import ReportTemplateSelectionView from '@/views/ReportTemplateSelectionView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/',
      name: 'root',
      component: HomeView,
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: 'Вход' },
    },
    {
      path: '/admin/reports',
      name: 'admin-reports',
      component: HomeView,
      props: { archiveMode: false },
      meta: { requiresAuth: true, roles: ['admin'], title: '' },
    },
    {
      path: '/admin/reports/archive',
      name: 'admin-report-archive',
      component: HomeView,
      props: { archiveMode: true },
      meta: { requiresAuth: true, roles: ['admin'], title: '' },
    },
    {
      path: '/admin/template',
      name: 'admin-template',
      component: () => import('@/views/AdminTemplateView.vue'),
      meta: { requiresAuth: true, roles: ['admin'], title: 'Макеты отчетов' },
    },
    {
      path: '/admin/accounts',
      name: 'admin-accounts',
      component: () => import('@/views/AdminAccountsView.vue'),
      meta: { requiresAuth: true, roles: ['admin'], title: 'Сотрудники' },
    },
    {
      path: '/reports/new',
      name: 'new-report',
      component: ReportTemplateSelectionView,
      meta: { requiresAuth: true, roles: ['worker'], title: 'Отчет' },
    },
    {
      path: '/reports/:reportId/edit',
      name: 'edit-report',
      component: ReportFormView,
      props: true,
      meta: { requiresAuth: true, roles: ['worker'], title: 'Отчет' },
    },
    {
      path: '/reports/history',
      name: 'worker-reports',
      component: () => import('@/views/WorkerReportsView.vue'),
      meta: { requiresAuth: true, roles: ['worker'], title: 'Мои отчеты' },
    },
    {
      path: '/reports/:reportId',
      name: 'report-details',
      component: () => import('@/views/ReportDetailView.vue'),
      props: true,
      meta: { requiresAuth: true, roles: ['admin', 'worker'], title: 'Карточка отчета' },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  await authStore.initialize()

  if (to.name === 'root') {
    if (!authStore.currentAccount) {
      return { name: 'login' }
    }

    return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'worker-reports' }
  }

  if (to.name === 'login' && authStore.currentAccount) {
    return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'worker-reports' }
  }

  if (to.meta.requiresAuth && !authStore.currentAccount) {
    return { name: 'login' }
  }

  const allowedRoles = to.meta.roles as AccountRole[] | undefined

  if (
    allowedRoles &&
    authStore.currentAccount &&
    !allowedRoles.includes(authStore.currentAccount.role)
  ) {
    return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'worker-reports' }
  }

  return true
})

export default router
