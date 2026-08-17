<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'
import type { AccountRole } from '@/types/report'

const authStore = useAuthStore()
const router = useRouter()
const loginNumber = ref('')
const password = ref('')
const selectedDemoRole = ref<AccountRole | null>(null)

async function handleSignIn(): Promise<void> {
  const account = await authStore.signIn(loginNumber.value, password.value)

  if (account) {
    await goToWorkspace(account.role)
  }
}

async function handleDemoSignIn(role: AccountRole): Promise<void> {
  selectedDemoRole.value = role
  const account = await authStore.signInAsRole(role)
  selectedDemoRole.value = null

  if (account) {
    await goToWorkspace(account.role)
  }
}

async function goToWorkspace(role: AccountRole): Promise<void> {
  await router.push(role === 'admin' ? { name: 'admin-reports' } : { name: 'worker-reports' })
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel app-card">
      <header class="login-heading">
        <span class="login-brand">
          <img src="/runash-logo.png" alt="Рунаш" />
        </span>
        <h1>Вход</h1>
      </header>

      <div class="role-actions" aria-label="Демо-вход">
        <button
          class="role-button role-button--primary"
          type="button"
          :disabled="authStore.isLoading"
          @click="handleDemoSignIn('worker')"
        >
          <span class="role-button__icon">И</span>
          <strong>{{ selectedDemoRole === 'worker' ? 'Открываем...' : 'Инспектор ОКК' }}</strong>
        </button>

        <button
          class="role-button"
          type="button"
          :disabled="authStore.isLoading"
          @click="handleDemoSignIn('admin')"
        >
          <span class="role-button__icon">А</span>
          <strong>{{ selectedDemoRole === 'admin' ? 'Открываем...' : 'Администратор' }}</strong>
        </button>
      </div>

      <div class="login-divider"><span>или по номеру и паролю</span></div>

      <form class="login-form" @submit.prevent="handleSignIn">
        <label class="field-label" for="loginNumber">
          Номер сотрудника
          <input
            id="loginNumber"
            v-model="loginNumber"
            class="field-control"
            inputmode="numeric"
            autocomplete="username"
            placeholder="Например, 2001"
            required
          />
        </label>
        <label class="field-label" for="password">
          Пароль
          <input
            id="password"
            v-model="password"
            class="field-control"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>
        <button class="primary-button" type="submit" :disabled="authStore.isLoading">
          {{ authStore.isLoading && !selectedDemoRole ? 'Проверяем...' : 'Войти' }}
        </button>
      </form>

      <p v-if="authStore.errorMessage" class="error-message">{{ authStore.errorMessage }}</p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(520px, 1.1fr);
  min-height: 100vh;
}

.login-brand-panel {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  padding: clamp(28px, 5vw, 64px);
  background:
    linear-gradient(145deg, rgba(198, 122, 36, 0.08), transparent 40%),
    var(--color-primary);
  color: #ffffff;
}

.login-brand {
  display: flex;
  align-items: center;
}

.login-brand img {
  display: block;
  width: min(100%, 230px);
  height: auto;
  object-fit: contain;
  object-position: left center;
}

.login-brand-panel__message {
  max-width: 560px;
  margin: auto 0;
}

.login-brand-panel__message p {
  color: #e7b779;
  font-size: 0.7rem;
  font-weight: 850;
  letter-spacing: 0.12em;
}

.login-brand-panel__message h1 {
  margin-top: 14px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(2.4rem, 5vw, 4.8rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 0.98;
}

.login-brand-panel__message span {
  display: block;
  max-width: 520px;
  margin-top: 24px;
  color: rgba(255, 255, 255, 0.66);
  font-size: 1rem;
}

.login-brand-panel ul {
  display: grid;
  gap: 10px;
  margin: 0 0 36px;
  padding: 0;
  list-style: none;
}

.login-brand-panel li {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.73);
  font-size: 0.82rem;
  font-weight: 720;
}

.login-brand-panel li i {
  color: #e7b779;
  font-size: 0.65rem;
  font-style: normal;
  font-weight: 900;
}

.login-version {
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.68rem;
}

.login-workspace {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: clamp(20px, 5vw, 64px);
  background:
    radial-gradient(circle at 100% 0%, rgba(117, 167, 133, 0.18), transparent 28rem),
    var(--color-background);
}

.login-panel {
  display: grid;
  width: min(100%, 560px);
  gap: 24px;
  padding: clamp(24px, 5vw, 40px);
}

.login-panel header {
  display: grid;
}

.workspace-label {
  display: inline-flex;
  width: max-content;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.66rem;
  font-weight: 850;
  text-transform: uppercase;
}

.login-panel h2 {
  margin-top: 16px;
  font-size: clamp(1.65rem, 4vw, 2.15rem);
  font-weight: 900;
  letter-spacing: -0.03em;
}

.login-panel header p {
  margin-top: 7px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.role-actions,
.login-form {
  display: grid;
  gap: 10px;
}

.role-button {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
}

.role-button:hover:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.role-button--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.role-button--primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.role-button__icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 900;
}

.role-button--primary .role-button__icon {
  background: rgba(255, 255, 255, 0.13);
  color: #ffffff;
}

.role-button > span:nth-child(2) {
  display: grid;
}

.role-button strong {
  font-size: 0.88rem;
  font-weight: 900;
}

.role-button small {
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.role-button--primary small {
  color: rgba(255, 255, 255, 0.58);
}

.role-button b {
  font-size: 1.1rem;
}

.login-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.login-divider::before,
.login-divider::after {
  height: 1px;
  flex: 1;
  background: var(--color-border);
  content: '';
}

.login-form {
  grid-template-columns: 1fr;
  align-items: end;
}

.login-panel footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
  color: var(--color-text-muted);
  font-size: 0.68rem;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-brand-panel {
    min-height: auto;
    padding: 28px 24px;
  }

  .login-brand-panel__message {
    margin: 48px 0 38px;
  }

  .login-brand-panel__message h1 {
    max-width: 640px;
    font-size: clamp(2.3rem, 9vw, 4.5rem);
  }

  .login-brand-panel ul,
  .login-version {
    display: none;
  }

  .login-workspace {
    min-height: auto;
    padding: 24px 16px 40px;
  }
}

@media (max-width: 520px) {
  .login-form {
    grid-template-columns: 1fr;
  }

  .login-panel footer {
    flex-direction: column;
  }
}

.login-page {
  grid-template-columns: 1fr;
  min-height: 100svh;
  place-items: center;
  padding: 24px;
  overflow: auto;
  background:
    radial-gradient(circle at 50% 0%, rgba(117, 167, 133, 0.2), transparent 30rem),
    var(--color-background);
}

.login-panel {
  width: min(100%, 480px);
  gap: 18px;
  padding: 28px;
}

.login-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.login-brand {
  width: 180px;
  border-radius: 9px;
  padding: 6px 10px;
  background: var(--color-primary);
}

.login-brand img {
  width: 100%;
}

.login-heading h1 {
  color: var(--color-text);
  font-size: 1.45rem;
  font-weight: 800;
}

.role-button {
  grid-template-columns: 40px minmax(0, 1fr);
  min-height: 60px;
  padding: 10px 12px;
}

.role-button strong {
  font-size: 0.86rem;
}

.login-form {
  grid-template-columns: 1fr;
}

@media (max-width: 520px) {
  .login-page {
    height: 100svh;
    min-height: 100svh;
    padding: 12px;
  }

  .login-panel {
    gap: 14px;
    padding: 18px;
  }

  .login-brand {
    width: 145px;
  }

  .login-heading h1 {
    font-size: 1.2rem;
  }

  .role-actions {
    gap: 8px;
  }

  .role-button {
    min-height: 54px;
    padding-block: 7px;
  }

  .login-form {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

@media (max-width: 520px) and (max-height: 620px) {
  .login-page {
    align-items: start;
    padding: 8px;
  }

  .login-panel {
    gap: 10px;
    padding: 14px;
  }

  .login-brand {
    width: 132px;
    padding-block: 4px;
  }

  .role-actions {
    gap: 6px;
  }

  .role-button {
    min-height: 48px;
  }
}
</style>
