// ═══════════════════════════════════════════════════════════════════════════
// Layout — casca autenticada: navegação (sidebar desktop / bottom-nav mobile)
// e <Outlet/> das rotas filhas.
// ═══════════════════════════════════════════════════════════════════════════
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSelection } from '../../contexts/SelectionContext'
import { Receipt, Target, Settings, LogOut, DollarSign } from 'lucide-react'

// Mesma lista na sidebar (desktop) e na barra inferior (mobile).
const NAV = [
  { to: '/',         icon: Receipt,  label: 'Planejamento' },
  { to: '/goals',    icon: Target,   label: 'Metas' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { active: selectionActive } = useSelection()

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 bg-gray-900 border-r border-gray-800 p-4">
        <div className="flex items-center gap-3 px-1 mb-8">
          <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center border border-brand-500/30">
            <DollarSign className="text-brand-400" size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">FinançasFamília</p>
            <p className="text-xs text-gray-500">{profile?.full_name?.split(' ')[0] || 'Usuário'}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                  ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`
              }>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all mt-2">
          <LogOut size={18}/> Sair
        </button>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-gray-900 border-t border-gray-800${selectionActive ? ' hidden' : ''}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  isActive ? 'text-brand-400' : 'text-gray-500'
                }`
              }>
              <Icon size={22} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

    </div>
  )
}
