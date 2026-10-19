# Starts (or restarts) the LOCAL CHECK API on port 8123 against the throwaway database.
# Restarting also clears the in-memory sign-in limiter (40 per 15 minutes per address).
#
# Run from the apps/api folder:   .\src\scripts\system-check\start-api.ps1
# It loads .env.check (copy .env.check.example) instead of apps/api/.env, so the API cannot reach the
# real Vercel Blob store, mail or any other real service.
param([string]$Db = "postgresql://postgres@localhost:5544/easyconstruct_check")

# Stop an API that is already running from this project.
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'tsx' -and $_.CommandLine -match 'construction-system-easyconstruct' -and $_.CommandLine -match 'src/index.ts' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (-not (Test-Path ".env.check")) { Copy-Item ".env.check.example" ".env.check"; Write-Host "Created .env.check from the example." }

$env:DATABASE_URL = $Db
$env:ALLOW_DEMO_RESET = "true"
$env:PORT = "8123"
$env:DOTENV_CONFIG_PATH = ".env.check"
npm run dev
