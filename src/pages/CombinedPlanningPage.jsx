// ─── CombinedPlanningPage — Planejamento e Lançamentos na mesma tela (abas) ──
import { useState } from 'react'
import TransactionsPage from './TransactionsPage'
import BudgetPage from './BudgetPage'

export default function CombinedPlanningPage() {
  const [activeTab, setActiveTab] = useState('transactions')

  return (
    <div>
      <div className="flex border-b border-gray-800">
        {[['transactions', 'Lançamentos'], ['budget', 'Planejamento']].map(([tab, label]) => (
          <button
            key={tab}
            className={`py-2 px-4 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {activeTab === 'transactions' ? <TransactionsPage /> : <BudgetPage />}
      </div>
    </div>
  )
}
