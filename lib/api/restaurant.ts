import { getSupabase } from '@/lib/supabase/client'
import {
  type Category,
  type CompanySettings,
  type DiningTable,
  type Expense,
  type MenuItem,
  type Order,
  type OrderLine,
  orderStatusFromDb,
  orderStatusToDb,
} from '@/lib/domain'

type TenantRow = {
  id: string
  slug: string
  name: string
  address: string
  phone: string
  email: string
  brn: string
  vat_registered: boolean
  vat_number: string
  logo_url: string
  is_active?: boolean
}

const lineTotal = (line: OrderLine) => {
  const addOns = line.addOns.reduce((sum, a) => sum + (Number(a.price) || 0), 0)
  return (Number(line.qty) || 0) * ((Number(line.unitPrice) || 0) + addOns)
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) {
    if (error.message.toLowerCase().includes('invalid login')) {
      throw new Error('Invalid email or password')
    }
    throw error
  }
  if (!data.user) throw new Error('Sign-in failed')
  return data
}

export async function signOut() {
  const supabase = getSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

/** Resolve restaurant from the signed-in Auth user. Creates one on first login (1 login = 1 restaurant). */
export async function resolveTenantId(_userId: string): Promise<{ tenantId: string; tenant: TenantRow }> {
  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('ensure_my_restaurant')
  if (error) throw error

  const tenant = data as TenantRow | null
  if (!tenant?.id) {
    throw new Error('Could not create or load a restaurant. Run supabase/01-reset.sql then supabase/02-setup.sql.')
  }

  if (tenant.is_active === false) throw new Error('This restaurant workspace is inactive')
  return { tenantId: tenant.id, tenant }
}

export function companyFromTenant(tenant: TenantRow): CompanySettings {
  return {
    logo: tenant.logo_url || '',
    name: tenant.name || '',
    address: tenant.address || '',
    phone: tenant.phone || '',
    email: tenant.email || '',
    brn: tenant.brn || '',
    vatRegistered: Boolean(tenant.vat_registered),
    vatNumber: tenant.vat_number || '',
  }
}

export async function updateCompany(tenantId: string, company: CompanySettings) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('tenants')
    .update({
      name: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      brn: company.brn,
      vat_registered: company.vatRegistered,
      vat_number: company.vatNumber,
      logo_url: company.logo,
    })
    .eq('id', tenantId)
    .select('*')
    .single()
  if (error) throw error
  return companyFromTenant(data)
}

export async function fetchCategories(tenantId: string): Promise<Category[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
  }))
}

export async function saveCategory(tenantId: string, category: Category): Promise<Category> {
  const supabase = getSupabase()
  const payload = {
    tenant_id: tenantId,
    name: category.name,
    description: category.description,
  }
  if (category.id) {
    const { data, error } = await supabase.from('categories').update(payload).eq('id', category.id).eq('tenant_id', tenantId).select('*').single()
    if (error) throw error
    return { id: data.id, name: data.name, description: data.description || '' }
  }
  const { data, error } = await supabase.from('categories').insert(payload).select('*').single()
  if (error) throw error
  return { id: data.id, name: data.name, description: data.description || '' }
}

export async function deleteCategory(tenantId: string, id: string) {
  const supabase = getSupabase()
  const { error } = await supabase.from('categories').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) throw error
}

export async function fetchMenu(tenantId: string): Promise<MenuItem[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('menu_items')
    .select('*, categories(name)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => {
    const cat = row.categories as { name?: string } | null
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      category: String(cat?.name ?? ''),
      allowAddOn: Boolean(row.allow_add_on),
      sellingPrice: Number(row.selling_price ?? 0),
      manufacturedPrice: Number(row.manufactured_price ?? 0),
      day: Boolean(row.available_day),
      night: Boolean(row.available_night),
      happyHour: Boolean(row.available_happy_hour),
    }
  })
}

export async function saveMenuItem(tenantId: string, item: MenuItem, categoryId: string | null): Promise<MenuItem> {
  const supabase = getSupabase()
  const payload = {
    tenant_id: tenantId,
    category_id: categoryId,
    name: item.name,
    description: item.description,
    allow_add_on: item.allowAddOn,
    selling_price: item.sellingPrice,
    manufactured_price: item.manufacturedPrice,
    available_day: item.day,
    available_night: item.night,
    available_happy_hour: item.happyHour,
    is_active: true,
  }
  if (item.id) {
    const { data, error } = await supabase.from('menu_items').update(payload).eq('id', item.id).eq('tenant_id', tenantId).select('*, categories(name)').single()
    if (error) throw error
    const cat = data.categories as { name?: string } | null
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      category: cat?.name || item.category,
      allowAddOn: data.allow_add_on,
      sellingPrice: Number(data.selling_price),
      manufacturedPrice: Number(data.manufactured_price),
      day: data.available_day,
      night: data.available_night,
      happyHour: data.available_happy_hour,
    }
  }
  const { data, error } = await supabase.from('menu_items').insert(payload).select('*, categories(name)').single()
  if (error) throw error
  const cat = data.categories as { name?: string } | null
  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    category: cat?.name || item.category,
    allowAddOn: data.allow_add_on,
    sellingPrice: Number(data.selling_price),
    manufacturedPrice: Number(data.manufactured_price),
    day: data.available_day,
    night: data.available_night,
    happyHour: data.available_happy_hour,
  }
}

export async function deleteMenuItem(tenantId: string, id: string) {
  const supabase = getSupabase()
  const { error } = await supabase.from('menu_items').update({ is_active: false }).eq('id', id).eq('tenant_id', tenantId)
  if (error) throw error
}

export async function fetchTables(tenantId: string): Promise<DiningTable[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('dining_tables')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('table_number', { ascending: true })
  if (error) throw error
  return (data || []).map(row => ({
    id: row.id,
    number: row.table_number,
    capacity: row.capacity,
  }))
}

export async function saveTable(tenantId: string, table: DiningTable): Promise<DiningTable> {
  const supabase = getSupabase()
  const payload = {
    tenant_id: tenantId,
    table_number: table.number,
    capacity: table.capacity,
    is_active: true,
  }
  if (table.id) {
    const { data, error } = await supabase.from('dining_tables').update(payload).eq('id', table.id).eq('tenant_id', tenantId).select('*').single()
    if (error) throw error
    return { id: data.id, number: data.table_number, capacity: data.capacity }
  }
  const { data, error } = await supabase.from('dining_tables').insert(payload).select('*').single()
  if (error) throw error
  return { id: data.id, number: data.table_number, capacity: data.capacity }
}

export async function deleteTable(tenantId: string, id: string) {
  const supabase = getSupabase()
  const { error } = await supabase.from('dining_tables').update({ is_active: false }).eq('id', id).eq('tenant_id', tenantId)
  if (error) throw error
}

export async function fetchOrders(tenantId: string): Promise<Order[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_lines(*, order_line_addons(*))')
    .eq('tenant_id', tenantId)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data || []).map((row: Record<string, unknown>) => {
    const linesRaw = Array.isArray(row.order_lines) ? row.order_lines as Array<Record<string, unknown>> : []
    const lines: OrderLine[] = linesRaw
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map(line => {
        const addOnsRaw = Array.isArray(line.order_line_addons) ? line.order_line_addons as Array<Record<string, unknown>> : []
        return {
          id: String(line.id),
          menuItemId: line.menu_item_id ? String(line.menu_item_id) : null,
          name: String(line.name ?? ''),
          qty: Number(line.qty ?? 1),
          unitPrice: Number(line.unit_price ?? 0),
          addOns: addOnsRaw.map(a => ({
            id: String(a.id),
            name: String(a.name ?? ''),
            price: Number(a.price ?? 0),
            menuItemId: a.menu_item_id ? String(a.menu_item_id) : null,
          })),
        }
      })
    const time = String(row.order_time ?? '').slice(0, 5)
    return {
      id: String(row.order_number ?? row.id),
      clientName: String(row.client_name ?? 'Walk-in guest'),
      tableNumber: Number(row.table_number ?? 1),
      status: orderStatusFromDb(String(row.status ?? 'new')),
      lines,
      total: Number(row.total_amount ?? 0),
      time,
      date: String(row.order_date ?? ''),
      _dbId: String(row.id),
    } as Order & { _dbId?: string }
  })
}

/** Map display order id (#1048) back to DB uuid via fetch cache helper */
export async function saveOrder(tenantId: string, order: Order, dbId?: string | null): Promise<Order> {
  const supabase = getSupabase()
  const total = order.lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const orderNumber = order.id || `#${Date.now().toString().slice(-4)}`
  const time = order.time.includes(':') ? (order.time.length === 5 ? `${order.time}:00` : order.time) : '12:00:00'

  let orderDbId = dbId || null
  if (!orderDbId && order.id) {
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('order_number', order.id)
      .maybeSingle()
    orderDbId = existing?.id ?? null
  }

  const orderPayload = {
    tenant_id: tenantId,
    order_number: orderNumber,
    client_name: order.clientName || 'Walk-in guest',
    table_number: order.tableNumber,
    status: orderStatusToDb(order.status),
    order_date: order.date,
    order_time: time,
    total_amount: total,
  }

  if (orderDbId) {
    const { error } = await supabase.from('orders').update(orderPayload).eq('id', orderDbId).eq('tenant_id', tenantId)
    if (error) throw error
    await supabase.from('order_lines').delete().eq('order_id', orderDbId)
  } else {
    const { data, error } = await supabase.from('orders').insert(orderPayload).select('id').single()
    if (error) throw error
    orderDbId = data.id
  }

  for (const [index, line] of order.lines.entries()) {
    const addOnSum = line.addOns.reduce((s, a) => s + (Number(a.price) || 0), 0)
    const { data: lineRow, error: lineError } = await supabase
      .from('order_lines')
      .insert({
        tenant_id: tenantId,
        order_id: orderDbId,
        menu_item_id: line.menuItemId,
        name: line.name,
        qty: line.qty,
        unit_price: line.unitPrice,
        line_total: Number(line.qty) * (Number(line.unitPrice) + addOnSum),
        sort_order: index,
      })
      .select('id')
      .single()
    if (lineError) throw lineError

    if (line.addOns.length) {
      const { error: addOnError } = await supabase.from('order_line_addons').insert(
        line.addOns.map(a => ({
          tenant_id: tenantId,
          order_line_id: lineRow.id,
          menu_item_id: a.menuItemId ?? null,
          name: a.name,
          price: a.price,
        })),
      )
      if (addOnError) throw addOnError
    }
  }

  return { ...order, id: orderNumber, total }
}

export async function updateOrderStatus(tenantId: string, orderNumber: string, status: Order['status']) {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('orders')
    .update({ status: orderStatusToDb(status) })
    .eq('tenant_id', tenantId)
    .eq('order_number', orderNumber)
  if (error) throw error
}

export async function deleteOrder(tenantId: string, orderNumber: string) {
  const supabase = getSupabase()
  const { error } = await supabase.from('orders').delete().eq('tenant_id', tenantId).eq('order_number', orderNumber)
  if (error) throw error
}

export async function fetchExpenseCategoryMap(tenantId: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, tenant_id')
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
  if (error) throw error
  const byName = new Map<string, string>()
  for (const row of data || []) {
    if (!byName.has(row.name) || row.tenant_id === tenantId) byName.set(row.name, row.id)
  }
  return byName
}

export async function fetchExpenses(tenantId: string): Promise<Expense[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('expenses')
    .select('*, expense_categories(name), expense_lines(*)')
    .eq('tenant_id', tenantId)
    .order('expense_date', { ascending: false })
  if (error) throw error

  return (data || []).map((row: Record<string, unknown>) => {
    const cat = row.expense_categories as { name?: string } | null
    const linesRaw = Array.isArray(row.expense_lines) ? row.expense_lines as Array<Record<string, unknown>> : []
    return {
      id: String(row.id),
      date: String(row.expense_date ?? ''),
      category: String(cat?.name ?? ''),
      categoryId: String(row.category_id ?? ''),
      lines: linesRaw
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map(line => ({
          id: String(line.id),
          description: String(line.description ?? ''),
          qty: Number(line.qty ?? 1),
          amount: Number(line.unit_amount ?? 0),
        })),
    }
  })
}

export async function saveExpense(tenantId: string, expense: Expense, categoryId: string): Promise<Expense> {
  const supabase = getSupabase()
  const total = expense.lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.amount) || 0), 0)
  const payload = {
    tenant_id: tenantId,
    expense_date: expense.date,
    category_id: categoryId,
    total_amount: total,
  }

  let expenseId = expense.id || null
  if (expenseId) {
    const { error } = await supabase.from('expenses').update(payload).eq('id', expenseId).eq('tenant_id', tenantId)
    if (error) throw error
    await supabase.from('expense_lines').delete().eq('expense_id', expenseId)
  } else {
    const { data, error } = await supabase.from('expenses').insert(payload).select('id').single()
    if (error) throw error
    expenseId = data.id
  }

  if (expense.lines.length) {
    const { error } = await supabase.from('expense_lines').insert(
      expense.lines.map((line, index) => ({
        tenant_id: tenantId,
        expense_id: expenseId!,
        description: line.description,
        qty: line.qty,
        unit_amount: line.amount,
        sort_order: index,
      })),
    )
    if (error) throw error
  }

  return { ...expense, id: expenseId!, categoryId }
}

export async function deleteExpense(tenantId: string, id: string) {
  const supabase = getSupabase()
  const { error } = await supabase.from('expenses').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) throw error
}

export async function loadWorkspace(userId: string) {
  const { tenantId, tenant } = await resolveTenantId(userId)
  const [categories, menu, tables, orders, expenses, expenseCategories] = await Promise.all([
    fetchCategories(tenantId),
    fetchMenu(tenantId),
    fetchTables(tenantId),
    fetchOrders(tenantId),
    fetchExpenses(tenantId),
    fetchExpenseCategoryMap(tenantId),
  ])
  return {
    tenantId,
    company: companyFromTenant(tenant),
    categories,
    menu,
    tables,
    orders,
    expenses,
    expenseCategories,
  }
}
