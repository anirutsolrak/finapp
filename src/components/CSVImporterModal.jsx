// ═══════════════════════════════════════════════════════════════════════════
// CSVImporterModal — importação de extrato/fatura Nubank. Faz parse do CSV,
// deixa revisar (categoria, tipo, duplicatas) e grava as transações.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react'
import { X, Upload, FileText, AlertTriangle } from 'lucide-react'
import { parseExtrato, parseFatura } from '../lib/nubankCSV'
import { addTransaction, getCategories } from '../lib/db'
import { supabase } from '../lib/supabase'

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function detectTargetAccount(accounts, csvType) {
  const active = (accounts || []).filter(a => a.is_active !== false)
  if (csvType === 'extrato') {
    return active.find(a => /^nubank conta/i.test(a.name))
      || active.find(a => a.type === 'bank')
      || null
  }
  if (csvType === 'fatura') {
    return active.find(a => /^nubank (cr|cred)/i.test(a.name))
      || active.find(a => a.type === 'credit' && a.subtype === 'credit_card')
      || null
  }
  return null
}

export default function CSVImporterModal({ open, accounts, userId, onClose, onSaved }) {
  const [step, setStep] = useState(1)
  const [csvType, setCsvType] = useState('extrato')
  const [file, setFile] = useState(null)
  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState([])
  const [parseErrors, setParseErrors] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importStatus, setImportStatus] = useState(null)

  const targetAccount = useMemo(() => {
    return accounts.find(a => a.id === accountId)
  }, [accounts, accountId])

  const reset = () => {
    setStep(1); setCsvType('extrato'); setFile(null); setAccountId('')
    setRows([]); setParseErrors([]); setLoading(false)
    setError(''); setImportStatus(null)
  }

  if (!open) return null

  async function handleNext() {
    setError('')
    if (!file) return setError('Selecione um arquivo CSV.')

    setLoading(true)
    const text = await file.text()
    const parsed = csvType === 'extrato' ? parseExtrato(text) : parseFatura(text)
    if (parsed.rows.length === 0) {
      setLoading(false)
      setParseErrors(parsed.errors)
      return setError('Nenhuma linha válida no CSV.')
    }

    const detected = detectTargetAccount(accounts, csvType)
    const useAccountId = accountId || detected?.id || ''
    if (!accountId && detected) setAccountId(detected.id)

    const { data: cats } = await getCategories()
    setCategories(cats || [])

    const uniqDates = [...new Set(parsed.rows.map(r => r.date))]
    let existing = []
    if (useAccountId && uniqDates.length > 0) {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, amount, account_id')
        .in('date', uniqDates)
        .eq('account_id', useAccountId)
      existing = data || []
    }

    const isDup = (r) => existing.some(e =>
      e.date === r.date && Number(e.amount).toFixed(2) === Number(r.amount).toFixed(2)
    )

    const enriched = parsed.rows.map(r => ({
      ...r,
      selected: !isDup(r),
      isDuplicate: isDup(r),
      categoryId: null,
    }))

    setRows(enriched)
    setParseErrors(parsed.errors)
    setLoading(false)
    setStep(2)
  }

  function updateRow(index, patch) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  async function handleConfirm() {
    setError('')
    const selected = rows.filter(r => r.selected)
    if (selected.length === 0) return setError('Nenhuma linha selecionada.')
    if (!targetAccount) return setError('Escolha a conta de destino.')

    setLoading(true)
    setImportStatus({ done: 0, total: selected.length })
    let done = 0
    for (const r of selected) {
      const payload = {
        user_id: userId,
        type: r.type,
        amount: r.amount,
        date: r.date,
        description: r.description,
        account_id: targetAccount.id,
        category_id: r.categoryId || null,
        payment_source: csvType === 'fatura' ? 'credit' : 'fixed_income',
        is_paid: true,
      }
      const { error: err } = await addTransaction(payload)
      if (err) {
        setLoading(false)
        setError(`Falha na linha ${done + 1}: ${err.message || err}`)
        return
      }
      done++
      setImportStatus({ done, total: selected.length })
    }
    setLoading(false)
    onSaved?.()
    reset()
    onClose()
  }

  function handleClose() {
    if (loading) return
    reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-white flex items-center gap-2">
            <Upload size={18}/> Importar CSV NuBank
          </h2>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800" aria-label="Fechar">
            <X size={18}/>
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="label">Tipo de CSV</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCsvType('extrato')}
                  className={`p-3 rounded-lg border ${csvType === 'extrato' ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 bg-gray-800/40'} text-left`}
                >
                  <p className="text-sm font-semibold text-white">Extrato Conta Corrente</p>
                  <p className="text-xs text-gray-500">Data, Valor, Identificador, Descrição</p>
                </button>
                <button
                  onClick={() => setCsvType('fatura')}
                  className={`p-3 rounded-lg border ${csvType === 'fatura' ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 bg-gray-800/40'} text-left`}
                >
                  <p className="text-sm font-semibold text-white">Fatura Cartão</p>
                  <p className="text-xs text-gray-500">date, title, amount</p>
                </button>
              </div>
            </div>

            <div>
              <label className="label">Arquivo CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/20 file:text-emerald-400 hover:file:bg-emerald-500/30"
              />
              {file && <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><FileText size={11}/> {file.name}</p>}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={handleClose} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={handleNext} disabled={loading || !file} className="btn-primary flex-1">
                {loading ? 'Processando...' : 'Próximo →'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {rows.length} linhas detectadas
              </p>
            </div>

            <div>
              <label className="label">Conta de destino</label>
              <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Selecione...</option>
                {accounts.filter(a => a.is_active !== false).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {parseErrors.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-xs text-amber-400">
                <p className="flex items-center gap-1 font-semibold mb-1"><AlertTriangle size={11}/> {parseErrors.length} linha(s) ignorada(s)</p>
                {parseErrors.slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
                {parseErrors.length > 3 && <p>... e mais {parseErrors.length - 3}</p>}
              </div>
            )}

            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left">Data</th>
                      <th className="p-2 text-left">Descrição</th>
                      <th className="p-2 text-right">Valor</th>
                      <th className="p-2 text-left">Tipo</th>
                      <th className="p-2 text-left">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`border-t border-gray-800 ${r.isDuplicate ? 'bg-amber-500/5' : ''}`}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={e => updateRow(i, { selected: e.target.checked })}
                            className="accent-emerald-500 w-4 h-4"
                          />
                        </td>
                        <td className="p-2 text-gray-300">{r.date}</td>
                        <td className="p-2 text-gray-300 truncate max-w-[160px]" title={r.description}>
                          {r.description}
                          {r.isDuplicate && <span className="ml-1 text-amber-400" title="Possível duplicata">⚠</span>}
                        </td>
                        <td className="p-2 text-right text-gray-300">{fmt(r.amount)}</td>
                        <td className="p-2">
                          <select
                            value={r.type}
                            onChange={e => updateRow(i, { type: e.target.value })}
                            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-300"
                          >
                            <option value="income">Receita</option>
                            <option value="expense">Despesa</option>
                            <option value="investment">Invest.</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <select
                            value={r.categoryId || ''}
                            onChange={e => updateRow(i, { categoryId: e.target.value || null })}
                            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-300 max-w-[120px]"
                          >
                            <option value="">—</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              {rows.filter(r => r.selected).length} de {rows.length} selecionadas
            </p>

            {importStatus && (
              <p className="text-xs text-emerald-400">Importando {importStatus.done} de {importStatus.total}...</p>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(1)} disabled={loading} className="btn-ghost flex-1">← Voltar</button>
              <button
                onClick={handleConfirm}
                disabled={loading || rows.filter(r => r.selected).length === 0 || !accountId}
                className="btn-primary flex-1"
              >
                {loading ? 'Importando...' : `Importar ${rows.filter(r => r.selected).length} selecionadas`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
