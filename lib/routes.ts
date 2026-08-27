import type { Metadata } from 'next'

export type PageKey =
  | 'dashboard'
  | 'menu'
  | 'categories'
  | 'tables'
  | 'orders'
  | 'expenses'
  | 'purchases'
  | 'journals'
  | 'ledger'
  | 'cashbook'
  | 'pnl'
  | 'sales'
  | 'expense-report'
  | 'inventory-report'
  | 'settings'

export const PAGE_PATH: Record<PageKey, string> = {
  dashboard: '/dashboard',
  orders: '/orders',
  expenses: '/expenses',
  tables: '/tables',
  menu: '/menu',
  categories: '/categories',
  purchases: '/purchases',
  journals: '/journals',
  ledger: '/ledger',
  cashbook: '/cashbook',
  pnl: '/pnl',
  sales: '/sales',
  'expense-report': '/expense-report',
  'inventory-report': '/inventory-report',
  settings: '/settings',
}

export const PAGE_KEYS = Object.keys(PAGE_PATH) as PageKey[]

export const PAGE_TITLES: Record<PageKey, [string, string]> = {
  dashboard: ['Dashboard', 'Live service, menu margins, and spend at a glance.'],
  menu: ['Menu item', 'Add and manage dishes on your menu.'],
  categories: ['Category', 'Name and describe the groups on your menu.'],
  tables: ['Tables', 'Add dining tables and seating capacity for this restaurant.'],
  orders: ['Orders', 'Tickets with menu items, add-ons, table, and status.'],
  expenses: ['Expenses', 'Track the cost of doing good work.'],
  purchases: ['Purchases of goods', 'Supplier invoices paid from cash or bank.'],
  journals: ['Journal entries', 'Chart of accounts and postings into the ledger.'],
  ledger: ['General ledger', 'Trial balance and account movements.'],
  cashbook: ['Cash book', 'Cash on hand and bank.'],
  pnl: ['P&L', 'Mauritian profit and loss statement from orders and expenses.'],
  sales: ['Sales report', 'Filter and review every sale, item, and ticket.'],
  'expense-report': ['Expense report', 'Filter and review every expense, category, and line item.'],
  'inventory-report': ['Inventory report', 'Items sold from completed orders, with date and category filters.'],
  settings: ['Settings', 'Make Pyramid Snack work your way.'],
}

const PATH_TO_PAGE = Object.fromEntries(
  PAGE_KEYS.map(key => [PAGE_PATH[key], key]),
) as Record<string, PageKey>

export function isPageKey(value: string): value is PageKey {
  return value in PAGE_PATH
}

export function pageFromPath(pathname: string): PageKey | null {
  return PATH_TO_PAGE[pathname] ?? null
}

export function sectionMetadata(key: PageKey): Metadata {
  return { title: `${PAGE_TITLES[key][0]} | Pyramid Snack` }
}
