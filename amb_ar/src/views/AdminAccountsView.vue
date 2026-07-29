<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { useAccountAdminStore } from '@/stores/account-admin.store'
import type { Account, AccountRole } from '@/types/report'

const accountAdminStore = useAccountAdminStore()
const editingAccountId = ref<string | null>(null)
const accountForm = reactive({
  loginNumber: '',
  fullName: '',
  role: 'worker' as AccountRole,
})

onMounted(() => {
  void accountAdminStore.loadAccounts()
})

function startCreate(): void {
  editingAccountId.value = null
  accountForm.loginNumber = ''
  accountForm.fullName = ''
  accountForm.role = 'worker'
}

function startEdit(account: Account): void {
  editingAccountId.value = account.id
  accountForm.loginNumber = account.loginNumber
  accountForm.fullName = account.fullName
  accountForm.role = account.role
}

async function saveAccount(): Promise<void> {
  if (!accountForm.loginNumber.trim() || !accountForm.fullName.trim()) {
    return
  }

  await accountAdminStore.save({
    id: editingAccountId.value ?? undefined,
    loginNumber: accountForm.loginNumber,
    fullName: accountForm.fullName,
    role: accountForm.role,
    isActive: true,
  })
  startCreate()
}

async function deleteAccount(accountId: string): Promise<void> {
  await accountAdminStore.deleteAccount(accountId)

  if (editingAccountId.value === accountId) {
    startCreate()
  }
}
</script>

<template>
  <main class="screen-page accounts-page">
    <section class="screen-heading">
      <div>
        <p class="screen-kicker">Администратор</p>
        <h1 class="screen-title">Аккаунты</h1>
        <p class="screen-subtitle">
          Аккаунты хранятся в серверной БД. Работники входят по уникальному номеру.
        </p>
      </div>
    </section>

    <section class="accounts-layout">
      <form class="account-form app-card" @submit.prevent="saveAccount">
        <label class="field-label">
          Уникальный номер
          <input v-model="accountForm.loginNumber" class="field-control" inputmode="numeric" />
        </label>

        <label class="field-label">
          ФИО
          <input v-model="accountForm.fullName" class="field-control" />
        </label>

        <label class="field-label">
          Роль
          <select v-model="accountForm.role" class="field-control">
            <option value="worker">Работник</option>
            <option value="admin">Администратор</option>
          </select>
        </label>

        <div class="account-form__actions">
          <button class="primary-button" type="submit" :disabled="accountAdminStore.isSaving">
            {{ editingAccountId ? 'Сохранить' : 'Добавить' }}
          </button>
          <button class="secondary-button" type="button" @click="startCreate">
            Очистить
          </button>
        </div>
      </form>

      <section class="account-list app-card">
        <div class="account-list__header">
          <div>
            <p class="screen-kicker">Серверная БД</p>
            <h2>Список аккаунтов</h2>
          </div>
          <span>{{ accountAdminStore.accounts.length }}</span>
        </div>

        <article v-for="account in accountAdminStore.accounts" :key="account.id" class="account-row">
          <div>
            <h3>{{ account.fullName }}</h3>
            <p>{{ account.loginNumber }} · {{ account.role === 'admin' ? 'Администратор' : 'Работник' }}</p>
          </div>
          <div class="account-row__actions">
            <button class="secondary-button" type="button" @click="startEdit(account)">
              Изменить
            </button>
            <button class="danger-button" type="button" @click="deleteAccount(account.id)">
              Удалить
            </button>
          </div>
        </article>

        <p v-if="!accountAdminStore.accounts.length && !accountAdminStore.isLoading" class="empty-state">
          Аккаунтов пока нет.
        </p>

        <p v-if="accountAdminStore.errorMessage" class="error-message">
          {{ accountAdminStore.errorMessage }}
        </p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.accounts-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
}

.account-form,
.account-list {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 12px;
}

.account-form__actions,
.account-list__header,
.account-row,
.account-row__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.account-form__actions {
  justify-content: flex-start;
}

.account-list__header h2,
.account-list__header > span {
  color: var(--color-text);
  font-size: 1.08rem;
  font-weight: 900;
}

.account-list__header > span {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 5px 9px;
  background: var(--color-surface-muted);
}

.account-row {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface);
}

.account-row h3 {
  color: var(--color-text);
  font-size: 0.96rem;
  font-weight: 900;
}

.account-row p {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.danger-button {
  min-height: 46px;
  border: 1px solid #f1b3ad;
  border-radius: 8px;
  padding: 11px 14px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-weight: 850;
}

@media (max-width: 820px) {
  .accounts-layout {
    grid-template-columns: 1fr;
  }

  .account-row,
  .account-row__actions {
    display: grid;
  }
}
</style>
