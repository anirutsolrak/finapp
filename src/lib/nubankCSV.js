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
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseDateISO(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function parseAmount(s) {
  if (s == null) return NaN
  let clean = String(s).trim().replace(/\s/g, '')
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
