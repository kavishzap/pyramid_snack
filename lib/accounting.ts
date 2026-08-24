import { newId, type Expense, type Order, type PayMethod } from '@/lib/domain'

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
export type JournalSource = 'manual' | 'sale' | 'purchase' | 'receipt' | 'payment' | 'expense'
export type SettleMethod = 'cash' | 'bank'
export type PurchaseStatus = 'unpaid' | 'partial' | 'paid'

export type GlAccount = {
  id: string
  code: string
  name: string
  type: AccountType
  isControl: boolean
}

export type JournalLine = {
  id: string
  accountId: string
  accountCode: string
  accountName: string
  description: string
  partyName: string
  debit: number
  credit: number
}

export type JournalEntry = {
  id: string
  number: string
  date: string
  source: JournalSource
  sourceRef: string
  memo: string
  lines: JournalLine[]
}

export type Supplier = {
  id: string
  name: string
  phone: string
  email: string
  notes: string
}

export type PurchaseLine = { id: string; description: string; qty: number; amount: number }

export type Purchase = {
  id: string
  number: string
  supplierId: string
  supplierName: string
  date: string
  dueDate: string
  paymentMethod: PayMethod
  status: PurchaseStatus
  lines: PurchaseLine[]
  notes: string
  vatInclusive: boolean
  vatClaimable: boolean
}

export type MoneyReceipt = {
  id: string
  number: string
  date: string
  customerName: string
  orderId: string
  method: SettleMethod
  amount: number
  memo: string
}

export type SupplierPayment = {
  id: string
  number: string
  date: string
  supplierId: string
  supplierName: string
  purchaseId: string
  method: SettleMethod
  amount: number
  memo: string
}

export type AccountingBooks = {
  accounts: GlAccount[]
  journals: JournalEntry[]
  suppliers: Supplier[]
  purchases: Purchase[]
  receipts: MoneyReceipt[]
  payments: SupplierPayment[]
}

export const ACCOUNT_CODES = {
  cash: '1000',
  bank: '1010',
  receivables: '1100',
  inventory: '1200',
  inputVat: '1300',
  payables: '2000',
  outputVat: '2100',
  capital: '3000',
  sales: '4000',
  purchases: '5000',
  distribution: '5100',
  admin: '5200',
  other: '5300',
} as const

export const SYSTEM_ACCOUNTS: Omit<GlAccount, 'id'>[] = [
  { code: '1000', name: 'Cash on hand', type: 'asset', isControl: false },
  { code: '1010', name: 'Bank', type: 'asset', isControl: false },
  { code: '1100', name: 'Trade receivables (sales control)', type: 'asset', isControl: true },
  { code: '1200', name: 'Inventory of goods', type: 'asset', isControl: false },
  { code: '1300', name: 'Input VAT receivable', type: 'asset', isControl: false },
  { code: '2000', name: 'Trade payables (purchase control)', type: 'liability', isControl: true },
  { code: '2100', name: 'Output VAT payable', type: 'liability', isControl: false },
  { code: '3000', name: 'Capital', type: 'equity', isControl: false },
  { code: '4000', name: 'Restaurant sales', type: 'income', isControl: false },
  { code: '5000', name: 'Purchases of goods / cost of sales', type: 'expense', isControl: false },
  { code: '5100', name: 'Distribution costs', type: 'expense', isControl: false },
  { code: '5200', name: 'Administrative expenses', type: 'expense', isControl: false },
  { code: '5300', name: 'Other expenses', type: 'expense', isControl: false },
]

export const VAT_RATE = 0.15

export const emptyBooks = (): AccountingBooks => ({
  accounts: SYSTEM_ACCOUNTS.map(account => ({ ...account, id: account.code })),
  journals: [],
  suppliers: [],
  purchases: [],
  receipts: [],
  payments: [],
})

export const money = (n: number) => `Rs ${Number(n || 0).toLocaleString('en-MU', { minimumFractionDigits: 2 })}`

export const roundMoney = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export const vatSplit = (inclusiveAmount: number, vatRegistered: boolean) => {
  const sign = inclusiveAmount < 0 ? -1 : 1
  const inclusive = roundMoney(Math.abs(inclusiveAmount))
  if (!vatRegistered || inclusive === 0) {
    return { exclusive: roundMoney(inclusiveAmount), vat: 0, inclusive: roundMoney(inclusiveAmount) }
  }
  const exclusive = roundMoney(inclusive / (1 + VAT_RATE))
  const vat = roundMoney(inclusive - exclusive)
  return { exclusive: exclusive * sign, vat: vat * sign, inclusive: inclusive * sign }
}

export type VatFlags = {
  vatInclusive?: boolean
  vatClaimable?: boolean
}

export type DocumentVat = {
  entered: number
  exclusive: number
  vat: number
  payable: number
  expense: number
  inputVat: number
}

export const defaultVatFlags = (vatRegistered: boolean): { vatInclusive: boolean; vatClaimable: boolean } => ({
  vatInclusive: true,
  vatClaimable: vatRegistered,
})

export function documentVat(enteredAmount: number, flags: VatFlags | undefined, vatRegistered: boolean): DocumentVat {
  const entered = roundMoney(enteredAmount)
  const vatInclusive = flags?.vatInclusive !== false
  const vatClaimable = Boolean(vatRegistered && flags?.vatClaimable !== false)
  if (!vatRegistered || entered === 0) {
    return { entered, exclusive: entered, vat: 0, payable: entered, expense: entered, inputVat: 0 }
  }
  let exclusive: number
  let vat: number
  let payable: number
  if (vatInclusive) {
    exclusive = roundMoney(entered / (1 + VAT_RATE))
    vat = roundMoney(entered - exclusive)
    payable = entered
  } else {
    exclusive = entered
    vat = roundMoney(entered * VAT_RATE)
    payable = roundMoney(exclusive + vat)
  }
  if (vatClaimable) {
    return { entered, exclusive, vat, payable, expense: exclusive, inputVat: vat }
  }
  return { entered, exclusive, vat, payable, expense: payable, inputVat: 0 }
}

export const purchaseTotal = (purchase: Purchase) =>
  roundMoney(purchase.lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.amount) || 0), 0))

export const journalTotals = (entry: Pick<JournalEntry, 'lines'>) => {
  const debit = roundMoney(entry.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0))
  const credit = roundMoney(entry.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0))
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 }
}

export const requireAccount = (accounts: GlAccount[], code: string) => {
  const account = accounts.find(item => item.code === code)
  if (!account) throw new Error(`Account ${code} is missing. Run supabase/04-accounting.sql.`)
  return account
}

const nextNumber = (items: { number: string }[], prefix: string) => {
  const max = items.reduce((highest, item) => {
    const match = item.number.match(/(\d+)\s*$/)
    const value = match ? Number(match[1]) : 0
    return value > highest ? value : highest
  }, 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

export const nextJournalNumber = (journals: JournalEntry[]) => nextNumber(journals, 'JE')
export const nextPurchaseNumber = (purchases: Purchase[]) => nextNumber(purchases, 'PO')
export const nextReceiptNumber = (receipts: MoneyReceipt[]) => nextNumber(receipts, 'RC')
export const nextPaymentNumber = (payments: SupplierPayment[]) => nextNumber(payments, 'SP')

const line = (
  account: GlAccount,
  debit: number,
  credit: number,
  description: string,
  partyName = '',
): JournalLine => ({
  id: newId(),
  accountId: account.id,
  accountCode: account.code,
  accountName: account.name,
  description,
  partyName,
  debit: roundMoney(debit),
  credit: roundMoney(credit),
})

const cashOrBank = (accounts: GlAccount[], method: PayMethod | SettleMethod) =>
  requireAccount(accounts, method === 'bank' ? ACCOUNT_CODES.bank : ACCOUNT_CODES.cash)

export function buildSaleJournal(accounts: GlAccount[], order: Order, vatRegistered: boolean): Omit<JournalEntry, 'id' | 'number'> | null {
  if (order.status !== 'Completed') return null
  const total = roundMoney(order.total)
  if (total <= 0) return null
  const method = order.paymentMethod || 'cash'
  const parts = vatSplit(total, vatRegistered)
  const debitAccount = method === 'credit'
    ? requireAccount(accounts, ACCOUNT_CODES.receivables)
    : cashOrBank(accounts, method)
  const sales = requireAccount(accounts, ACCOUNT_CODES.sales)
  const lines = [
    line(debitAccount, total, 0, `Sale ${order.id}`, order.clientName),
    line(sales, 0, parts.exclusive, 'Restaurant sales', order.clientName),
  ]
  if (vatRegistered && parts.vat) {
    lines.push(line(requireAccount(accounts, ACCOUNT_CODES.outputVat), 0, parts.vat, 'Output VAT on sales', order.clientName))
  }
  return {
    date: order.date,
    source: 'sale',
    sourceRef: order.id,
    memo: `Sale ${order.id} · ${order.clientName} · ${method}`,
    lines,
  }
}

export function buildExpenseJournal(
  accounts: GlAccount[],
  expense: Expense,
  vatRegistered: boolean,
  expenseAccountCode: string,
): Omit<JournalEntry, 'id' | 'number'> | null {
  const entered = roundMoney(expense.lines.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.amount) || 0), 0))
  const parts = documentVat(entered, expense, vatRegistered)
  if (parts.payable <= 0) return null
  const expenseAccount = requireAccount(accounts, expenseAccountCode)
  const cash = requireAccount(accounts, ACCOUNT_CODES.cash)
  const lines = [
    line(expenseAccount, parts.expense, 0, expense.category || 'Expense'),
    line(cash, 0, parts.payable, `Paid ${expense.category || 'expense'}`),
  ]
  if (parts.inputVat) {
    lines.push(line(requireAccount(accounts, ACCOUNT_CODES.inputVat), parts.inputVat, 0, 'Input VAT on expense'))
  }
  return {
    date: expense.date,
    source: 'expense',
    sourceRef: expense.id,
    memo: `Expense · ${expense.category}${parts.inputVat ? '' : vatRegistered ? ' · VAT not claimed' : ''}`,
    lines,
  }
}

export function buildPurchaseJournal(accounts: GlAccount[], purchase: Purchase, vatRegistered: boolean): Omit<JournalEntry, 'id' | 'number'> | null {
  const parts = documentVat(purchaseTotal(purchase), purchase, vatRegistered)
  if (parts.payable <= 0) return null
  const goods = requireAccount(accounts, ACCOUNT_CODES.purchases)
  const creditAccount = purchase.paymentMethod === 'credit'
    ? requireAccount(accounts, ACCOUNT_CODES.payables)
    : cashOrBank(accounts, purchase.paymentMethod)
  const lines = [
    line(goods, parts.expense, 0, `Purchases ${purchase.number}`, purchase.supplierName),
    line(creditAccount, 0, parts.payable, purchase.paymentMethod === 'credit' ? 'Trade payables' : 'Paid purchase', purchase.supplierName),
  ]
  if (parts.inputVat) {
    lines.push(line(requireAccount(accounts, ACCOUNT_CODES.inputVat), parts.inputVat, 0, 'Input VAT on purchases', purchase.supplierName))
  }
  return {
    date: purchase.date,
    source: 'purchase',
    sourceRef: purchase.id,
    memo: `Purchase ${purchase.number} · ${purchase.supplierName}${parts.inputVat ? '' : vatRegistered ? ' · VAT not claimed' : ''}`,
    lines,
  }
}

export function buildReceiptJournal(accounts: GlAccount[], receipt: MoneyReceipt): Omit<JournalEntry, 'id' | 'number'> {
  const cash = cashOrBank(accounts, receipt.method)
  const ar = requireAccount(accounts, ACCOUNT_CODES.receivables)
  return {
    date: receipt.date,
    source: 'receipt',
    sourceRef: receipt.id,
    memo: `Receipt ${receipt.number} · ${receipt.customerName}`,
    lines: [
      line(cash, receipt.amount, 0, `Cash received · ${receipt.number}`, receipt.customerName),
      line(ar, 0, receipt.amount, 'Sales receivable control', receipt.customerName),
    ],
  }
}

export function buildPaymentJournal(accounts: GlAccount[], payment: SupplierPayment): Omit<JournalEntry, 'id' | 'number'> {
  const cash = cashOrBank(accounts, payment.method)
  const ap = requireAccount(accounts, ACCOUNT_CODES.payables)
  return {
    date: payment.date,
    source: 'payment',
    sourceRef: payment.id,
    memo: `Payment ${payment.number} · ${payment.supplierName}`,
    lines: [
      line(ap, payment.amount, 0, 'Trade payables control', payment.supplierName),
      line(cash, 0, payment.amount, `Paid supplier · ${payment.number}`, payment.supplierName),
    ],
  }
}

export function upsertJournal(books: AccountingBooks, draft: Omit<JournalEntry, 'id' | 'number'> & { id?: string; number?: string }): AccountingBooks {
  const { debit, credit, balanced } = journalTotals(draft)
  if (!balanced) throw new Error(`Journal is not balanced (Dr ${money(debit)} / Cr ${money(credit)}).`)
  const existing = draft.source === 'manual'
    ? (draft.id ? books.journals.find(item => item.id === draft.id) : undefined)
    : books.journals.find(item => item.source === draft.source && item.sourceRef === draft.sourceRef)
  const entry: JournalEntry = {
    id: existing?.id || draft.id || newId(),
    number: existing?.number || draft.number || nextJournalNumber(books.journals.filter(item => item.id !== existing?.id)),
    date: draft.date,
    source: draft.source,
    sourceRef: draft.sourceRef,
    memo: draft.memo,
    lines: draft.lines.map(item => ({ ...item, id: item.id || newId() })),
  }
  return {
    ...books,
    journals: [entry, ...books.journals.filter(item => item.id !== entry.id)],
  }
}

export function removeJournal(books: AccountingBooks, source: JournalSource, sourceRef: string): AccountingBooks {
  return {
    ...books,
    journals: books.journals.filter(item => !(item.source === source && item.sourceRef === sourceRef)),
  }
}

export function expenseAccountCode(category: string, cogs: Set<string>, distribution: Set<string>, admin: Set<string>) {
  if (cogs.has(category)) return ACCOUNT_CODES.purchases
  if (distribution.has(category)) return ACCOUNT_CODES.distribution
  if (admin.has(category)) return ACCOUNT_CODES.admin
  return ACCOUNT_CODES.other
}

export type TrialBalanceRow = {
  account: GlAccount
  debit: number
  credit: number
  balance: number
  displayDebit: number
  displayCredit: number
}

export function trialBalance(books: AccountingBooks): TrialBalanceRow[] {
  const byId = new Map<string, { debit: number; credit: number }>()
  for (const account of books.accounts) byId.set(account.id, { debit: 0, credit: 0 })
  for (const entry of books.journals) {
    for (const item of entry.lines) {
      const row = byId.get(item.accountId) || { debit: 0, credit: 0 }
      row.debit += Number(item.debit) || 0
      row.credit += Number(item.credit) || 0
      byId.set(item.accountId, row)
    }
  }
  return books.accounts
    .map(account => {
      const row = byId.get(account.id) || { debit: 0, credit: 0 }
      const raw = roundMoney(row.debit - row.credit)
      const normalDebit = account.type === 'asset' || account.type === 'expense'
      return {
        account,
        debit: roundMoney(row.debit),
        credit: roundMoney(row.credit),
        balance: raw,
        displayDebit: normalDebit ? Math.max(raw, 0) : Math.max(-raw, 0),
        displayCredit: normalDebit ? Math.max(-raw, 0) : Math.max(raw, 0),
      }
    })
    .filter(row => row.debit || row.credit)
}

export type LedgerMove = {
  date: string
  number: string
  memo: string
  source: JournalSource
  debit: number
  credit: number
  balance: number
}

export function accountLedger(books: AccountingBooks, accountId: string): LedgerMove[] {
  const account = books.accounts.find(item => item.id === accountId)
  const normalDebit = account?.type === 'asset' || account?.type === 'expense'
  const moves: LedgerMove[] = []
  let running = 0
  const chronological = [...books.journals].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
  for (const entry of chronological) {
    for (const item of entry.lines) {
      if (item.accountId !== accountId) continue
      const debit = Number(item.debit) || 0
      const credit = Number(item.credit) || 0
      running = roundMoney(running + (normalDebit ? debit - credit : credit - debit))
      moves.push({
        date: entry.date,
        number: entry.number,
        memo: item.description || entry.memo,
        source: entry.source,
        debit,
        credit,
        balance: running,
      })
    }
  }
  return moves
}

export type ReceivableRow = {
  orderId: string
  date: string
  customerName: string
  billed: number
  received: number
  outstanding: number
}

export function receivableRows(orders: Order[], receipts: MoneyReceipt[]): ReceivableRow[] {
  const creditSales = orders.filter(order => order.status === 'Completed' && (order.paymentMethod || 'cash') === 'credit')
  return creditSales
    .map(order => {
      const received = roundMoney(
        receipts.filter(receipt => receipt.orderId === order.id).reduce((sum, receipt) => sum + receipt.amount, 0),
      )
      const billed = roundMoney(order.total)
      return {
        orderId: order.id,
        date: order.date,
        customerName: order.clientName,
        billed,
        received: Math.min(received, billed),
        outstanding: roundMoney(Math.max(billed - received, 0)),
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export type PayableRow = {
  purchaseId: string
  number: string
  date: string
  supplierName: string
  billed: number
  paid: number
  outstanding: number
}

export function payableRows(purchases: Purchase[], payments: SupplierPayment[]): PayableRow[] {
  return purchases
    .filter(purchase => purchase.paymentMethod === 'credit')
    .map(purchase => {
      const billed = purchaseTotal(purchase)
      const paid = roundMoney(
        payments.filter(payment => payment.purchaseId === purchase.id).reduce((sum, payment) => sum + payment.amount, 0),
      )
      return {
        purchaseId: purchase.id,
        number: purchase.number,
        date: purchase.date,
        supplierName: purchase.supplierName,
        billed,
        paid,
        outstanding: roundMoney(Math.max(billed - paid, 0)),
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function cashBook(books: AccountingBooks, code: '1000' | '1010') {
  const account = books.accounts.find(item => item.code === code)
  if (!account) return []
  return accountLedger(books, account.id)
}
