import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Save, Key, User, Mail, Bell } from 'lucide-react'

export default function SettingsPage() {
  const { user, profile, fetchProfile } = useAuth()
  const [form, setForm] = useState({ full_name: '', notify_email: '' })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name || '', notify_email: profile.notify_email || '' })
    const k = localStorage.getItem('claude_api_key') || ''
    setApiKey(k)
  }, [profile])

  async function saveProfile() {
    setSaving(true)
    await supabase.from('profiles').update(form).eq('id', user.id)
    localStorage.setItem('claude_api_key', apiKey)
    await fetchProfile(user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-white">Configurações</h1>

      {/* Profile */}
      <div className="card space-y-4">
        <p className="font-semibold text-white flex items-center gap-2"><User size={16}/> Perfil</p>
        <div>
          <label className="label">Nome completo</label>
          <input className="input" value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} />
        </div>
        <div>
          <label className="label">E-mail da conta</label>
          <input className="input" value={user?.email || ''} disabled className="input opacity-50 cursor-not-allowed" />
        </div>
        <div>
          <label className="label flex items-center gap-1"><Mail size={11}/> E-mail para alertas</label>
          <input className="input" type="email" placeholder="email@gmail.com" value={form.notify_email} onChange={e => setForm(f => ({...f, notify_email: e.target.value}))} />
          <p className="text-xs text-gray-500 mt-1">Receberá alertas de contas a vencer por e-mail</p>
        </div>
      </div>

      {/* Claude API Key */}
      <div className="card space-y-4">
        <p className="font-semibold text-white flex items-center gap-2"><Key size={16}/> API do Claude (Assistente IA)</p>
        <div>
          <label className="label">Sua Claude API Key</label>
          <input className="input font-mono text-sm" type="password" placeholder="sk-ant-api03-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">
            Obtenha em{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">console.anthropic.com</a>
            {' '}→ API Keys. Salva apenas no seu dispositivo.
          </p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <p className="text-xs text-amber-400">⚠️ A chave é armazenada apenas localmente (localStorage). Nunca é enviada ao servidor.</p>
        </div>
      </div>

      {/* Notifications info */}
      <div className="card space-y-2">
        <p className="font-semibold text-white flex items-center gap-2"><Bell size={16}/> Notificações</p>
        <p className="text-xs text-gray-400">Para ativar push notifications no celular, instale o app como PWA:</p>
        <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
          <li>Abra o app no Chrome/Safari do celular</li>
          <li>Toque em "Compartilhar" ou menu do navegador</li>
          <li>Selecione "Adicionar à tela inicial"</li>
        </ol>
      </div>

      <button onClick={saveProfile} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
        <Save size={16}/>
        {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar configurações'}
      </button>
    </div>
  )
}
