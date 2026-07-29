<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'

const authStore = useAuthStore()
const router = useRouter()
const loginNumber = ref('')

async function handleSignIn(): Promise<void> {
  const account = await authStore.signIn(loginNumber.value)

  if (!account) {
    return
  }

  await router.push(account.role === 'admin' ? { name: 'admin-reports' } : { name: 'new-report' })
}
</script>

<template>
  <main class="screen-page login-page">
    <section class="login-panel app-card">
      <div>
        <p class="screen-kicker">АМБАР QC</p>
        <h1 class="screen-title">Вход по номеру аккаунта</h1>
        <p class="screen-subtitle">
          Аккаунты заранее заданы в локальной базе. Самостоятельная регистрация недоступна.
        </p>
      </div>

      <form class="login-form" @submit.prevent="handleSignIn">
        <label class="field-label" for="loginNumber">
          Уникальный номер
          <input
            id="loginNumber"
            v-model="loginNumber"
            class="field-control"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="Например, 2001"
          />
        </label>

        <button class="primary-button" type="submit" :disabled="authStore.isLoading">
          {{ authStore.isLoading ? 'Проверяем...' : 'Войти' }}
        </button>
      </form>

      <p v-if="authStore.errorMessage" class="error-message">
        {{ authStore.errorMessage }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  place-items: center;
  padding-bottom: 24px;
}

.login-panel {
  display: grid;
  width: min(100%, 480px);
  gap: 18px;
  padding: 20px;
}

.login-form {
  display: grid;
  gap: 14px;
}
</style>
