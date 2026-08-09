# Runs the Flutter app with dart-defines from .env (gitignored).
# Usage: powershell -File run.ps1 [--device <id>] [extra flutter args...]
$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    Write-Error "Missing $envFile — copy .env.example values (SUPABASE_URL, SUPABASE_ANON_KEY) into it first."
}

$defines = @()
Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
        $kv = $line -split '=', 2
        if ($kv.Count -eq 2 -and $kv[0] -and $kv[1]) {
            $defines += "--dart-define=$($kv[0].Trim())=$($kv[1].Trim())"
        }
    }
}

if ($defines.Count -eq 0) {
    Write-Error "No KEY=VALUE entries found in $envFile."
}

Write-Host "Running flutter with $($defines.Count) dart-defines (values not printed)..."
& flutter run @defines @args
