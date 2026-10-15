import { getSupabase } from '@/lib/supabase/client'
import {
  type AccountingBooks,
  type GlAccount,
  type JournalEntry,
  type JournalLine,
  type MoneyReceipt,
  type Purchase,
  type PurchaseLine,
  type Supplier,
  type SupplierPayment,
  buildExpenseJournal,
  buildPaymentJournal,
  buildPurchaseJournal,
  buildReceiptJournal,
  buildSaleJournal,
  journalTotals,
  nextJournalNumber,
} from '@/lib/accounting'
import type { Expense, Order } from '@/lib/domain'

type AccountRow = {
  id: string
  code: string
  name: string
  account_type: GlAccount['type']
  is_control: boolean
  is_system?: boolean
  description?: string
}

const mapAccount = (row: AccountRow): GlAccount => ({
  id: row.id,
  code: row.code,
  name: row.name,
  type: row.account_type,
  isControl: Boolean(row.is_control),
  isSystem: Boolean(row.is_system),
  description: String(row.description ?? ''),
})

function accountWriteError(error: { code?: string; message?: string } | null) {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
    throw new Error('That account code is already in use')
  }
  throw new Error(error.message || 'Could not save the account')
}

function numbered(prefix: string, values: string[]) {
  const max = values.reduce((highest, value) => {
    const match = String(value).match(/(\d+)\s*$/)
    const n = match ? Number(match[1]) : 0
    return n > highest ? n : highest
  }, 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

export async function fetchAccounts(tenantId: string): Promise<GlAccount[]> {
  const supabase = getSupabase()
  await supabase.rpc('seed_chart_of_accounts', { p_tenant_id: tenantId })
  const withDescription = await supabase
    .from('gl_accounts')
    .select('id, code, name, account_type, is_control, is_system, description')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('code')
  if (!withDescription.error) return (withDescription.data || []).map(mapAccount)
  if (!/description/i.test(withDescription.error.message || '')) throw withDescription.error
  const { data, error } = await supabase
    .from('gl_accounts')
    .select('id, code, name, account_type, is_control, is_system')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('code')
  if (error) throw withDescription.error
  return (data || []).map(mapAccount)
}

export async function saveAccount(tenantId: string, account: GlAccount): Promise<GlAccount> {
  const supabase = getSupabase()
  const code = account.code.trim()
  const name = account.name.trim()
  if (!code || !name) throw new Error('Code and account name are required')
  if (account.id) {
    const payload = account.isSystem
      ? { name, description: account.description?.trim() || '' }
      : {
          code,
          name,
          account_type: account.type,
          is_control: Boolean(account.isControl),
          description: account.description?.trim() || '',
        }
    const { data, error } = await supabase
      .from('gl_accounts')
      .update(payload)
      .eq('id', account.id)
      .eq('tenant_id', tenantId)
      .select('id, code, name, account_type, is_control, is_system, description')
      .single()
    accountWriteError(error)
    return mapAccount(data as AccountRow)
  }
  const { data, error } = await supabase
    .from('gl_accounts')
    .insert({
      tenant_id: tenantId,
      code,
      name,
      account_type: account.type,
      is_control: Boolean(account.isControl),
      is_system: false,
      is_active: true,
      description: account.description?.trim() || '',
    })
    .select('id, code, name, account_type, is_control, is_system, description')
    .single()
  accountWriteError(error)
  return mapAccount(data as AccountRow)
}

export async function deleteAccount(tenantId: string, account: GlAccount) {
  if (account.isSystem) throw new Error('System accounts cannot be deleted')
  const supabase = getSupabase()
  const { error } = await supabase
    .from('gl_accounts')
    .update({ is_active: false })
    .eq('id', account.id)
    .eq('tenant_id', tenantId)
    .eq('is_system', false)
  if (error) throw new Error(error.message)
}

async function fetchEveryRow<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await load(from, from + size - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < size) return rows
  }
}

export async function fetchJournals(tenantId: string, accounts: GlAccount[]): Promise<JournalEntry[]> {
  const supabase = getSupabase()
  const [entries, lines] = await Promise.all([
    fetchEveryRow<Record<string, unknown>>(async (from, to) => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('entry_date', { ascending: false })
        .order('entry_no', { ascending: false })
        .range(from, to)
      return { data: (data || []) as Record<string, unknown>[], error }
    }),
    fetchEveryRow<Record<string, unknown>>(async (from, to) => {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('journal_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .range(from, to)
      return { data: (data || []) as Record<string, unknown>[], error }
    }),
  ])
  const byId = new Map(accounts.map(account => [account.id, account]))
  const linesByJournal = new Map<string, Array<Record<string, unknown>>>()
  for (const line of lines) {
    const journalId = String(line.journal_id)
    const list = linesByJournal.get(journalId) || []
    list.push(line)
    linesByJournal.set(journalId, list)
  }
  return entries.map(row => {
    const linesRaw = (linesByJournal.get(String(row.id)) || [])
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    return {
      id: String(row.id),
      number: String(row.entry_no),
      date: String(row.entry_date),
      source: row.source as JournalEntry['source'],
      sourceRef: String(row.source_ref ?? ''),
      memo: String(row.memo ?? ''),
      lines: linesRaw.map(line => {
        const account = byId.get(String(line.account_id))
        return {
          id: String(line.id),
          accountId: String(line.account_id),
          accountCode: account?.code ?? '',
          accountName: account?.name ?? '',
          description: String(line.description ?? ''),
          partyName: String(line.party_name ?? ''),
          debit: Number(line.debit ?? 0),
          credit: Number(line.credit ?? 0),
        } satisfies JournalLine
      }),
    }
  })
}

export async function fetchSuppliers(tenantId: string): Promise<Supplier[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('name')
  if (error) throw error
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    email: row.email || '',
    notes: row.notes || '',
  }))
}

export async function saveSupplier(tenantId: string, supplier: Supplier): Promise<Supplier> {
  const supabase = getSupabase()
  const payload = {
    tenant_id: tenantId,
    name: supplier.name.trim(),
    phone: supplier.phone.trim(),
    email: supplier.email.trim(),
    notes: supplier.notes.trim(),
  }
  if (supplier.id && !supplier.id.startsWith('id-')) {
    const { data, error } = await supabase.from('suppliers').update(payload).eq('id', supplier.id).eq('tenant_id', tenantId).select('*').single()
    if (error) throw error
    return { id: data.id, name: data.name, phone: data.phone || '', email: data.email || '', notes: data.notes || '' }
  }
  const { data, error } = await supabase.from('suppliers').insert(payload).select('*').single()
  if (error) throw error
  return { id: data.id, name: data.name, phone: data.phone || '', email: data.email || '', notes: data.notes || '' }
}

async function mapPurchases(tenantId: string): Promise<Purchase[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('purchases')
    .select('*, suppliers(name), purchase_lines(*)')
    .eq('tenant_id', tenantId)
    .order('purchase_date', { ascending: false })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => {
    const supplier = row.suppliers as { name?: string } | null
    const linesRaw = Array.isArray(row.purchase_lines) ? row.purchase_lines as Array<Record<string, unknown>> : []
    return {
      id: String(row.id),
      number: String(row.purchase_no),
      supplierId: String(row.supplier_id ?? ''),
      supplierName: String(supplier?.name ?? ''),
      date: String(row.purchase_date),
      dueDate: String(row.due_date ?? ''),
      paymentMethod: (row.payment_method || 'credit') as Purchase['paymentMethod'],
      status: (row.status || 'unpaid') as Purchase['status'],
      notes: String(row.notes ?? ''),
      vatInclusive: row.vat_inclusive !== false,
      vatClaimable: row.vat_claimable !== false,
      lines: linesRaw
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map(line => ({
          id: String(line.id),
          description: String(line.description ?? ''),
          qty: Number(line.qty ?? 1),
          amount: Number(line.unit_amount ?? 0),
        } satisfies PurchaseLine)),
    }
  })
}

export async function fetchPurchases(tenantId: string) {
  return mapPurchases(tenantId)
}

export async function fetchReceipts(tenantId: string): Promise<MoneyReceipt[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('money_receipts').select('*').eq('tenant_id', tenantId).order('receipt_date', { ascending: false })
  if (error) throw error
  return (data || []).map(row => ({
    id: row.id,
    number: row.receipt_no,
    date: row.receipt_date,
    customerName: row.customer_name || '',
    orderId: row.order_number || '',
    method: row.method,
    amount: Number(row.amount),
    memo: row.memo || '',
  }))
}

export async function fetchPayments(tenantId: string): Promise<SupplierPayment[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('supplier_payments')
    .select('*, suppliers(name)')
    .eq('tenant_id', tenantId)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => {
    const supplier = row.suppliers as { name?: string } | null
    return {
      id: String(row.id),
      number: String(row.payment_no),
      date: String(row.payment_date),
      supplierId: String(row.supplier_id ?? ''),
      supplierName: String(supplier?.name ?? ''),
      purchaseId: String(row.purchase_id ?? ''),
      method: row.method as SupplierPayment['method'],
      amount: Number(row.amount),
      memo: String(row.memo ?? ''),
    }
  })
}

export async function loadBooks(tenantId: string): Promise<AccountingBooks> {
  const supabase = getSupabase()
  const accounts = await fetchAccounts(tenantId)
  const [journals, suppliers, purchases, receipts, payments, tenant] = await Promise.all([
    fetchJournals(tenantId, accounts),
    fetchSuppliers(tenantId),
    fetchPurchases(tenantId),
    fetchReceipts(tenantId),
    fetchPayments(tenantId),
    supabase.from('tenants').select('vat_registered').eq('id', tenantId).single(),
  ])
  const vatOn = Boolean(tenant.data?.vat_registered)
  const books: AccountingBooks = { accounts, journals, suppliers, purchases, receipts, payments }
  let repaired = false
  for (const purchase of purchases) {
    const existing = journals.find(item => item.source === 'purchase' && item.sourceRef === purchase.id)
    if (existing && existing.lines.length && journalTotals(existing).debit > 0) continue
    const draft = buildPurchaseJournal(accounts, purchase, vatOn)
    if (!draft) continue
    await saveJournal(tenantId, draft, journals.map(item => item.number))
    repaired = true
  }
  if (!repaired) return books
  return { ...books, journals: await fetchJournals(tenantId, accounts) }
}

export async function deleteAutoJournal(tenantId: string, source: JournalEntry['source'], sourceRef: string) {
  if (!sourceRef || source === 'manual') return
  const supabase = getSupabase()
  const { error } = await supabase.from('journal_entries').delete().eq('tenant_id', tenantId).eq('source', source).eq('source_ref', sourceRef)
  if (error) throw error
}

export async function saveJournal(tenantId: string, entry: Omit<JournalEntry, 'id' | 'number'> & { id?: string; number?: string }, existingNumbers: string[]) {
  const supabase = getSupabase()
  if (entry.source !== 'manual' && entry.sourceRef) {
    await deleteAutoJournal(tenantId, entry.source, entry.sourceRef)
  } else if (entry.id) {
    await supabase.from('journal_entries').delete().eq('id', entry.id).eq('tenant_id', tenantId)
  }
  const entryNo = entry.number || numbered('JE', existingNumbers)
  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      tenant_id: tenantId,
      entry_no: entryNo,
      entry_date: entry.date,
      source: entry.source,
      source_ref: entry.sourceRef || '',
      memo: entry.memo,
    })
    .select('id, entry_no')
    .single()
  if (error) throw error
  if (entry.lines.length) {
    const { error: lineError } = await supabase.from('journal_lines').insert(
      entry.lines.map((item, index) => ({
        tenant_id: tenantId,
        journal_id: data.id,
        account_id: item.accountId,
        description: item.description,
        party_name: item.partyName,
        debit: item.debit,
        credit: item.credit,
        sort_order: index,
      })),
    )
    if (lineError) {
      await supabase.from('journal_entries').delete().eq('id', data.id).eq('tenant_id', tenantId)
      throw lineError
    }
  }
  return { id: data.id as string, number: data.entry_no as string }
}

export async function deleteManualJournal(tenantId: string, id: string) {
  const supabase = getSupabase()
  const { error } = await supabase.from('journal_entries').delete().eq('id', id).eq('tenant_id', tenantId).eq('source', 'manual')
  if (error) throw error
}

const moneyKey = (amount: number) => (Math.round((Number(amount) || 0) * 100) / 100).toFixed(2)

const saleSignature = (entry: { date: string; lines: Array<{ accountCode: string; debit: number; credit: number }> }) => {
  const lines = entry.lines
    .map(line => `${line.accountCode}:${moneyKey(line.debit)}:${moneyKey(line.credit)}`)
    .sort()
    .join('|')
  return `${entry.date.slice(0, 10)}|${lines}`
}

export async function syncSaleJournals(tenantId: string, books: AccountingBooks, orders: Order[], vatRegistered: boolean): Promise<AccountingBooks> {
  const expected = orders.flatMap(order => {
    const draft = buildSaleJournal(books.accounts, order, vatRegistered)
    return draft ? [draft] : []
  })
  const existing = books.journals.filter(journal => journal.source === 'sale')
  const byRef = new Map(existing.map(journal => [journal.sourceRef, journal]))
  const unchanged = existing.length === expected.length && expected.every(draft => {
    const current = byRef.get(draft.sourceRef)
    return Boolean(current && saleSignature(current) === saleSignature(draft))
  })
  if (unchanged) return books

  const supabase = getSupabase()
  const { error: deleteError } = await supabase.from('journal_entries').delete().eq('tenant_id', tenantId).eq('source', 'sale')
  if (deleteError) throw deleteError

  const numbers = books.journals.filter(journal => journal.source !== 'sale').map(journal => journal.number)
  const drafts = expected.map(draft => {
    const number = nextJournalNumber(numbers.map(value => ({ number: value }) as JournalEntry))
    numbers.push(number)
    return { ...draft, number }
  })

  const idByRef = new Map<string, string>()
  for (let index = 0; index < drafts.length; index += 80) {
    const slice = drafts.slice(index, index + 80)
    const { data, error } = await supabase
      .from('journal_entries')
      .insert(slice.map(draft => ({
        tenant_id: tenantId,
        entry_no: draft.number,
        entry_date: draft.date.slice(0, 10),
        source: draft.source,
        source_ref: draft.sourceRef,
        memo: draft.memo,
      })))
      .select('id, source_ref')
    if (error) throw error
    for (const row of data || []) idByRef.set(String(row.source_ref), String(row.id))
  }

  const lineRows = drafts.flatMap(draft => {
    const journalId = idByRef.get(draft.sourceRef)
    if (!journalId) throw new Error(`Could not post the sale journal for ${draft.sourceRef}`)
    return draft.lines.map((line, sort) => ({
      tenant_id: tenantId,
      journal_id: journalId,
      account_id: line.accountId,
      description: line.description,
      party_name: line.partyName,
      debit: line.debit,
      credit: line.credit,
      sort_order: sort,
    }))
  })
  for (let index = 0; index < lineRows.length; index += 400) {
    const { error } = await supabase.from('journal_lines').insert(lineRows.slice(index, index + 400))
    if (error) throw error
  }
  return { ...books, journals: await fetchJournals(tenantId, books.accounts) }
}

export async function postSaleJournal(tenantId: string, accounts: GlAccount[], journals: JournalEntry[], order: Order, vatRegistered: boolean) {
  await deleteAutoJournal(tenantId, 'sale', order.id)
  const draft = buildSaleJournal(accounts, order, vatRegistered)
  if (!draft) return
  await saveJournal(tenantId, draft, journals.map(item => item.number))
}

export async function postExpenseJournal(
  tenantId: string,
  accounts: GlAccount[],
  journals: JournalEntry[],
  expense: Expense,
  vatRegistered: boolean,
  expenseAccountCode: string,
) {
  await deleteAutoJournal(tenantId, 'expense', expense.id)
  const draft = buildExpenseJournal(accounts, expense, vatRegistered, expenseAccountCode)
  if (!draft) return
  await saveJournal(tenantId, draft, journals.map(item => item.number))
}

export async function savePurchase(
  tenantId: string,
  books: AccountingBooks,
  purchase: Purchase,
  vatRegistered: boolean,
) {
  const supabase = getSupabase()
  const total = purchase.lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.amount) || 0), 0)
  const number = purchase.number || numbered('PO', books.purchases.map(item => item.number))
  const payload = {
    tenant_id: tenantId,
    supplier_id: purchase.supplierId || null,
    purchase_no: number,
    purchase_date: purchase.date,
    due_date: purchase.dueDate || null,
    payment_method: purchase.paymentMethod,
    status: purchase.paymentMethod === 'credit' ? 'unpaid' : 'paid',
    total_amount: total,
    vat_inclusive: purchase.vatInclusive !== false,
    vat_claimable: purchase.vatClaimable !== false,
    notes: purchase.notes,
  }
  let purchaseId = purchase.id || null
  if (purchaseId) {
    const { error } = await supabase.from('purchases').update(payload).eq('id', purchaseId).eq('tenant_id', tenantId)
    if (error) throw error
    await supabase.from('purchase_lines').delete().eq('purchase_id', purchaseId)
  } else {
    const { data, error } = await supabase.from('purchases').insert(payload).select('id').single()
    if (error) throw error
    purchaseId = data.id
  }
  if (purchase.lines.length) {
    const { error } = await supabase.from('purchase_lines').insert(
      purchase.lines.map((line, index) => ({
        tenant_id: tenantId,
        purchase_id: purchaseId,
        description: line.description,
        qty: line.qty,
        unit_amount: line.amount,
        sort_order: index,
      })),
    )
    if (error) throw error
  }
  const saved: Purchase = { ...purchase, id: purchaseId!, number, status: payload.status as Purchase['status'] }
  const accounts = await fetchAccounts(tenantId)
  const draft = buildPurchaseJournal(accounts, saved, vatRegistered)
  if (!draft) throw new Error('Purchase total must be greater than zero to post a journal.')
  await saveJournal(tenantId, draft, books.journals.map(item => item.number))
  return saved
}

export async function deletePurchase(tenantId: string, id: string) {
  const supabase = getSupabase()
  await deleteAutoJournal(tenantId, 'purchase', id)
  const { error } = await supabase.from('purchases').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) throw error
}

export async function saveReceipt(tenantId: string, books: AccountingBooks, receipt: MoneyReceipt) {
  const supabase = getSupabase()
  const number = receipt.number || numbered('RC', books.receipts.map(item => item.number))
  const { data, error } = await supabase
    .from('money_receipts')
    .insert({
      tenant_id: tenantId,
      receipt_no: number,
      receipt_date: receipt.date,
      customer_name: receipt.customerName,
      order_number: receipt.orderId,
      method: receipt.method,
      amount: receipt.amount,
      memo: receipt.memo,
    })
    .select('id')
    .single()
  if (error) throw error
  const saved: MoneyReceipt = { ...receipt, id: data.id, number }
  await saveJournal(tenantId, buildReceiptJournal(books.accounts, saved), books.journals.map(item => item.number))
  return saved
}

export async function savePayment(tenantId: string, books: AccountingBooks, payment: SupplierPayment) {
  const supabase = getSupabase()
  const number = payment.number || numbered('SP', books.payments.map(item => item.number))
  const { data, error } = await supabase
    .from('supplier_payments')
    .insert({
      tenant_id: tenantId,
      payment_no: number,
      payment_date: payment.date,
      supplier_id: payment.supplierId || null,
      purchase_id: payment.purchaseId || null,
      method: payment.method,
      amount: payment.amount,
      memo: payment.memo,
    })
    .select('id')
    .single()
  if (error) throw error
  if (payment.purchaseId) {
    await supabase.from('purchases').update({ status: 'paid' }).eq('id', payment.purchaseId).eq('tenant_id', tenantId)
  }
  const saved: SupplierPayment = { ...payment, id: data.id, number }
  await saveJournal(tenantId, buildPaymentJournal(books.accounts, saved), books.journals.map(item => item.number))
  return saved
}
