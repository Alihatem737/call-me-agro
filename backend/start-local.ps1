param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$java = 'C:\Program Files\Java\jdk-17\bin\java.exe'
$secret = Join-Path $root '.idea\earthdata.env'
$line = @(Get-Content -LiteralPath $secret | Where-Object { $_ -match '^\s*EARTHDATA_TOKEN\s*=' })
if ($line.Count -ne 1) { throw 'Expected one EARTHDATA_TOKEN assignment.' }
$token = ($line[0] -split '=',2)[1].Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Earthdata token is empty.' }
$listener = @(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue)
foreach ($idToStop in @($listener.OwningProcess | Select-Object -Unique)) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$idToStop"
    if ($existing.Name -ne 'java.exe' -or $existing.CommandLine -notmatch 'BackendApplication|backend-0.0.1-SNAPSHOT.jar') { throw 'Port 8080 belongs to another application.' }
    if (!$Restart) { throw 'Backend already running. Use -Restart.' }
    Stop-Process -Id $idToStop
    Wait-Process -Id $idToStop -ErrorAction SilentlyContinue
}
$previous = $env:EARTHDATA_TOKEN
try {
    $env:EARTHDATA_TOKEN = $token
    $jar = Join-Path $root 'target\backend-0.0.1-SNAPSHOT.jar'
    if (!(Test-Path $jar)) { throw 'Build first with Maven package using Java 17.' }
    $process = Start-Process -FilePath $java -ArgumentList @('-jar',('"'+$jar+'"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'target\local-backend.stdout.log') -RedirectStandardError (Join-Path $root 'target\local-backend.stderr.log') -PassThru
    Write-Output "Started backend PID $($process.Id); non-empty Earthdata token loaded; Java 17."
} finally {
    $env:EARTHDATA_TOKEN = $previous
    $token = $null
}
