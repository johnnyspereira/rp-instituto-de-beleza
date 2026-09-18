$ErrorActionPreference = 'Stop'

$workerDirectory = Split-Path -Parent $PSCommandPath
$starter = Join-Path $workerDirectory 'start-background.ps1'

try {
  & $starter
  Start-Sleep -Milliseconds 800
  $listening = Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) {
    throw 'O worker não abriu a porta local 4100.'
  }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    'Worker do WhatsApp iniciado. Aguarde alguns segundos para o CRM atualizar o estado.',
    'RP Instituto de Beleza',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "Não foi possível iniciar o worker.`n`n$($_.Exception.Message)",
    'RP Instituto de Beleza — erro no worker',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}
