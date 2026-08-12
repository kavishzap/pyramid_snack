export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          owner_id: string
          slug: string
          name: string
          address: string
          phone: string
          email: string
          brn: string
          vat_registered: boolean
          vat_number: string
          logo_url: string
          currency_code: string
          vat_rate: number
          corporate_tax_rate: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['tenants']['Row']> & {
          owner_id: string
          slug: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['tenants']['Row']>
      }
      categories: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          description?: string
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['categories']['Row']>
      }
      menu_items: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          name: string
          description: string
          allow_add_on: boolean
          selling_price: number
          manufactured_price: number
          available_day: boolean
          available_night: boolean
          available_happy_hour: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          name: string
          category_id?: string | null
          description?: string
          allow_add_on?: boolean
          selling_price?: number
          manufactured_price?: number
          available_day?: boolean
          available_night?: boolean
          available_happy_hour?: boolean
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['menu_items']['Row']>
      }
      dining_tables: {
        Row: {
          id: string
          tenant_id: string
          table_number: number
          capacity: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          table_number: number
          capacity?: number
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['dining_tables']['Row']>
      }
      orders: {
        Row: {
          id: string
          tenant_id: string
          order_number: string
          client_name: string
          table_number: number
          dining_table_id: string | null
          status: 'new' | 'completed' | 'cancelled'
          order_date: string
          order_time: string
          total_amount: number
          notes: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          order_number: string
          client_name?: string
          table_number: number
          dining_table_id?: string | null
          status?: 'new' | 'completed' | 'cancelled'
          order_date?: string
          order_time?: string
          total_amount?: number
          notes?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['orders']['Row']>
      }
      order_lines: {
        Row: {
          id: string
          tenant_id: string
          order_id: string
          menu_item_id: string | null
          name: string
          qty: number
          unit_price: number
          line_total: number
          sort_order: number
          created_at: string
        }
        Insert: {
          tenant_id: string
          order_id: string
          name: string
          menu_item_id?: string | null
          qty?: number
          unit_price?: number
          line_total?: number
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['order_lines']['Row']>
      }
      order_line_addons: {
        Row: {
          id: string
          tenant_id: string
          order_line_id: string
          menu_item_id: string | null
          name: string
          price: number
          created_at: string
        }
        Insert: {
          tenant_id: string
          order_line_id: string
          name: string
          menu_item_id?: string | null
          price?: number
        }
        Update: Partial<Database['public']['Tables']['order_line_addons']['Row']>
      }
      expense_categories: {
        Row: {
          id: string
          tenant_id: string | null
          name: string
          bucket: 'cogs' | 'distribution' | 'admin' | 'other'
          is_active: boolean
          created_at: string
        }
        Insert: {
          name: string
          tenant_id?: string | null
          bucket?: 'cogs' | 'distribution' | 'admin' | 'other'
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['expense_categories']['Row']>
      }
      expenses: {
        Row: {
          id: string
          tenant_id: string
          expense_date: string
          category_id: string
          notes: string
          total_amount: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          tenant_id: string
          expense_date: string
          category_id: string
          notes?: string
          total_amount?: number
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['expenses']['Row']>
      }
      expense_lines: {
        Row: {
          id: string
          tenant_id: string
          expense_id: string
          description: string
          qty: number
          unit_amount: number
          line_total: number
          sort_order: number
          created_at: string
        }
        Insert: {
          tenant_id: string
          expense_id: string
          description: string
          qty?: number
          unit_amount?: number
          sort_order?: number
        }
        Update: Partial<Database['public']['Tables']['expense_lines']['Row']>
      }
    }
    Views: Record<string, never>
    Functions: {
      ensure_my_restaurant: {
        Args: Record<string, never>
        Returns: Json
      }
      user_tenant_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
    }
    Enums: {
      order_status: 'new' | 'completed' | 'cancelled'
      expense_bucket: 'cogs' | 'distribution' | 'admin' | 'other'
    }
  }
}
