<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import { useAccountAdminStore } from '@/stores/account-admin.store'
import { generateAccountLoginNumber } from '@/shared/repositories/account-repository'
import { requestConfirmation } from '@/shared/ui/confirmation-dialog'
import { useAuthStore } from '@/stores/auth.store'
import type { Account, AccountRole } from '@/types/report'

const accountAdminStore = useAccountAdminStore()
const authStore = useAuthStore()
const editingAccountId = ref<string | null>(null)
const isAccountPanelOpen = ref(false)
const isGeneratingLoginNumber = ref(false)
const numberGenerationError = ref('')
const accountForm = reactive({
  loginNumber: '',
  fullName: '',
  role: '' as AccountRole | '',
  password: '',
})
const passwordCopyMessage = ref('')
const isPasswordResetting = ref(false)

onMounted(() => {
  void accountAdminStore.loadAccounts()
})

function resetAccountForm(): void {
  editingAccountId.value = null
  accountForm.loginNumber = ''
  accountForm.fullName = ''
  accountForm.role = ''
  accountForm.password = ''
  passwordCopyMessage.value = ''
  isPasswordResetting.value = false
  numberGenerationError.value = ''
}

function startCreate(): void {
  resetAccountForm()
  isAccountPanelOpen.value = true
}

function closeAccountPanel(): void {
  resetAccountForm()
  isAccountPanelOpen.value = false
}

function startEdit(account: Account): void {
  editingAccountId.value = account.id
  accountForm.loginNumber = account.loginNumber
  accountForm.fullName = account.fullName
  accountForm.role = account.role
  accountForm.password = ''
  passwordCopyMessage.value = ''
  isPasswordResetting.value = false
  numberGenerationError.value = ''
  isAccountPanelOpen.value = true
}

function createPassword(): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?']
  const allCharacters = groups.join('')
  const characters = groups.map((group) => randomCharacter(group))

  while (characters.length < 14) {
    characters.push(randomCharacter(allCharacters))
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1)
    const currentCharacter = characters[index]!
    characters[index] = characters[swapIndex]!
    characters[swapIndex] = currentCharacter
  }

  return characters.join('')
}

function generatePassword(): void {
  accountForm.password = createPassword()
}

async function generateLoginNumber(): Promise<void> {
  const accountId = authStore.currentAccount?.id
  const role = accountForm.role

  if (!accountId || !role) {
    return
  }

  isGeneratingLoginNumber.value = true
  numberGenerationError.value = ''

  try {
    accountForm.loginNumber = await generateAccountLoginNumber(role, accountId)
  } catch (error) {
    numberGenerationError.value = error instanceof Error ? error.message : 'Не удалось сгенерировать номер'
  } finally {
    isGeneratingLoginNumber.value = false
  }
}

function handleRoleChange(): void {
  if (!editingAccountId.value) {
    void generateLoginNumber()
  }
}

async function copyPassword(): Promise<void> {
  if (!accountForm.password) {
    return
  }

  await navigator.clipboard.writeText(accountForm.password)
  passwordCopyMessage.value = 'Пароль скопирован'
}

async function offerCredentialsCopy(
  fullName: string,
  loginNumber: string,
  password: string,
): Promise<void> {
  const credentials = `Сотрудник: ${fullName}\nID: ${loginNumber}\nПароль: ${password}`
  const shouldCopy = await requestConfirmation({
    title: 'Скопировать данные сотрудника',
    message: credentials,
    confirmLabel: 'Скопировать',
  })

  if (shouldCopy) {
    await navigator.clipboard.writeText(credentials)
  }
}

function randomCharacter(characters: string): string {
  return characters[randomIndex(characters.length)] ?? ''
}

function randomIndex(limit: number): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0]! % limit
}

async function saveAccount(): Promise<void> {
  if (!accountForm.loginNumber.trim() || !accountForm.fullName.trim() || !accountForm.role) {
    return
  }

  const isNewAccount = !editingAccountId.value
  const wasPasswordReset = isPasswordResetting.value
  const password = accountForm.password
  const fullName = accountForm.fullName.trim()
  const loginNumber = accountForm.loginNumber.trim()
  const saved = await accountAdminStore.save({
    id: editingAccountId.value ?? undefined,
    loginNumber,
    fullName,
    role: accountForm.role as AccountRole,
    isActive: true,
    password: password || undefined,
  })

  if (saved) {
    closeAccountPanel()

    if ((isNewAccount || wasPasswordReset) && password) {
      await offerCredentialsCopy(fullName, loginNumber, password)
    }
  }
}

function startPasswordReset(): void {
  isPasswordResetting.value = true
  accountForm.password = ''
  passwordCopyMessage.value = ''
}

async function deleteAccount(accountId: string): Promise<void> {
  const account = accountAdminStore.accounts.find((item) => item.id === accountId)
  const shouldDelete = await requestConfirmation({
    title: 'Отключить аккаунт?',
    message: `Отключить аккаунт «${account?.fullName ?? accountId}» на этой рабочей станции?`,
    confirmLabel: 'Отключить',
    destructive: true,
  })

  if (!shouldDelete) {
    return
  }

  await accountAdminStore.deleteAccount(accountId)

  if (editingAccountId.value === accountId) {
    closeAccountPanel()
  }
}
</script>

<template>
  <main class="screen-page accounts-page">
    <section class="screen-heading">
      <div>
        <h1 class="screen-title">Аккаунты</h1>
      </div>
    </section>

    <section class="accounts-layout">
      <section class="account-list app-card">
        <div class="account-list__header">
          <div>
            <h2>Список аккаунтов</h2>
          </div>
          <span>{{ accountAdminStore.accounts.length }}</span>
        </div>

        <button class="primary-button account-create-button" type="button" @click="startCreate">
          Создать аккаунт
        </button>

        <button
          v-for="account in accountAdminStore.accounts"
          :key="account.id"
          class="account-row"
          :class="{ 'account-row--selected': editingAccountId === account.id }"
          type="button"
          @click="startEdit(account)"
        >
          <span class="account-row__identity">
            <strong>{{ account.fullName }}</strong>
            <small>{{ account.role === 'admin' ? 'Администратор' : 'Работник' }}</small>
          </span>
          <span class="account-row__arrow" aria-hidden="true">›</span>
        </button>

        <p v-if="!accountAdminStore.accounts.length && !accountAdminStore.isLoading" class="empty-state">
          Аккаунтов пока нет.
        </p>

        <p v-if="accountAdminStore.errorMessage" class="error-message">
          {{ accountAdminStore.errorMessage }}
        </p>
      </section>

      <section v-if="isAccountPanelOpen" class="account-details app-card">
        <header class="account-details__header">
          <div>
            <h2>{{ editingAccountId ? 'Данные аккаунта' : 'Создать аккаунт' }}</h2>
          </div>
          <button class="secondary-button" type="button" @click="closeAccountPanel">Закрыть</button>
        </header>

        <form class="account-form" @submit.prevent="saveAccount">
          <label class="field-label">
            Роль
            <select v-model="accountForm.role" class="field-control" required @change="handleRoleChange">
              <option disabled value="">Выберите роль</option>
              <option value="worker">Работник</option>
              <option value="admin">Администратор</option>
            </select>
          </label>

          <label class="field-label">
            Уникальный номер
            <input
              v-model="accountForm.loginNumber"
              class="field-control"
              inputmode="numeric"
              readonly
              :placeholder="isGeneratingLoginNumber ? 'Генерируем номер...' : 'Выберите роль'"
            />
            <small v-if="numberGenerationError" class="field-error">{{ numberGenerationError }}</small>
          </label>

        <label class="field-label">
          ФИО
          <input v-model="accountForm.fullName" class="field-control" />
        </label>

        <label v-if="!editingAccountId || isPasswordResetting" class="field-label">
          {{ editingAccountId ? 'Новый пароль' : 'Пароль' }}
          <span class="field-with-action">
            <input
              v-model="accountForm.password"
              class="field-control"
              type="text"
              autocomplete="new-password"
              minlength="8"
              :required="!editingAccountId || isPasswordResetting"
            />
            <button
              class="password-copy-button"
              type="button"
              :disabled="!accountForm.password"
              aria-label="Скопировать пароль"
              title="Скопировать пароль"
              @click="copyPassword"
            >
              <img src="/icons/clone-svgrepo-com.svg" alt="" aria-hidden="true" />
            </button>
            <button class="secondary-button" type="button" @click="generatePassword">
              Сгенерировать
            </button>
          </span>
        </label>

        <button
          v-else
          class="secondary-button password-reset-button"
          type="button"
          :disabled="accountAdminStore.isSaving"
          @click="startPasswordReset"
        >
          Сбросить пароль
        </button>

        <p v-if="(!editingAccountId || isPasswordResetting) && passwordCopyMessage" class="password-message">
          {{ passwordCopyMessage }}
        </p>

        <div class="account-form__actions">
          <button class="primary-button" type="submit" :disabled="accountAdminStore.isSaving">
            {{ editingAccountId ? 'Сохранить' : 'Добавить' }}
          </button>
          <button class="secondary-button" type="button" @click="closeAccountPanel">
            Отмена
          </button>
        </div>
          <button
            v-if="editingAccountId"
            class="danger-button"
            type="button"
            @click="deleteAccount(editingAccountId)"
          >
            Удалить аккаунт
          </button>
        </form>
      </section>

      <section v-else class="account-placeholder app-card">
        <h2>Выберите аккаунт</h2>
        <p>Нажмите на сотрудника в списке, чтобы открыть его данные и настройки доступа.</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
@media (min-width: 961px) {
  .screen-heading .screen-title {
    display: none;
  }
}

.accounts-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.65fr) minmax(0, 1fr);
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
.account-details__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.account-form__actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.account-details,
.account-placeholder {
  align-self: start;
  padding: 18px;
}

.account-details__header {
  margin-bottom: 16px;
}

.account-details__header h2,
.account-placeholder h2 {
  color: var(--color-text);
  font-size: 1.08rem;
  font-weight: 900;
}

.account-placeholder {
  display: grid;
  gap: 8px;
  align-content: start;
  min-height: 0;
}

.account-placeholder p:last-child {
  color: var(--color-text-muted);
}

.account-create-button {
  width: 100%;
}

.field-with-action {
  display: flex;
  gap: 8px;
}

.field-with-action .field-control {
  min-width: 0;
  flex: 1;
}

.field-with-action .secondary-button {
  min-height: 46px;
  white-space: nowrap;
}

.password-reset-button {
  min-height: 46px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 800;
}

.password-copy-button {
  display: grid;
  width: 46px;
  min-width: 46px;
  min-height: 46px;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.password-copy-button:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.password-copy-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.password-copy-button img {
  width: 21px;
  height: 21px;
}

@media (max-width: 520px) {
  .field-with-action {
    display: grid;
  }
}

.password-message {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.field-error {
  display: block;
  margin-top: 5px;
  color: var(--color-danger);
  font-size: 0.78rem;
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
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
}

.account-row:hover,
.account-row--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.account-row__identity {
  display: grid;
  gap: 3px;
}

.account-row strong {
  color: var(--color-text);
  font-size: 0.96rem;
  font-weight: 900;
}

.account-row small {
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.account-row__arrow {
  color: var(--color-primary);
  font-size: 1.55rem;
  line-height: 1;
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

}
</style>
