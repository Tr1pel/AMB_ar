<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import ConfirmationDialog from '@/components/ui/ConfirmationDialog.vue'
import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useSyncStore } from '@/stores/sync.store'

interface NavigationItem {
  id: 'reports' | 'archive' | 'report-action' | 'templates' | 'accounts'
  to: string
  label: string
  shortLabel: string
  icon: string
  iconType?: 'svg'
}

const route = useRoute()
const authStore = useAuthStore()
const syncStore = useSyncStore()

const showShell = computed(() => route.name !== 'login' && authStore.currentAccount)
const pageTitle = computed(() => String(route.meta.title ?? 'Рабочая область'))
const isReportWorkScreen = computed(
  () => route.name === 'edit-report' || route.name === 'report-details',
)
const isAdminReportsPage = computed(
  () => route.name === 'admin-reports' || route.name === 'admin-report-archive',
)
const hasAdminGreenHeader = computed(
  () =>
    isAdminReportsPage.value ||
    route.name === 'admin-template' ||
    route.name === 'admin-accounts',
)
const topbarTitle = computed(() =>
  isAdminReportsPage.value
    ? route.name === 'admin-report-archive'
      ? 'Архив отчетов'
      : 'Отчеты работников'
    : pageTitle.value,
)
const roleLabel = computed(() => (authStore.isAdmin ? 'Администратор' : 'Инспектор ОКК'))
const initials = computed(() =>
  (authStore.currentAccount?.fullName ?? 'АМ')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)
const navItems = computed<NavigationItem[]>(() => {
  if (authStore.isAdmin) {
    return [
      {
        id: 'reports',
        to: '/admin/reports',
        label: 'Журнал отчетов',
        shortLabel: 'Отчеты',
        icon: '/icons/admin-reports.svg',
        iconType: 'svg',
      },
      {
        id: 'archive',
        to: '/admin/reports/archive',
        label: 'Архив отчетов',
        shortLabel: 'Архив',
        icon: '/icons/trash-clock-svgrepo-com.svg',
        iconType: 'svg',
      },
      {
        id: 'templates',
        to: '/admin/template',
        label: 'Макеты отчетов',
        shortLabel: 'Макеты',
        icon: '/icons/admin-reference.svg',
        iconType: 'svg',
      },
      {
        id: 'accounts',
        to: '/admin/accounts',
        label: 'Сотрудники',
        shortLabel: 'Люди',
        icon: '/icons/admin-accounts.svg',
        iconType: 'svg',
      },
    ]
  }

  return [
    {
      id: 'reports',
      to: '/reports/history',
      label: 'Мои отчеты',
      shortLabel: 'Главная',
      icon: '/icons/admin-reports.svg',
      iconType: 'svg',
    },
    {
      id: 'report-action',
      to: '/reports/new',
      label: 'Новый отчет',
      shortLabel: 'Отчет',
      icon: '/icons/admin-reference.svg',
      iconType: 'svg',
    },
  ]
})
onMounted(() => {
  void authStore.initialize()
  void syncStore.initialize()
})

function isNavItemActive(path: string): boolean {
  if (path === '/reports/history') {
    return route.path === path || route.name === 'report-details' || route.name === 'edit-report'
  }

  if (path === '/admin/reports') {
    return (
      route.name === 'admin-reports' ||
      (route.name === 'report-details' && route.query.from !== 'archive')
    )
  }

  if (path === '/admin/reports/archive') {
    return (
      route.name === 'admin-report-archive' ||
      (route.name === 'report-details' && route.query.from === 'archive')
    )
  }

  return route.path.startsWith(path)
}

function isMobileNavItemActive(item: NavigationItem): boolean {
  if (!authStore.isWorker) {
    return isNavItemActive(item.to)
  }

  if (item.id === 'report-action') {
    return route.name === 'new-report' || route.name === 'edit-report'
  }

  if (item.id === 'reports') {
    return route.name === 'worker-reports' || route.name === 'report-details'
  }

  return isNavItemActive(item.to)
}

async function signOut(): Promise<void> {
  await authStore.signOut()
}
</script>

<template>
  <div
    v-if="showShell"
    class="workspace-shell"
    :class="{ 'workspace-shell--compact-topbar': isReportWorkScreen }"
  >
    <aside class="workspace-sidebar">
      <RouterLink class="brand" to="/" aria-label="Рунаш — главная">
        <img src="/runash-logo.png" alt="Рунаш" />
      </RouterLink>

      <nav class="workspace-nav" aria-label="Основная навигация">
        <p>Рабочая область</p>
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="workspace-nav__link"
          :class="{ 'workspace-nav__link--active': isNavItemActive(item.to) }"
        >
          <span class="workspace-nav__icon" aria-hidden="true">
            <span
              v-if="item.iconType === 'svg'"
              class="navigation-svg-icon"
              :style="{
                maskImage: `url(${item.icon})`,
                WebkitMaskImage: `url(${item.icon})`,
              }"
            />
            <template v-else>{{ item.icon }}</template>
          </span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-account">
        <span class="account-avatar">{{ initials }}</span>
        <div>
          <strong>{{ authStore.currentAccount?.fullName }}</strong>
          <small>{{ roleLabel }}</small>
        </div>
        <RouterLink to="/login" title="Выйти" aria-label="Выйти" @click="signOut">
          <span class="logout-svg-icon" aria-hidden="true" />
        </RouterLink>
      </div>
    </aside>

    <section class="workspace-main">
      <header
        class="workspace-topbar"
        :class="{
          'workspace-topbar--admin-reports': hasAdminGreenHeader,
          'workspace-topbar--compact': isReportWorkScreen,
        }"
      >
        <div class="topbar-heading">
          <span class="mobile-brand">
            <img src="/runash-logo.png" alt="Рунаш" />
          </span>
          <h1 v-if="topbarTitle && !isReportWorkScreen">{{ topbarTitle }}</h1>
        </div>
        <div class="topbar-actions">
          <LocaleSwitcher />
          <button
            v-if="authStore.isWorker && !isReportWorkScreen"
            class="sync-status"
            :class="{ 'sync-status--offline': !syncStore.isOnline }"
            type="button"
            :title="syncStore.lastError ?? syncStore.statusLabel"
            @click="syncStore.synchronizeNow"
          >
            <span aria-hidden="true" />
            {{ syncStore.statusLabel }}
          </button>
        </div>
        <div class="topbar-account">
          <span class="account-avatar">{{ initials }}</span>
          <div>
            <strong>{{ authStore.currentAccount?.fullName }}</strong>
            <small>{{ roleLabel }}</small>
          </div>
        </div>
        <div class="mobile-account">
          <span class="account-avatar">{{ initials }}</span>
          <div class="mobile-account__identity">
            <strong>{{ authStore.currentAccount?.fullName }}</strong>
            <small>{{ roleLabel }}</small>
          </div>
          <RouterLink class="mobile-account__logout" to="/login" @click="signOut">
            <span class="logout-svg-icon" aria-hidden="true" />
            Выйти
          </RouterLink>
        </div>
      </header>

      <div class="workspace-content">
        <RouterView />
      </div>
    </section>

    <nav class="mobile-nav" aria-label="Мобильная навигация">
      <RouterLink
        v-for="item in navItems"
        :key="item.id"
        :to="item.to"
        :class="{ 'mobile-nav__link--active': isMobileNavItemActive(item) }"
      >
        <span aria-hidden="true">
          <span
            v-if="item.iconType === 'svg'"
            class="navigation-svg-icon"
            :style="{
              maskImage: `url(${item.icon})`,
              WebkitMaskImage: `url(${item.icon})`,
            }"
          />
          <template v-else>{{ item.icon }}</template>
        </span>
        <small>{{ item.shortLabel }}</small>
      </RouterLink>
    </nav>
  </div>

  <RouterView v-else />
  <LocaleSwitcher v-if="!showShell" class="public-locale-switcher" />
  <ConfirmationDialog />
</template>

<style scoped>
.workspace-shell {
  --workspace-topbar-offset: 72px;
  min-height: 100vh;
  background: var(--color-background);
}

.workspace-sidebar {
  position: fixed;
  z-index: 30;
  inset: 0 auto 0 0;
  display: flex;
  width: 252px;
  flex-direction: column;
  padding: 22px 16px 18px;
  background: var(--color-primary);
  color: #f7faf8;
}

.brand {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 6px;
  text-decoration: none;
}

.brand img {
  display: block;
  width: min(100%, 190px);
  height: auto;
  object-fit: contain;
  object-position: left center;
}

.sidebar-account div,
.topbar-account div {
  display: grid;
  min-width: 0;
}

.workspace-nav {
  display: grid;
  gap: 5px;
  margin-top: 34px;
}

.workspace-nav > p {
  margin: 0 10px 8px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 0.64rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-nav__link {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  border-radius: 10px;
  padding: 8px 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.84rem;
  font-weight: 750;
  text-decoration: none;
}

.workspace-nav__link:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
}

.workspace-nav__link--active {
  background: #f4f7f4;
  color: var(--color-primary);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}

.workspace-nav__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 1rem;
  font-weight: 900;
}

.navigation-svg-icon {
  display: block;
  width: 18px;
  height: 18px;
  background: currentColor;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}

.workspace-nav__link--active .workspace-nav__icon {
  background: var(--color-primary-soft);
}

.sidebar-account {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 16px 4px 0;
}

.account-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.7rem;
  font-weight: 900;
}

.sidebar-account strong,
.topbar-account strong {
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-account small,
.topbar-account small {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.68rem;
}

.sidebar-account a {
  color: rgba(255, 255, 255, 0.54);
  text-decoration: none;
}

.logout-svg-icon {
  display: block;
  width: 18px;
  height: 18px;
  background: currentColor;
  mask: url('/icons/logout.svg') center / contain no-repeat;
}

.workspace-main {
  min-height: 100vh;
  margin-left: 252px;
}

.workspace-topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 24px;
  min-height: 72px;
  border-bottom: 1px solid var(--color-border);
  padding: 10px clamp(18px, 3vw, 36px);
  background: rgba(248, 250, 247, 0.94);
  backdrop-filter: blur(16px);
}

.topbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.public-locale-switcher {
  position: fixed;
  z-index: 100;
  top: 18px;
  right: 18px;
}

.workspace-topbar h1 {
  font-size: 1.05rem;
  font-weight: 900;
}

.mobile-brand {
  display: none;
}

.mobile-account {
  display: none;
}

.topbar-account small {
  color: var(--color-text-muted);
  font-size: 0.67rem;
}

.topbar-account {
  display: flex;
  max-width: 220px;
  align-items: center;
  gap: 10px;
}

.sync-status {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 750;
}

.sync-status span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #348b55;
}

.sync-status--offline span {
  background: #c07b28;
}

.workspace-content {
  min-height: calc(100vh - 72px);
}

.mobile-nav {
  display: none;
}

@media (max-width: 960px) {
  .workspace-shell {
    --workspace-topbar-offset: 114px;
  }

  .workspace-shell--compact-topbar {
    --workspace-topbar-offset: 72px;
  }

  .workspace-sidebar {
    display: none;
  }

  .workspace-main {
    margin-left: 0;
  }

  .workspace-topbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .topbar-heading {
    display: contents;
  }

  .topbar-heading h1 {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
  }

  .mobile-brand {
    display: flex;
    grid-column: 1;
    grid-row: 1;
    width: 112px;
    padding: 4px 7px;
    align-items: center;
    border-radius: 7px;
    background: var(--color-primary);
  }

  .mobile-brand img {
    display: block;
    width: 100%;
    height: auto;
  }

  .topbar-account {
    display: none;
  }

  .sync-status {
    white-space: nowrap;
  }

  .topbar-actions {
    grid-column: 2;
    grid-row: 2;
    flex-wrap: wrap;
  }

  .workspace-topbar--compact .topbar-actions {
    grid-row: 1;
  }

  .workspace-topbar--compact .mobile-account {
    display: none;
  }

  .mobile-account {
    display: grid;
    grid-column: 2;
    grid-row: 1;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 8px 9px;
    background: var(--color-surface);
  }

  .mobile-account__identity {
    display: grid;
    min-width: 0;
  }

  .mobile-account__identity strong {
    overflow: hidden;
    color: var(--color-text);
    font-size: 0.78rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-account__identity small {
    color: var(--color-text-muted);
    font-size: 0.66rem;
  }

  .mobile-account__logout {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 5px;
    border-radius: 8px;
    padding: 7px 9px;
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-size: 0.72rem;
    font-weight: 800;
    text-decoration: none;
  }

  .mobile-nav {
    position: fixed;
    z-index: 40;
    right: 10px;
    bottom: 10px;
    left: 10px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    max-width: 520px;
    gap: 5px;
    margin: 0 auto;
    border: 1px solid rgba(18, 55, 42, 0.14);
    border-radius: 15px;
    padding: 7px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 18px 46px rgba(18, 55, 42, 0.2);
    backdrop-filter: blur(18px);
  }

  .mobile-nav a {
    display: grid;
    min-height: 54px;
    place-items: center;
    gap: 1px;
    border-radius: 10px;
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .mobile-nav a > span {
    font-size: 1.05rem;
    font-weight: 900;
  }

  .mobile-nav a small {
    font-size: 0.64rem;
    font-weight: 800;
  }

  .mobile-nav__link--active {
    background: var(--color-primary);
    color: #ffffff !important;
  }
}

:global(html[dir='rtl'] .workspace-sidebar) {
  inset: 0 0 0 auto;
}

:global(html[dir='rtl'] .workspace-main) {
  margin-right: 252px;
  margin-left: 0;
}

:global(html[dir='rtl'] .brand img) {
  object-position: right center;
}

:global(html[dir='rtl'] .public-locale-switcher) {
  right: auto;
  left: 18px;
}

@media (max-width: 960px) {
  :global(html[dir='rtl'] .workspace-main) {
    margin-right: 0;
  }
}

@media (min-width: 961px) {
  .workspace-topbar--admin-reports {
    gap: 20px;
    min-height: 72px;
    margin: 0 12px;
    border-bottom: 0;
    border-radius: 0 0 8px 8px;
    background: var(--color-primary);
    color: #ffffff;
  }

  .workspace-topbar--admin-reports h1 {
    font-size: 1.65rem;
    line-height: 1.1;
  }

  .workspace-topbar--admin-reports .topbar-account strong,
  .workspace-topbar--admin-reports .topbar-account small {
    color: #ffffff;
  }

  .workspace-topbar--admin-reports .account-avatar {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
  }
}

@media (max-width: 620px) {
  .workspace-topbar {
    min-height: 0;
    padding: 8px 14px;
  }

  .workspace-topbar h1 {
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.25;
  }

  .mobile-brand {
    width: 104px;
  }

  .workspace-topbar {
    grid-template-columns: 104px minmax(0, 1fr);
  }

  .mobile-account {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px;
    padding: 6px 7px;
  }

  .mobile-account .account-avatar {
    display: none;
  }

  .mobile-account__logout {
    padding-inline: 8px;
  }

  .topbar-actions {
    gap: 5px;
  }

  .topbar-actions .sync-status {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .public-locale-switcher {
    top: 10px;
    right: 10px;
  }

  :global(html[dir='rtl'] .public-locale-switcher) {
    right: auto;
    left: 10px;
  }
}

@media print {
  .workspace-sidebar,
  .workspace-topbar,
  .mobile-nav {
    display: none;
  }

  .workspace-main {
    margin-left: 0;
  }
}
</style>
