import { supabase } from './supabase'

async function invoke(fnName, body = {}) {
  const { data, error } = await supabase.functions.invoke(fnName, { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export const pluggyConnectToken = () => invoke('pluggy-connect-token')
export const pluggyCreateItem = (itemId) => invoke('pluggy-create-item', { itemId })
export const pluggyListItems = () => invoke('pluggy-list-items')
export const pluggyDeleteItem = (itemId) => invoke('pluggy-delete-item', { itemId })
export const pluggySync = (itemId) => invoke('pluggy-sync', { itemId })
