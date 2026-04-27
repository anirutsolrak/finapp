# audit.ps1 — wrapper PowerShell para scripts/audit.py
#
# Carrega SUPABASE_SECRET de .env.local (gitignored), invoca o script Python
# e abre o JSON de saida.
#
# Uso:
#   .\scripts\audit.ps1                       # mes corrente, JSON no console
#   .\scripts\audit.ps1 -Month 2026-04        # mes especifico
#   .\scripts\audit.ps1 -Today 2026-04-26     # simula data
#   .\scripts\audit.ps1 -Output audit.json    # salva em arquivo

param(
    [string]$Month,
    [string]$Today,
    [string]$Output,
    [int]$LimitHistorico = 10
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# Carrega .env.local se existir (define SUPABASE_SECRET na sessao)
$envLocal = Join-Path $root '.env.local'
if (Test-Path $envLocal) {
    Get-Content $envLocal | ForEach-Object {
        if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+?)\s*$') {
            $name = $Matches[1].Trim()
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

if (-not $env:SUPABASE_SECRET -and -not $env:SUPABASE_SERVICE_KEY) {
    Write-Error "Defina SUPABASE_SECRET. Crie .env.local com: SUPABASE_SECRET=sb_secret_..."
    exit 1
}

$args = @()
if ($Month) { $args += @('--month', $Month) }
if ($Today) { $args += @('--today', $Today) }
if ($Output) { $args += @('--output', $Output) }
if ($LimitHistorico) { $args += @('--limit-historico', "$LimitHistorico") }

python "$root\scripts\audit.py" @args
