# Auditoria de calculos — FinAPP

Referencia rapida para validar se a UI exibe os mesmos valores que o
calculo do backend produz. Util sempre que um KPI/card parecer suspeito.

## Como funciona

`scripts/audit.py` replica em Python a logica de `src/lib/budgetEngine.js`
(`computeBucketSnapshot`, `computeReservaSnapshot`) e os agregados de
`TransactionsPage`/`DashboardPage`/`BudgetPage`. Busca dados direto do
Supabase via REST (service_role key) e imprime JSON com os mesmos campos
de Inicio, Lancamentos e Planejamento.

Stack: Python 3.8+ stdlib (sem dependencias).

## Setup (uma vez)

1. Crie `.env.local` na raiz (ja esta no .gitignore):

   ```
   SUPABASE_SECRET=sb_secret_...
   ```

2. `.env` ja deve ter `VITE_SUPABASE_URL` (vem do projeto).

## Comandos

PowerShell (carrega `.env.local` automaticamente):

```powershell
.\scripts\audit.ps1                       # mes corrente, JSON no console
.\scripts\audit.ps1 -Month 2026-04        # mes especifico
.\scripts\audit.ps1 -Today 2026-04-26     # simula data (testa Sunday-anchor)
.\scripts\audit.ps1 -Output audit.json    # salva em arquivo
```

Direto via Python:

```bash
python scripts/audit.py --month 2026-04 --output audit.json
```

## Plano de testes

1. **Inicio** — abra o app e anote: KPIs de Renda (saldo origem, gasto,
   planejado, pendente, disponivel, media diaria, meta semanal),
   Credito (limite, usado, disponivel), Reserva (acumulada, aporte,
   usado, disponivel), Objetivos.
2. **Lancamentos** — Ritmo de gasto (diario/semanal: valor atual, meta,
   resta, status), Resumo financeiro (transferido, investido, entrou,
   saiu, liquido), Historico recente.
3. **Planejamento** — Snapshot Renda/Credito/Reserva, totais por bucket
   (receita planejada, despesa planejada, balanco), fechamentos recentes.
4. Rode `.\scripts\audit.ps1` no mesmo mes/data e compare campo a campo
   com o JSON de saida. Discrepancia = bug (na UI ou no backend).

## Validar o recalculo travado-no-domingo

Simule datas com `-Today` e veja se `media_diaria`/`meta_semanal` so
mudam quando a `ancora_semana` avanca:

```powershell
.\scripts\audit.ps1 -Today 2026-04-22   # quarta — anchor 2026-04-19
.\scripts\audit.ps1 -Today 2026-04-25   # sabado — anchor 2026-04-19 (mesmo)
.\scripts\audit.ps1 -Today 2026-04-26   # domingo — anchor 2026-04-26 (mudou)
```

Se `meta_semanal` mudar entre quarta e sabado, a logica de anchor quebrou.

## Estrutura do JSON

```
periodo, gerado_em, data_referencia, ancora_semana
ciclo: { inicio, fim, saldo_origem_renda, saldo_origem_credito, reserva_pct, reserva_acumulada }
inicio: { kpis_renda, kpis_credito, reserva, objetivos }
lancamentos: { ritmo_de_gasto, resumo_financeiro, historico_recente }
planejamento: { snapshot_renda, snapshot_credito, reserva, totais_renda, totais_credito, fechamentos_recentes }
```

Detalhes completos em [scripts/README.md](scripts/README.md).

## Premissas do calculo (fonte de verdade)

- **Renda (`saldoDisponivel`)** = `saldo_origem_income * (1 - reserva_pct/100)`.
  `saldo_origem_income` representa o **saldo liquido atual em conta** —
  voce atualiza via Configurar ciclo quando quer forcar recalculo. NAO se
  subtrai saida real porque o usuario ja entra com o valor net.
- **Credito (`saldoDisponivel`)** = `limite - committed`, onde committed =
  `max(planned, bills, tx)` por item + adhoc tx no bucket.
- **Reserva** = `reserva_acumulada (rollover) + saldo_origem_income * reserva_pct/100 - tx expense com payment_source=reserve`.
- **Media diaria** = `saldoDisponivel / dias_restantes_do_anchor`.
  Anchor = ultimo domingo (ou `start_date` se anchor cair antes).
- **Meta semanal** = `media_diaria * 7`.
- **Gasto hoje/semana (Lancamentos)** = soma de tx do tipo expense no
  bucket `income`, filtrando pela data (hoje / segunda-ate-hoje).

Se algum desses contratos mudar em `budgetEngine.js`, atualize tanto o
script `audit.py` quanto este doc.
