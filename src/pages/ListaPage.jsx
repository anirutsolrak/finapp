// ═══════════════════════════════════════════════════════════════════════════
// ListaPage — lista de compras/tarefas (schema todo). Itens concluídos podem
// ser importados em lote como transações.
// Estrutura: helpers → ImportModal → página principal (no fim).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ShoppingCart, CheckSquare, Square, ChevronDown, ChevronRight,
  UploadCloud, AlertCircle, Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getTodoItems, markTodoImported } from '../lib/todo'
import { addTransaction } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { useDateRange } from '../contexts/DateRangeContext'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function itemStatus(item) {
  if (item.imported_at) return 'imported'
  if (item.done) return 'ready'
  return 'pending'
}

function ImportModal({ items, cycle, categories, userId, onClose, onDone }) {
  const defaultCategoryId = categories.find(c => c.type === 'variable')?.id
  const cycleEndDate = cycle?.end_date ?? null

  const [step, setStep] = useState(1)
  const [drafts, setDrafts] = useState(() =>
    items.map(item => ({
      item,
      date: item.done_at ? item.done_at.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      categoryId: defaultCategoryId,
      outOfPeriod: false,
    }))
  )
  const [customCats, setCustomCats] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setDate = (idx, date) => {
    setDrafts(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const outOfPeriod = cycleEndDate ? date > cycleEndDate : false
      return { ...d, date, outOfPeriod }
    }))
  }

  const setCategoryId = (idx, catId) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, categoryId: catId } : d))
  }

  const validDrafts = drafts.filter(d => !d.outOfPeriod)
  const invalidCount = drafts.filter(d => d.outOfPeriod).length
  const total = validDrafts.reduce((acc, d) => acc + Number(d.item.value ?? 0), 0)

  async function doImport() {
    setSaving(true)
    setError('')
    try {
      for (const draft of validDrafts) {
        const { data: tx, error: txErr } = await addTransaction({
          user_id: userId,
          description: draft.item.name,
          amount: draft.item.value ?? 0,
          type: 'expense',
          payment_source: 'fixed_income',
          date: draft.date,
          category_id: draft.categoryId,
          is_paid: true,
          notes: draft.item.notes ?? '',
        })
        if (txErr) throw new Error(txErr.message)
        if (!tx) throw new Error('Transação não retornada pelo banco')
        await markTodoImported(draft.item.id, tx.id)
      }
      onDone()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Importar para Lançamentos</h2>
          <span className="text-xs text-gray-500">Passo {step}/3</span>
        </div>

        {/* Passo 1 — Datas */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Confirme ou ajuste a data de pagamento de cada item. Itens fora do período atual ficam desabilitados.</p>
            {drafts.map((draft, i) => (
              <div key={draft.item.id} className={`rounded-xl p-3 space-y-2 ${draft.outOfPeriod ? 'bg-red-500/10 border border-red-500/30' : 'bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">{draft.item.name}</span>
                  <span className="text-sm text-gray-300 ml-2 shrink-0">{fmt(draft.item.value)}</span>
                </div>
                <input
                  type="date"
                  value={draft.date}
                  onChange={e => setDate(i, e.target.value)}
                  className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-emerald-500"
                />
                {draft.outOfPeriod && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Item do período {draft.date.slice(0, 7)} — ajuste a data ou importe no período correto
                  </p>
                )}
              </div>
            ))}
            {invalidCount > 0 && (
              <p className="text-xs text-amber-400">{invalidCount} item(s) fora do período serão ignorados nesta importação.</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button
                onClick={() => setStep(2)}
                disabled={validDrafts.length === 0}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Passo 2 — Categorias */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Deseja definir categoria específica para algum item? O padrão é "Variável".</p>
            <div className="flex gap-2">
              <button
                onClick={() => setCustomCats(false)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${!customCats ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-700 text-gray-400 hover:text-white'}`}
              >
                Usar padrão
              </button>
              <button
                onClick={() => setCustomCats(true)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${customCats ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-700 text-gray-400 hover:text-white'}`}
              >
                Definir por item
              </button>
            </div>
            {customCats && validDrafts.map((draft) => {
              const globalIdx = drafts.findIndex(d => d.item.id === draft.item.id)
              return (
                <div key={draft.item.id} className="flex items-center gap-2 bg-gray-800 rounded-xl p-3">
                  <span className="flex-1 text-sm text-white truncate">{draft.item.name}</span>
                  <select
                    value={draft.categoryId || ''}
                    onChange={e => setCategoryId(globalIdx, e.target.value)}
                    className="bg-gray-700 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-emerald-500"
                  >
                    {categories.filter(c => c.type !== 'income').map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              )
            })}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(1)} className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">Voltar</button>
              <button onClick={() => setStep(3)} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">Próximo</button>
            </div>
          </div>
        )}

        {/* Passo 3 — Confirmar */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-3 space-y-1">
              <p className="text-xs text-gray-400">Resumo da importação</p>
              <p className="text-sm text-white font-semibold">{validDrafts.length} item(s) · Total {fmt(total)}</p>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {validDrafts.map(draft => (
                <div key={draft.item.id} className="flex items-center justify-between text-xs text-gray-300 px-1 py-0.5">
                  <span className="truncate">{draft.item.name}</span>
                  <span className="ml-2 shrink-0 text-gray-400">{draft.date}</span>
                </div>
              ))}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(2)} className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">Voltar</button>
              <button
                onClick={doImport}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {saving ? 'Importando...' : 'Confirmar importação'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function ListaPage() {
  const { user } = useAuth()
  const { range, cycles } = useDateRange()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [cycle, setCycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [todoRes, catsRes] = await Promise.all([
        getTodoItems(),
        supabase.from('categories').select('*').order('sort_order'),
      ])
      setItems(todoRes.data || [])
      setCategories(catsRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Cycle deriva do range global (match exato com cycle existente).
  useEffect(() => {
    const c = (cycles || []).find(c =>
      c.start_date === range?.startDate && c.end_date === range?.endDate
    ) || null
    setCycle(c)
  }, [cycles, range])

  const grouped = useMemo(() => {
    const groups = {}
    for (const item of items) {
      const cat = item.category || 'Sem categoria'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }
    return groups
  }, [items])

  const readyItems = items.filter(i => i.done && !i.imported_at)
  const selectedItems = readyItems.filter(i => selected.has(i.id))

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const selectAll = () => setSelected(new Set(readyItems.map(i => i.id)))
  const clearSelect = () => setSelected(new Set())

  const toggleNotes = (id) => setExpandedNotes(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart size={20} className="text-emerald-400" />
            Lista de Compras
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {readyItems.length > 0
              ? `${readyItems.length} item(s) aguardando importação`
              : 'Todos os itens estão em dia'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <button onClick={clearSelect} className="text-xs text-gray-400 hover:text-white transition-colors">
                Limpar
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                <UploadCloud size={15} /> Importar ({selected.size})
              </button>
            </>
          ) : readyItems.length > 0 ? (
            <button onClick={selectAll} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
              Selecionar todos prontos
            </button>
          ) : null}
        </div>
      </div>

      {/* Groups */}
      {Object.entries(grouped).map(([cat, catItems]) => {
        const readyCount = catItems.filter(i => i.done && !i.imported_at).length
        return (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat}</h2>
              {readyCount > 0 && (
                <span className="text-[10px] text-amber-400">{readyCount} pronto(s)</span>
              )}
            </div>
            {catItems.map(item => {
              const status = itemStatus(item)
              const isReady = status === 'ready'
              const isImported = status === 'imported'
              const isExpanded = expandedNotes.has(item.id)
              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-3 border transition-all ${
                    isImported
                      ? 'bg-gray-800/40 border-gray-800 opacity-60'
                      : isReady && selected.has(item.id)
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-gray-800/80 border-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-3">

                    {/* Checkbox / status icon */}
                    <div className="mt-0.5 shrink-0">
                      {isReady && (
                        <button onClick={() => toggleSelect(item.id)} className="text-emerald-400">
                          {selected.has(item.id)
                            ? <CheckSquare size={18} />
                            : <Square size={18} className="text-gray-600" />}
                        </button>
                      )}
                      {isImported && <Check size={18} className="text-emerald-500" />}
                      {status === 'pending' && <Square size={18} className="text-gray-700" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${isImported ? 'line-through text-gray-500' : 'text-white'}`}>
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.value != null && (
                            <span className="text-sm text-emerald-400 font-semibold">{fmt(item.value)}</span>
                          )}
                          {isReady && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                              Aguardando
                            </span>
                          )}
                          {isImported && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">
                              Importado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes expandíveis */}
                      {item.notes && (
                        <div className="mt-1">
                          <button
                            onClick={() => toggleNotes(item.id)}
                            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Notas
                          </button>
                          {isExpanded && (
                            <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Data de importação */}
                      {isImported && item.imported_at && (
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          Importado em {format(parseISO(item.imported_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {items.length === 0 && (
        <div className="text-center py-20 text-gray-600">
          <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhum item na lista ainda</p>
        </div>
      )}

      {/* Import Modal */}
      {showModal && (
        <ImportModal
          items={selectedItems}
          cycle={cycle}
          categories={categories}
          userId={user?.id}
          onClose={() => setShowModal(false)}
          onDone={() => {
            setShowModal(false)
            setSelected(new Set())
            load()
          }}
        />
      )}
    </div>
  )
}
