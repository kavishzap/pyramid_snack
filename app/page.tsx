'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, BookOpen, Boxes, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Download, Eye, LayoutDashboard, LogOut, Menu as MenuIcon, Moon, MoreHorizontal, Plus, Receipt, Search, Settings, Sparkles, Store, Sun, Table2, Tags, TrendingUp, Users, Wallet, X, Trash2 } from 'lucide-react'

import {
  type Category,
  type CompanySettings,
  type DiningTable,
  type Expense,
  type ExpenseLine,
  type MenuItem,
  type Order,
  type OrderAddOn,
  type OrderLine,
  type OrderStatus,
  newId,
} from '@/lib/domain'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import * as api from '@/lib/api/restaurant'
import { downloadReportPdf, reportFileName } from '@/lib/reportPdf'

type PageKey = 'dashboard' | 'menu' | 'categories' | 'tables' | 'orders' | 'expenses' | 'pnl' | 'sales' | 'expense-report' | 'inventory-report' | 'settings'

const expenseCategories = [
  'Produce',
  'Meat & seafood',
  'Dairy',
  'Dry goods',
  'Beverages',
  'Alcohol',
  'Packaging',
  'Cleaning supplies',
  'Kitchen equipment',
  'Furniture & fixtures',
  'Utilities',
  'Rent',
  'Payroll',
  'Marketing',
  'Maintenance & repairs',
  'Transportation',
  'Insurance',
  'Licenses & permits',
  'Software & subscriptions',
  'Miscellaneous',
] as const

const cogsExpenseCategories = new Set<string>([
  'Produce',
  'Meat & seafood',
  'Dairy',
  'Dry goods',
  'Beverages',
  'Alcohol',
  'Packaging',
])

const distributionExpenseCategories = new Set<string>(['Marketing', 'Transportation'])
const adminExpenseCategories = new Set<string>([
  'Payroll',
  'Rent',
  'Utilities',
  'Insurance',
  'Licenses & permits',
  'Software & subscriptions',
  'Cleaning supplies',
  'Kitchen equipment',
  'Furniture & fixtures',
  'Maintenance & repairs',
  'Miscellaneous',
])

const CORPORATE_TAX_RATE = 0.15 // Mauritius headline company tax rate under the Income Tax Act
const VAT_RATE = 0.15 // Mauritius standard VAT rate
const vatSplit = (inclusiveAmount: number, vatRegistered: boolean) => {
  const sign = inclusiveAmount < 0 ? -1 : 1
  const inclusive = Math.abs(inclusiveAmount)
  if (!vatRegistered || inclusive === 0) {
    return { exclusive: inclusiveAmount, vat: 0, inclusive: inclusiveAmount }
  }
  const exclusive = inclusive / (1 + VAT_RATE)
  const vat = inclusive - exclusive
  return { exclusive: exclusive * sign, vat: vat * sign, inclusive: inclusiveAmount }
}
const excl = (inclusiveAmount: number, vatRegistered: boolean) => vatSplit(inclusiveAmount, vatRegistered).exclusive

type ExpenseBucket = 'cogs' | 'distribution' | 'admin' | 'other'
const expenseBucket = (category: string): ExpenseBucket => {
  if (cogsExpenseCategories.has(category)) return 'cogs'
  if (distributionExpenseCategories.has(category)) return 'distribution'
  if (adminExpenseCategories.has(category) && category !== 'Miscellaneous') return 'admin'
  return 'other'
}
const expenseBucketLabel: Record<ExpenseBucket, string> = {
  cogs: 'Cost of goods',
  distribution: 'Distribution',
  admin: 'Admin',
  other: 'Other',
}



const money = (n: number) => `Rs ${n.toLocaleString('en-MU', { minimumFractionDigits: 2 })}`
const profitCoefficient = (sellingPrice: number, manufacturedPrice: number) => {
  if (!manufacturedPrice || manufacturedPrice <= 0) return null
  const value = sellingPrice / manufacturedPrice
  return Number.isFinite(value) ? value : null
}
const formatProfitCoefficient = (sellingPrice: number, manufacturedPrice: number) => {
  const value = profitCoefficient(sellingPrice, manufacturedPrice)
  if (value == null) return '—'
  return `${value.toLocaleString('en-MU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
}
const expenseLineTotal = (line: ExpenseLine) => (Number(line.qty) || 0) * (Number(line.amount) || 0)
const expenseTotal = (e: Expense) => e.lines.reduce((sum, line) => sum + expenseLineTotal(line), 0)
const formatExpenseDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
const parseExpenseDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return value
}
const inYearMonth = (iso: string, year: number, month?: number) => {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  if (d.getFullYear() !== year) return false
  if (month !== undefined && d.getMonth() !== month) return false
  return true
}
const orderLineTotal = (line: OrderLine) => {
  const addOns = line.addOns.reduce((sum, a) => sum + (Number(a.price) || 0), 0)
  return (Number(line.qty) || 0) * ((Number(line.unitPrice) || 0) + addOns)
}
const orderTotal = (order: Order) => order.lines.reduce((sum, line) => sum + orderLineTotal(line), 0)
const formatOrderLine = (line: OrderLine) => {
  const addOnText = line.addOns.length ? ` (+ ${line.addOns.map(a => a.name).join(', ')})` : ''
  return `${line.qty}× ${line.name}${addOnText}`
}
const normalizeOrderStatus = (value: unknown): OrderStatus => {
  const status = String(value || 'New')
  if (status === 'Completed' || status === 'Cancelled') return status
  return 'New'
}
const normalizeOrder = (raw: Record<string, unknown>, index: number): Order => {
  let lines: OrderLine[] = []
  if (Array.isArray(raw.lines)) {
    lines = (raw.lines as Array<Record<string, unknown>>).map((line, i) => ({
      id: String(line.id ?? newId()),
      menuItemId: line.menuItemId == null || line.menuItemId === '' ? null : String(line.menuItemId),
      name: String(line.name ?? ''),
      qty: Number(line.qty ?? 1) || 1,
      unitPrice: Number(line.unitPrice ?? 0) || 0,
      addOns: Array.isArray(line.addOns)
        ? (line.addOns as Array<Record<string, unknown>>).map((addOn, j) => ({
            id: String(addOn.id ?? newId()),
            name: String(addOn.name ?? ''),
            price: Number(addOn.price ?? 0) || 0,
          }))
        : [],
    }))
  } else if (Array.isArray(raw.items)) {
    const counts: Record<string, number> = {}
    for (const item of raw.items) {
      const name = String(item).trim()
      if (!name) continue
      counts[name] = (counts[name] || 0) + 1
    }
    lines = Object.entries(counts).map(([name, qty], i) => ({
      id: newId(),
      menuItemId: null,
      name,
      qty,
      unitPrice: 0,
      addOns: [],
    }))
  }
  const tableRaw = raw.tableNumber ?? raw.table ?? 1
  const tableNumber = typeof tableRaw === 'string'
    ? Number(String(tableRaw).replace(/\D/g, '')) || 1
    : Number(tableRaw) || 1
  const storedTotal = Number(raw.total ?? 0) || 0
  const computed = lines.length ? lines.reduce((sum, line) => sum + orderLineTotal(line), 0) : 0
  return {
    id: String(raw.id ?? `#${1000 + index}`),
    clientName: String(raw.clientName ?? raw.guest ?? 'Walk-in guest'),
    tableNumber,
    status: normalizeOrderStatus(raw.status),
    lines,
    total: computed > 0 ? computed : storedTotal,
    time: String(raw.time ?? ''),
    date: parseExpenseDate(String(raw.date ?? new Date().toISOString().slice(0, 10))),
  }
}
const sumOrders = (list: Order[]) => list.filter(o => o.status !== 'Cancelled').reduce((sum, o) => sum + o.total, 0)
const sumExpenses = (list: Expense[]) => list.reduce((sum, e) => sum + expenseTotal(e), 0)
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const seedMenu: MenuItem[] = [
  { id: '1', name: 'Prawn rougaille', description: 'Tomato, garlic, thyme, local prawns.', category: 'Mains', allowAddOn: true, sellingPrice: 680, manufacturedPrice: 238, day: true, night: true, happyHour: false },
  { id: '2', name: 'Chicken curry', description: 'Free-range chicken, curry leaf, coconut.', category: 'Mains', allowAddOn: false, sellingPrice: 540, manufacturedPrice: 182, day: true, night: true, happyHour: true },
  { id: '3', name: 'Fish vindaye', description: 'Local fish, mustard, turmeric, onion.', category: 'Mains', allowAddOn: false, sellingPrice: 590, manufacturedPrice: 205, day: true, night: false, happyHour: false },
  { id: '4', name: 'Coconut rice', description: 'Basmati rice, toasted coconut, herbs.', category: 'Sides', allowAddOn: true, sellingPrice: 220, manufacturedPrice: 62, day: true, night: true, happyHour: false },
]
const seedTables: DiningTable[] = [
  { id: '1', number: 1, capacity: 2 },
  { id: '2', number: 2, capacity: 4 },
  { id: '3', number: 3, capacity: 4 },
  { id: '4', number: 4, capacity: 6 },
]
const seedOrders: Order[] = [
  {
    id: '#1048',
    clientName: 'Walk-in guest',
    tableNumber: 6,
    status: 'New',
    lines: [
      { id: '1', menuItemId: '2', name: 'Chicken curry', qty: 1, unitPrice: 540, addOns: [] },
      { id: '2', menuItemId: '4', name: 'Coconut rice', qty: 1, unitPrice: 220, addOns: [{ id: '21', name: 'Extra coconut', price: 40 }] },
    ],
    total: 800,
    time: '12:42 PM',
    date: '2026-08-12',
  },
  {
    id: '#1047',
    clientName: 'A. Ramtohul',
    tableNumber: 2,
    status: 'New',
    lines: [
      { id: '3', menuItemId: '1', name: 'Prawn rougaille', qty: 1, unitPrice: 680, addOns: [{ id: '31', name: 'Coconut rice', price: 220 }] },
      { id: '4', menuItemId: '4', name: 'Coconut rice', qty: 1, unitPrice: 220, addOns: [] },
    ],
    total: 1120,
    time: '12:30 PM',
    date: '2026-08-12',
  },
  {
    id: '#1046',
    clientName: 'M. Leung',
    tableNumber: 11,
    status: 'New',
    lines: [
      { id: '5', menuItemId: '3', name: 'Fish vindaye', qty: 1, unitPrice: 590, addOns: [] },
    ],
    total: 590,
    time: '12:24 PM',
    date: '2026-08-12',
  },
  {
    id: '#1045',
    clientName: 'S. Banymandhub',
    tableNumber: 4,
    status: 'Completed',
    lines: [
      { id: '6', menuItemId: '1', name: 'Prawn rougaille', qty: 1, unitPrice: 680, addOns: [] },
      { id: '7', menuItemId: '2', name: 'Chicken curry', qty: 1, unitPrice: 540, addOns: [] },
    ],
    total: 1220,
    time: '11:50 AM',
    date: '2026-08-11',
  },
  {
    id: '#1044',
    clientName: 'Walk-in guest',
    tableNumber: 1,
    status: 'Completed',
    lines: [
      { id: '8', menuItemId: '4', name: 'Coconut rice', qty: 1, unitPrice: 220, addOns: [] },
      { id: '9', menuItemId: '3', name: 'Fish vindaye', qty: 1, unitPrice: 590, addOns: [] },
    ],
    total: 810,
    time: '1:10 PM',
    date: '2026-08-08',
  },
  {
    id: '#1039',
    clientName: 'K. Appadoo',
    tableNumber: 3,
    status: 'Completed',
    lines: [
      { id: '10', menuItemId: '2', name: 'Chicken curry', qty: 1, unitPrice: 540, addOns: [] },
      { id: '11', menuItemId: '4', name: 'Coconut rice', qty: 2, unitPrice: 220, addOns: [] },
    ],
    total: 980,
    time: '7:40 PM',
    date: '2026-07-22',
  },
  {
    id: '#1032',
    clientName: 'Walk-in guest',
    tableNumber: 8,
    status: 'Cancelled',
    lines: [
      { id: '12', menuItemId: '1', name: 'Prawn rougaille', qty: 1, unitPrice: 680, addOns: [] },
    ],
    total: 680,
    time: '8:05 PM',
    date: '2026-07-09',
  },
  {
    id: '#1024',
    clientName: 'N. Seebaluck',
    tableNumber: 5,
    status: 'Completed',
    lines: [
      { id: '13', menuItemId: '3', name: 'Fish vindaye', qty: 1, unitPrice: 590, addOns: [] },
      { id: '14', menuItemId: '4', name: 'Coconut rice', qty: 1, unitPrice: 220, addOns: [] },
    ],
    total: 810,
    time: '12:15 PM',
    date: '2026-06-18',
  },
  {
    id: '#1018',
    clientName: 'Walk-in guest',
    tableNumber: 2,
    status: 'Completed',
    lines: [
      { id: '15', menuItemId: '2', name: 'Chicken curry', qty: 2, unitPrice: 540, addOns: [] },
    ],
    total: 1080,
    time: '6:50 PM',
    date: '2026-05-27',
  },
  {
    id: '#1011',
    clientName: 'R. Jhuboo',
    tableNumber: 7,
    status: 'Completed',
    lines: [
      { id: '16', menuItemId: '1', name: 'Prawn rougaille', qty: 1, unitPrice: 680, addOns: [{ id: '161', name: 'Coconut rice', price: 220 }] },
    ],
    total: 900,
    time: '1:35 PM',
    date: '2026-04-14',
  },
  {
    id: '#1004',
    clientName: 'Walk-in guest',
    tableNumber: 9,
    status: 'Completed',
    lines: [
      { id: '17', menuItemId: '4', name: 'Coconut rice', qty: 1, unitPrice: 220, addOns: [] },
      { id: '18', menuItemId: '2', name: 'Chicken curry', qty: 1, unitPrice: 540, addOns: [] },
    ],
    total: 760,
    time: '8:20 PM',
    date: '2026-03-21',
  },
  {
    id: '#0997',
    clientName: 'A. Ramtohul',
    tableNumber: 3,
    status: 'Completed',
    lines: [
      { id: '19', menuItemId: '3', name: 'Fish vindaye', qty: 1, unitPrice: 590, addOns: [] },
      { id: '20', menuItemId: '2', name: 'Chicken curry', qty: 1, unitPrice: 540, addOns: [] },
      { id: '21', menuItemId: '4', name: 'Coconut rice', qty: 1, unitPrice: 220, addOns: [] },
    ],
    total: 1350,
    time: '7:15 PM',
    date: '2026-02-11',
  },
  {
    id: '#0988',
    clientName: 'Walk-in guest',
    tableNumber: 6,
    status: 'Completed',
    lines: [
      { id: '22', menuItemId: '1', name: 'Prawn rougaille', qty: 2, unitPrice: 680, addOns: [] },
    ],
    total: 1360,
    time: '12:40 PM',
    date: '2026-01-19',
  },
  {
    id: '#0975',
    clientName: 'M. Leung',
    tableNumber: 1,
    status: 'Completed',
    lines: [
      { id: '23', menuItemId: '2', name: 'Chicken curry', qty: 1, unitPrice: 540, addOns: [] },
      { id: '24', menuItemId: '3', name: 'Fish vindaye', qty: 1, unitPrice: 590, addOns: [] },
    ],
    total: 1130,
    time: '9:05 PM',
    date: '2025-12-28',
  },
]
const seedExpenses: Expense[] = [
  {
    id: '1',
    date: '2026-08-05',
    category: 'Produce',
    lines: [
      { id: '11', description: 'Tomatoes', qty: 10, amount: 120 },
      { id: '12', description: 'Lettuce mix', qty: 8, amount: 110 },
      { id: '13', description: 'Fresh herbs', qty: 5, amount: 520 },
    ],
  },
  {
    id: '2',
    date: '2026-08-04',
    category: 'Beverages',
    lines: [
      { id: '21', description: 'Soft drinks case', qty: 4, amount: 1050 },
      { id: '22', description: 'Sparkling water', qty: 6, amount: 525 },
      { id: '23', description: 'Juice cartons', qty: 5, amount: 400 },
    ],
  },
  {
    id: '3',
    date: '2026-01-18',
    category: 'Dry goods',
    lines: [
      { id: '31', description: 'Basmati rice 25kg', qty: 2, amount: 1425 },
      { id: '32', description: 'Cooking oil', qty: 4, amount: 410 },
    ],
  },
  {
    id: '4',
    date: '2025-11-22',
    category: 'Kitchen equipment',
    lines: [
      { id: '41', description: 'Blender blades', qty: 1, amount: 950 },
      { id: '42', description: 'Storage containers', qty: 7, amount: 200 },
    ],
  },
]
const seedCategories: Category[] = [
  { id: '1', name: 'Starters', description: 'Light plates to open the meal.' },
  { id: '2', name: 'Mains', description: 'Signature dishes and house specialties.' },
  { id: '3', name: 'Sides', description: 'Accompaniments and shared plates.' },
  { id: '4', name: 'Desserts', description: 'Sweet finishes and pastry.' },
]

const seedCompany: CompanySettings = {
  logo: '',
  name: 'Pyramid Snack',
  address: '',
  phone: '+230 263 8820',
  email: 'hello@pyramidsnack.com',
  brn: '',
  vatRegistered: false,
  vatNumber: '',
}

function Button({ children, onClick, variant = 'primary', type = 'button', className = '' }: { children: React.ReactNode; onClick?: () => void; variant?: string; type?: 'button' | 'submit'; className?: string }) { return <button type={type} onClick={onClick} className={`button button-${variant}${className ? ` ${className}` : ''}`}>{children}</button> }
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }
function Badge({ children }: { children: React.ReactNode }) { return <span className="badge">{children}</span> }
function VatAmountCells({ inclusive, vatOn }: { inclusive: number; vatOn: boolean }) {
  if (!vatOn) return <td className="align-right"><strong>{money(inclusive)}</strong></td>
  const parts = vatSplit(inclusive, true)
  return (
    <>
      <td className="align-right muted">{money(parts.exclusive)}</td>
      <td className="align-right">{money(parts.vat)}</td>
      <td className="align-right"><strong>{money(parts.inclusive)}</strong></td>
    </>
  )
}
const vatPdfCells = (inclusive: number, vatOn: boolean) => {
  if (!vatOn) return [money(inclusive)]
  const parts = vatSplit(inclusive, true)
  return [money(parts.exclusive), money(parts.vat), money(parts.inclusive)]
}
function Dialog({ title, close, children, wide }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className={wide ? 'dialog dialog-wide' : 'dialog'}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button onClick={close} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
function ConfirmDelete({
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = 'Delete',
  confirmVariant = 'danger',
}: {
  title: string
  message: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel?: string
  confirmVariant?: string
}) {
  return (
    <Dialog title={title} close={onCancel}>
      <p className="confirm-copy">{message}</p>
      <div className="dialog-actions">
        <span className="dialog-actions-spacer" />
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmVariant === 'danger' ? <Trash2 size={16} /> : <LogOut size={16} />}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
function FormActions({ close, onDelete }: { close: () => void; onDelete?: () => void }) {
  return (
    <div className="dialog-actions">
      {onDelete && <Button variant="danger" type="button" onClick={onDelete}><Trash2 size={16} /> Delete</Button>}
      <span className="dialog-actions-spacer" />
      <Button variant="secondary" onClick={close}>Cancel</Button>
      <Button type="submit"><Check size={16} /> Save</Button>
    </div>
  )
}

function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <main className="login-page">
      <section className="login-hero" aria-label="Pyramid Snack">
        <div className="login-hero-media" aria-hidden="true" />
        <div className="login-hero-shade" aria-hidden="true" />
        <div className="login-hero-content">
          <div className="login-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="28" height="28" fill="none">
              <path d="M24 6L42 40H6L24 6Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M24 18L33 36H15L24 18Z" fill="currentColor" opacity=".85" />
            </svg>
          </div>
          <h1 className="login-brand">Pyramid Snack</h1>
          <p className="login-tagline">Fresh service, clear numbers — the back office for every rush.</p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <span className="login-mark small" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="22" height="22" fill="none">
                <path d="M24 6L42 40H6L24 6Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                <path d="M24 18L33 36H15L24 18Z" fill="currentColor" opacity=".85" />
              </svg>
            </span>
            <strong>Pyramid Snack</strong>
          </div>
          <p className="login-panel-kicker">Staff sign-in</p>
          <h2>Enter the back office</h2>
          <p className="login-panel-copy">
            {isSupabaseConfigured
              ? 'Sign in with your email and password. Each account is its own restaurant.'
              : 'Supabase is not configured yet — using local demo login.'}
          </p>
          <form
            onSubmit={async e => {
              e.preventDefault()
              setError('')
              setBusy(true)
              const d = new FormData(e.currentTarget)
              const email = String(d.get('email') || '')
              const password = String(d.get('password') || '')
              try {
                await onLogin(email, password)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Sign-in failed')
              } finally {
                setBusy(false)
              }
            }}
          >
            <label>
              Email address
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Password
              <span className="password-input">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <Eye size={16} />
                </button>
              </span>
            </label>
            {error && <p className="form-error">{error}</p>}
            <Button type="submit" className="full-button">
              {busy ? 'Signing in…' : 'Sign in'} <ChevronRight size={17} />
            </Button>
          </form>
          <p className="login-foot">Pyramid Snack · Mauritius</p>
        </div>
      </section>
    </main>
  )
}

const PAGE_SIZE = 10

function usePagedRows<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), pageCount)
  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])
  const start = (safePage - 1) * pageSize
  return {
    page: safePage,
    setPage,
    pageCount,
    total,
    pageSize,
    from: total ? start + 1 : 0,
    to: Math.min(start + pageSize, total),
    slice: rows.slice(start, start + pageSize),
  }
}

function pageWindow(page: number, pageCount: number) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter(p => p >= 1 && p <= pageCount))
  if (page <= 3) [2, 3, 4].forEach(p => { if (p < pageCount) pages.add(p) })
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach(p => { if (p > 1) pages.add(p) })
  return Array.from(pages).sort((a, b) => a - b)
}

function TablePagination({
  page,
  pageCount,
  total,
  from,
  to,
  setPage,
  noun = 'rows',
}: {
  page: number
  pageCount: number
  total: number
  from: number
  to: number
  setPage: (page: number) => void
  noun?: string
}) {
  if (!total) return null
  const pages = pageWindow(page, pageCount)
  return (
    <div className="table-pagination">
      <div className="pagination-meta">
        <strong>{from}–{to}</strong>
        <span>of {total} {noun}</span>
      </div>
      <div className="pagination-controls" role="navigation" aria-label="Pagination">
        <button type="button" className="pagination-nav" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <div className="pagination-pages">
          {pages.map((p, index) => {
            const prev = pages[index - 1]
            const showGap = prev != null && p - prev > 1
            return (
              <span key={p} className="pagination-page-wrap">
                {showGap && <span className="pagination-ellipsis" aria-hidden>…</span>}
                <button
                  type="button"
                  className={`pagination-page-btn${p === page ? ' active' : ''}`}
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              </span>
            )
          })}
        </div>
        <button type="button" className="pagination-nav" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

const navSections = [
  {
    title: 'Operations',
    items: [
      ['dashboard', 'Dashboard', LayoutDashboard],
      ['orders', 'Orders', ClipboardList],
      ['expenses', 'Expenses', Receipt],
      ['tables', 'Tables', Table2],
      ['menu', 'Menu item', BookOpen],
      ['categories', 'Category', Tags],
    ],
  },
  {
    title: 'Reports',
    items: [
      ['pnl', 'P&L', BarChart3],
      ['sales', 'Sales report', TrendingUp],
      ['expense-report', 'Expense report', Wallet],
      ['inventory-report', 'Inventory report', Boxes],
    ],
  },
  {
    title: 'System',
    items: [['settings', 'Settings', Settings]],
  },
] as const

function Sidebar({ active, setActive, logout, company }: { active: PageKey; setActive: (x: PageKey) => void; logout: () => void; company: CompanySettings }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className={`app-logo${company.logo ? ' app-logo-with-img' : ''}`}>
          {company.logo ? (
            <img className="app-logo-img" src={company.logo} alt={company.name || 'Restaurant logo'} />
          ) : (
            <span className="logo-icon"><Store size={19} /></span>
          )}
        </div>
      </div>
      <nav>
        {navSections.map(section => (
          <div key={section.title} className="nav-group">
            <p>{section.title}</p>
            {section.items.map(([key, label, Icon]) => (
              <button key={key} className={`nav-item ${active === key ? 'active' : ''}`} onClick={() => setActive(key)}>
                <Icon size={18} /><span>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="user-chip">
          <button type="button" onClick={logout} className="sign-out">
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
function Header({ active, mobileMenu }: { active: PageKey; mobileMenu: () => void }) { const titles: Record<PageKey, [string, string]> = { dashboard: ['Dashboard', 'Live service, menu margins, and spend at a glance.'], menu: ['Menu item', 'Add and manage dishes on your menu.'], categories: ['Category', 'Name and describe the groups on your menu.'], tables: ['Tables', 'Add dining tables and seating capacity for this restaurant.'], orders: ['Orders', 'Tickets with menu items, add-ons, table, and status.'], expenses: ['Expenses', 'Track the cost of doing good work.'], pnl: ['P&L', 'Mauritian profit and loss statement from orders and expenses.'], sales: ['Sales report', 'Filter and review every sale, item, and ticket.'], 'expense-report': ['Expense report', 'Filter and review every expense, category, and line item.'], 'inventory-report': ['Inventory report', 'Items sold from completed orders, with date and category filters.'], settings: ['Settings', 'Make Pyramid Snack work your way.'] }; return <header className="topbar"><button className="mobile-menu" onClick={mobileMenu}><MenuIcon size={21} /></button><div><h1>{titles[active][0]}</h1><p>{titles[active][1]}</p></div></header> }

function Dashboard({ orders, expenses }: { orders: Order[]; expenses: Expense[] }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const salesOverall = sumOrders(orders)
  const salesYear = sumOrders(orders.filter(o => inYearMonth(o.date, year)))
  const salesMonth = sumOrders(orders.filter(o => inYearMonth(o.date, year, month)))

  const expenseOverall = sumExpenses(expenses)
  const expenseYear = sumExpenses(expenses.filter(e => inYearMonth(e.date, year)))
  const expenseMonth = sumExpenses(expenses.filter(e => inYearMonth(e.date, year, month)))

  const profitOverall = salesOverall - expenseOverall
  const profitYear = salesYear - expenseYear
  const profitMonth = salesMonth - expenseMonth

  const monthlySales = monthLabels.map((label, index) => ({
    month: label,
    sales: sumOrders(orders.filter(o => inYearMonth(o.date, year, index))),
  }))

  const itemCounts = orders.reduce<Record<string, number>>((acc, order) => {
    if (order.status === 'Cancelled') return acc
    order.lines.forEach(line => {
      const name = line.name.trim()
      if (!name) return
      acc[name] = (acc[name] || 0) + (Number(line.qty) || 0)
    })
    return acc
  }, {})
  const topSelling = Object.entries(itemCounts)
    .map(([name, sold]) => ({ name, sold }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5)

  return (
    <div className="page-content">
      <div className="dashboard-grid dash-top-grid">
        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <h2>Total sales per month</h2>
              <p>{year} · January to December</p>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlySales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={64} tickFormatter={(v: number) => `Rs ${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(value) => money(Number(value ?? 0))} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)' }} />
                <Bar dataKey="sales" name="Sales" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <h2>Top 5 selling items</h2>
              <p>Most ordered dishes across all tickets</p>
            </div>
          </div>
          {topSelling.length ? (
            <div className="rank-list">
              {topSelling.map((item, index) => (
                <div className="rank-row" key={item.name}>
                  <span className="rank-index">{index + 1}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <span className="muted">Ordered across service</span>
                  </div>
                  <div className="rank-value">
                    <strong>{item.sold}</strong>
                    <span className="muted">{item.sold === 1 ? 'sale' : 'sales'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted empty-panel">No order items yet. Completed tickets will rank here.</p>
          )}
        </Card>
      </div>

      <div className="metric-grid dash-triple-grid">
        <Card className="metric-card summary-card">
          <p>Total sales</p>
          <div className="stat-stack">
            <div><span>Overall</span><strong>{money(salesOverall)}</strong></div>
            <div><span>This year</span><strong>{money(salesYear)}</strong></div>
            <div><span>This month</span><strong>{money(salesMonth)}</strong></div>
          </div>
        </Card>
        <Card className="metric-card summary-card">
          <p>Total expense</p>
          <div className="stat-stack">
            <div><span>Overall</span><strong>{money(expenseOverall)}</strong></div>
            <div><span>This year</span><strong>{money(expenseYear)}</strong></div>
            <div><span>This month</span><strong>{money(expenseMonth)}</strong></div>
          </div>
        </Card>
        <Card className="metric-card summary-card">
          <p>Profit</p>
          <div className="stat-stack">
            <div><span>Overall</span><strong className={profitOverall >= 0 ? 'positive' : 'negative'}>{money(profitOverall)}</strong></div>
            <div><span>This year</span><strong className={profitYear >= 0 ? 'positive' : 'negative'}>{money(profitYear)}</strong></div>
            <div><span>This month</span><strong className={profitMonth >= 0 ? 'positive' : 'negative'}>{money(profitMonth)}</strong></div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function CategoriesPage({ categories, setCategories, toast, tenantId }: { categories: Category[]; setCategories: React.Dispatch<React.SetStateAction<Category[]>>; toast: (x: string) => void; tenantId: string | null }) {
  const [editing, setEditing] = useState<Category | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null)
  const [query, setQuery] = useState('')
  const shown = categories.filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.description.toLowerCase().includes(query.toLowerCase()))
  const paged = usePagedRows(shown)
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    const draft: Category = { id: editing?.id || '', name: String(d.get('name')).trim(), description: String(d.get('description')).trim() }
    try {
      const category = tenantId ? await api.saveCategory(tenantId, draft) : { ...draft, id: draft.id || newId() }
      setCategories(xs => editing?.id ? xs.map(x => x.id === editing.id ? category : x) : [category, ...xs])
      setEditing(null)
      toast(editing?.id ? 'Category updated' : 'Category added')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save category')
    }
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      if (tenantId) await api.deleteCategory(tenantId, pendingDelete.id)
      setCategories(xs => xs.filter(x => x.id !== pendingDelete.id))
      setPendingDelete(null)
      setEditing(null)
      toast('Category deleted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete category')
    }
  }
  return (
    <div className="page-content">
      <div className="page-toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search categories..." value={query} onChange={e => { setQuery(e.target.value); paged.setPage(1) }} /></div>
        <Button onClick={() => setEditing({ id: '', name: '', description: '' })}><Plus size={17} /> Add category</Button>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>{shown.length} {shown.length === 1 ? 'category' : 'categories'}</strong></div>
        <div className="data-table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Description</th><th /></tr></thead>
            <tbody>
              {paged.slice.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td className="muted">{c.description || '—'}</td>
                  <td><div className="row-actions"><button className="more-button" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><MoreHorizontal size={18} /></button><button className="more-button" onClick={() => setPendingDelete(c)} aria-label={`Delete ${c.name}`}><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={3} className="muted">No categories yet. Add one to get started.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={shown.length === 1 ? 'category' : 'categories'} />
      </Card>
      {editing && !pendingDelete && (
        <Dialog title={editing.id ? 'Edit category' : 'Add category'} close={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label className="full-span">Name<input name="name" defaultValue={editing.name} placeholder="e.g. Mains" required /></label>
              <label className="full-span">Description<textarea name="description" defaultValue={editing.description} placeholder="Short note about this category" rows={3} /></label>
            </div>
            <FormActions close={() => setEditing(null)} onDelete={editing.id ? () => setPendingDelete(editing) : undefined} />
          </form>
        </Dialog>
      )}
      {pendingDelete && (
        <ConfirmDelete
          title="Delete category?"
          message={`Are you sure you want to delete “${pendingDelete.name}”? This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function MenuPage({ menu, setMenu, categories, company, toast, tenantId }: { menu: MenuItem[]; setMenu: React.Dispatch<React.SetStateAction<MenuItem[]>>; categories: Category[]; company: CompanySettings; toast: (x: string) => void; tenantId: string | null }) {
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState<'all' | 'day' | 'night' | 'happyHour'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null)
  const shown = menu.filter(x => {
    if (categoryFilter !== 'all' && x.category !== categoryFilter) return false
    if (serviceFilter === 'day' && !x.day) return false
    if (serviceFilter === 'night' && !x.night) return false
    if (serviceFilter === 'happyHour' && !x.happyHour) return false
    if (query) {
      const q = query.toLowerCase()
      if (!x.name.toLowerCase().includes(q) && !x.description.toLowerCase().includes(q) && !x.category.toLowerCase().includes(q)) return false
    }
    return true
  })
  const paged = usePagedRows(shown)
  const blank = (): MenuItem => ({
    id: '',
    name: '',
    description: '',
    category: categories[0]?.name ?? '',
    allowAddOn: false,
    sellingPrice: 0,
    manufacturedPrice: 0,
    day: true,
    night: false,
    happyHour: false,
  })
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editing) return
    const d = new FormData(e.currentTarget)
    const draft: MenuItem = {
      id: editing.id || '',
      name: String(d.get('name')).trim(),
      description: String(d.get('description')).trim(),
      category: String(d.get('category')),
      allowAddOn: d.get('allowAddOn') === 'on',
      sellingPrice: Number(d.get('sellingPrice')),
      manufacturedPrice: Number(d.get('manufacturedPrice')),
      day: d.get('day') === 'on',
      night: d.get('night') === 'on',
      happyHour: d.get('happyHour') === 'on',
    }
    try {
      const categoryId = categories.find(c => c.name === draft.category)?.id ?? null
      const item = tenantId
        ? await api.saveMenuItem(tenantId, draft, categoryId)
        : { ...draft, id: draft.id || newId() }
      setMenu(xs => editing.id ? xs.map(x => x.id === editing.id ? item : x) : [item, ...xs])
      setEditing(null)
      toast(editing.id ? 'Menu item updated' : 'Menu item added')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save menu item')
    }
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      if (tenantId) await api.deleteMenuItem(tenantId, pendingDelete.id)
      setMenu(xs => xs.filter(x => x.id !== pendingDelete.id))
      setPendingDelete(null)
      setEditing(null)
      toast('Menu item deleted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete menu item')
    }
  }
  return (
    <div className="page-content">
      <div className="menu-filters-bar">
        <div className="menu-filters-main">
          <div className="menu-search">
            <Search size={17} />
            <input placeholder="Search dishes, notes, categories…" value={query} onChange={e => { setQuery(e.target.value); paged.setPage(1) }} />
          </div>
          <label className="menu-filter-field">
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); paged.setPage(1) }}
              aria-label="Category filter"
            >
              <option value="all">All categories</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <div className="menu-period-group" role="group" aria-label="Service period">
            {([
              ['all', 'All', null],
              ['day', 'Day', Sun],
              ['night', 'Night', Moon],
              ['happyHour', 'Happy hour', Sparkles],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                className={`menu-period-chip${serviceFilter === key ? ' active' : ''}${key !== 'all' ? ` period-${key}` : ''}`}
                aria-pressed={serviceFilter === key}
                onClick={() => { setServiceFilter(key); paged.setPage(1) }}
              >
                {Icon ? <Icon size={14} /> : null}
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={() => setEditing(blank())}><Plus size={17} /> Add menu item</Button>
      </div>
      <Card className="table-card">
        <div className="table-summary">
          <strong>{shown.length} {shown.length === 1 ? 'item' : 'items'}</strong>
          {(categoryFilter !== 'all' || serviceFilter !== 'all' || query) && (
            <button
              type="button"
              className="text-button"
              onClick={() => { setCategoryFilter('all'); setServiceFilter('all'); setQuery(''); paged.setPage(1) }}
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Selling price</th>
                <th>Manufactured price</th>
                <th>Profit coefficient</th>
                <th>Add-on</th>
                <th>Availability</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.slice.map(item => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    {item.description ? <div className="muted table-desc">{item.description}</div> : null}
                  </td>
                  <td><Badge>{item.category || 'Uncategorised'}</Badge></td>
                  <td>{money(item.sellingPrice)}</td>
                  <td className="muted">{money(item.manufacturedPrice)}</td>
                  <td><strong>{formatProfitCoefficient(item.sellingPrice, item.manufacturedPrice)}</strong></td>
                  <td className="muted">{item.allowAddOn ? 'Yes' : 'No'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.day && <Badge>Day</Badge>}
                      {item.night && <Badge>Night</Badge>}
                      {item.happyHour && <Badge>Happy hour</Badge>}
                      {!item.day && !item.night && !item.happyHour && <span className="muted">—</span>}
                    </div>
                  </td>
                  <td><div className="row-actions"><button className="more-button" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><MoreHorizontal size={18} /></button><button className="more-button" onClick={() => setPendingDelete(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={8} className="muted">No menu items match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={shown.length === 1 ? 'item' : 'items'} />
      </Card>
      {editing && !pendingDelete && (
        <Dialog title={editing.id ? 'Edit menu item' : 'Add menu item'} close={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label className="full-span">Name<input name="name" defaultValue={editing.name} required /></label>
              <label className="full-span">Description<textarea name="description" defaultValue={editing.description} rows={2} /></label>
              <label>Category
                <select name="category" defaultValue={editing.category}>
                  {!categories.length && <option value="">No categories</option>}
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>Selling price{company.vatRegistered ? <span className="field-hint">VAT incl.</span> : null}<input name="sellingPrice" type="number" min={0} step="0.01" value={editing.sellingPrice} onChange={e => setEditing({ ...editing, sellingPrice: Number(e.target.value) })} required /></label>
              <label>Manufactured price{company.vatRegistered ? <span className="field-hint">VAT incl.</span> : null}<input name="manufacturedPrice" type="number" min={0} step="0.01" value={editing.manufacturedPrice} onChange={e => setEditing({ ...editing, manufacturedPrice: Number(e.target.value) })} required /></label>
              <div className="full-span coeff-preview">
                <span className="muted">Profit coefficient</span>
                <strong>{formatProfitCoefficient(editing.sellingPrice, editing.manufacturedPrice)}</strong>
                <span className="muted">Selling ÷ manufactured</span>
              </div>
              <label className="check"><input name="allowAddOn" type="checkbox" defaultChecked={editing.allowAddOn} /> Allow add-on</label>
              <label className="check"><input name="day" type="checkbox" defaultChecked={editing.day} /> Day</label>
              <label className="check"><input name="night" type="checkbox" defaultChecked={editing.night} /> Night</label>
              <label className="check"><input name="happyHour" type="checkbox" defaultChecked={editing.happyHour} /> Happy hour</label>
            </div>
            <FormActions close={() => setEditing(null)} onDelete={editing.id ? () => setPendingDelete(editing) : undefined} />
          </form>
        </Dialog>
      )}
      {pendingDelete && (
        <ConfirmDelete
          title="Delete menu item?"
          message={`Are you sure you want to delete “${pendingDelete.name}”? This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function Tables({ tables, setTables, toast, tenantId }: { tables: DiningTable[]; setTables: React.Dispatch<React.SetStateAction<DiningTable[]>>; toast: (x: string) => void; tenantId: string | null }) {
  const [editing, setEditing] = useState<DiningTable | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DiningTable | null>(null)
  const [query, setQuery] = useState('')
  const shown = tables.filter(t => !query || String(t.number).includes(query) || String(t.capacity).includes(query))
  const paged = usePagedRows(shown)
  const nextNumber = (tables.reduce((max, t) => Math.max(max, t.number), 0) || 0) + 1
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editing) return
    const d = new FormData(e.currentTarget)
    const draft: DiningTable = {
      id: editing.id || '',
      number: Number(d.get('number')),
      capacity: Number(d.get('capacity')),
    }
    if (!draft.number || draft.number < 1) return toast('Enter a table number')
    if (!draft.capacity || draft.capacity < 1) return toast('Enter seating capacity')
    const taken = tables.some(t => t.number === draft.number && t.id !== draft.id)
    if (taken) return toast(`Table ${draft.number} already exists`)
    try {
      const table = tenantId ? await api.saveTable(tenantId, draft) : { ...draft, id: draft.id || newId() }
      setTables(xs => editing.id ? xs.map(x => x.id === editing.id ? table : x) : [...xs, table].sort((a, b) => a.number - b.number))
      setEditing(null)
      toast(editing.id ? 'Table updated' : 'Table added')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save table')
    }
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      if (tenantId) await api.deleteTable(tenantId, pendingDelete.id)
      setTables(xs => xs.filter(x => x.id !== pendingDelete.id))
      setPendingDelete(null)
      setEditing(null)
      toast('Table deleted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete table')
    }
  }
  return (
    <div className="page-content">
      <div className="page-toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search tables..." value={query} onChange={e => { setQuery(e.target.value); paged.setPage(1) }} /></div>
        <Button onClick={() => setEditing({ id: '', number: nextNumber, capacity: 4 })}><Plus size={17} /> Add table</Button>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>{shown.length} {shown.length === 1 ? 'table' : 'tables'}</strong></div>
        <div className="data-table-wrap">
          <table>
            <thead><tr><th>Table</th><th>Capacity</th><th /></tr></thead>
            <tbody>
              {paged.slice.map(t => (
                <tr key={t.id}>
                  <td><strong>Table {String(t.number).padStart(2, '0')}</strong></td>
                  <td className="muted"><Users size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />{t.capacity} seats</td>
                  <td><div className="row-actions"><button className="more-button" onClick={() => setEditing(t)} aria-label={`Edit table ${t.number}`}><MoreHorizontal size={18} /></button><button className="more-button" onClick={() => setPendingDelete(t)} aria-label={`Delete table ${t.number}`}><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={3} className="muted">No tables yet. Add one to get started.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={shown.length === 1 ? 'table' : 'tables'} />
      </Card>
      {editing && !pendingDelete && (
        <Dialog title={editing.id ? 'Edit table' : 'Add table'} close={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Table number<input name="number" type="number" min={1} defaultValue={editing.number} required /></label>
              <label>Capacity (seats)<input name="capacity" type="number" min={1} defaultValue={editing.capacity} required /></label>
            </div>
            <FormActions close={() => setEditing(null)} onDelete={editing.id ? () => setPendingDelete(editing) : undefined} />
          </form>
        </Dialog>
      )}
      {pendingDelete && (
        <ConfirmDelete
          title="Delete table?"
          message={`Are you sure you want to delete Table ${String(pendingDelete.number).padStart(2, '0')}? This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function Orders({
  orders,
  setOrders,
  menu,
  company,
  toast,
  tenantId,
}: {
  orders: Order[]
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>
  menu: MenuItem[]
  company: CompanySettings
  toast: (x: string) => void
  tenantId: string | null
}) {
  const [editing, setEditing] = useState<Order | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | OrderStatus>('All')

  const blankLine = (): OrderLine => ({
    id: newId(),
    menuItemId: menu[0]?.id ?? null,
    name: menu[0]?.name ?? '',
    qty: 1,
    unitPrice: menu[0]?.sellingPrice ?? 0,
    addOns: [],
  })
  const blank = (): Order => ({
    id: '',
    clientName: '',
    tableNumber: 1,
    status: 'New',
    lines: [blankLine()],
    total: 0,
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toISOString().slice(0, 10),
  })

  const shown = orders.filter(order => {
    if (statusFilter !== 'All' && order.status !== statusFilter) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (
      order.id.toLowerCase().includes(q)
      || order.clientName.toLowerCase().includes(q)
      || String(order.tableNumber).includes(q)
      || order.lines.some(line => line.name.toLowerCase().includes(q) || line.addOns.some(a => a.name.toLowerCase().includes(q)))
    )
  })
  const paged = usePagedRows(shown)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      if (tenantId) await api.deleteOrder(tenantId, pendingDelete.id)
      setOrders(xs => xs.filter(x => x.id !== pendingDelete.id))
      setPendingDelete(null)
      setEditing(null)
      toast('Order deleted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete order')
    }
  }

  const updateLine = (id: string, patch: Partial<OrderLine>) => {
    setEditing(order => {
      if (!order) return order
      return { ...order, lines: order.lines.map(line => (line.id === id ? { ...line, ...patch } : line)) }
    })
  }

  const setLineMenuItem = (lineId: string, menuItemId: string) => {
    const item = menu.find(m => m.id === menuItemId)
    if (!item) return
    updateLine(lineId, {
      menuItemId: item.id,
      name: item.name,
      unitPrice: item.sellingPrice,
      addOns: item.allowAddOn ? [] : [],
    })
  }

  const toggleAddOn = (lineId: string, addOnItem: MenuItem) => {
    setEditing(order => {
      if (!order) return order
      return {
        ...order,
        lines: order.lines.map(line => {
          if (line.id !== lineId) return line
          const exists = line.addOns.some(a => a.id === addOnItem.id)
          const addOns = exists
            ? line.addOns.filter(a => a.id !== addOnItem.id)
            : [...line.addOns, { id: addOnItem.id, name: addOnItem.name, price: addOnItem.sellingPrice, menuItemId: addOnItem.id }]
          return { ...line, addOns }
        }),
      }
    })
  }

  const addLine = () => setEditing(order => (order ? { ...order, lines: [...order.lines, blankLine()] } : order))
  const removeLine = (id: string) => {
    setEditing(order => {
      if (!order || order.lines.length <= 1) return order
      return { ...order, lines: order.lines.filter(line => line.id !== id) }
    })
  }

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editing) return
    const d = new FormData(e.currentTarget)
    const lines = editing.lines
      .map(line => ({
        ...line,
        name: line.name.trim(),
        qty: Number(line.qty) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        addOns: line.addOns.filter(a => a.name.trim()),
      }))
      .filter(line => line.name && line.qty > 0)
    if (!lines.length) return toast('Add at least one menu item')
    const draft: Order = {
      id: editing.id || `#${1050 + orders.length}`,
      clientName: String(d.get('clientName')).trim() || 'Walk-in guest',
      tableNumber: Number(d.get('tableNumber')) || 1,
      status: d.get('status') as OrderStatus,
      lines,
      total: lines.reduce((sum, line) => sum + orderLineTotal(line), 0),
      time: editing.time || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      date: String(d.get('date') || new Date().toISOString().slice(0, 10)),
    }
    try {
      const order = tenantId ? await api.saveOrder(tenantId, draft) : draft
      setOrders(xs => (editing.id ? xs.map(x => (x.id === editing.id ? order : x)) : [order, ...xs]))
      setEditing(null)
      toast(editing.id ? 'Order updated' : 'New order created')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save order')
    }
  }

  const setStatus = async (id: string, status: OrderStatus) => {
    try {
      if (tenantId) await api.updateOrderStatus(tenantId, id, status)
      setOrders(xs => xs.map(x => (x.id === id ? { ...x, status } : x)))
      toast(`${id} marked ${status.toLowerCase()}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update status')
    }
  }

  const editingTotal = editing ? orderTotal(editing) : 0

  return (
    <div className="page-content">
      <div className="order-summary-row">
        <div className="order-kpis">
          <span><strong>{orders.filter(x => x.status === 'New').length}</strong> New</span>
          <span><strong>{orders.filter(x => x.status === 'Completed').length}</strong> Completed</span>
          <span><strong>{orders.filter(x => x.status === 'Cancelled').length}</strong> Cancelled</span>
        </div>
        <Button onClick={() => setEditing(blank())}><Plus size={17} /> New order</Button>
      </div>
      <div className="page-toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search orders..." value={query} onChange={e => { setQuery(e.target.value); paged.setPage(1) }} /></div>
        <div className="toolbar-actions">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as 'All' | OrderStatus); paged.setPage(1) }}>
            <option value="All">All statuses</option>
            <option value="New">New</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>Orders</strong><div><span>{shown.length} shown</span></div></div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Client</th>
                <th>Table</th>
                <th>Items</th>
                <th>Status</th>
                <th className="align-right">Total{company.vatRegistered ? ' · VAT incl.' : ''}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.slice.map(order => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                    <div className="muted">{formatExpenseDate(order.date)} · {order.time}</div>
                  </td>
                  <td>{order.clientName || 'Walk-in guest'}</td>
                  <td><Table2 size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />{order.tableNumber}</td>
                  <td>
                    <div className="line-preview">
                      {order.lines.map(line => (
                        <span key={line.id} className="muted">{formatOrderLine(line)}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="status-toggles" role="group" aria-label={`${order.id} status`}>
                      <button
                        type="button"
                        className={`status-toggle${order.status === 'Completed' ? ' on' : ''}`}
                        aria-pressed={order.status === 'Completed'}
                        onClick={() => setStatus(order.id, order.status === 'Completed' ? 'New' : 'Completed')}
                      >
                        Completed
                      </button>
                      <button
                        type="button"
                        className={`status-toggle cancel${order.status === 'Cancelled' ? ' on' : ''}`}
                        aria-pressed={order.status === 'Cancelled'}
                        onClick={() => setStatus(order.id, order.status === 'Cancelled' ? 'New' : 'Cancelled')}
                      >
                        Cancelled
                      </button>
                    </div>
                  </td>
                  <td className="align-right"><strong>{money(order.total)}</strong></td>
                  <td>
                    <div className="row-actions">
                      <button className="more-button" onClick={() => setEditing({ ...order, lines: order.lines.map(l => ({ ...l, addOns: l.addOns.map(a => ({ ...a })) })) })} aria-label={`Edit ${order.id}`}><MoreHorizontal size={18} /></button>
                      <button className="more-button" onClick={() => setPendingDelete(order)} aria-label={`Delete ${order.id}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={7} className="muted">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={shown.length === 1 ? 'order' : 'orders'} />
      </Card>
      {editing && !pendingDelete && (
        <Dialog title={editing.id ? 'Edit order' : 'New order'} close={() => setEditing(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Date<input name="date" type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} required /></label>
              <label>Status
                <select name="status" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as OrderStatus })}>
                  <option value="New">New</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
              <label>Client name<input name="clientName" value={editing.clientName} onChange={e => setEditing({ ...editing, clientName: e.target.value })} placeholder="Walk-in guest" /></label>
              <label>Table number<input name="tableNumber" type="number" min={1} value={editing.tableNumber} onChange={e => setEditing({ ...editing, tableNumber: Number(e.target.value) })} required /></label>
              <div className="line-items full-span">
                <div className="line-items-head">
                  <strong>Menu items</strong>
                  <button type="button" className="text-button" onClick={addLine}><Plus size={14} /> Add item</button>
                </div>
                {editing.lines.map((line, index) => {
                  const menuItem = menu.find(m => m.id === line.menuItemId)
                  const allowAddOn = menuItem?.allowAddOn ?? false
                  const addOnOptions = menu.filter(m => m.id !== line.menuItemId)
                  return (
                    <div className="order-line-block" key={line.id}>
                      <div className="order-line-row">
                        <label>Item
                          <select
                            value={line.menuItemId ?? ''}
                            onChange={e => setLineMenuItem(line.id, String(e.target.value))}
                            required
                          >
                            {!line.menuItemId && <option value="">Select item</option>}
                            {line.menuItemId && !menu.some(m => m.id === line.menuItemId) && (
                              <option value={line.menuItemId}>{line.name}</option>
                            )}
                            {menu.map(m => <option key={m.id} value={m.id}>{m.name} · {money(m.sellingPrice)}</option>)}
                          </select>
                        </label>
                        <label>Qty<input type="number" min={1} step={1} value={line.qty} onChange={e => updateLine(line.id, { qty: Number(e.target.value) })} required /></label>
                        <label>Unit price{company.vatRegistered ? <span className="field-hint">VAT incl.</span> : null}<input type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => updateLine(line.id, { unitPrice: Number(e.target.value) })} required /></label>
                        <div className="order-line-sum">
                          <span className="muted">Line</span>
                          <strong>{money(orderLineTotal(line))}</strong>
                        </div>
                        <button type="button" className="more-button" onClick={() => removeLine(line.id)} aria-label={`Remove item ${index + 1}`} disabled={editing.lines.length <= 1}><Trash2 size={16} /></button>
                      </div>
                      {allowAddOn && (
                        <div className="order-addons">
                          <span className="muted">Add-ons</span>
                          <div className="order-addon-list">
                            {addOnOptions.length ? addOnOptions.map(option => {
                              const checked = line.addOns.some(a => a.id === option.id)
                              return (
                                <label key={option.id} className="check order-addon-check">
                                  <input type="checkbox" checked={checked} onChange={() => toggleAddOn(line.id, option)} />
                                  {option.name} · {money(option.sellingPrice)}
                                </label>
                              )
                            }) : <span className="muted">No other menu items available as add-ons.</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="line-items-total"><span className="muted">Order total{company.vatRegistered ? ' (VAT incl.)' : ''}</span><strong>{money(editingTotal)}</strong></div>
              </div>
            </div>
            <FormActions close={() => setEditing(null)} onDelete={editing.id ? () => setPendingDelete(editing) : undefined} />
          </form>
        </Dialog>
      )}
      {pendingDelete && (
        <ConfirmDelete
          title="Delete order?"
          message={`Are you sure you want to delete order ${pendingDelete.id}? This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function Expenses({ expenses, setExpenses, company, toast, tenantId, expenseCategoryMap }: { expenses: Expense[]; setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>; company: CompanySettings; toast: (x: string) => void; tenantId: string | null; expenseCategoryMap: Map<string, string> }) {
  const [editing, setEditing] = useState<Expense | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null)
  const [query, setQuery] = useState('')
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const totalOf = (list: Expense[]) => list.reduce((sum, e) => sum + expenseTotal(e), 0)
  const inYear = (e: Expense) => {
    const d = new Date(`${e.date}T00:00:00`)
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year
  }
  const inMonth = (e: Expense) => {
    const d = new Date(`${e.date}T00:00:00`)
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month
  }
  const thisYearTotal = totalOf(expenses.filter(inYear))
  const thisMonthTotal = totalOf(expenses.filter(inMonth))
  const overallTotal = totalOf(expenses)
  const shown = expenses.filter(e => {
    if (!query) return true
    const q = query.toLowerCase()
    return e.category.toLowerCase().includes(q) || e.lines.some(l => l.description.toLowerCase().includes(q))
  })
  const paged = usePagedRows(shown)
  const blank = (): Expense => ({
    id: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'Produce',
    lines: [{ id: newId(), description: '', qty: 1, amount: 0 }],
  })
  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      if (tenantId) await api.deleteExpense(tenantId, pendingDelete.id)
      setExpenses(xs => xs.filter(x => x.id !== pendingDelete.id))
      setPendingDelete(null)
      setEditing(null)
      toast('Expense deleted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete expense')
    }
  }
  const updateLine = (id: string, patch: Partial<ExpenseLine>) => {
    setEditing(e => e ? { ...e, lines: e.lines.map(line => line.id === id ? { ...line, ...patch } : line) } : e)
  }
  const addLine = () => {
    setEditing(e => e ? { ...e, lines: [...e.lines, { id: newId(), description: '', qty: 1, amount: 0 }] } : e)
  }
  const removeLine = (id: string) => {
    setEditing(e => {
      if (!e) return e
      if (e.lines.length <= 1) return e
      return { ...e, lines: e.lines.filter(line => line.id !== id) }
    })
  }
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editing) return
    const d = new FormData(e.currentTarget)
    const lines = editing.lines
      .map(line => ({ ...line, description: line.description.trim(), qty: Number(line.qty) || 0, amount: Number(line.amount) || 0 }))
      .filter(line => line.description || line.amount > 0 || line.qty > 0)
    if (!lines.length) return toast('Add at least one line item')
    const draft: Expense = {
      id: editing.id || '',
      date: String(d.get('date')),
      category: String(d.get('category')).trim(),
      lines,
    }
    try {
      let expense = draft
      if (tenantId) {
        const categoryId = expenseCategoryMap.get(draft.category)
        if (!categoryId) throw new Error(`Unknown expense category: ${draft.category}`)
        expense = await api.saveExpense(tenantId, draft, categoryId)
      } else {
        expense = { ...draft, id: draft.id || newId() }
      }
      setExpenses(xs => editing.id ? xs.map(x => x.id === editing.id ? expense : x) : [expense, ...xs])
      setEditing(null)
      toast(editing.id ? 'Expense updated' : 'Expense added')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save expense')
    }
  }
  return (
    <div className="page-content">
      <div className="metric-grid expense-metrics">
        <Card className="metric-card"><p>This year</p><strong>{money(thisYearTotal)}</strong><span className="muted">{year}</span></Card>
        <Card className="metric-card"><p>This month</p><strong>{money(thisMonthTotal)}</strong><span className="muted">{now.toLocaleString('en-GB', { month: 'long' })}</span></Card>
        <Card className="metric-card"><p>Overall</p><strong>{money(overallTotal)}</strong><span className="muted">{expenses.length} expenses</span></Card>
      </div>
      <div className="page-toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search expenses..." value={query} onChange={e => { setQuery(e.target.value); paged.setPage(1) }} /></div>
        <Button onClick={() => setEditing(blank())}><Plus size={17} /> Add expense</Button>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>Recent expenses</strong></div>
        <div className="data-table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Line items</th><th className="align-right">Amount</th><th /></tr></thead>
            <tbody>
              {paged.slice.map(x => (
                <tr key={x.id}>
                  <td className="muted">{formatExpenseDate(x.date)}</td>
                  <td><Badge>{x.category}</Badge></td>
                  <td>
                    <div className="line-preview">
                      {x.lines.map(line => (
                        <span key={line.id} className="muted">{line.description || 'Untitled'} · {line.qty} × {money(line.amount)} = {money(expenseLineTotal(line))}</span>
                      ))}
                    </div>
                  </td>
                  <td className="align-right"><strong>{money(expenseTotal(x))}</strong></td>
                  <td><div className="row-actions"><button className="more-button" onClick={() => setEditing({ ...x, lines: x.lines.map(l => ({ ...l })) })} aria-label={`Edit ${x.category} expense`}><MoreHorizontal size={18} /></button><button className="more-button" onClick={() => setPendingDelete(x)} aria-label={`Delete ${x.category} expense`}><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={5} className="muted">No expenses yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={shown.length === 1 ? 'expense' : 'expenses'} />
      </Card>
      {editing && !pendingDelete && (
        <Dialog title={editing.id ? 'Edit expense' : 'Add expense'} close={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Date<input name="date" type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} required /></label>
              <label>Category
                <select name="category" defaultValue={editing.category || expenseCategories[0]} required>
                  {editing.category && !(expenseCategories as readonly string[]).includes(editing.category) && (
                    <option value={editing.category}>{editing.category}</option>
                  )}
                  {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </label>
              <div className="line-items full-span">
                <div className="line-items-head">
                  <strong>Line items</strong>
                  <button type="button" className="text-button" onClick={addLine}><Plus size={14} /> Add line</button>
                </div>
                {editing.lines.map((line, index) => (
                  <div className="line-item-row" key={line.id}>
                    <label>Description<input value={line.description} onChange={e => updateLine(line.id, { description: e.target.value })} placeholder={`Item ${index + 1}`} required /></label>
                    <label>Qty<input type="number" min={0} step="1" value={line.qty} onChange={e => updateLine(line.id, { qty: Number(e.target.value) })} required /></label>
                    <label>Amount{company.vatRegistered ? <span className="field-hint">VAT incl.</span> : null}<input type="number" min={0} step="0.01" value={line.amount} onChange={e => updateLine(line.id, { amount: Number(e.target.value) })} required /></label>
                    <button type="button" className="more-button" onClick={() => removeLine(line.id)} aria-label="Remove line" disabled={editing.lines.length <= 1}><Trash2 size={16} /></button>
                  </div>
                ))}
                <div className="line-items-total"><span className="muted">Total</span><strong>{money(expenseTotal(editing))}</strong></div>
              </div>
            </div>
            <FormActions close={() => setEditing(null)} onDelete={editing.id ? () => setPendingDelete(editing) : undefined} />
          </form>
        </Dialog>
      )}
      {pendingDelete && (
        <ConfirmDelete
          title="Delete expense?"
          message={`Are you sure you want to delete this ${pendingDelete.category} expense from ${formatExpenseDate(pendingDelete.date)}? This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function SalesReport({ orders, company, toast }: { orders: Order[]; company: CompanySettings; toast: (x: string) => void }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const yearStart = `${year}-01-01`
  type Preset = 'today' | 'month' | 'year' | 'all' | 'custom'
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<'All' | OrderStatus>('All')
  const [query, setQuery] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [itemFilter, setItemFilter] = useState('All')
  const [view, setView] = useState<'orders' | 'items'>('orders')
  const [downloading, setDownloading] = useState(false)

  const menuOptions = Array.from(
    new Set(orders.flatMap(o => o.lines.map(l => l.name.trim()).filter(Boolean)))
  ).sort((a, b) => a.localeCompare(b))

  const filtered = orders
    .filter(order => {
      if (from && order.date < from) return false
      if (to && order.date > to) return false
      if (status !== 'All' && order.status !== status) return false
      if (tableFilter && String(order.tableNumber) !== tableFilter) return false
      if (itemFilter !== 'All' && !order.lines.some(l => l.name === itemFilter)) return false
      if (query) {
        const q = query.toLowerCase()
        const hit =
          order.id.toLowerCase().includes(q)
          || order.clientName.toLowerCase().includes(q)
          || String(order.tableNumber).includes(q)
          || order.lines.some(l => l.name.toLowerCase().includes(q) || l.addOns.some(a => a.name.toLowerCase().includes(q)))
        if (!hit) return false
      }
      return true
    })
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))

  const vatOn = Boolean(company.vatRegistered)
  const billable = filtered.filter(o => o.status !== 'Cancelled')
  const cancelled = filtered.filter(o => o.status === 'Cancelled')
  const salesTotal = billable.reduce((sum, o) => sum + o.total, 0)
  const salesVat = vatSplit(salesTotal, vatOn)
  const cancelledTotal = cancelled.reduce((sum, o) => sum + o.total, 0)
  const avgTicket = billable.length ? salesTotal / billable.length : 0
  const itemsSold = billable.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), 0)
  const statusCounts = {
    New: filtered.filter(o => o.status === 'New').length,
    Completed: filtered.filter(o => o.status === 'Completed').length,
    Cancelled: filtered.filter(o => o.status === 'Cancelled').length,
  }

  const itemBreakdown = billable.reduce<Record<string, { qty: number; revenue: number }>>((acc, order) => {
    order.lines.forEach(line => {
      const name = line.name.trim() || 'Untitled'
      if (!acc[name]) acc[name] = { qty: 0, revenue: 0 }
      acc[name].qty += Number(line.qty) || 0
      acc[name].revenue += orderLineTotal(line)
    })
    return acc
  }, {})
  const itemRows = Object.entries(itemBreakdown)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
  const ordersPaged = usePagedRows(filtered)
  const itemsPaged = usePagedRows(itemRows)

  const applyPreset = (next: Exclude<Preset, 'custom'>) => {
    setPreset(next)
    if (next === 'today') {
      setFrom(today)
      setTo(today)
    } else if (next === 'month') {
      setFrom(monthStart)
      setTo(today)
    } else if (next === 'year') {
      setFrom(yearStart)
      setTo(today)
    } else {
      setFrom('')
      setTo('')
    }
  }

  const clearFilters = () => {
    applyPreset('month')
    setStatus('All')
    setQuery('')
    setTableFilter('')
    setItemFilter('All')
    ordersPaged.setPage(1)
    itemsPaged.setPage(1)
  }

  const rangeLabel = from || to
    ? `${from ? formatExpenseDate(from) : 'Start'} – ${to ? formatExpenseDate(to) : 'Now'}`
    : 'All time'

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await downloadReportPdf({
        company,
        title: 'Sales report',
        period: rangeLabel,
        filename: reportFileName('sales-report'),
        orientation: 'landscape',
        kpis: [
          { label: vatOn ? 'Gross sales (VAT incl.)' : 'Gross sales', value: money(salesTotal) },
          ...(vatOn ? [{ label: 'VAT on sales', value: money(salesVat.vat) }, { label: 'Excl. VAT', value: money(salesVat.exclusive) }] : []),
          { label: 'Orders', value: String(billable.length) },
          { label: 'Avg ticket', value: money(avgTicket) },
          { label: 'Items sold', value: String(itemsSold) },
          { label: 'Cancelled', value: `${cancelled.length} · ${money(cancelledTotal)}` },
        ],
        tables: [
          {
            title: 'Orders',
            head: vatOn
              ? ['Order', 'Date', 'Client', 'Table', 'Status', 'Excl. VAT', 'VAT', 'Incl. VAT']
              : ['Order', 'Date', 'Client', 'Table', 'Status', 'Total'],
            rightAlign: vatOn ? [5, 6, 7] : [5],
            body: filtered.map(order => [
              order.id,
              `${formatExpenseDate(order.date)} ${order.time}`,
              order.clientName || 'Walk-in guest',
              order.tableNumber,
              order.status,
              ...vatPdfCells(order.total, vatOn),
            ]),
            foot: ['Total (excluding cancelled)', '', '', '', '', ...vatPdfCells(salesTotal, vatOn)],
          },
          {
            title: 'By item',
            head: vatOn
              ? ['Item', 'Qty sold', 'Excl. VAT', 'VAT', 'Incl. VAT', 'Share']
              : ['Item', 'Qty sold', 'Revenue', 'Share'],
            rightAlign: vatOn ? [1, 2, 3, 4, 5] : [1, 2, 3],
            body: itemRows.map(row => [
              row.name,
              row.qty,
              ...vatPdfCells(row.revenue, vatOn),
              salesTotal ? `${Math.round((row.revenue / salesTotal) * 100)}%` : '-',
            ]),
            foot: ['Total', itemsSold, ...vatPdfCells(salesTotal, vatOn), salesTotal ? '100%' : '-'],
          },
        ],
        notes: [
          'Totals use the filters currently applied on screen.',
          company.vatRegistered
            ? `Amounts are VAT inclusive at ${Math.round(VAT_RATE * 100)}%. Excl. VAT = inclusive / 1.${Math.round(VAT_RATE * 100)}.`
            : 'The company is not VAT registered.',
          'Cancelled orders are listed but excluded from gross sales.',
        ],
      })
      toast('Sales report PDF downloaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page-content sales-page">
      <div className="sales-top no-print">
        <div className="tabs">
          {([
            ['today', 'Today'],
            ['month', 'This month'],
            ['year', 'This year'],
            ['all', 'All time'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" className={preset === key ? 'active' : ''} onClick={() => applyPreset(key)}>{label}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void downloadPdf()}><Download size={16} /> {downloading ? 'Preparing…' : 'Download PDF'}</Button>
      </div>

      <div className="sales-controls no-print">
        <div className="search-box sales-search"><Search size={17} /><input placeholder="Search order, client, item…" value={query} onChange={e => { setQuery(e.target.value); ordersPaged.setPage(1); itemsPaged.setPage(1) }} /></div>
        <input type="date" value={from} onChange={e => { setPreset('custom'); setFrom(e.target.value); ordersPaged.setPage(1); itemsPaged.setPage(1) }} aria-label="From date" />
        <input type="date" value={to} onChange={e => { setPreset('custom'); setTo(e.target.value); ordersPaged.setPage(1); itemsPaged.setPage(1) }} aria-label="To date" />
        <select value={status} onChange={e => { setStatus(e.target.value as 'All' | OrderStatus); ordersPaged.setPage(1); itemsPaged.setPage(1) }} aria-label="Status">
          <option value="All">All statuses</option>
          <option value="New">New</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select value={itemFilter} onChange={e => { setItemFilter(e.target.value); ordersPaged.setPage(1); itemsPaged.setPage(1) }} aria-label="Menu item">
          <option value="All">All items</option>
          {menuOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <input type="number" min={1} placeholder="Table" value={tableFilter} onChange={e => { setTableFilter(e.target.value); ordersPaged.setPage(1); itemsPaged.setPage(1) }} aria-label="Table number" />
        <button type="button" className="text-button" onClick={clearFilters}>Reset</button>
      </div>

      <div className="sales-summary">
        <div className="sales-kpi">
          <span>Gross sales{vatOn ? ' · VAT incl.' : ''}</span>
          <strong>{money(salesTotal)}</strong>
        </div>
        {vatOn && (
          <div className="sales-kpi">
            <span>VAT on sales</span>
            <strong>{money(salesVat.vat)}</strong>
            <em>{money(salesVat.exclusive)} excl.</em>
          </div>
        )}
        <div className="sales-kpi">
          <span>Orders</span>
          <strong>{billable.length}</strong>
        </div>
        <div className="sales-kpi">
          <span>Avg ticket</span>
          <strong>{money(avgTicket)}</strong>
        </div>
        <div className="sales-kpi">
          <span>Items sold</span>
          <strong>{itemsSold}</strong>
        </div>
        <div className="sales-kpi muted-kpi">
          <span>Cancelled</span>
          <strong>{cancelled.length}</strong>
          <em>{money(cancelledTotal)}</em>
        </div>
      </div>

      <Card className="table-card sales-main">
        <div className="table-summary sales-main-head">
          <div className="tabs">
            <button type="button" className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}>Orders</button>
            <button type="button" className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>By item</button>
          </div>
          <div className="sales-main-meta">
            <span className="muted">{rangeLabel}</span>
            <span className="sales-pill">{statusCounts.New} new</span>
            <span className="sales-pill done">{statusCounts.Completed} done</span>
            <span className="sales-pill cancel">{statusCounts.Cancelled} cancelled</span>
          </div>
        </div>

        {view === 'orders' ? (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Client</th>
                  <th>Table</th>
                  <th>Items</th>
                  <th>Status</th>
                  {vatOn ? (
                    <>
                      <th className="align-right">Excl. VAT</th>
                      <th className="align-right">VAT</th>
                      <th className="align-right">Incl. VAT</th>
                    </>
                  ) : (
                    <th className="align-right">Total</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {ordersPaged.slice.map(order => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.id}</strong>
                      <div className="muted">{formatExpenseDate(order.date)} · {order.time}</div>
                    </td>
                    <td>{order.clientName || 'Walk-in guest'}</td>
                    <td>{order.tableNumber}</td>
                    <td>
                      <div className="sales-items-cell">
                        <strong>{order.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)} items</strong>
                        <span className="muted">{order.lines.map(formatOrderLine).join(', ')}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${order.status === 'Completed' ? 'badge-green' : order.status === 'Cancelled' ? 'badge-red' : 'badge-amber'}`}>
                        {order.status}
                      </span>
                    </td>
                    <VatAmountCells inclusive={order.total} vatOn={vatOn} />
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={vatOn ? 8 : 6} className="muted">No orders match these filters.</td></tr>}
              </tbody>
              {!!filtered.length && (
                <tfoot>
                  <tr>
                    <td colSpan={5}><strong>Total (excluding cancelled)</strong></td>
                    <VatAmountCells inclusive={salesTotal} vatOn={vatOn} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className="align-right">Qty sold</th>
                  {vatOn ? (
                    <>
                      <th className="align-right">Excl. VAT</th>
                      <th className="align-right">VAT</th>
                      <th className="align-right">Incl. VAT</th>
                    </>
                  ) : (
                    <th className="align-right">Revenue</th>
                  )}
                  <th className="align-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {itemsPaged.slice.map((row, index) => (
                  <tr key={row.name}>
                    <td className="muted">{(itemsPaged.page - 1) * itemsPaged.pageSize + index + 1}</td>
                    <td><strong>{row.name}</strong></td>
                    <td className="align-right">{row.qty}</td>
                    <VatAmountCells inclusive={row.revenue} vatOn={vatOn} />
                    <td className="align-right muted">{salesTotal ? `${Math.round((row.revenue / salesTotal) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                {!itemRows.length && <tr><td colSpan={vatOn ? 7 : 5} className="muted">No item sales in this filter.</td></tr>}
              </tbody>
              {!!itemRows.length && (
                <tfoot>
                  <tr>
                    <td colSpan={3}><strong>Total</strong></td>
                    <VatAmountCells inclusive={salesTotal} vatOn={vatOn} />
                    <td className="align-right muted">{salesTotal ? '100%' : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {view === 'orders'
          ? <TablePagination {...ordersPaged} noun={filtered.length === 1 ? 'order' : 'orders'} />
          : <TablePagination {...itemsPaged} noun={itemRows.length === 1 ? 'item' : 'items'} />}
      </Card>
    </div>
  )
}

function ExpenseReport({ expenses, company, toast }: { expenses: Expense[]; company: CompanySettings; toast: (x: string) => void }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const yearStart = `${year}-01-01`
  type Preset = 'today' | 'month' | 'year' | 'all' | 'custom'
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [bucketFilter, setBucketFilter] = useState<'All' | ExpenseBucket>('All')
  const [lineFilter, setLineFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'expenses' | 'categories' | 'lines'>('expenses')
  const [downloading, setDownloading] = useState(false)

  const categoryOptions = Array.from(
    new Set([
      ...expenseCategories,
      ...expenses.map(e => e.category.trim()).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b))

  const lineOptions = Array.from(
    new Set(expenses.flatMap(e => e.lines.map(l => l.description.trim()).filter(Boolean)))
  ).sort((a, b) => a.localeCompare(b))

  const filtered = expenses
    .filter(expense => {
      if (from && expense.date < from) return false
      if (to && expense.date > to) return false
      if (categoryFilter !== 'All' && expense.category !== categoryFilter) return false
      if (bucketFilter !== 'All' && expenseBucket(expense.category) !== bucketFilter) return false
      if (lineFilter !== 'All' && !expense.lines.some(l => l.description === lineFilter)) return false
      if (query) {
        const q = query.toLowerCase()
        const hit =
          expense.category.toLowerCase().includes(q)
          || expense.lines.some(l => l.description.toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    })
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))

  const spendTotal = filtered.reduce((sum, e) => sum + expenseTotal(e), 0)
  const avgExpense = filtered.length ? spendTotal / filtered.length : 0
  const lineCount = filtered.reduce((sum, e) => sum + e.lines.length, 0)
  const qtyCount = filtered.reduce((sum, e) => sum + e.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), 0)

  const bucketTotals = filtered.reduce<Record<ExpenseBucket, number>>((acc, e) => {
    const bucket = expenseBucket(e.category)
    acc[bucket] += expenseTotal(e)
    return acc
  }, { cogs: 0, distribution: 0, admin: 0, other: 0 })

  const categoryBreakdown = filtered.reduce<Record<string, { count: number; amount: number }>>((acc, expense) => {
    const name = expense.category.trim() || 'Uncategorised'
    if (!acc[name]) acc[name] = { count: 0, amount: 0 }
    acc[name].count += 1
    acc[name].amount += expenseTotal(expense)
    return acc
  }, {})
  const categoryRows = Object.entries(categoryBreakdown)
    .map(([name, stats]) => ({ name, bucket: expenseBucket(name), ...stats }))
    .sort((a, b) => b.amount - a.amount)

  const lineBreakdown = filtered.reduce<Record<string, { qty: number; amount: number }>>((acc, expense) => {
    expense.lines.forEach(line => {
      const name = line.description.trim() || 'Untitled'
      if (!acc[name]) acc[name] = { qty: 0, amount: 0 }
      acc[name].qty += Number(line.qty) || 0
      acc[name].amount += expenseLineTotal(line)
    })
    return acc
  }, {})
  const lineRows = Object.entries(lineBreakdown)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.amount - a.amount)

  const expensesPaged = usePagedRows(filtered)
  const categoriesPaged = usePagedRows(categoryRows)
  const linesPaged = usePagedRows(lineRows)

  const resetPages = () => {
    expensesPaged.setPage(1)
    categoriesPaged.setPage(1)
    linesPaged.setPage(1)
  }

  const applyPreset = (next: Exclude<Preset, 'custom'>) => {
    setPreset(next)
    if (next === 'today') {
      setFrom(today)
      setTo(today)
    } else if (next === 'month') {
      setFrom(monthStart)
      setTo(today)
    } else if (next === 'year') {
      setFrom(yearStart)
      setTo(today)
    } else {
      setFrom('')
      setTo('')
    }
    resetPages()
  }

  const clearFilters = () => {
    applyPreset('month')
    setCategoryFilter('All')
    setBucketFilter('All')
    setLineFilter('All')
    setQuery('')
    resetPages()
  }

  const rangeLabel = from || to
    ? `${from ? formatExpenseDate(from) : 'Start'} – ${to ? formatExpenseDate(to) : 'Now'}`
    : 'All time'

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await downloadReportPdf({
        company,
        title: 'Expense report',
        period: rangeLabel,
        filename: reportFileName('expense-report'),
        kpis: [
          { label: company.vatRegistered ? 'Total spend (VAT incl.)' : 'Total spend', value: money(spendTotal) },
          { label: 'Expenses', value: String(filtered.length) },
          { label: 'Avg expense', value: money(avgExpense) },
          { label: 'Line items', value: String(lineCount) },
          { label: 'Qty recorded', value: String(qtyCount) },
        ],
        tables: [
          {
            title: 'Expenses',
            head: ['Date', 'Category', 'Bucket', 'Line items', 'Total'],
            rightAlign: [4],
            body: filtered.map(expense => [
              formatExpenseDate(expense.date),
              expense.category || 'Uncategorised',
              expenseBucketLabel[expenseBucket(expense.category)],
              expense.lines.map(line => `${line.description || 'Untitled'} · ${line.qty} × ${money(line.amount)}`).join(', '),
              money(expenseTotal(expense)),
            ]),
          },
          {
            title: 'By category',
            head: ['Category', 'Bucket', 'Expenses', 'Amount', 'Share'],
            rightAlign: [2, 3, 4],
            body: categoryRows.map(row => [
              row.name,
              expenseBucketLabel[row.bucket],
              row.count,
              money(row.amount),
              spendTotal ? `${Math.round((row.amount / spendTotal) * 100)}%` : '—',
            ]),
          },
          {
            title: 'By line item',
            head: ['Line item', 'Qty', 'Amount', 'Share'],
            rightAlign: [1, 2, 3],
            body: lineRows.map(row => [
              row.name,
              row.qty,
              money(row.amount),
              spendTotal ? `${Math.round((row.amount / spendTotal) * 100)}%` : '—',
            ]),
          },
        ],
        notes: [
          'Totals use the filters currently applied on screen.',
          `Buckets: COGS ${money(bucketTotals.cogs)} · Distribution ${money(bucketTotals.distribution)} · Overhead ${money(bucketTotals.admin + bucketTotals.other)}.`,
          company.vatRegistered ? 'Amounts are VAT inclusive.' : 'The company is not VAT registered.',
        ],
      })
      toast('Expense report PDF downloaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page-content sales-page">
      <div className="sales-top no-print">
        <div className="tabs">
          {([
            ['today', 'Today'],
            ['month', 'This month'],
            ['year', 'This year'],
            ['all', 'All time'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" className={preset === key ? 'active' : ''} onClick={() => applyPreset(key)}>{label}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void downloadPdf()}><Download size={16} /> {downloading ? 'Preparing…' : 'Download PDF'}</Button>
      </div>

      <div className="sales-controls no-print">
        <div className="search-box sales-search"><Search size={17} /><input placeholder="Search category or line item…" value={query} onChange={e => { setQuery(e.target.value); resetPages() }} /></div>
        <input type="date" value={from} onChange={e => { setPreset('custom'); setFrom(e.target.value); resetPages() }} aria-label="From date" />
        <input type="date" value={to} onChange={e => { setPreset('custom'); setTo(e.target.value); resetPages() }} aria-label="To date" />
        <select value={bucketFilter} onChange={e => { setBucketFilter(e.target.value as 'All' | ExpenseBucket); resetPages() }} aria-label="Bucket">
          <option value="All">All buckets</option>
          <option value="cogs">Cost of goods</option>
          <option value="distribution">Distribution</option>
          <option value="admin">Admin</option>
          <option value="other">Other</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); resetPages() }} aria-label="Category">
          <option value="All">All categories</option>
          {categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={lineFilter} onChange={e => { setLineFilter(e.target.value); resetPages() }} aria-label="Line item">
          <option value="All">All line items</option>
          {lineOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="button" className="text-button" onClick={clearFilters}>Reset</button>
      </div>

      <div className="sales-summary">
        <div className="sales-kpi">
          <span>Total spend{company.vatRegistered ? ' · VAT incl.' : ''}</span>
          <strong>{money(spendTotal)}</strong>
        </div>
        <div className="sales-kpi">
          <span>Expenses</span>
          <strong>{filtered.length}</strong>
        </div>
        <div className="sales-kpi">
          <span>Avg expense</span>
          <strong>{money(avgExpense)}</strong>
        </div>
        <div className="sales-kpi">
          <span>Line items</span>
          <strong>{lineCount}</strong>
        </div>
        <div className="sales-kpi muted-kpi">
          <span>Qty recorded</span>
          <strong>{qtyCount}</strong>
          <em>{categoryRows.length} categories</em>
        </div>
      </div>

      <Card className="table-card sales-main">
        <div className="table-summary sales-main-head">
          <div className="tabs">
            <button type="button" className={view === 'expenses' ? 'active' : ''} onClick={() => setView('expenses')}>Expenses</button>
            <button type="button" className={view === 'categories' ? 'active' : ''} onClick={() => setView('categories')}>By category</button>
            <button type="button" className={view === 'lines' ? 'active' : ''} onClick={() => setView('lines')}>By line item</button>
          </div>
          <div className="sales-main-meta">
            <span className="muted">{rangeLabel}</span>
            <span className="sales-pill">{money(bucketTotals.cogs)} COGS</span>
            <span className="sales-pill done">{money(bucketTotals.distribution)} dist.</span>
            <span className="sales-pill cancel">{money(bucketTotals.admin + bucketTotals.other)} overhead</span>
          </div>
        </div>

        {view === 'expenses' ? (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Bucket</th>
                  <th>Line items</th>
                  <th className="align-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {expensesPaged.slice.map(expense => (
                  <tr key={expense.id}>
                    <td>
                      <strong>{formatExpenseDate(expense.date)}</strong>
                    </td>
                    <td><Badge>{expense.category || 'Uncategorised'}</Badge></td>
                    <td className="muted">{expenseBucketLabel[expenseBucket(expense.category)]}</td>
                    <td>
                      <div className="sales-items-cell">
                        <strong>{expense.lines.length} {expense.lines.length === 1 ? 'line' : 'lines'}</strong>
                        <span className="muted">
                          {expense.lines.map(line => `${line.description || 'Untitled'} · ${line.qty} × ${money(line.amount)}`).join(', ')}
                        </span>
                      </div>
                    </td>
                    <td className="align-right"><strong>{money(expenseTotal(expense))}</strong></td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={5} className="muted">No expenses match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : view === 'categories' ? (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category</th>
                  <th>Bucket</th>
                  <th className="align-right">Expenses</th>
                  <th className="align-right">Amount</th>
                  <th className="align-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {categoriesPaged.slice.map((row, index) => (
                  <tr key={row.name}>
                    <td className="muted">{(categoriesPaged.page - 1) * categoriesPaged.pageSize + index + 1}</td>
                    <td><strong>{row.name}</strong></td>
                    <td className="muted">{expenseBucketLabel[row.bucket]}</td>
                    <td className="align-right">{row.count}</td>
                    <td className="align-right"><strong>{money(row.amount)}</strong></td>
                    <td className="align-right muted">{spendTotal ? `${Math.round((row.amount / spendTotal) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                {!categoryRows.length && <tr><td colSpan={6} className="muted">No category spend in this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Line item</th>
                  <th className="align-right">Qty</th>
                  <th className="align-right">Amount</th>
                  <th className="align-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {linesPaged.slice.map((row, index) => (
                  <tr key={row.name}>
                    <td className="muted">{(linesPaged.page - 1) * linesPaged.pageSize + index + 1}</td>
                    <td><strong>{row.name}</strong></td>
                    <td className="align-right">{row.qty}</td>
                    <td className="align-right"><strong>{money(row.amount)}</strong></td>
                    <td className="align-right muted">{spendTotal ? `${Math.round((row.amount / spendTotal) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                {!lineRows.length && <tr><td colSpan={5} className="muted">No line items in this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {view === 'expenses'
          ? <TablePagination {...expensesPaged} noun={filtered.length === 1 ? 'expense' : 'expenses'} />
          : view === 'categories'
            ? <TablePagination {...categoriesPaged} noun={categoryRows.length === 1 ? 'category' : 'categories'} />
            : <TablePagination {...linesPaged} noun={lineRows.length === 1 ? 'line item' : 'line items'} />}
      </Card>
    </div>
  )
}

function InventoryReport({ orders, menu, company, toast }: { orders: Order[]; menu: MenuItem[]; company: CompanySettings; toast: (x: string) => void }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const yearStart = `${year}-01-01`
  type Preset = 'today' | 'month' | 'year' | 'all' | 'custom'
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [itemFilter, setItemFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'items' | 'categories'>('items')
  const [downloading, setDownloading] = useState(false)

  const menuById = new Map(menu.map(item => [item.id, item]))
  const menuByName = new Map(menu.map(item => [item.name.trim().toLowerCase(), item]))
  const resolveCategory = (name: string, menuItemId?: string | null) => {
    const byId = menuItemId ? menuById.get(menuItemId) : undefined
    if (byId?.category) return byId.category
    return menuByName.get(name.trim().toLowerCase())?.category || 'Uncategorised'
  }

  const completedInRange = orders.filter(order => {
    if (order.status !== 'Completed') return false
    if (from && order.date < from) return false
    if (to && order.date > to) return false
    return true
  })

  type SoldRow = { name: string; category: string; qty: number; revenue: number; orders: number; addOn: boolean }
  const soldMap = completedInRange.reduce<Record<string, SoldRow & { orderIds: Set<string> }>>((acc, order) => {
    order.lines.forEach(line => {
      const name = line.name.trim() || 'Untitled'
      const category = resolveCategory(name, line.menuItemId)
      const qty = Number(line.qty) || 0
      const lineRevenue = qty * (Number(line.unitPrice) || 0)
      const key = `item::${name}`
      if (!acc[key]) acc[key] = { name, category, qty: 0, revenue: 0, orders: 0, addOn: false, orderIds: new Set() }
      acc[key].qty += qty
      acc[key].revenue += lineRevenue
      acc[key].orderIds.add(order.id)
      line.addOns.forEach(addOn => {
        const addOnName = addOn.name.trim() || 'Add-on'
        const addOnCategory = resolveCategory(addOnName, addOn.menuItemId)
        const addOnKey = `addon::${addOnName}`
        if (!acc[addOnKey]) acc[addOnKey] = { name: addOnName, category: addOnCategory, qty: 0, revenue: 0, orders: 0, addOn: true, orderIds: new Set() }
        acc[addOnKey].qty += qty
        acc[addOnKey].revenue += qty * (Number(addOn.price) || 0)
        acc[addOnKey].orderIds.add(order.id)
      })
    })
    return acc
  }, {})

  const soldRows = Object.values(soldMap)
    .map(row => ({ ...row, orders: row.orderIds.size }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name))

  const categoryOptions = Array.from(new Set([
    ...menu.map(m => m.category.trim()).filter(Boolean),
    ...soldRows.map(r => r.category).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b))

  const itemOptions = Array.from(new Set(soldRows.map(r => r.name))).sort((a, b) => a.localeCompare(b))

  const filtered = soldRows.filter(row => {
    if (categoryFilter !== 'All' && row.category !== categoryFilter) return false
    if (itemFilter !== 'All' && row.name !== itemFilter) return false
    if (query && !row.name.toLowerCase().includes(query.toLowerCase()) && !row.category.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  const vatOn = Boolean(company.vatRegistered)
  const qtySold = filtered.reduce((sum, row) => sum + row.qty, 0)
  const revenue = filtered.reduce((sum, row) => sum + row.revenue, 0)
  const revenueVat = vatSplit(revenue, vatOn)
  const uniqueItems = filtered.length
  const ordersWithFilteredItems = new Set(
    Object.values(soldMap)
      .filter(row => filtered.some(f => f.name === row.name && f.addOn === row.addOn && f.category === row.category))
      .flatMap(row => Array.from(row.orderIds))
  ).size

  const categoryBreakdown = filtered.reduce<Record<string, { qty: number; revenue: number; items: number }>>((acc, row) => {
    const name = row.category || 'Uncategorised'
    if (!acc[name]) acc[name] = { qty: 0, revenue: 0, items: 0 }
    acc[name].qty += row.qty
    acc[name].revenue += row.revenue
    acc[name].items += 1
    return acc
  }, {})
  const categoryRows = Object.entries(categoryBreakdown)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.qty - a.qty)

  const itemsPaged = usePagedRows(filtered)
  const categoriesPaged = usePagedRows(categoryRows)

  const resetPages = () => {
    itemsPaged.setPage(1)
    categoriesPaged.setPage(1)
  }

  const applyPreset = (next: Exclude<Preset, 'custom'>) => {
    setPreset(next)
    if (next === 'today') {
      setFrom(today)
      setTo(today)
    } else if (next === 'month') {
      setFrom(monthStart)
      setTo(today)
    } else if (next === 'year') {
      setFrom(yearStart)
      setTo(today)
    } else {
      setFrom('')
      setTo('')
    }
    resetPages()
  }

  const clearFilters = () => {
    applyPreset('month')
    setCategoryFilter('All')
    setItemFilter('All')
    setQuery('')
    resetPages()
  }

  const rangeLabel = from || to
    ? `${from ? formatExpenseDate(from) : 'Start'} – ${to ? formatExpenseDate(to) : 'Now'}`
    : 'All time'

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await downloadReportPdf({
        company,
        title: 'Inventory report',
        period: rangeLabel,
        filename: reportFileName('inventory-report'),
        orientation: 'landscape',
        kpis: [
          { label: 'Qty sold', value: String(qtySold) },
          { label: 'Unique items', value: String(uniqueItems) },
          { label: 'Completed orders', value: String(completedInRange.length) },
          { label: vatOn ? 'Revenue (VAT incl.)' : 'Revenue', value: money(revenue) },
          ...(vatOn ? [{ label: 'VAT on sales', value: money(revenueVat.vat) }, { label: 'Excl. VAT', value: money(revenueVat.exclusive) }] : []),
        ],
        tables: [
          {
            title: 'Items sold (completed orders only)',
            head: vatOn
              ? ['Item', 'Type', 'Category', 'Qty sold', 'Orders', 'Excl. VAT', 'VAT', 'Incl. VAT', 'Share']
              : ['Item', 'Type', 'Category', 'Qty sold', 'Orders', 'Revenue', 'Share'],
            rightAlign: vatOn ? [3, 4, 5, 6, 7, 8] : [3, 4, 5, 6],
            body: filtered.map(row => [
              row.name,
              row.addOn ? 'Add-on' : 'Item',
              row.category,
              row.qty,
              row.orders,
              ...vatPdfCells(row.revenue, vatOn),
              revenue ? `${Math.round((row.revenue / revenue) * 100)}%` : '-',
            ]),
            foot: ['Total', '', '', qtySold, '', ...vatPdfCells(revenue, vatOn), revenue ? '100%' : '-'],
          },
          {
            title: 'By category',
            head: vatOn
              ? ['Category', 'Items', 'Qty sold', 'Excl. VAT', 'VAT', 'Incl. VAT', 'Share']
              : ['Category', 'Items', 'Qty sold', 'Revenue', 'Share'],
            rightAlign: vatOn ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4],
            body: categoryRows.map(row => [
              row.name,
              row.items,
              row.qty,
              ...vatPdfCells(row.revenue, vatOn),
              revenue ? `${Math.round((row.revenue / revenue) * 100)}%` : '-',
            ]),
            foot: ['Total', uniqueItems, qtySold, ...vatPdfCells(revenue, vatOn), revenue ? '100%' : '-'],
          },
        ],
        notes: [
          'Only completed orders are included.',
          'Totals use the filters currently applied on screen.',
          company.vatRegistered
            ? `Amounts are VAT inclusive at ${Math.round(VAT_RATE * 100)}%. Excl. VAT = inclusive / 1.${Math.round(VAT_RATE * 100)}.`
            : 'The company is not VAT registered.',
        ],
      })
      toast('Inventory report PDF downloaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page-content sales-page">
      <div className="sales-top no-print">
        <div className="tabs">
          {([
            ['today', 'Today'],
            ['month', 'This month'],
            ['year', 'This year'],
            ['all', 'All time'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" className={preset === key ? 'active' : ''} onClick={() => applyPreset(key)}>{label}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void downloadPdf()}><Download size={16} /> {downloading ? 'Preparing…' : 'Download PDF'}</Button>
      </div>

      <div className="sales-controls no-print">
        <div className="search-box sales-search"><Search size={17} /><input placeholder="Search sold item or category…" value={query} onChange={e => { setQuery(e.target.value); resetPages() }} /></div>
        <input type="date" value={from} onChange={e => { setPreset('custom'); setFrom(e.target.value); resetPages() }} aria-label="From date" />
        <input type="date" value={to} onChange={e => { setPreset('custom'); setTo(e.target.value); resetPages() }} aria-label="To date" />
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); resetPages() }} aria-label="Category">
          <option value="All">All categories</option>
          {categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={itemFilter} onChange={e => { setItemFilter(e.target.value); resetPages() }} aria-label="Item">
          <option value="All">All items</option>
          {itemOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="button" className="text-button" onClick={clearFilters}>Reset</button>
      </div>

      <div className="sales-summary">
        <div className="sales-kpi">
          <span>Qty sold</span>
          <strong>{qtySold}</strong>
        </div>
        <div className="sales-kpi">
          <span>Unique items</span>
          <strong>{uniqueItems}</strong>
        </div>
        <div className="sales-kpi">
          <span>Completed orders</span>
          <strong>{completedInRange.length}</strong>
        </div>
        <div className="sales-kpi">
          <span>Revenue{vatOn ? ' · VAT incl.' : ''}</span>
          <strong>{money(revenue)}</strong>
        </div>
        {vatOn && (
          <div className="sales-kpi">
            <span>VAT on sales</span>
            <strong>{money(revenueVat.vat)}</strong>
            <em>{money(revenueVat.exclusive)} excl.</em>
          </div>
        )}
        <div className="sales-kpi muted-kpi">
          <span>Orders with matches</span>
          <strong>{ordersWithFilteredItems}</strong>
          <em>Completed only</em>
        </div>
      </div>

      <Card className="table-card sales-main">
        <div className="table-summary sales-main-head">
          <div className="tabs">
            <button type="button" className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>Items sold</button>
            <button type="button" className={view === 'categories' ? 'active' : ''} onClick={() => setView('categories')}>By category</button>
          </div>
          <div className="sales-main-meta">
            <span className="muted">{rangeLabel}</span>
            <span className="sales-pill done">{completedInRange.length} completed</span>
          </div>
        </div>

        {view === 'items' ? (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th className="align-right">Qty sold</th>
                  <th className="align-right">Orders</th>
                  {vatOn ? (
                    <>
                      <th className="align-right">Excl. VAT</th>
                      <th className="align-right">VAT</th>
                      <th className="align-right">Incl. VAT</th>
                    </>
                  ) : (
                    <th className="align-right">Revenue</th>
                  )}
                  <th className="align-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {itemsPaged.slice.map((row, index) => (
                  <tr key={`${row.addOn ? 'addon' : 'item'}-${row.name}`}>
                    <td className="muted">{(itemsPaged.page - 1) * itemsPaged.pageSize + index + 1}</td>
                    <td>
                      <strong>{row.name}</strong>
                      {row.addOn ? <div className="muted">Add-on</div> : null}
                    </td>
                    <td><Badge>{row.category}</Badge></td>
                    <td className="align-right"><strong>{row.qty}</strong></td>
                    <td className="align-right muted">{row.orders}</td>
                    <VatAmountCells inclusive={row.revenue} vatOn={vatOn} />
                    <td className="align-right muted">{revenue ? `${Math.round((row.revenue / revenue) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={vatOn ? 9 : 7} className="muted">No completed order items match these filters.</td></tr>}
              </tbody>
              {!!filtered.length && (
                <tfoot>
                  <tr>
                    <td colSpan={5}><strong>Total</strong></td>
                    <VatAmountCells inclusive={revenue} vatOn={vatOn} />
                    <td className="align-right muted">{revenue ? '100%' : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category</th>
                  <th className="align-right">Items</th>
                  <th className="align-right">Qty sold</th>
                  {vatOn ? (
                    <>
                      <th className="align-right">Excl. VAT</th>
                      <th className="align-right">VAT</th>
                      <th className="align-right">Incl. VAT</th>
                    </>
                  ) : (
                    <th className="align-right">Revenue</th>
                  )}
                  <th className="align-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {categoriesPaged.slice.map((row, index) => (
                  <tr key={row.name}>
                    <td className="muted">{(categoriesPaged.page - 1) * categoriesPaged.pageSize + index + 1}</td>
                    <td><strong>{row.name}</strong></td>
                    <td className="align-right">{row.items}</td>
                    <td className="align-right"><strong>{row.qty}</strong></td>
                    <VatAmountCells inclusive={row.revenue} vatOn={vatOn} />
                    <td className="align-right muted">{revenue ? `${Math.round((row.revenue / revenue) * 100)}%` : '—'}</td>
                  </tr>
                ))}
                {!categoryRows.length && <tr><td colSpan={vatOn ? 8 : 6} className="muted">No category inventory in this filter.</td></tr>}
              </tbody>
              {!!categoryRows.length && (
                <tfoot>
                  <tr>
                    <td colSpan={4}><strong>Total</strong></td>
                    <VatAmountCells inclusive={revenue} vatOn={vatOn} />
                    <td className="align-right muted">{revenue ? '100%' : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {view === 'items'
          ? <TablePagination {...itemsPaged} noun={filtered.length === 1 ? 'item' : 'items'} />
          : <TablePagination {...categoriesPaged} noun={categoryRows.length === 1 ? 'category' : 'categories'} />}
      </Card>
    </div>
  )
}

function Reports({ orders, expenses, company, toast }: { orders: Order[]; expenses: Expense[]; company: CompanySettings; toast: (x: string) => void }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  type PeriodKey = 'month' | 'year' | 'overall'
  const [period, setPeriod] = useState<PeriodKey>('year')
  const [downloading, setDownloading] = useState(false)
  const vatOn = company.vatRegistered

  const inPeriod = (iso: string) => {
    if (period === 'overall') return true
    if (period === 'year') return inYearMonth(iso, year)
    return inYearMonth(iso, year, month)
  }

  const periodOrders = orders.filter(o => inPeriod(o.date) && o.status !== 'Cancelled')
  const periodExpenses = expenses.filter(e => inPeriod(e.date))

  const revenueIncl = sumOrders(periodOrders)
  const expensesByCategory = periodExpenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + expenseTotal(e)
    return acc
  }, {})

  const costOfSalesIncl = Object.entries(expensesByCategory)
    .filter(([cat]) => cogsExpenseCategories.has(cat))
    .reduce((sum, [, amount]) => sum + amount, 0)

  const distributionCostsIncl = Object.entries(expensesByCategory)
    .filter(([cat]) => distributionExpenseCategories.has(cat))
    .reduce((sum, [, amount]) => sum + amount, 0)

  const administrativeExpensesIncl = Object.entries(expensesByCategory)
    .filter(([cat]) => adminExpenseCategories.has(cat))
    .reduce((sum, [, amount]) => sum + amount, 0)

  const otherExpensesIncl = Object.entries(expensesByCategory)
    .filter(([cat]) => !cogsExpenseCategories.has(cat) && !distributionExpenseCategories.has(cat) && !adminExpenseCategories.has(cat))
    .reduce((sum, [, amount]) => sum + amount, 0)

  const revenueExcl = excl(revenueIncl, vatOn)
  const costOfSalesExcl = excl(costOfSalesIncl, vatOn)
  const distributionExcl = excl(distributionCostsIncl, vatOn)
  const adminExcl = excl(administrativeExpensesIncl, vatOn)
  const otherExcl = excl(otherExpensesIncl, vatOn)

  const grossProfitIncl = revenueIncl - costOfSalesIncl
  const grossProfitExcl = revenueExcl - costOfSalesExcl
  const operatingProfitIncl = grossProfitIncl - distributionCostsIncl - administrativeExpensesIncl - otherExpensesIncl
  const operatingProfitExcl = grossProfitExcl - distributionExcl - adminExcl - otherExcl
  const financeCosts = 0
  const profitBeforeTaxIncl = operatingProfitIncl - financeCosts
  const profitBeforeTaxExcl = operatingProfitExcl - financeCosts
  // Corporate tax is charged on accounting profit exclusive of VAT
  const incomeTaxExpense = profitBeforeTaxExcl > 0 ? profitBeforeTaxExcl * CORPORATE_TAX_RATE : 0
  const profitForPeriodExcl = profitBeforeTaxExcl - incomeTaxExpense
  const profitForPeriodIncl = profitBeforeTaxIncl - incomeTaxExpense

  const outputVat = vatSplit(revenueIncl, vatOn).vat
  const inputVat = vatSplit(costOfSalesIncl + distributionCostsIncl + administrativeExpensesIncl + otherExpensesIncl, vatOn).vat
  const netVat = outputVat - inputVat

  const periodLabel =
    period === 'month'
      ? `${now.toLocaleString('en-GB', { month: 'long' })} ${year}`
      : period === 'year'
        ? `Year ended 31 December ${year}`
        : 'All periods'

  const cogsLines = Object.entries(expensesByCategory)
    .filter(([cat]) => cogsExpenseCategories.has(cat))
    .sort((a, b) => b[1] - a[1])
  const adminLines = Object.entries(expensesByCategory)
    .filter(([cat]) => adminExpenseCategories.has(cat))
    .sort((a, b) => b[1] - a[1])
  const distributionLines = Object.entries(expensesByCategory)
    .filter(([cat]) => distributionExpenseCategories.has(cat))
    .sort((a, b) => b[1] - a[1])
  const otherLines = Object.entries(expensesByCategory)
    .filter(([cat]) => !cogsExpenseCategories.has(cat) && !distributionExpenseCategories.has(cat) && !adminExpenseCategories.has(cat))
    .sort((a, b) => b[1] - a[1])

  const row = (
    label: string,
    inclusiveAmount: number,
    opts?: { bold?: boolean; total?: boolean; muted?: boolean; indent?: boolean; noVat?: boolean }
  ) => {
    const parts = opts?.noVat
      ? { exclusive: inclusiveAmount, vat: 0, inclusive: inclusiveAmount }
      : vatSplit(inclusiveAmount, vatOn)
    return (
      <tr className={`${opts?.total ? 'pnl-total' : ''} ${opts?.bold ? 'pnl-bold' : ''}`}>
        <td className={opts?.indent ? 'pnl-indent' : ''}>{label}</td>
        {vatOn && (
          <>
            <td className={`align-right ${opts?.muted ? 'muted' : ''} ${parts.exclusive < 0 ? 'negative' : ''}`}>{money(parts.exclusive)}</td>
            <td className={`align-right ${opts?.muted ? 'muted' : ''} ${parts.vat < 0 ? 'negative' : ''}`}>{opts?.noVat ? '—' : money(parts.vat)}</td>
          </>
        )}
        <td className={`align-right ${opts?.muted ? 'muted' : ''} ${parts.inclusive < 0 ? 'negative' : ''}`}>{money(parts.inclusive)}</td>
      </tr>
    )
  }

  const pnlHead = vatOn ? ['Description', 'Excl. VAT', 'VAT', 'Incl. VAT'] : ['Description', 'MUR']
  const pnlCells = (inclusiveAmount: number, opts?: { noVat?: boolean }) => {
    const parts = opts?.noVat
      ? { exclusive: inclusiveAmount, vat: 0, inclusive: inclusiveAmount }
      : vatSplit(inclusiveAmount, vatOn)
    return vatOn
      ? [money(parts.exclusive), opts?.noVat ? '-' : money(parts.vat), money(parts.inclusive)]
      : [money(parts.inclusive)]
  }
  const pnlRow = (label: string, inclusiveAmount: number, opts?: { indent?: boolean; noVat?: boolean }) => [
    opts?.indent ? `    ${label}` : label,
    ...pnlCells(inclusiveAmount, opts),
  ]

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const pnlBody = [
        pnlRow('Revenue (from restaurant orders)', revenueIncl),
        pnlRow('Cost of sales', -costOfSalesIncl),
        ...(cogsLines.length ? cogsLines.map(([cat, amount]) => pnlRow(cat, -amount, { indent: true })) : [pnlRow('No cost-of-sales purchases recorded in period', 0, { indent: true })]),
        pnlRow('Gross profit', grossProfitIncl),
        pnlRow('Distribution costs', -distributionCostsIncl),
        ...(distributionLines.length ? distributionLines.map(([cat, amount]) => pnlRow(cat, -amount, { indent: true })) : [pnlRow('Nil', 0, { indent: true })]),
        pnlRow('Administrative expenses', -administrativeExpensesIncl),
        ...(adminLines.length ? adminLines.map(([cat, amount]) => pnlRow(cat, -amount, { indent: true })) : [pnlRow('Nil', 0, { indent: true })]),
        pnlRow('Other expenses', -otherExpensesIncl),
        ...(otherLines.length ? otherLines.map(([cat, amount]) => pnlRow(cat, -amount, { indent: true })) : [pnlRow('Nil', 0, { indent: true })]),
        pnlRow('Finance costs', -financeCosts),
        pnlRow('Profit / (loss) before tax', profitBeforeTaxIncl),
        pnlRow('Income tax expense (estimated at 15%)', -incomeTaxExpense, { noVat: true }),
        vatOn
          ? ['Profit / (loss) for the period', money(profitForPeriodExcl), '-', money(profitForPeriodIncl)]
          : pnlRow('Profit / (loss) for the period', profitForPeriodIncl),
        ...(vatOn ? [['Net VAT position (output minus input)', '-', money(netVat), '-']] : []),
      ]
      const denom = vatOn ? revenueExcl : revenueIncl
      await downloadReportPdf({
        company,
        title: 'Statement of profit or loss',
        period: periodLabel,
        filename: reportFileName('pnl-report'),
        kpis: [
          { label: 'Gross margin', value: denom ? `${Math.round((grossProfitExcl / denom) * 100)}%` : '-' },
          { label: 'Net margin', value: denom ? `${Math.round((profitForPeriodExcl / denom) * 100)}%` : '-' },
          { label: vatOn ? 'Net VAT' : 'Orders in period', value: vatOn ? money(netVat) : String(periodOrders.length) },
          { label: vatOn ? 'VAT incl. profit' : 'Profit for period', value: money(profitForPeriodIncl) },
        ],
        tables: [
          {
            title: 'Profit or loss',
            head: pnlHead,
            rightAlign: vatOn ? [1, 2, 3] : [1],
            body: pnlBody,
          },
        ],
        notes: [
          `Revenue and expense totals are taken from recorded orders and expenses${vatOn ? ' on a VAT-inclusive basis' : ''} and presented in MUR.`,
          ...(vatOn ? [`VAT is extracted at the standard Mauritius rate of ${Math.round(VAT_RATE * 100)}%. Exclusive amounts drive the trading result.`] : []),
          'Cost of sales aggregates Produce, Meat & seafood, Dairy, Dry goods, Beverages, Alcohol, and Packaging.',
          'Operating expenses are classified by function (distribution, administrative, and other).',
          `Income tax is an illustrative charge at 15% on profit before tax${vatOn ? ' exclusive of VAT' : ''}. This is not an MRA return.`,
          `This statement is a management report for ${company.name || 'Pyramid Snack'} and should be reviewed before statutory filing.`,
        ],
      })
      toast('P&L PDF downloaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="page-toolbar">
        <div className="tabs">
          {([
            ['month', 'This month'],
            ['year', 'This year'],
            ['overall', 'Overall'],
          ] as const).map(([key, label]) => (
            <button key={key} className={period === key ? 'active' : ''} onClick={() => setPeriod(key)}>{label}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void downloadPdf()}><Download size={16} /> {downloading ? 'Preparing…' : 'Download PDF'}</Button>
      </div>

      <Card className="table-card pnl-card">
        <div className="pnl-letterhead">
          <div className="pnl-brand">
            <div className="pnl-logo">{company.logo ? <img src={company.logo} alt="" /> : <Store size={22} />}</div>
            <div>
              <p className="eyebrow">{(company.name || 'Pyramid Snack').toUpperCase()}</p>
              <h2>Statement of profit or loss</h2>
              <p className="muted">Prepared in accordance with the IFRS for SMEs Accounting Standard as permitted for non-PIE entities in Mauritius · Presented in Mauritian Rupees (MUR)</p>
              <p className="muted pnl-reg">
                {company.brn && <>BRN {company.brn}</>}
                {company.brn && company.vatRegistered && company.vatNumber ? ' · ' : ''}
                {company.vatRegistered && company.vatNumber && <>VAT {company.vatNumber}</>}
                {company.vatRegistered ? <> · Prices are VAT inclusive at {Math.round(VAT_RATE * 100)}%</> : <> · Not VAT registered</>}
              </p>
            </div>
          </div>
          <div className="pnl-meta">
            <strong>{periodLabel}</strong>
            <span className="muted">Income Tax Act company tax rate applied: 15%</span>
            {company.address && <span className="muted">{company.address}</span>}
          </div>
        </div>

        <div className="data-table-wrap">
          <table className="pnl-table">
            <thead>
              <tr>
                <th>Description</th>
                {vatOn && <th className="align-right">Excl. VAT</th>}
                {vatOn && <th className="align-right">VAT</th>}
                <th className="align-right">{vatOn ? 'Incl. VAT' : 'MUR'}</th>
              </tr>
            </thead>
            <tbody>
              {row('Revenue (from restaurant orders)', revenueIncl, { bold: true })}
              {row('Cost of sales', -costOfSalesIncl, { bold: true })}
              {cogsLines.map(([cat, amount]) => row(cat, -amount, { indent: true, muted: true }))}
              {!cogsLines.length && row('No cost-of-sales purchases recorded in period', 0, { indent: true, muted: true })}
              {row('Gross profit', grossProfitIncl, { total: true, bold: true })}

              {row('Distribution costs', -distributionCostsIncl, { bold: true })}
              {distributionLines.map(([cat, amount]) => row(cat, -amount, { indent: true, muted: true }))}
              {!distributionLines.length && row('Nil', 0, { indent: true, muted: true })}

              {row('Administrative expenses', -administrativeExpensesIncl, { bold: true })}
              {adminLines.map(([cat, amount]) => row(cat, -amount, { indent: true, muted: true }))}
              {!adminLines.length && row('Nil', 0, { indent: true, muted: true })}

              {row('Other expenses', -otherExpensesIncl, { bold: true })}
              {otherLines.map(([cat, amount]) => row(cat, -amount, { indent: true, muted: true }))}
              {!otherLines.length && row('Nil', 0, { indent: true, muted: true })}

              {row('Finance costs', -financeCosts, { bold: true })}
              {row('Profit / (loss) before tax', profitBeforeTaxIncl, { total: true, bold: true })}
              {row('Income tax expense (estimated at 15%)', -incomeTaxExpense, { bold: true, noVat: true })}
              {vatOn ? (
                <tr className="pnl-total pnl-bold">
                  <td>Profit / (loss) for the period</td>
                  <td className={`align-right ${profitForPeriodExcl < 0 ? 'negative' : ''}`}>{money(profitForPeriodExcl)}</td>
                  <td className="align-right muted">—</td>
                  <td className={`align-right ${profitForPeriodIncl < 0 ? 'negative' : ''}`}>{money(profitForPeriodIncl)}</td>
                </tr>
              ) : row('Profit / (loss) for the period', profitForPeriodIncl, { total: true, bold: true })}
              {vatOn && (
                <tr className="pnl-bold">
                  <td>Net VAT position (output minus input)</td>
                  <td className="align-right muted">—</td>
                  <td className={`align-right ${netVat < 0 ? 'negative' : ''}`}>{money(netVat)}</td>
                  <td className="align-right muted">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pnl-notes">
          <h3>Notes</h3>
          <ol>
            <li>Revenue and expense totals are taken from recorded orders and expenses{vatOn ? ' on a VAT-inclusive basis' : ''} and presented in MUR.</li>
            {vatOn && <li>Because the company is VAT registered, VAT is extracted at the standard Mauritius rate of {Math.round(VAT_RATE * 100)}%. Exclusive amounts drive the trading result; the VAT column shows output/input VAT embedded in inclusive prices.</li>}
            <li>Cost of sales aggregates purchases classified as Produce, Meat &amp; seafood, Dairy, Dry goods, Beverages, Alcohol, and Packaging.</li>
            <li>Operating expenses are classified by function under IFRS for SMEs (distribution, administrative, and other).</li>
            <li>Income tax is an illustrative charge at the Mauritius headline company rate of 15% on profit before tax{vatOn ? ' exclusive of VAT' : ''}. This is not an MRA return.</li>
            {vatOn && <li>Net VAT position is output VAT on sales less input VAT on recorded expenses for the period. Actual VAT return figures may differ after adjustments.</li>}
            <li>This statement is a management report for {company.name || 'Pyramid Snack'} and should be reviewed by a licensed auditor/accountant before statutory filing.</li>
          </ol>
        </div>
      </Card>

      <div className="metric-grid expense-metrics" style={{ marginTop: 18 }}>
        <Card className="metric-card"><p>Gross margin</p><strong>{(vatOn ? revenueExcl : revenueIncl) ? `${Math.round((grossProfitExcl / (vatOn ? revenueExcl : revenueIncl)) * 100)}%` : '—'}</strong><span className="muted">{vatOn ? 'On excl. VAT revenue' : 'Gross profit ÷ revenue'}</span></Card>
        <Card className="metric-card"><p>Net margin</p><strong className={profitForPeriodExcl >= 0 ? 'positive' : 'negative'}>{(vatOn ? revenueExcl : revenueIncl) ? `${Math.round((profitForPeriodExcl / (vatOn ? revenueExcl : revenueIncl)) * 100)}%` : '—'}</strong><span className="muted">Profit after tax ÷ revenue</span></Card>
        <Card className="metric-card"><p>{vatOn ? 'Net VAT' : 'Orders in period'}</p><strong>{vatOn ? money(netVat) : periodOrders.length}</strong><span className="muted">{vatOn ? 'Output minus input VAT' : `${periodExpenses.length} expense entries`}</span></Card>
      </div>
    </div>
  )
}

function SettingsPage({ company, setCompany, toast, tenantId }: { company: CompanySettings; setCompany: React.Dispatch<React.SetStateAction<CompanySettings>>; toast: (x: string) => void; tenantId: string | null }) {
  const [draft, setDraft] = useState(company)
  useEffect(() => { setDraft(company) }, [company])

  const update = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const onLogo = (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Please choose an image file')
    if (file.size > 2 * 1024 * 1024) return toast('Logo must be under 2MB')
    const reader = new FileReader()
    reader.onload = () => update('logo', String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = {
      ...draft,
      name: draft.name.trim() || 'Pyramid Snack',
      address: draft.address.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      brn: draft.brn.trim(),
      vatNumber: draft.vatRegistered ? draft.vatNumber.trim() : '',
    }
    try {
      const saved = tenantId ? await api.updateCompany(tenantId, next) : next
      setCompany(saved)
      toast('Company settings saved')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save settings')
    }
  }

  return (
    <div className="page-content settings-page">
      <form onSubmit={save}>
        <Card className="settings-card">
          <div className="settings-heading">
            <div>
              <h2>Company information</h2>
              <p>Logo, registration details, and VAT profile for Pyramid Snack.</p>
            </div>
            <Button type="submit"><Check size={16} /> Save changes</Button>
          </div>

          <div className="settings-logo-row">
            <div className="settings-logo-preview">
              {draft.logo ? <img src={draft.logo} alt="Company logo" /> : <Store size={28} />}
            </div>
            <div className="settings-logo-copy">
              <strong>Company logo</strong>
              <p className="muted">PNG or JPG, up to 2MB. Shown in the sidebar and on reports.</p>
              <div className="settings-logo-actions">
                <label className="button button-secondary settings-upload">
                  Upload logo
                  <input type="file" accept="image/*" hidden onChange={e => { onLogo(e.target.files?.[0]); e.currentTarget.value = '' }} />
                </label>
                {draft.logo && <Button variant="secondary" type="button" onClick={() => update('logo', '')}>Remove</Button>}
              </div>
            </div>
          </div>

          <div className="settings-form-grid">
            <label>Company name<input value={draft.name} onChange={e => update('name', e.target.value)} required /></label>
            <label>Email<input type="email" value={draft.email} onChange={e => update('email', e.target.value)} placeholder="hello@pyramidsnack.com" /></label>
            <label className="full-span">Address<textarea value={draft.address} onChange={e => update('address', e.target.value)} rows={2} placeholder="Street, city, Mauritius" /></label>
            <label>Phone number<input value={draft.phone} onChange={e => update('phone', e.target.value)} placeholder="+230 ..." /></label>
            <label>BRN<input value={draft.brn} onChange={e => update('brn', e.target.value)} placeholder="Business Registration Number" /></label>
            <label className="settings-toggle full-span">
              <span>
                <strong>VAT registered</strong>
                <small className="muted">Enable if the company is registered for VAT with the MRA</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draft.vatRegistered}
                className={`toggle-switch ${draft.vatRegistered ? 'on' : ''}`}
                onClick={() => update('vatRegistered', !draft.vatRegistered)}
              >
                <span />
              </button>
            </label>
            {draft.vatRegistered && (
              <label className="full-span">VAT number<input value={draft.vatNumber} onChange={e => update('vatNumber', e.target.value)} placeholder="VAT registration number" required /></label>
            )}
          </div>
        </Card>
      </form>
    </div>
  )
}


export default function Page() {
  const [auth, setAuth] = useState(false)
  const [booting, setBooting] = useState(true)
  const [active, setActive] = useState<PageKey>('dashboard')
  const [drawer, setDrawer] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [expenseCategoryMap, setExpenseCategoryMap] = useState<Map<string, string>>(new Map())
  const [menu, setMenu] = useState(seedMenu)
  const [tables, setTables] = useState(seedTables)
  const [orders, setOrders] = useState(seedOrders)
  const [expenses, setExpenses] = useState(seedExpenses)
  const [categories, setCategories] = useState(seedCategories)
  const [company, setCompany] = useState(seedCompany)

  const toast = (message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(''), 2600)
  }

  const hydrateLocal = () => {
    const savedMenu = localStorage.getItem('lagoon-menu')
    if (savedMenu) {
      const parsed = JSON.parse(savedMenu) as Array<Record<string, unknown>>
      setMenu(parsed.map(row => ({
        id: String(row.id ?? newId()),
        name: String(row.name ?? ''),
        description: String(row.description ?? row.recipe ?? ''),
        category: String(row.category ?? row.cat ?? ''),
        allowAddOn: Boolean(row.allowAddOn ?? false),
        sellingPrice: Number(row.sellingPrice ?? row.price ?? 0),
        manufacturedPrice: Number(row.manufacturedPrice ?? row.cost ?? 0),
        day: Boolean(row.day ?? true),
        night: Boolean(row.night ?? false),
        happyHour: Boolean(row.happyHour ?? false),
      })))
    }
    const savedTables = localStorage.getItem('lagoon-tables')
    if (savedTables) {
      const parsed = JSON.parse(savedTables) as Array<Record<string, unknown>>
      setTables(parsed.map(row => ({
        id: String(row.id ?? newId()),
        number: Number(row.number ?? 1),
        capacity: Number(row.capacity ?? row.seats ?? 4),
      })))
    }
    const savedOrders = localStorage.getItem('lagoon-orders')
    if (savedOrders) {
      const parsed = JSON.parse(savedOrders) as Array<Record<string, unknown>>
      if (parsed.some(o => o.date || o.lines || o.items)) setOrders(parsed.map((o, i) => normalizeOrder(o, i)))
    }
    const savedExpenses = localStorage.getItem('lagoon-expenses')
    if (savedExpenses) {
      const parsed = JSON.parse(savedExpenses) as Array<Record<string, unknown>>
      setExpenses(parsed.map(e => {
        const lines = Array.isArray(e.lines)
          ? (e.lines as Array<Record<string, unknown>>).map((line, i) => ({
              id: String(line.id ?? newId()),
              description: String(line.description ?? ''),
              qty: Number(line.qty ?? 1),
              amount: Number(line.amount ?? 0),
            }))
          : [{ id: newId(), description: String(e.category ?? 'Expense'), qty: 1, amount: Number(e.amount ?? 0) }]
        return { id: String(e.id ?? newId()), date: parseExpenseDate(String(e.date ?? '')), category: String(e.category ?? ''), lines }
      }))
    }
    const savedCategories = localStorage.getItem('lagoon-categories')
    if (savedCategories) setCategories(JSON.parse(savedCategories))
    const savedCompany = localStorage.getItem('lagoon-company')
    if (savedCompany) setCompany({ ...seedCompany, ...JSON.parse(savedCompany) })
  }

  const loadRemote = async (userId: string) => {
    const workspace = await api.loadWorkspace(userId)
    setTenantId(workspace.tenantId)
    setCompany(workspace.company)
    setCategories(workspace.categories)
    setMenu(workspace.menu)
    setTables(workspace.tables)
    setOrders(workspace.orders)
    setExpenses(workspace.expenses)
    setExpenseCategoryMap(workspace.expenseCategories)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (!isSupabaseConfigured) {
          setAuth(!!localStorage.getItem('lagoon-auth'))
          hydrateLocal()
          return
        }
        const session = await api.getSession()
        if (!alive) return
        if (session?.user) {
          await loadRemote(session.user.id)
          if (alive) setAuth(true)
        }
      } catch (err) {
        console.error(err)
        toast(err instanceof Error ? err.message : 'Failed to restore session')
      } finally {
        if (alive) setBooting(false)
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!auth || isSupabaseConfigured) return
    localStorage.setItem('lagoon-menu', JSON.stringify(menu))
    localStorage.setItem('lagoon-tables', JSON.stringify(tables))
    localStorage.setItem('lagoon-orders', JSON.stringify(orders))
    localStorage.setItem('lagoon-expenses', JSON.stringify(expenses))
    localStorage.setItem('lagoon-categories', JSON.stringify(categories))
    localStorage.setItem('lagoon-company', JSON.stringify(company))
  }, [auth, menu, tables, orders, expenses, categories, company])

  const handleLogin = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      if (email !== 'admin@pyramidsnack.com' || password !== 'admin123') {
        throw new Error('Use admin@pyramidsnack.com and admin123.')
      }
      localStorage.setItem('lagoon-auth', 'yes')
      hydrateLocal()
      setTenantId(null)
      setAuth(true)
      return
    }
    const { user } = await api.signIn(email, password)
    if (!user) throw new Error('Sign-in failed')
    try {
      await loadRemote(user.id)
      setAuth(true)
    } catch (err) {
      await api.signOut()
      throw err
    }
  }

  const handleLogout = async () => {
    if (isSupabaseConfigured) await api.signOut()
    localStorage.removeItem('lagoon-auth')
    setTenantId(null)
    setConfirmLogout(false)
    setAuth(false)
    setActive('dashboard')
  }

  if (booting) {
    return <main className="login-page" style={{ placeItems: 'center', display: 'grid' }}><p className="muted">Loading workspace…</p></main>
  }

  if (!auth) return <Login onLogin={handleLogin} />

  return (
    <div className={`app-shell ${drawer ? 'drawer-open' : ''}`}>
      <Sidebar active={active} setActive={x => { setActive(x); setDrawer(false) }} company={company} logout={() => setConfirmLogout(true)} />
      <div className="main-area">
        <Header active={active} mobileMenu={() => setDrawer(!drawer)} />
        {active === 'dashboard' && <Dashboard orders={orders} expenses={expenses} />}
        {active === 'menu' && <MenuPage menu={menu} setMenu={setMenu} categories={categories} company={company} toast={toast} tenantId={tenantId} />}
        {active === 'categories' && <CategoriesPage categories={categories} setCategories={setCategories} toast={toast} tenantId={tenantId} />}
        {active === 'tables' && <Tables tables={tables} setTables={setTables} toast={toast} tenantId={tenantId} />}
        {active === 'orders' && <Orders orders={orders} setOrders={setOrders} menu={menu} company={company} toast={toast} tenantId={tenantId} />}
        {active === 'expenses' && <Expenses expenses={expenses} setExpenses={setExpenses} company={company} toast={toast} tenantId={tenantId} expenseCategoryMap={expenseCategoryMap} />}
        {active === 'pnl' && <Reports orders={orders} expenses={expenses} company={company} toast={toast} />}
        {active === 'sales' && <SalesReport orders={orders} company={company} toast={toast} />}
        {active === 'expense-report' && <ExpenseReport expenses={expenses} company={company} toast={toast} />}
        {active === 'inventory-report' && <InventoryReport orders={orders} menu={menu} company={company} toast={toast} />}
        {active === 'settings' && <SettingsPage company={company} setCompany={setCompany} toast={toast} tenantId={tenantId} />}
      </div>
      {confirmLogout && (
        <ConfirmDelete
          title="Log out?"
          message="Are you sure you want to log out of Pyramid Snack?"
          confirmLabel="Log out"
          confirmVariant="primary"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => { void handleLogout() }}
        />
      )}
      {toastMessage && <div className="toast"><Check size={17} /> {toastMessage}</div>}
    </div>
  )
}
