import type { ProductOption } from '@/types/report'

export const PRODUCT_OPTIONS: ProductOption[] = [
  {
    id: 'sweet-red-pepper',
    label: 'Перец красный сладкий 1 кг',
    category: 'Овощи',
  },
  {
    id: 'fresh-vegetables',
    label: 'Свежие овощи',
    category: 'Склад холодного хранения',
  },
  {
    id: 'dairy',
    label: 'Молочная продукция',
    category: 'Склад холодного хранения',
  },
  {
    id: 'frozen-meat',
    label: 'Замороженное мясо',
    category: 'Морозильный склад',
  },
  {
    id: 'dry-goods',
    label: 'Сухие товары',
    category: 'Основной склад',
  },
]

export function getProductLabel(productId: string): string {
  return PRODUCT_OPTIONS.find((product) => product.id === productId)?.label ?? ''
}
