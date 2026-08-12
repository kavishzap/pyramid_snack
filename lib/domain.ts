export type OrderStatus = 'New' | 'Completed' | 'Cancelled'

export type MenuItem = {
  id: string
  name: string
  description: string
  category: string
  allowAddOn: boolean
  sellingPrice: number
  manufacturedPrice: number
  day: boolean
  night: boolean
  happyHour: boolean
}

export type DiningTable = { id: string; number: number; capacity: number }
export type ExpenseLine = { id: string; description: string; qty: number; amount: number }
export type Expense = { id: string; date: string; category: string; lines: ExpenseLine[]; categoryId?: string }
export type OrderAddOn = { id: string; name: string; price: number; menuItemId?: string | null }
export type OrderLine = {
  id: string
  menuItemId: string | null
  name: string
  qty: number
  unitPrice: number
  addOns: OrderAddOn[]
}
export type Order = {
  id: string
  clientName: string
  tableNumber: number
  status: OrderStatus
  lines: OrderLine[]
  total: number
  time: string
  date: string
}
export type Category = { id: string; name: string; description: string }
export type CompanySettings = {
  logo: string
  name: string
  address: string
  phone: string
  email: string
  brn: string
  vatRegistered: boolean
  vatNumber: string
}

export const orderStatusToDb = (status: OrderStatus): 'new' | 'completed' | 'cancelled' => {
  if (status === 'Completed') return 'completed'
  if (status === 'Cancelled') return 'cancelled'
  return 'new'
}

export const orderStatusFromDb = (status: string): OrderStatus => {
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  return 'New'
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
