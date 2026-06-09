// ═══════════════════════════════════════════════════════════════════════════
// App — raiz da aplicação: providers globais + tabela de rotas.
// Tudo que é "estado de sessão" (auth, ciclo/período, seleção) é injetado aqui.
// ═══════════════════════════════════════════════════════════════════════════
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DateRangeProvider } from './contexts/DateRangeContext'
import { SelectionProvider } from './contexts/SelectionContext'
import Layout from './components/layout/Layout'
import InstallPrompt from './components/InstallPrompt'
import UpdatePrompt from './components/UpdatePrompt'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import GoalsPage from './pages/GoalsPage'
import BudgetPage from './pages/BudgetPage'
import ChatPage from './pages/ChatPage'
import SettingsPage from './pages/SettingsPage'
import ListaPage from './pages/ListaPage'

// ─── Guarda de rota: exige usuário logado ───────────────────────────────────
function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/></div>
  return user ? children : <Navigate to="/login" replace />
}

// ─── Tabela de rotas ────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="lista" element={<ListaPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

// ─── Raiz: ordem dos providers importa (Auth → DateRange → Selection) ───────
export default function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
      <UpdatePrompt />
      <AuthProvider>
        <DateRangeProvider>
          <SelectionProvider>
            <AppRoutes />
          </SelectionProvider>
        </DateRangeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
