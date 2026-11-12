# Set the Perplexity API key in Vizai-discovery/.env.local
# Run this on the PC (double-click set-perplexity-key.bat). It prompts for the
# key with hidden input and writes it to .env.local, then restarts the dev
# server so the new key is picked up. The key is never printed and never
# leaves this PC; it is stored the same way the other API keys in .env.local are.

$envFile = "C:\projects\Vizai-discovery\.env.local"

Write-Host ""
Write-Host "This sets PERPLEXITY_API_KEY in $envFile"
Write-Host "Paste your Perplexity API key (it starts with pplx-). It will not show as you type."
$secure = Read-Host -AsSecureString "Perplexity API key"
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $key = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
$key = $key.Trim()
if (-not $key.StartsWith("pplx-")) {
    Write-Host ""
    Write-Host "That does not look like a Perplexity key (it should start with pplx-). Nothing was changed."
    Read-Host "Press Enter to close"
    exit 1
}

$lines = @()
if (Test-Path $envFile) {
    $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^\s*PERPLEXITY_API_KEY\s*=' }
}
$lines += "PERPLEXITY_API_KEY=$key"
$key = $null
[System.GC]::Collect()
$lines | Set-Content $envFile -Encoding utf8
Write-Host ""
Write-Host "PERPLEXITY_API_KEY written to $envFile."

Write-Host "Restarting the VizAI Discovery dev server so it picks up the new key..."
$proc = Get-NetTCPConnection -LocalPort 9002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) {
    Stop-Process -Id $proc.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped the old dev server."
}
Start-Sleep -Seconds 2
schtasks /Run /TN "VizAI Discovery Dev Server" | Out-Null
Write-Host "Dev server restart requested. It takes about 30-60 seconds to come back up."
Write-Host ""
Write-Host "Done. The live free scan will now use Perplexity."
Read-Host "Press Enter to close"
