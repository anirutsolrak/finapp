# scripts/audit

Auditoria dos calculos do FinAPP — busca dados direto do Supabase e replica
a logica de `src/lib/budgetEngine.js` em Python para validar se os valores
exibidos na UI batem com o que o calculo do backend produz.

## Setup (uma vez)

1. Crie `.env.local` na raiz (gitignored) com a service_role key:

   ```
   SUPABASE_SECRET=sb_secret_...
   ```

2. Garanta que `.env` ja tem `VITE_SUPABASE_URL` (ja vem do projeto).

3. Python 3.8+ (sem dependencias externas — usa stdlib).

## Uso

PowerShell (wrapper carrega o .env.local automaticamente):

```powershell
.\scripts\audit.ps1                       # mes corrente, JSON no console
.\scripts\audit.ps1 -Month 2026-04        # mes especifico
.\scripts\audit.ps1 -Today 2026-04-26     # simula data (testa Sunday-anchor)
.\scripts\audit.ps1 -Output audit.json    # salva em arquivo
```

Direto via Python (qualquer shell):

```bash
python scripts/audit.py --month 2026-04 --output audit.json
```

## Plano de testes

1. Abra o app no browser, anote os valores exibidos em cada modulo:
   - **Inicio**: KPIs de Renda (saldo origem, gasto, planejado, pendente, disponivel,
     media diaria, meta semanal), Credito (limite, usado, disponivel),
     Reserva (acumulada, aporte, usado, disponivel).
   - **Lancamentos**: Ritmo de gasto (diario/semanal — valor atual, meta, resta,
     status), Resumo financeiro (transferido, investido, entrou, saiu, liquido),
     Historico recente (top N).
   - **Planejamento**: Snapshot Renda/Credito/Reserva, totais por bucket
     (receita, despesa, balanco).

2. Rode `.\scripts\audit.ps1` no mesmo mes/data e compare campo a campo com
   o JSON de saida. Discrepancias indicam bug — ou na UI ou no backend.

3. Para reproduzir o comportamento do recalculo travado-no-domingo:
   `.\scripts\audit.ps1 -Today 2026-04-26` (proximo domingo) — `media_diaria`
   e `meta_semanal` mudam apenas quando a `ancora_semana` avanca.

## Estrutura do JSON

```
{
  "periodo": "Abril de 2026",
  "ancora_semana": "2026-04-19",
  "ciclo": { ... },
  "inicio": {
    "kpis_renda": { ... },
    "kpis_credito": { ... },
    "reserva": { ... },
    "objetivos": [ ... ]
  },
  "lancamentos": {
    "ritmo_de_gasto": { "diario": {...}, "semanal": {...} },
    "resumo_financeiro": { ... },
    "historico_recente": [ ... ]
  },
  "planejamento": {
    "snapshot_renda": { ... },
    "snapshot_credito": { ... },
    "reserva": { ... },
    "totais_renda": { ... },
    "totais_credito": { ... },
    "fechamentos_recentes": [ ... ]
  }
}
```
