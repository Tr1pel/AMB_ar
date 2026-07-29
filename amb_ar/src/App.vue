<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'

const route = useRoute()
const authStore = useAuthStore()

const currentPath = computed(() => route.path)
const showShellControls = computed(() => route.name !== 'login' && authStore.currentAccount)
const navItems = computed(() => {
  if (authStore.isAdmin) {
    return [
      {
        to: '/admin/reports',
        label: 'Отчеты',
        icon: 'list',
      },
      {
        to: '/admin/template',
        label: 'Макет',
        icon: 'sliders',
      },
      {
        to: '/admin/accounts',
        label: 'Аккаунты',
        icon: 'user',
      },
    ]
  }

  return [
    {
      to: '/reports/new',
      label: 'Новый отчет',
      icon: 'plus',
    },
    {
      to: '/reports/history',
      label: 'История',
      icon: 'list',
    },
  ]
})

onMounted(() => {
  void authStore.initialize()
})

function isNavItemActive(path: string): boolean {
  return currentPath.value.startsWith(path)
}

function signOut(): void {
  authStore.signOut()
}
</script>

<template>
  <div class="app-background">
    <div class="app-shell">
      <header v-if="showShellControls" class="account-bar">
        <div>
          <strong>{{ authStore.currentAccount?.fullName }}</strong>
          <span>{{ authStore.isAdmin ? 'Администратор' : 'Работник' }}</span>
        </div>
        <RouterLink class="account-bar__logout" to="/login" @click="signOut">
          Выйти
        </RouterLink>
      </header>

      <RouterView />

      <nav
        v-if="showShellControls"
        class="app-bottom-nav"
        :style="{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }"
        aria-label="Основная навигация"
      >
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          class="app-bottom-nav__link"
          :class="{ 'app-bottom-nav__link--active': isNavItemActive(item.to) }"
          :to="item.to"
        >
          <span class="app-bottom-nav__icon" :class="`app-bottom-nav__icon--${item.icon}`" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.app-background {
  min-height: 100vh;
  padding: 0;
}

.app-shell {
  position: relative;
  width: min(100%, 1240px);
  min-height: 100vh;
  margin: 0 auto;
  background: var(--color-background);
  box-shadow:
    0 0 0 1px rgba(34, 57, 43, 0.08),
    0 24px 80px rgba(34, 57, 43, 0.14);
}

.account-bar {
  position: sticky;
  z-index: 15;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(34, 57, 43, 0.12);
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
}

.account-bar div {
  display: grid;
  min-width: 0;
}

.account-bar strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-bar span {
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 850;
}

.account-bar__logout {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 7px 10px;
  background: var(--color-surface-muted);
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 850;
  text-decoration: none;
  white-space: nowrap;
}

.app-bottom-nav {
  position: fixed;
  z-index: 20;
  right: 10px;
  bottom: 10px;
  left: 10px;
  display: grid;
  max-width: 420px;
  gap: 6px;
  margin: 0 auto;
  border: 1px solid rgba(34, 57, 43, 0.14);
  border-radius: 8px;
  padding: 7px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 34px rgba(34, 57, 43, 0.18);
  backdrop-filter: blur(18px);
}

.app-bottom-nav__link {
  display: grid;
  min-height: 58px;
  place-items: center;
  gap: 4px;
  border-radius: 8px;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 850;
  text-decoration: none;
}

.app-bottom-nav__link--active {
  background: var(--color-primary);
  color: #ffffff;
}

.app-bottom-nav__icon {
  position: relative;
  display: block;
  width: 22px;
  height: 22px;
}

.app-bottom-nav__icon::before,
.app-bottom-nav__icon::after {
  position: absolute;
  content: '';
}

.app-bottom-nav__icon--list {
  border: 2px solid currentColor;
  border-radius: 5px;
}

.app-bottom-nav__icon--list::before,
.app-bottom-nav__icon--list::after {
  right: 4px;
  left: 4px;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
}

.app-bottom-nav__icon--list::before {
  top: 6px;
}

.app-bottom-nav__icon--list::after {
  bottom: 6px;
}

.app-bottom-nav__icon--plus::before,
.app-bottom-nav__icon--plus::after {
  top: 10px;
  left: 3px;
  width: 16px;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
}

.app-bottom-nav__icon--plus::after {
  transform: rotate(90deg);
}

.app-bottom-nav__icon--sliders {
  border-top: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
}

.app-bottom-nav__icon--sliders::before,
.app-bottom-nav__icon--sliders::after {
  width: 7px;
  height: 7px;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: var(--color-surface);
}

.app-bottom-nav__icon--sliders::before {
  top: -5px;
  left: 3px;
}

.app-bottom-nav__icon--sliders::after {
  right: 3px;
  bottom: -5px;
}

.app-bottom-nav__icon--user {
  border: 2px solid currentColor;
  border-radius: 50% 50% 8px 8px;
}

.app-bottom-nav__icon--user::before {
  top: 3px;
  left: 6px;
  width: 6px;
  height: 6px;
  border: 2px solid currentColor;
  border-radius: 50%;
}

.app-bottom-nav__icon--user::after {
  right: 4px;
  bottom: 3px;
  left: 4px;
  height: 5px;
  border: 2px solid currentColor;
  border-radius: 8px 8px 0 0;
  border-bottom: 0;
}

@media (min-width: 1240px) {
  .app-bottom-nav {
    right: calc((100vw - 1240px) / 2 + 24px);
    left: calc((100vw - 1240px) / 2 + 24px);
  }
}

@media print {
  .account-bar,
  .app-bottom-nav {
    display: none;
  }
}

@media (max-width: 520px) {
  .app-shell {
    width: 100%;
    box-shadow: none;
  }
}
</style>
