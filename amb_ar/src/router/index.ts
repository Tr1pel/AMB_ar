import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'
import type { AccountRole } from '@/types/report'
import HomeView from '@/views/HomeView.vue'
import ReportFormView from '@/views/ReportFormView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
    },
    {
      path: '/admin/reports',
      name: 'admin-reports',
      component: HomeView,
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/template',
      name: 'admin-template',
      component: () => import('@/views/AdminTemplateView.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/admin/accounts',
      name: 'admin-accounts',
      component: () => import('@/views/AdminAccountsView.vue'),
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/reports/new',
      name: 'new-report',
      component: ReportFormView,
      meta: { requiresAuth: true, roles: ['worker'] },
    },
    {
      path: '/reports/history',
      name: 'worker-reports',
      component: () => import('@/views/WorkerReportsView.vue'),
      meta: { requiresAuth: true, roles: ['worker'] },
    },
    {
      path: '/reports/:reportId',
      name: 'report-details',
      component: () => import('@/views/ReportDetailView.vue'),
      props: true,
      meta: { requiresAuth: true, roles: ['admin', 'worker'] },
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

    return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'new-report' }
  }

  if (to.name === 'login' && authStore.currentAccount) {
    return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'new-report' }
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
    return authStore.isAdmin ? { name: 'admin-reports' } : { name: 'new-report' }
  }

  return true
})

export default router
