export type OrderStatus = 'New' | 'Completed' | 'Cancelled'
export type PayMethod = 'cash' | 'bank' | 'credit'

export type MenuItem = {
  id: string
  name: string
  description: string
  category: string
  allowAddOn: boolean
  targetCategories?: string[]
  sellingPrice: number
  manufacturedPrice: number
  day: boolean
  night: boolean
  happyHour: boolean
}

export const isAddOnCategory = (name: string) => {
  const n = name.trim().toLowerCase().replace(/[\s_\-]+/g, '')
  return n === 'adons' || n === 'addons' || n === 'addon'
}

export type DiningTable = { id: string; number: number; capacity: number }
export type ExpenseLine = { id: string; description: string; qty: number; amount: number }
export type Expense = {
  id: string
  date: string
  category: string
  lines: ExpenseLine[]
  categoryId?: string
  paymentMethod?: 'cash' | 'bank'
  vatInclusive?: boolean
  vatClaimable?: boolean
}
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
  paymentMethod?: PayMethod
  lines: OrderLine[]
  /** Line items before discount (VAT-inclusive). Maps to `subtotal_amount`. */
  subtotal?: number
  /** Checkout discount (VAT-inclusive). Maps to `discount_amount`. */
  discount?: number
  /** Amount collected = subtotal − discount. Maps to `total_amount`. */
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

const money2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export const orderLineAmount = (line: OrderLine) => {
  const addOns = line.addOns.reduce((sum, a) => sum + (Number(a.price) || 0), 0)
  return money2((Number(line.qty) || 0) * ((Number(line.unitPrice) || 0) + addOns))
}

export const orderSubtotal = (order: Pick<Order, 'lines' | 'subtotal'>) => {
  if (order.lines.length) {
    return money2(order.lines.reduce((sum, line) => sum + orderLineAmount(line), 0))
  }
  return money2(Math.max(Number(order.subtotal) || 0, 0))
}

export const orderDiscountAmount = (order: Pick<Order, 'lines' | 'subtotal' | 'discount'>) => {
  const subtotal = orderSubtotal(order)
  return money2(Math.min(Math.max(Number(order.discount) || 0, 0), subtotal))
}

export const orderPayable = (order: Pick<Order, 'lines' | 'subtotal' | 'discount'> & { total?: number }) =>
  settleOrderAmounts(order).total

export const settleOrderAmounts = (order: Pick<Order, 'lines' | 'subtotal' | 'discount'> & { total?: number }) => {
  const subtotal = orderSubtotal(order)
  const discount = money2(Math.min(Math.max(Number(order.discount) || 0, 0), subtotal))
  return { subtotal, discount, total: money2(subtotal - discount) }
}

export const orderDiscountFactor = (order: Pick<Order, 'lines' | 'subtotal' | 'discount'> & { total?: number }) => {
  const { subtotal, total } = settleOrderAmounts(order)
  return subtotal > 0 ? total / subtotal : 1
}
