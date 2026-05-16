# Onda 6 — CSV importer NuBank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importer multi-step pra extrato Conta Corrente e fatura Cartão NuBank, com categorização automática via Claude e dedup soft por `date + amount + account_id`.

**Architecture:** 3 novos arquivos: parser CSV (`nubankCSV.js`), wrapper IA (`aiCategorize.js`), modal multi-step (`CSVImporterModal.jsx`). Reusa `addTransaction` (db.js) e `sendToClaudeAPI` (claude.js) existentes — não modifica Edge Function. Botão "Importar CSV" no header de `/transactions`.

**Tech Stack:** React 19, Vite, Supabase, date-fns, Tailwind, lucide-react, Claude (via Edge Function existente).

**Testing:** Manual smoke test — projeto não tem suite automatizada. Cada task tem passos no browser.

---

## File Structure

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `src/lib/nubankCSV.js` | `parseExtrato(text)` + `parseFatura(text)` retornam `{ rows, errors }` | **NOVO** |
| `src/lib/aiCategorize.js` | `categorizeBatch(rows, categories)` chama claude e retorna mapa desc→category_id | **NOVO** |
| `src/components/CSVImporterModal.jsx` | Modal multi-step (upload → preview → confirm) | **NOVO** |
| `src/pages/TransactionsPage.jsx` | Botão "Importar CSV" no header + render do modal | Modificado |
| `INVENTARIO.md` | Histórico + features | Modificado |

---

## Task 1: Parser CSV NuBank

**Files:**
- Create: `src/lib/nubankCSV.js`

- [ ] **Step 1: Criar o parser**

Conteúdo de `src/lib/nubankCSV.js`:

```js
// Parser dos CSVs do NuBank.
// - parseExtrato: extrato da Conta Corrente (formato: Data,Valor,Identificador,Descrição)
// - parseFatura: fatura do Cartão (formato: date,title,amount)
//
// Ambos retornam { rows: ParsedRow[], errors: string[] }
//
// ParsedRow:
//   {
//     date: 'YYYY-MM-DD',
//     amount: number (sempre positivo),
//     description: string,
//     type: 'income' | 'expense',
//     raw: object  // linha original pra debug
//   }

// Split CSV simples respeitando aspas. Suficiente pro formato NuBank.
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

function parseDateBR(s) {
  // DD/MM/YYYY → YYYY-MM-DD
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseDateISO(s) {
  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function parseAmount(s) {
  // Aceita "-50,00", "-50.00", "1.234,56" (BR), "1234.56" (US)
  if (s == null) return NaN
  let clean = String(s).trim().replace(/\s/g, '')
  // Se tem vírgula E ponto, ponto é separador de milhar (BR): "1.234,56"
  // Se só tem vírgula: "1234,56" → trocar vírgula por ponto
  // Se só tem ponto: "1234.56" → manter
  const hasComma = clean.includes(',')
  const hasDot = clean.includes('.')
  if (hasComma && hasDot) {
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    clean = clean.replace(',', '.')
  }
  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
}

function parseLines(text) {
  const lines = stripBom(text).split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { header: [], dataLines: [] }
  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase())
  return { header, dataLines: lines.slice(1) }
}

export function parseExtrato(text) {
  const { header, dataLines } = parseLines(text)
  const idxData = header.findIndex(h => h === 'data')
  const idxValor = header.findIndex(h => h === 'valor')
  const idxDesc = header.findIndex(h => h === 'descrição' || h === 'descricao')
  if (idxData < 0 || idxValor < 0 || idxDesc < 0) {
    return { rows: [], errors: [`Header não reconhecido. Esperado: Data, Valor, Descrição. Encontrado: ${header.join(', ')}`] }
  }

  const rows = []
  const errors = []
  dataLines.forEach((line, i) => {
    const cols = splitCsvLine(line)
    const dateStr = cols[idxData]
    const valStr = cols[idxValor]
    const desc = cols[idxDesc]
    const date = parseDateBR(dateStr) || parseDateISO(dateStr)
    const valor = parseAmount(valStr)
    if (!date || Number.isNaN(valor)) {
      errors.push(`Linha ${i + 2}: data ou valor inválido (${dateStr}, ${valStr})`)
      return
    }
    rows.push({
      date,
      amount: Math.abs(valor),
      description: desc || '',
      type: valor < 0 ? 'expense' : 'income',
      raw: { dateStr, valStr, desc },
    })
  })
  return { rows, errors }
}

export function parseFatura(text) {
  const { header, dataLines } = parseLines(text)
  const idxDate = header.findIndex(h => h === 'date' || h === 'data')
  const idxTitle = header.findIndex(h => h === 'title' || h === 'descrição' || h === 'descricao')
  const idxAmount = header.findIndex(h => h === 'amount' || h === 'valor')
  if (idxDate < 0 || idxTitle < 0 || idxAmount < 0) {
    return { rows: [], errors: [`Header não reconhecido. Esperado: date, title, amount. Encontrado: ${header.join(', ')}`] }
  }

  const rows = []
  const errors = []
  dataLines.forEach((line, i) => {
    const cols = splitCsvLine(line)
    const dateStr = cols[idxDate]
    const valStr = cols[idxAmount]
    const title = cols[idxTitle]
    const date = parseDateISO(dateStr) || parseDateBR(dateStr)
    const valor = parseAmount(valStr)
    if (!date || Number.isNaN(valor)) {
      errors.push(`Linha ${i + 2}: data ou valor inválido (${dateStr}, ${valStr})`)
      return
    }
    rows.push({
      date,
      amount: Math.abs(valor),
      description: title || '',
      type: 'expense',
      raw: { dateStr, valStr, title },
    })
  })
  return { rows, errors }
}
```

- [ ] **Step 2: Sanity check com input mock**

```bash
node --input-type=module -e "
import { parseExtrato, parseFatura } from './src/lib/nubankCSV.js'

const extrato = 'Data,Valor,Identificador,Descrição\n12/05/2026,-50.00,abc,PIX João\n13/05/2026,5000.00,def,Salário\n'
console.log('Extrato:', JSON.stringify(parseExtrato(extrato), null, 2))

const fatura = 'date,title,amount\n2026-05-10,Mercado XYZ,150.00\n2026-05-11,Posto ABC,90.50\n'
console.log('Fatura:', JSON.stringify(parseFatura(fatura), null, 2))
"
```

Esperado: 2 linhas em cada, sem erros, datas em formato `2026-05-12` e `2026-05-13`, `type=expense` pro PIX, `type=income` pro Salário.

- [ ] **Step 3: Commit**

```bash
git add src/lib/nubankCSV.js
git commit -m "feat(import): parser CSV NuBank (extrato + fatura) (Onda 6)"
```

---

## Task 2: Wrapper IA `aiCategorize.js`

**Files:**
- Create: `src/lib/aiCategorize.js`

- [ ] **Step 1: Criar wrapper**

Conteúdo de `src/lib/aiCategorize.js`:

```js
import { sendToClaudeAPI } from './claude'

// Pede pro Claude categorizar uma lista de descrições.
// rows: ParsedRow[]
// categories: { id, name, type }[]  // de db.getCategories()
//
// Retorna { [description]: category_id | null }
// Se houver falha (timeout, JSON malformado, etc.), retorna mapa vazio
// — UI cai pra categoria null em todas as linhas (user categoriza manual).
export async function categorizeBatch(rows, categories) {
  if (!rows || rows.length === 0 || !categories || categories.length === 0) return {}

  const catList = categories.map(c => `- ${c.id} — ${c.name} (${c.type})`).join('\n')
  const numbered = rows.map((r, i) => `${i + 1}. ${r.description} (${r.type})`).join('\n')

  const system = `Você é um classificador de transações financeiras brasileiras.

Categorias disponíveis (use APENAS estes IDs exatos):
${catList}

Para cada descrição numerada abaixo, retorne o category_id mais apropriado.
Se não tiver certeza, retorne null.
Combine com o tipo da transação (income/expense) ao escolher.

Responda APENAS um objeto JSON neste formato exato, sem nenhum texto adicional:
{"1": "category_id_ou_null", "2": "...", ...}`

  const messages = [{ role: 'user', content: numbered }]

  try {
    const reply = await sendToClaudeAPI(messages, system)
    // Extrai JSON da resposta (Claude às vezes wrappa em ```json ... ```)
    const jsonMatch = reply.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return {}
    const parsed = JSON.parse(jsonMatch[0])
    // Mapeia { "1": cat_id } → { description: cat_id }
    const result = {}
    rows.forEach((r, i) => {
      const catId = parsed[String(i + 1)]
      result[r.description] = catId && catId !== 'null' ? catId : null
    })
    return result
  } catch (err) {
    console.warn('[aiCategorize] falha:', err)
    return {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/aiCategorize.js
git commit -m "feat(import): wrapper aiCategorize chama Claude pra categorizar batch (Onda 6)"
```

---

## Task 3: Componente CSVImporterModal

**Files:**
- Create: `src/components/CSVImporterModal.jsx`

- [ ] **Step 1: Criar o componente**

Conteúdo de `src/components/CSVImporterModal.jsx`:

```jsx
import { useState, useMemo } from 'react'
import { X, Upload, FileText, AlertTriangle, Sparkles } from 'lucide-react'
import { parseExtrato, parseFatura } from '../lib/nubankCSV'
import { categorizeBatch } from '../lib/aiCategorize'
import { addTransaction, getCategories } from '../lib/db'
import { supabase } from '../lib/supabase'

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Identifica conta-alvo automática baseado no tipo do CSV.
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
  const [csvType, setCsvType] = useState('extrato')  // 'extrato' | 'fatura'
  const [file, setFile] = useState(null)
  const [accountId, setAccountId] = useState('')
  const [rows, setRows] = useState([])  // ParsedRow[] enriquecidos: { ...row, selected, categoryId, isDuplicate }
  const [parseErrors, setParseErrors] = useState([])
  const [aiUsed, setAiUsed] = useState(false)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importStatus, setImportStatus] = useState(null)  // { done, total }

  const targetAccount = useMemo(() => {
    return accounts.find(a => a.id === accountId)
  }, [accounts, accountId])

  const reset = () => {
    setStep(1); setCsvType('extrato'); setFile(null); setAccountId('')
    setRows([]); setParseErrors([]); setAiUsed(false); setLoading(false)
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
    if (!accountId) setAccountId(detected?.id || '')
    const useAccountId = accountId || detected?.id

    const { data: cats } = await getCategories()
    setCategories(cats || [])

    const aiMap = await categorizeBatch(parsed.rows, cats || [])
    setAiUsed(Object.keys(aiMap).length > 0)

    // Dedup soft: query existentes
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
      categoryId: aiMap[r.description] || null,
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                {aiUsed && <span className="ml-2 inline-flex items-center gap-1 text-emerald-400 text-xs"><Sparkles size={10}/> IA categorizou</span>}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CSVImporterModal.jsx
git commit -m "feat(import): CSVImporterModal multi-step com IA + dedup (Onda 6)"
```

---

## Task 4: TransactionsPage — botão "Importar CSV"

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Atualizar imports**

Localizar o import do lucide-react no início e adicionar `Upload`. Logo após o último import, adicionar:

```jsx
import CSVImporterModal from '../components/CSVImporterModal'
import { useAccounts } from '../hooks/useData'
```

(Se `useAccounts` já é importado no arquivo, ajustar — não duplicar.) E confirmar que `Upload` está no import do lucide-react.

- [ ] **Step 2: Adicionar estado importerOpen + useAccounts**

Localizar o início do componente TransactionsPage (function body). Adicionar logo após os outros `useState`:

```jsx
  const [importerOpen, setImporterOpen] = useState(false)
  const { accounts } = useAccounts()
```

(Se `useAccounts` ou `accounts` já existem no componente, não duplicar — apenas garantir que estão disponíveis.)

- [ ] **Step 3: Adicionar botão "Importar CSV" no header**

Localizar o bloco `{/* Header */}` no return (aprox linhas 361-367). Substituir por:

```jsx
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Lançamentos</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setImporterOpen(true)} className="btn-ghost flex items-center gap-1.5 text-sm" title="Importar CSV NuBank">
            <Upload size={16}/> Importar
          </button>
          <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={16}/> Novo
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Renderizar o modal**

Localizar onde o componente já renderiza o TxModal (final do return, antes do `</div>` raiz). Adicionar **antes** desse `</div>` raiz (ou após o render do TxModal):

```jsx
      <CSVImporterModal
        open={importerOpen}
        accounts={accounts}
        userId={user?.id}
        onClose={() => setImporterOpen(false)}
        onSaved={refetch}
      />
```

Se `user` ainda não está desestruturado de `useAuth()` no componente, ajustar a linha do `useAuth`:

```jsx
const { user } = useAuth()
```

(verificar se já há outros hooks/destructures pra não duplicar)

- [ ] **Step 5: Build smoke check**

```bash
npx vite build 2>&1 | tail -10
```

Esperado: `✓ built in X.XXs`.

- [ ] **Step 6: Verificação manual no browser**

`npm run dev`. Em `/transactions`:

1. Botão "Importar" aparece ao lado de "Novo".
2. Click → modal abre no step 1 (tipo + upload).
3. Selecionar "Extrato Conta Corrente" + um CSV de teste → Próximo.
4. Step 2 mostra preview com linhas, conta-alvo auto-detectada, IA categorizou (ou warning se não).
5. Editar tipo/categoria de uma linha, desmarcar outra, click "Importar".
6. Modal fecha, /transactions atualiza (realtime), Dashboard reflete.
7. Re-importar mesmo CSV → linhas com ⚠ duplicata, desmarcadas por default.

CSV de teste mínimo (salvar como `test.csv`):
```csv
Data,Valor,Identificador,Descrição
16/05/2026,-50.00,a,Mercado teste
16/05/2026,2000.00,b,Salário teste
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/TransactionsPage.jsx
git commit -m "feat(transactions): botão Importar CSV abre CSVImporterModal (Onda 6)"
```

---

## Task 5: Atualizar INVENTARIO.md

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 1: Adicionar linha no histórico de execução**

Localizar a tabela "Histórico de execução". Adicionar após a linha da Onda 5:

```markdown
| 2026-05-16 | 6 — CSV importer NuBank | Novo `src/lib/nubankCSV.js` (parseExtrato + parseFatura), `src/lib/aiCategorize.js` (categorizeBatch via Claude proxy), `src/components/CSVImporterModal.jsx` (multi-step upload→preview→confirm). TransactionsPage ganha botão "Importar". IA categoriza descrições em 1 chamada; dedup soft por date+amount+account_id (warning na linha, checkbox OFF). Sem migration, sem mudança na Edge Function. |
```

- [ ] **Step 2: Adicionar features na tabela de Lançamentos**

Localizar a tabela `# 2. Lançamentos (`/transactions` — TransactionsPage)`. Adicionar antes do "Validação de reserva":

```markdown
| Botão "Importar CSV" | TransactionsPage (Onda 6) | Abre CSVImporterModal pra importar extrato Conta Corrente ou fatura Cartão NuBank | Click no botão ao lado de "Novo" | ✅ | Onda 6 |
| CSVImporterModal | components/CSVImporterModal.jsx | Multi-step: tipo+upload → preview com categorização IA + dedup → confirm em batch | Click "Importar" → file → tabela editável | ✅ | Onda 6 — usa nubankCSV.js + aiCategorize.js |
```

- [ ] **Step 3: Resolver auditoria item 10**

Localizar a seção "Auditoria de dados" no INVENTARIO. Substituir:

```markdown
10. **CSV NuBank vs tx no app** — comparar pra detectar tx faltando, valores divergentes, tx no app sem correspondente no extrato.
```

por:

```markdown
10. ~~**CSV NuBank vs tx no app**~~ — ✅ **Resolvido na Onda 6 (CSV importer com dedup soft por date+amount+account_id)**
```

- [ ] **Step 4: Commit**

```bash
git add INVENTARIO.md
git commit -m "docs: atualiza INVENTARIO.md pos-Onda6"
```

---

## Final Sanity Check

- [ ] **Step 1: Smoke test end-to-end**

`npm run dev` e validar:

1. `/transactions` mostra botão "Importar".
2. Upload extrato → preview, IA, dedup funcionam.
3. Confirm cria tx; lista e Dashboard atualizam via realtime.
4. Upload fatura → tx criadas como expense vinculadas a NuBank Crédito.
5. IA offline (Anthropic indisponível) → preview com categoria null, warning, user importa manualmente.

- [ ] **Step 2: Git log final**

```bash
git log --oneline auditoria-features ^main | head -20
```

Esperado: histórico completo das Ondas 1-6 (com seus spec/plan/commits).

---

## Out of scope (registrado)

- ❌ Outros bancos → futuro
- ❌ Detecção automática pagamento de fatura → transfer → futuro
- ❌ Múltiplos arquivos no mesmo upload
- ❌ Histórico de importações / undo
- ❌ `external_id` em transactions pra dedup forte
- ❌ Importer pra Biplay/PicPay/envelope
- ❌ Sugerir budget_item via IA
- ❌ Vincular goal via importer
