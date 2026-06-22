# apply-migrations.ps1
# Applica le migrazioni 0018 e 0019 su Supabase via Management API
# Eseguire questo script DOPO aver ottenuto un Management API Token da:
# https://supabase.com/dashboard/account/tokens
#
# Uso:
#   .\scripts\apply-migrations.ps1 -ManagementToken "sbp_xxxx..."
#
# OPPURE se non hai il token, copia il contenuto dei file .sql
# e incollalo nel SQL Editor di Supabase:
# https://supabase.com/dashboard/project/gfprrbmkeushdcrvwbeo/sql/new

param(
  [string]$ManagementToken = $env:SUPABASE_MANAGEMENT_TOKEN
)

$projectRef = "gfprrbmkeushdcrvwbeo"

$migrations = @(
  "supabase\migrations\0018_fix_availability_rls_bypass.sql",
  "supabase\migrations\0019_fix_create_booking_overlap_check.sql"
)

if (-not $ManagementToken) {
  Write-Host ""
  Write-Host "⚠️  Nessun Management Token fornito." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Per applicare le migrazioni automaticamente:" -ForegroundColor Cyan
  Write-Host "  1. Vai su: https://supabase.com/dashboard/account/tokens"
  Write-Host "  2. Crea un Access Token"
  Write-Host "  3. Riesegui: .\scripts\apply-migrations.ps1 -ManagementToken 'sbp_xxx...'"
  Write-Host ""
  Write-Host "OPPURE applica manualmente dal SQL Editor:" -ForegroundColor Cyan
  Write-Host "  https://supabase.com/dashboard/project/$projectRef/sql/new"
  Write-Host ""
  Write-Host "File da eseguire in ordine:" -ForegroundColor White
  foreach ($m in $migrations) {
    Write-Host "  - $m" -ForegroundColor Gray
  }
  exit 0
}

Write-Host "🚀 Applicazione migrazioni su progetto: $projectRef" -ForegroundColor Cyan

foreach ($migPath in $migrations) {
  $sql = Get-Content $migPath -Raw -Encoding UTF8
  $migName = Split-Path $migPath -Leaf
  
  Write-Host "`n▶ $migName ..." -ForegroundColor White

  $body = @{ query = $sql } | ConvertTo-Json -Depth 10 -Compress

  try {
    $response = Invoke-RestMethod `
      -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" `
      -Method POST `
      -Headers @{
        "Authorization" = "Bearer $ManagementToken"
        "Content-Type"  = "application/json"
      } `
      -Body $body

    Write-Host "  ✅ Successo!" -ForegroundColor Green
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message
    Write-Host "  ❌ Errore ($statusCode): $errorBody" -ForegroundColor Red
  }
}

Write-Host "`n✅ Completato." -ForegroundColor Green
