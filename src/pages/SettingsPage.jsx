import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Save, User, Mail, Bell, Shield, Wallet, Plus, Edit2, EyeOff } from 'lucide-react'
import { useAccounts } from '../hooks/useData'
import { upsertAccount, deactivateAccount } from '../lib/db'

const ACCOUNT_TYPE_LABELS = {
  bank: 'Conta bancária',
  credit: 'Cartão / Crédito',
  envelope: 'Envelope virtual',
}

const PAYMENT_SOURCE_LABELS = {
  fixed_income: 'Renda fixa',
  variable_income: 'Renda variável',
  credit: 'Crédito',
  reserve: 'Reserva',
}

const EMPTY_ACCOUNT = {
  name: '',
  type: 'bank',
  subtype: '',
  default_payment_source: 'fixed_income',
  is_active: true,
  display_order: 0,
  notes: '',
  opening_balance: 0,
  credit_limit: 0,
}

function defaultPaymentSourceForType(type) {
  if (type === 'credit') return 'credit'
  if (type === 'envelope') return 'variable_income'
  return 'fixed_income'
}

function AccountModal({ initial, userId, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) return { ...EMPTY_ACCOUNT, ...initial }
    return EMPTY_ACCOUNT
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Quando muda type, atualiza default_payment_source automaticamente
      if (k === 'type') {
        next.default_payment_source = defaultPaymentSourceForType(v)
      }
      return next
    })
  }

  async function save() {
    setError('')
    if (!form.name.trim()) return setError('Informe um nome.')
    setSaving(true)
    const { categories, ...clean } = form
    const payload = {
      ...clean,
      user_id: userId,
      display_order: Number(form.display_order) || 0,
      opening_balance: Number(form.opening_balance) || 0,
      credit_limit: Number(form.credit_limit) || 0,
    }
    const { error: err } = await upsertAccount(payload)
    setSaving(false)
    if (err) return setError(err.message || 'Falha ao salvar conta.')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Nova'} conta</h2>

        <div>
          <label className="label">Nome</label>
          <input className="input" placeholder="Ex: NuBank Conta Corrente" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div>
          <label className="label">Tipo</label>
          <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Subtipo (opcional)</label>
          <input className="input" placeholder="Ex: checking, credit_card, loan, shared" value={form.subtype || ''} onChange={e => set('subtype', e.target.value)} />
        </div>

        <div>
          <label className="label">Fonte de pagamento padrão</label>
          <select className="input" value={form.default_payment_source} onChange={e => set('default_payment_source', e.target.value)}>
            {Object.entries(PAYMENT_SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">Preenchido automaticamente ao escolher essa conta no lançamento.</p>
        </div>

        {(form.type === 'bank' || form.type === 'envelope') && (
          <div>
            <label className="label">Saldo inicial</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.opening_balance}
              onChange={e => set('opening_balance', e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-gray-600 mt-1">Saldo da conta no momento em que você começou a usar o app. Saldo atual = inicial + entradas − saídas.</p>
          </div>
        )}

        {form.type === 'credit' && (
          <div>
            <label className="label">Limite</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.credit_limit}
              onChange={e => set('credit_limit', e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-gray-600 mt-1">Limite total. Use 0 se for empréstimo sem limite tradicional (ex: Biplay).</p>
          </div>
        )}

        <div>
          <label className="label">Notas (opcional)</label>
          <textarea className="input resize-none" rows={2} placeholder="Observações..." value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </div>

        <div>
          <label className="label">Ordem de exibição</label>
          <input type="number" className="input" value={form.display_order} onChange={e => set('display_order', e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="aactive" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="accent-emerald-500 w-4 h-4"/>
          <label htmlFor="aactive" className="text-sm text-gray-300">Ativa</label>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { user, profile, fetchProfile } = useAuth()
  const [form, setForm] = useState({ full_name: '', notify_email: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { accounts, refetch: refetchAccounts } = useAccounts()
  const [accountModal, setAccountModal] = useState(null)

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', notify_email: profile.notify_email || '' })
  }, [profile])

  async function saveProfile() {
    setSaving(true)
    await supabase.from('profiles').update(form).eq('id', user.id)
    await fetchProfile(user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  async function handleDeactivate(account) {
    if (!confirm(`Desativar "${account.name}"? As transações existentes mantêm o vínculo.`)) return
    await deactivateAccount(account.id)
    refetchAccounts()
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-white">Configurações</h1>

      {/* Perfil */}
      <div className="card space-y-4">
        <p className="font-semibold text-white flex items-center gap-2"><User size={16}/> Perfil</p>
        <div>
          <label className="label">Nome completo</label>
          <input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">E-mail da conta</label>
          <input className="input opacity-50 cursor-not-allowed" value={user?.email || ''} disabled />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Mail size={11}/> E-mail para alertas de vencimento</label>
          <input className="input" type="email" placeholder="email@gmail.com" value={form.notify_email} onChange={e => setForm(f => ({ ...f, notify_email: e.target.value }))} />
          <p className="text-xs text-gray-500 mt-1">Receberá e-mails automáticos de contas a vencer</p>
        </div>
      </div>

      {/* Contas */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-white flex items-center gap-2"><Wallet size={16}/> Contas</p>
          <button onClick={() => setAccountModal({})} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={14}/> Nova conta
          </button>
        </div>

        {accounts.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhuma conta cadastrada ainda. Crie a primeira pra começar a lançar transações.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between border-t border-gray-800 pt-2 first:border-0 first:pt-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.name}</p>
                  <p className="text-xs text-gray-500">{ACCOUNT_TYPE_LABELS[a.type] || a.type}{a.subtype ? ` · ${a.subtype}` : ''} · {PAYMENT_SOURCE_LABELS[a.default_payment_source] || '—'}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setAccountModal(a)} className="text-gray-600 hover:text-gray-400 p-1" title="Editar">
                    <Edit2 size={14}/>
                  </button>
                  <button onClick={() => handleDeactivate(a)} className="text-gray-600 hover:text-red-400 p-1" title="Desativar">
                    <EyeOff size={14}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PWA */}
      <div className="card space-y-2">
        <p className="font-semibold text-white flex items-center gap-2"><Bell size={16}/> Instalar no celular (PWA)</p>
        <p className="text-xs text-gray-400">Para receber notificações e usar offline:</p>
        <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
          <li>Abra o app no Chrome (Android) ou Safari (iPhone)</li>
          <li>Toque em Compartilhar ou menu do navegador</li>
          <li>Selecione "Adicionar à tela inicial"</li>
        </ol>
      </div>

      {/* Segurança */}
      <div className="card space-y-2">
        <p className="font-semibold text-white flex items-center gap-2"><Shield size={16}/> Segurança</p>
        <p className="text-xs text-gray-400">A IA é processada via servidor seguro (Supabase Edge Functions). Nenhuma chave de API fica armazenada no seu dispositivo.</p>
      </div>

      <button onClick={saveProfile} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        <Save size={16}/>
        {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar configurações'}
      </button>

      {accountModal !== null && (
        <AccountModal
          initial={accountModal}
          userId={user?.id}
          onClose={() => setAccountModal(null)}
          onSaved={refetchAccounts}
        />
      )}
    </div>
  )
}
