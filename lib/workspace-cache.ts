import type { AccountingBooks } from '@/lib/accounting'
import type { Category, CompanySettings, DiningTable, Expense, MenuItem, Order } from '@/lib/domain'

export type WorkspaceSnapshot = {
  auth: boolean
  tenantId: string | null
  menu: MenuItem[]
  tables: DiningTable[]
  orders: Order[]
  expenses: Expense[]
  categories: Category[]
  company: CompanySettings
  books: AccountingBooks
  expenseCategoryMap: Map<string, string>
}

let snapshot: WorkspaceSnapshot | null = null
let lastFetchedPath: string | null = null

export const getWorkspaceSnapshot = () => snapshot

export const setWorkspaceSnapshot = (next: WorkspaceSnapshot | null) => {
  snapshot = next
  if (!next) lastFetchedPath = null
}

export const shouldFetchWorkspace = (pathname: string, force = false) => {
  if (!force && lastFetchedPath === pathname) return false
  lastFetchedPath = pathname
  return true
}

export const markWorkspaceFetched = (pathname: string) => {
  lastFetchedPath = pathname
}

export const clearWorkspaceFetchMark = () => {
  lastFetchedPath = null
}
