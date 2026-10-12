// ═══════════════════════════════════════════════════════════════════════════
// App — raiz da aplicação: providers globais + tabela de rotas.
// Tudo que é "estado de sessão" (auth, seleção) é injetado aqui.
// ═══════════════════════════════════════════════════════════════════════════
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SelectionProvider } from './contexts/SelectionContext'
import Layout from './components/layout/Layout'
import InstallPrompt from './components/InstallPrompt'
import UpdatePrompt from './components/UpdatePrompt'
import LoginPage from './pages/LoginPage'
import PlanningPage from './pages/PlanningPage'
import GoalsPage from './pages/GoalsPage'
import SettingsPage from './pages/SettingsPage'

// ─── Guarda de rota: exige usuário logado ───────────────────────────────────
function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div>
  return user ? children : <Navigate to="/login" replace />
}

// ─── Tabela de rotas ────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<PlanningPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      {/* Rotas removidas (/budget, /lista, /chat...) salvas no celular caem na tela principal */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ─── Raiz ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
      <UpdatePrompt />
      <AuthProvider>
        <SelectionProvider>
          <AppRoutes />
        </SelectionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
