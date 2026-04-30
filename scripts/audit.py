#!/usr/bin/env python3
"""
audit.py — Audita os calculos do FinAPP direto do banco (Supabase REST API).

Imprime em JSON os mesmos valores que aparecem nos KPIs/cards de Inicio,
Lancamentos e Planejamento. Usar pra validar se a UI esta exibindo o que
o calculo do backend produz.

Replicacao da logica de src/lib/budgetEngine.js (computeBucketSnapshot,
computeReservaSnapshot) + ritmo de gasto / resumo de Lancamentos.

Variaveis necessarias (env ou .env.local):
  VITE_SUPABASE_URL    URL do projeto Supabase (publica, ja em .env)
  SUPABASE_SECRET      service_role key (NUNCA committar — use .env.local)

Uso:
  python scripts/audit.py                       # ciclo do mes corrente
  python scripts/audit.py --month 2026-04       # mes especifico
  python scripts/audit.py --today 2026-04-26    # simula data (testes)
  python scripts/audit.py --output audit.json   # salva em arquivo
"""

import os
import sys
import json
import argparse
from datetime import datetime, date, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# Forca UTF-8 no stdout/stderr (Windows console default eh cp1252).
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

# ── Config ─────────────────────────────────────────────────────────────

def load_env_file(path):
    if not os.path.exists(path):
        return {}
    out = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out

# Procura .env e .env.local no diretorio atual e no pai
def find_env(name):
    for base in ('.', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))):
        env = load_env_file(os.path.join(base, name))
        if env:
            return env
    return {}

env = find_env('.env')
local = find_env('.env.local')

SUPABASE_URL = (
    os.environ.get('SUPABASE_URL')
    or os.environ.get('VITE_SUPABASE_URL')
    or local.get('VITE_SUPABASE_URL')
    or env.get('VITE_SUPABASE_URL')
)
SUPABASE_KEY = (
    os.environ.get('SUPABASE_SECRET')
    or os.environ.get('SUPABASE_SERVICE_KEY')
    or local.get('SUPABASE_SECRET')
    or local.get('SUPABASE_SERVICE_KEY')
)

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.stderr.write(
        'ERRO: defina SUPABASE_URL e SUPABASE_SECRET.\n'
        '  PowerShell:  $env:SUPABASE_SECRET="sb_secret_..."\n'
        '  Ou crie .env.local (gitignored) com SUPABASE_SECRET=...\n'
    )
    sys.exit(1)

# ── HTTP ───────────────────────────────────────────────────────────────

def query(table, select='*', filters=None, order=None):
    qs = [f'select={select}']
    if filters:
        for k, v in filters.items():
            qs.append(f'{k}={v}')
    if order:
        qs.append(f'order={order}')
    url = f'{SUPABASE_URL}/rest/v1/{table}?{"&".join(qs)}'
    req = Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Accept': 'application/json',
    })
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        sys.stderr.write(f'HTTP {e.code} em {table}: {body}\n')
        sys.exit(2)

# ── Logica replicada de budgetEngine.js ────────────────────────────────

OUTFLOW_TYPES = {'expense', 'transfer', 'investment'}

PAYMENT_SOURCE_LABELS = {
    'fixed_income': 'Renda Fixa',
    'variable_income': 'Renda Variavel',
    'credit': 'Credito',
    'reserve': 'Reserva',
}
TYPE_LABELS = {
    'expense': 'Despesa',
    'income': 'Receita',
    'transfer': 'Transferencia',
    'investment': 'Investimento',
}
MONTH_PT = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Marco', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

def bucket_of(source):
    if source == 'credit':
        return 'credit'
    if source == 'reserve':
        return 'reserve'
    return 'income'

def parse_date(s):
    if not s:
        return None
    return datetime.strptime(s[:10], '%Y-%m-%d').date()

def sunday_anchor(d):
    # weekday(): Mon=0 ... Sun=6 ; ultimo domingo (incluindo o proprio)
    return d - timedelta(days=(d.weekday() + 1) % 7)

def compute_bucket_snapshot(bucket, cycle, items, transactions, bills, today):
    if not cycle:
        return {
            'saldoOrigem': 0.0, 'reserva': 0.0, 'planejado': 0.0, 'gastoReal': 0.0,
            'committed': 0.0, 'saldoDisponivel': 0.0, 'diasRestantes': 0,
            'mediaDiaria': 0.0, 'metaSemanal': 0.0, 'pct': 0.0,
        }
    saldo_origem = float(
        (cycle.get('saldo_origem_credit') if bucket == 'credit' else cycle.get('saldo_origem_income')) or 0
    )
    reserva_pct = float(cycle.get('reserva_pct') or 0)
    reserva = 0.0 if bucket == 'credit' else saldo_origem * reserva_pct / 100

    items_in = [
        i for i in items
        if bucket_of(i.get('payment_source')) == bucket
        and (i.get('categories') or {}).get('type') != 'income'
    ]
    planejado = sum(float(i.get('planned_amount') or 0) for i in items_in)
    gasto_real = sum(
        float(t.get('amount') or 0) for t in transactions
        if t.get('type') == 'expense' and bucket_of(t.get('payment_source')) == bucket
    )

    committed = 0.0
    for item in items_in:
        bill_sum = sum(
            float(b.get('amount') or 0) for b in bills
            if b.get('budget_item_id') == item['id']
        )
        tx_sum = sum(
            float(t.get('amount') or 0) for t in transactions
            if t.get('budget_item_id') == item['id'] and t.get('type') in OUTFLOW_TYPES
        )
        planned = float(item.get('planned_amount') or 0)
        committed += max(bill_sum, tx_sum, planned)
    adhoc_tx = sum(
        float(t.get('amount') or 0) for t in transactions
        if t.get('type') in OUTFLOW_TYPES
        and not t.get('budget_item_id')
        and bucket_of(t.get('payment_source')) == bucket
    )
    committed += adhoc_tx

    # Renda: outflow tx logadas DEPOIS de cycle.updated_at reduzem o saldo_origem.
    saida_since_cutoff = 0.0
    if bucket != 'credit':
        cutoff_str = cycle.get('updated_at')
        cutoff = datetime.fromisoformat(cutoff_str.replace('Z', '+00:00')) if cutoff_str else None
        for t in transactions:
            if t.get('type') not in OUTFLOW_TYPES or bucket_of(t.get('payment_source')) != 'income':
                continue
            tcreated = t.get('created_at')
            if cutoff and tcreated:
                tdt = datetime.fromisoformat(tcreated.replace('Z', '+00:00'))
                if tdt < cutoff:
                    continue
            saida_since_cutoff += float(t.get('amount') or 0)

    saldo_real = saldo_origem - committed if bucket == 'credit' else saldo_origem - saida_since_cutoff
    if bucket == 'credit':
        saldo_disponivel = max(saldo_real, 0.0)
    else:
        saldo_disponivel = max(saldo_real * (1 - reserva_pct / 100), 0.0)

    end_date = parse_date(cycle.get('end_date'))
    start_date = parse_date(cycle.get('start_date'))
    anchor = sunday_anchor(today)
    if start_date and anchor < start_date:
        anchor = start_date
    dias_restantes = max((end_date - anchor).days + 1, 1) if end_date else 1
    media_diaria = 0.0 if bucket == 'credit' else saldo_disponivel / dias_restantes
    meta_semanal = 0.0 if bucket == 'credit' else media_diaria * 7
    pct = (committed / saldo_origem * 100) if saldo_origem > 0 else 0.0

    return {
        'saldoOrigem': saldo_origem,
        'reserva': reserva,
        'planejado': planejado,
        'gastoReal': gasto_real,
        'committed': committed,
        'saidaSinceCutoff': saida_since_cutoff,
        'saldoReal': saldo_real,
        'saldoDisponivel': saldo_disponivel,
        'diasRestantes': dias_restantes,
        'mediaDiaria': media_diaria,
        'metaSemanal': meta_semanal,
        'pct': pct,
    }

def compute_reserva_snapshot(cycle, transactions):
    if not cycle:
        return {'acumulada': 0.0, 'aporte': 0.0, 'usado': 0.0, 'disponivel': 0.0, 'total': 0.0}
    acumulada = float(cycle.get('reserva_acumulada') or 0)
    saldo_origem_income = float(cycle.get('saldo_origem_income') or 0)
    aporte = saldo_origem_income * float(cycle.get('reserva_pct') or 0) / 100
    usado = sum(
        float(t.get('amount') or 0) for t in transactions
        if t.get('type') == 'expense' and t.get('payment_source') == 'reserve'
    )
    total = acumulada + aporte
    disponivel = max(total - usado, 0.0)
    return {'acumulada': acumulada, 'aporte': aporte, 'usado': usado, 'disponivel': disponivel, 'total': total}

def status_text(label, spent, budget):
    pct = (spent / budget * 100) if budget > 0 else 0
    if pct > 100:
        return f'{label} estourou'
    if pct >= 80:
        return f'{label} no limite'
    return f'{label} no ritmo'

def r2(v):
    return round(float(v), 2)

# ── Pipeline ───────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Auditoria dos calculos do FinAPP.')
    ap.add_argument('--month', default=None, help='Mes de referencia YYYY-MM (default: hoje)')
    ap.add_argument('--today', default=None, help='Simula data YYYY-MM-DD (default: hoje)')
    ap.add_argument('--output', default=None, help='Arquivo de saida (default: stdout)')
    ap.add_argument('--limit-historico', type=int, default=10, help='N tx no historico (default: 10)')
    args = ap.parse_args()

    today = parse_date(args.today) if args.today else date.today()
    month_ref = args.month or today.strftime('%Y-%m')

    cycles = query('budget_cycles', filters={'month_ref': f'eq.{month_ref}'})
    cycle = cycles[0] if cycles else None

    items = query(
        'budget_items',
        select='*,categories(*)',
        filters={'active': 'eq.true'},
        order='created_at.asc',
    )
    txs = query(
        'transactions',
        select='*,categories(*),budget_items(name,payment_source)',
        filters={'month_ref': f'eq.{month_ref}'},
        order='date.desc',
    )
    bills = query(
        'bills',
        select='*,budget_items(active,payment_source)',
        filters={'month_ref': f'eq.{month_ref}'},
        order='due_date.asc',
    )
    goals = query('goals', order='priority.asc')
    checkpoints = query('weekly_checkpoints', order='week_start.desc')[:8]

    income_snap = compute_bucket_snapshot('income', cycle, items, txs, bills, today)
    credit_snap = compute_bucket_snapshot('credit', cycle, items, txs, bills, today)
    reserva_snap = compute_reserva_snapshot(cycle, txs)

    # Lancamentos: ritmo de gasto (semana segunda→hoje, replica TransactionsPage.metrics)
    today_str = today.isoformat()
    week_monday = today - timedelta(days=today.weekday())  # Monday da semana corrente
    gasto_hoje = 0.0
    gasto_semana = 0.0
    for t in txs:
        if t.get('type') != 'expense' or bucket_of(t.get('payment_source')) != 'income':
            continue
        d = parse_date(t.get('date'))
        amt = float(t.get('amount') or 0)
        if t.get('date') == today_str:
            gasto_hoje += amt
        if d and week_monday <= d <= today:
            gasto_semana += amt

    orcamento_dia = income_snap['mediaDiaria']
    orcamento_semana = income_snap['mediaDiaria'] * 7

    # Resumo financeiro
    totals = {'income': 0.0, 'expense': 0.0, 'investment': 0.0, 'transfer': 0.0}
    for t in txs:
        totals[t['type']] = totals.get(t['type'], 0.0) + float(t.get('amount') or 0)

    # Historico recente
    historico = []
    for t in txs[: args.limit_historico]:
        cat = t.get('categories') or {}
        psrc = t.get('payment_source')
        sign = -1 if t['type'] in OUTFLOW_TYPES else 1
        historico.append({
            'descricao': t.get('description') or '',
            'data': t.get('date'),
            'tipo': TYPE_LABELS.get(t['type'], t['type']),
            'categoria_principal': PAYMENT_SOURCE_LABELS.get(psrc, psrc or ''),
            'subcategoria': cat.get('name') or '',
            'valor': r2(sign * float(t.get('amount') or 0)),
        })

    # Planejamento: totais por bucket (replica BudgetPage)
    def totals_bucket(b):
        bs = [i for i in items if bucket_of(i.get('payment_source')) == b]
        receita = sum(float(i.get('planned_amount') or 0) for i in bs if (i.get('categories') or {}).get('type') == 'income')
        despesa = sum(float(i.get('planned_amount') or 0) for i in bs if (i.get('categories') or {}).get('type') != 'income')
        return {'receita_planejada': r2(receita), 'despesa_planejada': r2(despesa), 'balanco': r2(receita - despesa)}

    period_label = f"{MONTH_PT[int(month_ref.split('-')[1])]} de {month_ref.split('-')[0]}"

    out = {
        'periodo': period_label,
        'gerado_em': datetime.now().isoformat(timespec='seconds'),
        'data_referencia': today.isoformat(),
        'ancora_semana': sunday_anchor(today).isoformat(),
        'ciclo': {
            'inicio': cycle.get('start_date') if cycle else None,
            'fim': cycle.get('end_date') if cycle else None,
            'saldo_origem_renda': r2(cycle.get('saldo_origem_income') or 0) if cycle else 0,
            'saldo_origem_credito': r2(cycle.get('saldo_origem_credit') or 0) if cycle else 0,
            'reserva_pct': float(cycle.get('reserva_pct') or 0) if cycle else 0,
            'reserva_acumulada': r2(cycle.get('reserva_acumulada') or 0) if cycle else 0,
        },
        'inicio': {
            'kpis_renda': {
                'saldo_origem': r2(income_snap['saldoOrigem']),
                'gasto_real': r2(income_snap['gastoReal']),
                'planejado': r2(income_snap['planejado']),
                'pendente': r2(max(income_snap['planejado'] - income_snap['gastoReal'], 0)),
                'disponivel': r2(income_snap['saldoDisponivel']),
                'media_diaria': r2(income_snap['mediaDiaria']),
                'meta_semanal': r2(income_snap['metaSemanal']),
                'dias_restantes': income_snap['diasRestantes'],
                'pct_comprometido': r2(income_snap['pct']),
            },
            'kpis_credito': {
                'limite': r2(credit_snap['saldoOrigem']),
                'usado': r2(credit_snap['gastoReal']),
                'disponivel': r2(credit_snap['saldoDisponivel']),
                'pct_comprometido': r2(credit_snap['pct']),
            },
            'reserva': {
                'acumulada': r2(reserva_snap['acumulada']),
                'aporte': r2(reserva_snap['aporte']),
                'usado': r2(reserva_snap['usado']),
                'disponivel': r2(reserva_snap['disponivel']),
                'total': r2(reserva_snap['total']),
            },
            'objetivos': [
                {
                    'titulo': g.get('title'),
                    'alvo': r2(g.get('target_amount') or 0),
                    'atual': r2(g.get('current_amount') or 0),
                    'pct': r2(((g.get('current_amount') or 0) / (g.get('target_amount') or 1)) * 100) if g.get('target_amount') else 0,
                }
                for g in (goals or [])
            ],
        },
        'lancamentos': {
            'ritmo_de_gasto': {
                'diario': {
                    'valor_atual': r2(gasto_hoje),
                    'meta': r2(orcamento_dia),
                    'resta': r2(orcamento_dia - gasto_hoje),
                    'status': status_text('Hoje', gasto_hoje, orcamento_dia),
                },
                'semanal': {
                    'valor_atual': r2(gasto_semana),
                    'meta': r2(orcamento_semana),
                    'resta': r2(orcamento_semana - gasto_semana),
                    'status': status_text('Semana', gasto_semana, orcamento_semana),
                },
            },
            'resumo_financeiro': {
                'transferido': r2(totals['transfer']),
                'investido': r2(totals['investment']),
                'entrou': r2(totals['income']),
                'saiu': r2(totals['expense']),
                'liquido': r2(totals['income'] - totals['expense']),
            },
            'historico_recente': historico,
        },
        'planejamento': {
            'snapshot_renda': {
                'saldo_origem': r2(income_snap['saldoOrigem']),
                'gasto_real': r2(income_snap['gastoReal']),
                'disponivel': r2(income_snap['saldoDisponivel']),
                'media_diaria': r2(income_snap['mediaDiaria']),
                'meta_semanal': r2(income_snap['metaSemanal']),
                'dias_restantes': income_snap['diasRestantes'],
                'pct_gasto': r2((income_snap['gastoReal'] / income_snap['saldoOrigem'] * 100) if income_snap['saldoOrigem'] > 0 else 0),
            },
            'snapshot_credito': {
                'limite': r2(credit_snap['saldoOrigem']),
                'usado': r2(credit_snap['gastoReal']),
                'disponivel': r2(credit_snap['saldoDisponivel']),
                'pct_comprometido': r2(credit_snap['pct']),
            },
            'reserva': {
                'disponivel': r2(reserva_snap['disponivel']),
                'usado': r2(reserva_snap['usado']),
                'acumulada': r2(reserva_snap['acumulada']),
            },
            'totais_renda': totals_bucket('income'),
            'totais_credito': totals_bucket('credit'),
            'fechamentos_recentes': [
                {
                    'semana': f"{cp.get('week_start')} -> {cp.get('week_end')}",
                    'bucket': cp.get('bucket'),
                    'previsto': r2(cp.get('saldo_previsto') or 0),
                    'real': r2(cp.get('saldo_real') or 0),
                    'status': cp.get('status'),
                }
                for cp in checkpoints
            ],
        },
    }

    payload = json.dumps(out, indent=2, ensure_ascii=False, default=str)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(payload)
        sys.stderr.write(f'OK: salvo em {args.output}\n')
    else:
        print(payload)

if __name__ == '__main__':
    main()
