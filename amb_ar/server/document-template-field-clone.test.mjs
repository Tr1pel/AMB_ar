import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createJiti } from 'jiti'
import { reactive } from 'vue'

const jiti = createJiti(import.meta.url, { moduleCache: false })
const { cloneDocumentTemplateField } = await jiti.import(
  '../src/shared/templates/document-template-field-clone.ts',
)

test('template fields can be cloned from Vue reactive editor state before saving', () => {
  const field = reactive({
    id: 'field-order-number',
    dataPath: 'custom.orderNumber',
    label: 'Номер заказа',
    type: 'text',
    required: false,
    placeholder: 'Введите номер',
    helpText: 'Укажите номер заказа',
    translations: {
      ru: {
        label: 'Номер заказа',
        placeholder: 'Введите номер',
        helpText: 'Укажите номер заказа',
      },
      en: {
        label: 'Order number',
        placeholder: 'Enter order number',
        helpText: 'Specify the order number',
      },
      fa: {
        label: 'شماره سفارش',
        placeholder: 'شماره سفارش را وارد کنید',
        helpText: 'شماره سفارش را مشخص کنید',
      },
    },
    width: 'half',
    sortOrder: 1,
    options: [],
  })

  assert.throws(() => structuredClone(field), { name: 'DataCloneError' })

  const clone = cloneDocumentTemplateField(field)

  assert.doesNotThrow(() => structuredClone(clone))
  assert.deepEqual(clone.translations, field.translations)
  assert.notEqual(clone.translations, field.translations)
})
