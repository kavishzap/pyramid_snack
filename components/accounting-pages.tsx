'use client'

import { Fragment, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Download, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'

import {
  type AccountType,
  type AccountingBooks,
  type GlAccount,
  type JournalEntry,
  type JournalLine,
  type Purchase,
  type Supplier,
  accountLedger,
  buildPurchaseJournal,
  cashBook,
  defaultVatFlags,
  documentVat,
  journalTotals,
  money,
  nextPurchaseNumber,
  purchaseTotal,
  removeJournal,
  trialBalance,
  upsertJournal,
} from '@/lib/accounting'
import * as booksApi from '@/lib/api/accounting'
import { newId, type CompanySettings, type PayMethod } from '@/lib/domain'
import { downloadReportPdf, reportFileName } from '@/lib/reportPdf'

function Button({ children, onClick, variant = 'primary', type = 'button', className = '' }: { children: React.ReactNode; onClick?: () => void; variant?: string; type?: 'button' | 'submit'; className?: string }) {
  return <button type={type} onClick={onClick} className={`button button-${variant}${className ? ` ${className}` : ''}`}>{children}</button>
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}
function Dialog({ title, close, children, wide }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop">
      <div className={wide ? 'dialog dialog-wide' : 'dialog'} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" onClick={close} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function VatToggleRow({
  vatInclusive,
  vatClaimable,
  onChange,
}: {
  vatInclusive: boolean
  vatClaimable: boolean
  onChange: (patch: { vatInclusive?: boolean; vatClaimable?: boolean }) => void
}) {
  return (
    <div className="vat-toggles">
      <label className="settings-toggle">
        <span>
          <strong>VAT inclusive</strong>
          <small className="muted">Amounts include 15% VAT</small>
        </span>
        <button type="button" role="switch" aria-checked={vatInclusive} className={`toggle-switch ${vatInclusive ? 'on' : ''}`} onClick={() => onChange({ vatInclusive: !vatInclusive })}>
          <span />
        </button>
      </label>
      <label className="settings-toggle">
        <span>
          <strong>VAT claimable</strong>
          <small className="muted">Recover input VAT on this bill</small>
        </span>
        <button type="button" role="switch" aria-checked={vatClaimable} className={`toggle-switch ${vatClaimable ? 'on' : ''}`} onClick={() => onChange({ vatClaimable: !vatClaimable })}>
          <span />
        </button>
      </label>
    </div>
  )
}

export function VatBreakdown({ entered, vatInclusive, vatClaimable, vatOn }: { entered: number; vatInclusive: boolean; vatClaimable: boolean; vatOn: boolean }) {
  if (!vatOn) return null
  const parts = documentVat(entered, { vatInclusive, vatClaimable }, true)
  return (
    <div className="vat-breakdown">
      <span><span className="muted">Net in P&L</span><strong>{money(parts.expense)}</strong></span>
      <span><span className="muted">{parts.inputVat ? 'VAT claimable' : 'VAT not claimed'}</span><strong>{money(parts.vat)}</strong></span>
      <span><span className="muted">{vatInclusive ? 'To pay' : 'To pay (excl. + VAT)'}</span><strong>{money(parts.payable)}</strong></span>
    </div>
  )
}

type BooksProps = {
  books: AccountingBooks
  setBooks: React.Dispatch<React.SetStateAction<AccountingBooks>>
  tenantId: string | null
  vatOn: boolean
  toast: (message: string) => void
  reload?: () => Promise<void>
}

const today = () => new Date().toISOString().slice(0, 10)
const PAGE_SIZE = 10

const formatBookDate = (iso: string) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const booksPeriod = (dates: string[]) => {
  const sorted = dates.map(value => String(value || '').slice(0, 10)).filter(Boolean).sort()
  if (!sorted.length) return 'All time'
  const first = formatBookDate(sorted[0])
  const last = formatBookDate(sorted[sorted.length - 1])
  return first === last ? first : `${first} – ${last}`
}

function PdfDownloadButton({ downloading, onClick }: { downloading: boolean; onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <Download size={16} /> {downloading ? 'Preparing…' : 'Download PDF'}
    </Button>
  )
}

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

export function PurchasesPage({ books, setBooks, tenantId, vatOn, toast, reload, company }: BooksProps & { company: CompanySettings }) {
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [downloading, setDownloading] = useState(false)

  const blank = (): Purchase => ({
    id: '',
    number: '',
    supplierId: '',
    supplierName: books.suppliers[0]?.name ?? '',
    date: today(),
    dueDate: today(),
    paymentMethod: 'cash',
    status: 'unpaid',
    notes: '',
    ...defaultVatFlags(vatOn),
    lines: [{ id: newId(), description: '', qty: 1, amount: 0 }],
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!editing) return
    const name = supplierName.trim() || editing.supplierName.trim()
    if (!name) return toast('Enter a supplier')
    const lines = editing.lines.filter(line => line.description.trim() && (Number(line.qty) || 0) > 0)
    if (!lines.length) return toast('Add at least one purchase line')
    try {
      let supplier = books.suppliers.find(item => item.name.toLowerCase() === name.toLowerCase())
      if (!supplier) {
        const created: Supplier = { id: '', name, phone: '', email: '', notes: '' }
        supplier = tenantId ? await booksApi.saveSupplier(tenantId, created) : { ...created, id: newId() }
      }
      const draft: Purchase = {
        ...editing,
        supplierId: supplier.id,
        supplierName: supplier.name,
        lines,
        status: editing.paymentMethod === 'credit' ? 'unpaid' : 'paid',
      }
      if (tenantId) {
        await booksApi.savePurchase(tenantId, { ...books, suppliers: [...books.suppliers, supplier] }, draft, vatOn)
      } else {
        const saved: Purchase = {
          ...draft,
          id: draft.id || newId(),
          number: draft.number || nextPurchaseNumber(books.purchases),
        }
        const journal = buildPurchaseJournal(books.accounts, saved, vatOn)
        setBooks(prev => {
          const next = {
            ...prev,
            suppliers: prev.suppliers.some(item => item.id === supplier.id) ? prev.suppliers : [...prev.suppliers, supplier],
            purchases: saved.id && prev.purchases.some(item => item.id === saved.id)
              ? prev.purchases.map(item => item.id === saved.id ? saved : item)
              : [saved, ...prev.purchases],
          }
          return journal ? upsertJournal(next, journal) : next
        })
      }
      setEditing(null)
      setSupplierName('')
      toast('Purchase saved and posted to the ledger')
      if (tenantId) await reload?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save purchase')
    }
  }

  const remove = async (purchase: Purchase) => {
    try {
      if (tenantId) await booksApi.deletePurchase(tenantId, purchase.id)
      setBooks(prev => ({
        ...removeJournal(prev, 'purchase', purchase.id),
        purchases: prev.purchases.filter(item => item.id !== purchase.id),
      }))
      toast('Purchase deleted')
      if (tenantId) await reload?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete purchase')
    }
  }

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const rows = [...books.purchases].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      const totals = rows.reduce((sum, purchase) => {
        const parts = documentVat(purchaseTotal(purchase), purchase, vatOn)
        return {
          payable: sum.payable + parts.payable,
          vat: sum.vat + parts.inputVat,
          net: sum.net + parts.expense,
        }
      }, { payable: 0, vat: 0, net: 0 })
      await downloadReportPdf({
        company,
        title: 'Purchases of goods',
        period: booksPeriod(rows.map(purchase => purchase.date)),
        filename: reportFileName('purchases'),
        orientation: 'landscape',
        kpis: [
          { label: 'Bills', value: String(rows.length) },
          { label: 'To pay', value: money(totals.payable) },
          ...(vatOn ? [
            { label: 'Net in P&L', value: money(totals.net) },
            { label: 'VAT claimable', value: money(totals.vat) },
          ] : []),
          { label: 'Paid', value: String(rows.filter(purchase => purchase.status === 'paid').length) },
        ],
        tables: [
          {
            title: 'Supplier invoices',
            head: vatOn
              ? ['No.', 'Date', 'Supplier', 'Paid by', 'Status', 'VAT', 'Net', 'To pay']
              : ['No.', 'Date', 'Supplier', 'Paid by', 'Status', 'Amount'],
            rightAlign: vatOn ? [6, 7] : [5],
            body: rows.map(purchase => {
              const parts = documentVat(purchaseTotal(purchase), purchase, vatOn)
              const vatLabel = `${purchase.vatInclusive !== false ? 'Incl.' : 'Excl.'} / ${purchase.vatClaimable !== false ? 'claimable' : 'not claimable'}`
              return vatOn
                ? [purchase.number, formatBookDate(purchase.date), purchase.supplierName, purchase.paymentMethod, purchase.status, vatLabel, money(parts.expense), money(parts.payable)]
                : [purchase.number, formatBookDate(purchase.date), purchase.supplierName, purchase.paymentMethod, purchase.status, money(parts.payable)]
            }),
            foot: rows.length
              ? vatOn
                ? ['Total', '', '', '', '', '', money(totals.net), money(totals.payable)]
                : ['Total', '', '', '', '', money(totals.payable)]
              : undefined,
          },
        ],
        notes: [
          'Purchases are supplier invoices for goods. Cash and bank bills post to the cash book.',
          ...(vatOn ? ['Net in P&L follows each bill’s VAT inclusive/exclusive and claimable flags. VAT is calculated at 15%.'] : ['The company is not VAT registered.']),
        ],
      })
      toast('Purchases PDF downloaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="page-toolbar">
        <p className="muted">Supplier invoices for goods. Credit bills hit the purchase control (payables); cash/bank bills hit the cash book.</p>
        <div className="toolbar-actions">
          <PdfDownloadButton downloading={downloading} onClick={() => void downloadPdf()} />
          <Button onClick={() => { setEditing(blank()); setSupplierName(books.suppliers[0]?.name ?? '') }}><Plus size={17} /> New purchase</Button>
        </div>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>Purchases of goods</strong></div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Paid by</th>
                <th>Status</th>
                <th className="align-right">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {books.purchases.map(purchase => {
                const parts = documentVat(purchaseTotal(purchase), purchase, vatOn)
                return (
                <tr key={purchase.id}>
                  <td><strong>{purchase.number}</strong></td>
                  <td className="muted">{purchase.date}</td>
                  <td>{purchase.supplierName}</td>
                  <td className="muted">{purchase.paymentMethod}</td>
                  <td>{purchase.status}</td>
                  <td className="align-right">
                    <strong>{money(parts.payable)}</strong>
                    {vatOn && (
                      <span className="vat-flag">
                        {purchase.vatInclusive !== false ? 'VAT incl.' : 'excl. VAT'}
                        {' · '}
                        {purchase.vatClaimable !== false ? 'claimable' : 'not claimable'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="more-button" onClick={() => { setEditing({ ...purchase, vatInclusive: purchase.vatInclusive !== false, vatClaimable: purchase.vatClaimable !== false, lines: purchase.lines.map(line => ({ ...line })) }); setSupplierName(purchase.supplierName) }} aria-label={`Edit ${purchase.number}`}><MoreHorizontal size={18} /></button>
                      <button className="more-button" onClick={() => void remove(purchase)} aria-label={`Delete ${purchase.number}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
                )
              })}
              {!books.purchases.length && <tr><td colSpan={7} className="muted">No purchases yet. Record a supplier invoice to post purchases and payables.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <Dialog title={editing.id ? 'Edit purchase' : 'Purchase of goods'} close={() => setEditing(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Supplier
                <input list="supplier-list" value={supplierName} onChange={e => setSupplierName(e.target.value)} required placeholder="Supplier name" />
                <datalist id="supplier-list">{books.suppliers.map(item => <option key={item.id} value={item.name} />)}</datalist>
              </label>
              <label>Date<input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} required /></label>
              <label>Due date<input type="date" value={editing.dueDate} onChange={e => setEditing({ ...editing, dueDate: e.target.value })} /></label>
              <label>Paid by
                <select value={editing.paymentMethod === 'bank' ? 'bank' : 'cash'} onChange={e => setEditing({ ...editing, paymentMethod: e.target.value as PayMethod })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
              {vatOn && (
                <VatToggleRow
                  vatInclusive={editing.vatInclusive !== false}
                  vatClaimable={editing.vatClaimable !== false}
                  onChange={patch => setEditing({ ...editing, ...patch })}
                />
              )}
              <div className="line-items full-span">
                <div className="line-items-head">
                  <strong>Goods</strong>
                  <button type="button" className="text-button" onClick={() => setEditing({ ...editing, lines: [...editing.lines, { id: newId(), description: '', qty: 1, amount: 0 }] })}><Plus size={14} /> Add line</button>
                </div>
                {editing.lines.map(line => (
                  <div className="order-line-row" key={line.id}>
                    <label>Description<input value={line.description} onChange={e => setEditing({ ...editing, lines: editing.lines.map(item => item.id === line.id ? { ...item, description: e.target.value } : item) })} required /></label>
                    <label>Qty<input type="number" min={0} step="0.01" value={line.qty} onChange={e => setEditing({ ...editing, lines: editing.lines.map(item => item.id === line.id ? { ...item, qty: Number(e.target.value) } : item) })} /></label>
                    <label>Unit{vatOn ? <span className="field-hint">{editing.vatInclusive !== false ? 'VAT incl.' : 'excl. VAT'}</span> : null}<input type="number" min={0} step="0.01" value={line.amount} onChange={e => setEditing({ ...editing, lines: editing.lines.map(item => item.id === line.id ? { ...item, amount: Number(e.target.value) } : item) })} /></label>
                    <button type="button" className="more-button" onClick={() => setEditing({ ...editing, lines: editing.lines.length > 1 ? editing.lines.filter(item => item.id !== line.id) : editing.lines })} aria-label="Remove line"><Trash2 size={16} /></button>
                  </div>
                ))}
                <div className="line-items-total"><span className="muted">{vatOn && editing.vatInclusive === false ? 'Entered excl. VAT' : 'Invoice total'}</span><strong>{money(purchaseTotal(editing))}</strong></div>
                <VatBreakdown entered={purchaseTotal(editing)} vatInclusive={editing.vatInclusive !== false} vatClaimable={editing.vatClaimable !== false} vatOn={vatOn} />
              </div>
            </div>
            <div className="dialog-actions">
              <span className="dialog-actions-spacer" />
              <Button type="submit"><Check size={16} /> Save and post</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
]

function ChartOfAccountsSection({ books, setBooks, tenantId, toast, reload }: BooksProps) {
  const [editing, setEditing] = useState<GlAccount | null>(null)
  const [pendingDelete, setPendingDelete] = useState<GlAccount | null>(null)
  const paged = usePagedRows(books.accounts)
  const blank = (): GlAccount => ({
    id: '',
    code: '',
    name: '',
    type: 'expense',
    isControl: false,
    isSystem: false,
    description: '',
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const draft: GlAccount = {
      ...editing,
      code: editing.code.trim(),
      name: editing.name.trim(),
      description: editing.description?.trim() || '',
    }
    if (!draft.code || !draft.name) return toast('Code and account name are required')
    const clash = books.accounts.find(item => item.id !== draft.id && item.code.toLowerCase() === draft.code.toLowerCase())
    if (clash) return toast('That account code is already in use')
    try {
      const saved = tenantId
        ? await booksApi.saveAccount(tenantId, draft)
        : { ...draft, id: draft.id || newId() }
      setBooks(prev => ({
        ...prev,
        accounts: draft.id
          ? prev.accounts.map(item => item.id === draft.id ? saved : item)
          : [...prev.accounts, saved].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
      }))
      if (tenantId) await reload?.()
      setEditing(null)
      toast(draft.id ? 'Account updated' : 'Account added')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the account')
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      if (pendingDelete.isSystem) throw new Error('System accounts cannot be deleted')
      if (tenantId) await booksApi.deleteAccount(tenantId, pendingDelete)
      setBooks(prev => ({ ...prev, accounts: prev.accounts.filter(item => item.id !== pendingDelete.id) }))
      if (tenantId) await reload?.()
      setPendingDelete(null)
      setEditing(null)
      toast('Account removed')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete the account')
    }
  }

  return (
    <>
      <Card className="table-card">
        <div className="table-summary">
          <div>
            <strong>Chart of accounts</strong>
            <div className="muted">{paged.total} {paged.total === 1 ? 'account' : 'accounts'}</div>
          </div>
          <Button onClick={() => setEditing(blank())}><Plus size={17} /> Add account</Button>
        </div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th>Control</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.slice.map(account => (
                <tr key={account.id}>
                  <td className="muted">{account.code}</td>
                  <td>
                    <strong>{account.name}</strong>
                    {account.description ? <div className="muted">{account.description}</div> : null}
                    {account.isSystem ? <div className="muted">System</div> : null}
                  </td>
                  <td className="muted">{ACCOUNT_TYPES.find(item => item.value === account.type)?.label || account.type}</td>
                  <td className="muted">{account.isControl ? 'Yes' : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="more-button" onClick={() => setEditing(account)} aria-label={`Edit ${account.name}`}><MoreHorizontal size={18} /></button>
                      {!account.isSystem && (
                        <button className="more-button" onClick={() => setPendingDelete(account)} aria-label={`Delete ${account.name}`}><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!books.accounts.length && <tr><td colSpan={5} className="muted">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={paged.total === 1 ? 'account' : 'accounts'} />
      </Card>
      {editing && !pendingDelete && (
        <Dialog title={editing.id ? 'Edit account' : 'Add account'} close={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Code
                <input
                  value={editing.code}
                  onChange={e => setEditing({ ...editing, code: e.target.value })}
                  placeholder="5400"
                  required
                  disabled={Boolean(editing.isSystem)}
                />
              </label>
              <label>Type
                <select
                  value={editing.type}
                  onChange={e => setEditing({ ...editing, type: e.target.value as AccountType })}
                  disabled={Boolean(editing.isSystem)}
                >
                  {ACCOUNT_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="full-span">Account
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Rent, electricity, staff meals…" required />
              </label>
              <label className="full-span">Description
                <input value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="Optional note" />
              </label>
              {!editing.isSystem && (
                <label className="check">
                  <input type="checkbox" checked={Boolean(editing.isControl)} onChange={e => setEditing({ ...editing, isControl: e.target.checked })} />
                  Control account
                </label>
              )}
            </div>
            <div className="dialog-actions">
              {editing.id && !editing.isSystem && (
                <Button variant="danger" type="button" onClick={() => setPendingDelete(editing)}><Trash2 size={16} /> Delete</Button>
              )}
              <span className="dialog-actions-spacer" />
              <Button variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit"><Check size={16} /> Save</Button>
            </div>
          </form>
        </Dialog>
      )}
      {pendingDelete && (
        <Dialog title="Delete account?" close={() => setPendingDelete(null)}>
          <p className="confirm-copy">Remove “{pendingDelete.name}” ({pendingDelete.code}) from the chart of accounts? Past journals keep their posted lines.</p>
          <div className="dialog-actions">
            <span className="dialog-actions-spacer" />
            <Button variant="secondary" type="button" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="danger" type="button" onClick={() => void confirmDelete()}>Delete</Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

export function JournalsPage({ books, setBooks, tenantId, toast, reload }: BooksProps) {
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const paged = usePagedRows(books.journals)
  const blankLine = (): JournalLine => ({ id: newId(), accountId: books.accounts[0]?.id ?? '', accountCode: books.accounts[0]?.code ?? '', accountName: books.accounts[0]?.name ?? '', description: '', partyName: '', debit: 0, credit: 0 })
  const blank = (): JournalEntry => ({
    id: '',
    number: '',
    date: today(),
    source: 'manual',
    sourceRef: '',
    memo: '',
    lines: [blankLine(), blankLine()],
  })

  const setLineAccount = (lineId: string, accountId: string) => {
    const account = books.accounts.find(item => item.id === accountId)
    if (!account || !editing) return
    setEditing({
      ...editing,
      lines: editing.lines.map(line => line.id === lineId ? { ...line, accountId: account.id, accountCode: account.code, accountName: account.name } : line),
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const lines = editing.lines.filter(line => line.accountId && ((Number(line.debit) || 0) > 0 || (Number(line.credit) || 0) > 0))
    const draft = { ...editing, source: 'manual' as const, lines }
    const totals = journalTotals(draft)
    if (lines.length < 2) return toast('A journal needs at least two lines')
    if (!totals.balanced) return toast(`Debits ${money(totals.debit)} must equal credits ${money(totals.credit)}`)
    try {
      if (tenantId) {
        await booksApi.saveJournal(tenantId, draft, books.journals.map(item => item.number))
        await reload?.()
      } else {
        setBooks(prev => upsertJournal(prev, draft))
      }
      setEditing(null)
      toast('Manual journal posted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not post journal')
    }
  }

  const remove = async (entry: JournalEntry) => {
    if (entry.source !== 'manual') return toast('System journals are reversed from the source document')
    try {
      if (tenantId) await booksApi.deleteManualJournal(tenantId, entry.id)
      setBooks(prev => ({ ...prev, journals: prev.journals.filter(item => item.id !== entry.id) }))
      if (tenantId) await reload?.()
      toast('Journal deleted')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete journal')
    }
  }

  return (
    <div className="page-content">
      <ChartOfAccountsSection books={books} setBooks={setBooks} tenantId={tenantId} vatOn={false} toast={toast} reload={reload} />
      <div className="page-toolbar">
        <p className="muted">Every sale, purchase, receipt, payment, and expense posts here. Use a manual entry for adjustments, opening balances, or year-end journals.</p>
        <Button onClick={() => setEditing(blank())}><Plus size={17} /> Manual entry</Button>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>Journal book</strong><span className="muted">{paged.total} {paged.total === 1 ? 'entry' : 'entries'}</span></div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Account</th>
                <th>Particulars</th>
                <th className="align-right">Debit</th>
                <th className="align-right">Credit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paged.slice.map(entry => {
                const totals = journalTotals(entry)
                const lines = entry.lines.length ? entry.lines : []
                return (
                  <Fragment key={entry.id}>
                    <tr className="journal-entry-row">
                      <td><strong>{entry.number}</strong></td>
                      <td className="muted">{entry.date}</td>
                      <td colSpan={2}>
                        <strong>{entry.memo}</strong>
                        <div className="muted">{entry.source}</div>
                      </td>
                      <td />
                      <td />
                      <td>
                        {entry.source === 'manual' && (
                          <div className="row-actions">
                            <button className="more-button" onClick={() => setEditing({ ...entry, lines: entry.lines.map(line => ({ ...line })) })} aria-label={`Edit ${entry.number}`}><MoreHorizontal size={18} /></button>
                            <button className="more-button" onClick={() => void remove(entry)} aria-label={`Delete ${entry.number}`}><Trash2 size={16} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {lines.map(line => (
                      <tr key={line.id} className="journal-line-row">
                        <td />
                        <td />
                        <td className="journal-account">{line.accountCode ? `${line.accountCode} · ${line.accountName}` : line.accountName || 'Account'}</td>
                        <td className="muted">{line.description || line.partyName}</td>
                        <td className="align-right">{line.debit ? money(line.debit) : ''}</td>
                        <td className="align-right">{line.credit ? money(line.credit) : ''}</td>
                        <td />
                      </tr>
                    ))}
                    <tr className="journal-total-row">
                      <td />
                      <td />
                      <td colSpan={2} className="muted">Totals must match</td>
                      <td className="align-right"><strong>{money(totals.debit)}</strong></td>
                      <td className="align-right"><strong>{money(totals.credit)}</strong></td>
                      <td />
                    </tr>
                  </Fragment>
                )
              })}
              {!books.journals.length && <tr><td colSpan={7} className="muted">No journals yet. Complete an order, record a purchase, or post a manual entry.</td></tr>}
            </tbody>
          </table>
        </div>
        <TablePagination {...paged} noun={paged.total === 1 ? 'journal' : 'journals'} />
      </Card>
      {editing && (
        <Dialog title={editing.id ? 'Edit manual journal' : 'Manual journal entry'} close={() => setEditing(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Date<input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} required /></label>
              <label>Memo<input value={editing.memo} onChange={e => setEditing({ ...editing, memo: e.target.value })} placeholder="Opening balance, adjustment…" /></label>
              <div className="line-items full-span">
                <div className="line-items-head">
                  <strong>Lines</strong>
                  <button type="button" className="text-button" onClick={() => setEditing({ ...editing, lines: [...editing.lines, blankLine()] })}><Plus size={14} /> Add line</button>
                </div>
                {editing.lines.map(line => (
                  <div className="order-line-row" key={line.id}>
                    <label>Account
                      <select value={line.accountId} onChange={e => setLineAccount(line.id, e.target.value)}>
                        {books.accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                      </select>
                    </label>
                    <label>Description<input value={line.description} onChange={e => setEditing({ ...editing, lines: editing.lines.map(item => item.id === line.id ? { ...item, description: e.target.value } : item) })} /></label>
                    <label>Debit<input type="number" min={0} step="0.01" value={line.debit || ''} onChange={e => setEditing({ ...editing, lines: editing.lines.map(item => item.id === line.id ? { ...item, debit: Number(e.target.value), credit: 0 } : item) })} /></label>
                    <label>Credit<input type="number" min={0} step="0.01" value={line.credit || ''} onChange={e => setEditing({ ...editing, lines: editing.lines.map(item => item.id === line.id ? { ...item, credit: Number(e.target.value), debit: 0 } : item) })} /></label>
                    <button type="button" className="more-button" onClick={() => setEditing({ ...editing, lines: editing.lines.length > 2 ? editing.lines.filter(item => item.id !== line.id) : editing.lines })} aria-label="Remove line"><Trash2 size={16} /></button>
                  </div>
                ))}
                <div className="line-items-total">
                  <span className={journalTotals(editing).balanced ? 'muted' : 'negative'}>
                    Dr {money(journalTotals(editing).debit)} · Cr {money(journalTotals(editing).credit)}
                    {journalTotals(editing).balanced ? ' · balanced' : ' · not balanced'}
                  </span>
                </div>
              </div>
            </div>
            <div className="dialog-actions">
              <span className="dialog-actions-spacer" />
              <Button type="submit"><Check size={16} /> Post journal</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}

export function LedgerPage({ books, company, toast }: { books: AccountingBooks; company: CompanySettings; toast: (message: string) => void }) {
  const rows = trialBalance(books)
  const [accountId, setAccountId] = useState(books.accounts.find(item => item.code === '1000')?.id || books.accounts[0]?.id || '')
  const [downloading, setDownloading] = useState(false)
  useEffect(() => {
    if (accountId && books.accounts.some(item => item.id === accountId)) return
    setAccountId(books.accounts.find(item => item.code === '1000')?.id || books.accounts[0]?.id || '')
  }, [books.accounts, accountId])
  const moves = accountId ? accountLedger(books, accountId) : []
  const account = books.accounts.find(item => item.id === accountId)
  const debitTotal = rows.reduce((sum, row) => sum + row.displayDebit, 0)
  const creditTotal = rows.reduce((sum, row) => sum + row.displayCredit, 0)

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await downloadReportPdf({
        company,
        title: 'General ledger',
        period: booksPeriod(books.journals.map(entry => entry.date)),
        filename: reportFileName('ledger'),
        orientation: 'landscape',
        kpis: [
          { label: 'Accounts with movement', value: String(rows.length) },
          { label: 'Debit total', value: money(debitTotal) },
          { label: 'Credit total', value: money(creditTotal) },
          { label: 'Account ledger', value: account ? `${account.code} ${account.name}` : '-' },
        ],
        tables: [
          {
            title: 'Trial balance',
            head: ['Code', 'Account', 'Type', 'Debit', 'Credit'],
            rightAlign: [3, 4],
            body: rows.map(row => [
              row.account.code,
              `${row.account.name}${row.account.isControl ? ' (control)' : ''}`,
              row.account.type,
              row.displayDebit ? money(row.displayDebit) : '',
              row.displayCredit ? money(row.displayCredit) : '',
            ]),
            foot: rows.length ? ['Totals', '', '', money(debitTotal), money(creditTotal)] : undefined,
          },
          {
            title: `Account ledger | ${account ? `${account.code} ${account.name}` : 'Account'}`,
            head: ['Date', 'Journal', 'Particulars', 'Debit', 'Credit', 'Balance'],
            rightAlign: [3, 4, 5],
            body: moves.map(move => [
              formatBookDate(move.date),
              move.number,
              move.memo,
              move.debit ? money(move.debit) : '',
              move.credit ? money(move.credit) : '',
              money(move.balance),
            ]),
          },
        ],
        notes: [
          'Trial balance includes posted journals only. Debit and credit columns are the closing position of each account.',
          'The account ledger matches the account selected on screen.',
        ],
      })
      toast('Ledger PDF downloaded')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page-content">
      <div className="page-toolbar">
        <p className="muted">Trial balance from posted journals, plus movements on the selected account.</p>
        <PdfDownloadButton downloading={downloading} onClick={() => void downloadPdf()} />
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>Trial balance</strong><span className="muted">General ledger in MUR</span></div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th className="align-right">Debit</th>
                <th className="align-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.account.id}>
                  <td className="muted">{row.account.code}</td>
                  <td>
                    <button type="button" className="text-button" onClick={() => setAccountId(row.account.id)}>
                      {row.account.name}{row.account.isControl ? ' · control' : ''}
                    </button>
                  </td>
                  <td className="muted">{row.account.type}</td>
                  <td className="align-right">{row.displayDebit ? money(row.displayDebit) : ''}</td>
                  <td className="align-right">{row.displayCredit ? money(row.displayCredit) : ''}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">No posted journals yet.</td></tr>}
            </tbody>
            {!!rows.length && (
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>Totals</strong></td>
                  <td className="align-right"><strong>{money(debitTotal)}</strong></td>
                  <td className="align-right"><strong>{money(creditTotal)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
      <Card className="table-card">
        <div className="table-summary">
          <strong>Account ledger</strong>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>
            {books.accounts.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
          </select>
        </div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Journal</th>
                <th>Particulars</th>
                <th className="align-right">Debit</th>
                <th className="align-right">Credit</th>
                <th className="align-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((move, index) => (
                <tr key={`${move.number}-${index}`}>
                  <td className="muted">{move.date}</td>
                  <td>{move.number}</td>
                  <td>{move.memo}</td>
                  <td className="align-right">{move.debit ? money(move.debit) : ''}</td>
                  <td className="align-right">{move.credit ? money(move.credit) : ''}</td>
                  <td className="align-right"><strong>{money(move.balance)}</strong></td>
                </tr>
              ))}
              {!moves.length && <tr><td colSpan={6} className="muted">No movement on {account?.name || 'this account'}.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export function CashBookPage({ books, company, toast }: { books: AccountingBooks; company: CompanySettings; toast: (message: string) => void }) {
  const [tab, setTab] = useState<'1000' | '1010'>('1000')
  const [downloading, setDownloading] = useState(false)
  const moves = cashBook(books, tab)
  const balance = moves.length ? moves[moves.length - 1].balance : 0
  const inTotal = moves.reduce((sum, move) => sum + (Number(move.debit) || 0), 0)
  const outTotal = moves.reduce((sum, move) => sum + (Number(move.credit) || 0), 0)
  const bookLabel = tab === '1000' ? 'Cash on hand' : 'Bank'

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await downloadReportPdf({
        company,
        title: tab === '1000' ? 'Cash book' : 'Bank book',
        period: booksPeriod(moves.map(move => move.date)),
        filename: reportFileName(tab === '1000' ? 'cash-book' : 'bank-book'),
        orientation: 'landscape',
        kpis: [
          { label: 'Closing balance', value: money(balance) },
          { label: 'In', value: money(inTotal) },
          { label: 'Out', value: money(outTotal) },
          { label: 'Movements', value: String(moves.length) },
        ],
        tables: [
          {
            title: bookLabel,
            head: ['Date', 'Journal', 'Particulars', 'In', 'Out', 'Balance'],
            rightAlign: [3, 4, 5],
            body: moves.map(move => [
              formatBookDate(move.date),
              move.number,
              move.memo,
              move.debit ? money(move.debit) : '',
              move.credit ? money(move.credit) : '',
              money(move.balance),
            ]),
            foot: moves.length ? ['Total', '', '', money(inTotal), money(outTotal), money(balance)] : undefined,
          },
        ],
        notes: [
          tab === '1000'
            ? 'Cash on hand (account 1000) from posted journals. Switch to Bank on screen to export that book.'
            : 'Bank (account 1010) from posted journals. Switch to Cash on hand on screen to export that book.',
        ],
      })
      toast(`${bookLabel} PDF downloaded`)
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
          <button type="button" className={tab === '1000' ? 'active' : ''} onClick={() => setTab('1000')}>Cash on hand</button>
          <button type="button" className={tab === '1010' ? 'active' : ''} onClick={() => setTab('1010')}>Bank</button>
        </div>
        <div className="toolbar-actions">
          <strong>{money(balance)}</strong>
          <PdfDownloadButton downloading={downloading} onClick={() => void downloadPdf()} />
        </div>
      </div>
      <Card className="table-card">
        <div className="table-summary"><strong>{tab === '1000' ? 'Cash book' : 'Bank book'}</strong></div>
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Journal</th>
                <th>Particulars</th>
                <th className="align-right">In</th>
                <th className="align-right">Out</th>
                <th className="align-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((move, index) => (
                <tr key={`${move.number}-${index}`}>
                  <td className="muted">{move.date}</td>
                  <td>{move.number}</td>
                  <td>{move.memo}</td>
                  <td className="align-right">{move.debit ? money(move.debit) : ''}</td>
                  <td className="align-right">{move.credit ? money(move.credit) : ''}</td>
                  <td className="align-right"><strong>{money(move.balance)}</strong></td>
                </tr>
              ))}
              {!moves.length && <tr><td colSpan={6} className="muted">No cash or bank movement yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
