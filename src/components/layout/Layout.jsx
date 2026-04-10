import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LayoutDashboard, Receipt, Bell, Target, PieChart, MessageCircle, Settings, LogOut, DollarSign, Menu, X } from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: Receipt,         label: 'Lançamentos' },
  { to: '/budget',       icon: PieChart,        label: 'Planejamento' },
  { to: '/bills',        icon: Bell,            label: 'Lembretes' },
  { to: '/goals',        icon: Target,          label: 'Metas' },
  { to: '/chat',         icon: MessageCircle,   label: 'Assistente IA' },
  { to: '/settings',     icon: Settings,        label: 'Configurações' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 flex-1">
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`
          }>
          <Icon size={18} /><span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden md:flex flex-col w-60 bg-gray-900 border-r border-gray-800 p-4">
        <div className="flex items-center gap-3 px-1 mb-8">
          <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
            <DollarSign className="text-emerald-400" size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">FinançasFamília</p>
            <p className="text-xs text-gray-500">{profile?.full_name?.split(' ')[0] || 'Usuário'}</p>
          </div>
        </div>
        <NavLinks />
        <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all mt-2">
          <LogOut size={18}/> Sair
        </button>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="text-emerald-400" size={20}/>
          <span className="font-bold text-white text-sm">FinançasFamília</span>
        </div>
        <button onClick={() => setMobileOpen(s => !s)} className="text-gray-400 hover:text-white">
          {mobileOpen ? <X size={22}/> : <Menu size={22}/>}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}>
          <div className="w-64 h-full bg-gray-900 border-r border-gray-800 p-4 pt-16 flex flex-col" onClick={e => e.stopPropagation()}>
            <NavLinks />
            <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 mt-2">
              <LogOut size={18}/> Sair
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
