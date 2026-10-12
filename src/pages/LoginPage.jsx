// ─── LoginPage — entrada/cadastro (e-mail+senha via Supabase Auth) ───────────
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { DollarSign, LogIn, UserPlus, Eye, EyeOff, Mail } from 'lucide-react'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    if (mode === 'login') {
      const { error: err } = await signIn(form.email, form.password)
      if (err) setError(translateError(err.message))
    } else {
      const result = await signUp(form.email, form.password, form.name)
      if (result.error) setError(translateError(result.error.message))
      else if (result.needsConfirmation) setInfo(result.message)
    }
    setLoading(false)
  }

  function translateError(msg) {
    if (msg?.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
    if (msg?.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
    if (msg?.includes('User already registered')) return 'E-mail já cadastrado. Faça login.'
    if (msg?.includes('Database error')) return 'Erro no banco de dados. Tente novamente em alguns segundos.'
    if (msg?.includes('Password should be')) return 'A senha deve ter pelo menos 6 caracteres.'
    return msg
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-3 border border-emerald-500/30">
            <DollarSign className="text-emerald-400" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">FinançasFamília</h1>
          <p className="text-gray-500 text-sm mt-1">Controle financeiro inteligente</p>
        </div>

        <div className="card">
          <div className="flex bg-gray-800 rounded-xl p-1 mb-6">
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setInfo('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-emerald-500 text-onaccent' : 'text-gray-400 hover:text-gray-200'}`}>
                {m === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Nome completo</label>
                <input className="input" placeholder="Seu nome" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
            )}
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <input className="input pr-10" type={showPwd ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
                <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
            )}

            {info && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
                <Mail size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-emerald-400 text-sm">{info}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading
                ? <div className="w-4 h-4 border-2 border-onaccent border-t-transparent rounded-full animate-spin" />
                : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-gray-500 text-xs mt-4">
              Primeiro acesso?{' '}
              <button onClick={() => setMode('register')} className="text-emerald-400 hover:text-emerald-300">Cadastre-se</button>
            </p>
          )}

          {mode === 'register' && (
            <div className="mt-4 bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-400">
                💡 <strong className="text-gray-300">Dica:</strong> Se tiver erro de "confirmação de e-mail", acesse o Supabase Dashboard → Authentication → Settings e desative <em>"Enable email confirmations"</em>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
