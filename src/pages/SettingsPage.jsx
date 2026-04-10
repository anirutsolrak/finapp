import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Save, User, Mail, Bell, Shield } from 'lucide-react'

export default function SettingsPage() {
  const { user, profile, fetchProfile } = useAuth()
  const [form, setForm] = useState({ full_name: '', notify_email: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
    </div>
  )
}
