$ErrorActionPreference = 'Stop'

$workerDirectory = Split-Path -Parent $PSCommandPath
$cloudflaredConfig = Join-Path $env:USERPROFILE '.cloudflared\config.yml'

if (-not (Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue)) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  # cPanel's certificate chain is trusted by Windows but not always by
  # Node's bundled CA store. Use the system store so CRM callbacks (outbox,
  # message persistence and heartbeat) remain available.
  Start-Process -FilePath $node -ArgumentList @('--use-system-ca', 'server.cjs') -WorkingDirectory $workerDirectory -WindowStyle Hidden
}

# Other local services can use cloudflared too. Only an instance launched
# with this worker's config exposes the WhatsApp bridge, so do not treat an
# unrelated tunnel as proof that this one is running.
$workerTunnelRunning = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$cloudflaredConfig*" }

if (-not $workerTunnelRunning) {
  $cloudflared = (Get-Command cloudflared.exe -ErrorAction Stop).Source
  Start-Process -FilePath $cloudflared -ArgumentList "--config `"$cloudflaredConfig`" tunnel run" -WindowStyle Hidden
}
