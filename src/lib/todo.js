import { supabase } from './supabase'

export const getTodoItems = () =>
  supabase.schema('todo').from('items').select('*').order('category').order('order_index')

export const markTodoImported = (id, transactionId) =>
  supabase.schema('todo').from('items')
    .update({ imported_at: new Date().toISOString(), finapp_transaction_id: transactionId })
    .eq('id', id)
