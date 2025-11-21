$ErrorActionPreference = 'Stop'

# ==============
#  PATH DI BASE
# ==============
$root = (Get-Item -LiteralPath $PSScriptRoot).FullName

$venv      = Join-Path $root '.venv313\Scripts\python.exe'
$db        = Join-Path $root 'output.db'
$caltxt    = Join-Path $root 'static\custom\calendar_columns.txt'
$templates = Join-Path $root 'templates'
$staticCus = 'custom:' + (Join-Path $root 'static\custom')
$metadata  = Join-Path $root 'metadata.json'

$bindHost = '0.0.0.0'
$bindPort = '8001'

# Certificati Tailscale
$cert = 'C:\ProgramData\Tailscale\certs\daniele.tail6b4058.ts.net.crt'
$key  = 'C:\ProgramData\Tailscale\certs\daniele.tail6b4058.ts.net.key'

# =====================
#  TOAST NOTIFICATION
# =====================
try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = 'WindowsRuntime'] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = 'WindowsRuntime'] | Out-Null
} catch {
    Write-Host "[WARN] Impossibile inizializzare le API toast: $($_.Exception.Message)"
}

function Show-Toast {
    param(
        [string]$Title,
        [string]$Message
    )

    try {
        $templateType = [Windows.UI.Notifications.ToastTemplateType]::ToastText02
        $xml          = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($templateType)

        $texts = $xml.GetElementsByTagName('text')
        $null  = $texts.Item(0).AppendChild($xml.CreateTextNode($Title))
        $null  = $texts.Item(1).AppendChild($xml.CreateTextNode($Message))

        $toast   = [Windows.UI.Notifications.ToastNotification]::new($xml)
        $appId   = 'DatasetteDashboard'
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
        $notifier.Show($toast)
    } catch {
        Write-Host "[WARN] Impossibile mostrare il toast: $($_.Exception.Message)"
    }
}

# =====================
#  AVVIO / STOP SERVER
# =====================

function Start-DS {
    Write-Host '[BUILD] Rigenero calendario...'

    $scriptPath = Join-Path $root 'scripts\build_calendar.py'
    $buildArgs  = @($scriptPath, $db, $caltxt, '--base-path', '/')

    # Avvia build_calendar in finestra nascosta
    $procBuild  = Start-Process -FilePath $venv `
                                -ArgumentList $buildArgs `
                                -WorkingDirectory $root `
                                -WindowStyle Hidden `
                                -Wait `
                                -PassThru

    if ($procBuild.ExitCode -ne 0) {
        throw "build_calendar.py fallito (ExitCode=$($procBuild.ExitCode))"
    }

    Write-Host '[RUN] Avvio Datasette...'

    $args = @(
        '-m','datasette',
        $db,
        '--host',  $bindHost,
        '--port',  $bindPort,
        '--setting','base_url','/',
        '--template-dir', $templates,
        '--static',       $staticCus,
        '--metadata',     $metadata
    )

    $useHttps = (Test-Path -LiteralPath $cert) -and (Test-Path -LiteralPath $key)
    if ($useHttps) {
        $args += @('--ssl-certfile', $cert, '--ssl-keyfile', $key)
        Write-Host ("[INFO] Modalita': HTTPS (host={0} port={1})" -f $bindHost, $bindPort)
    } else {
        Write-Host ("[INFO] Modalita': HTTP (host={0} port={1})" -f $bindHost, $bindPort)
    }

    # Avvia Datasette in finestra nascosta
    $global:proc = Start-Process -FilePath $venv `
                                 -ArgumentList $args `
                                 -WorkingDirectory $root `
                                 -WindowStyle Hidden `
                                 -PassThru

    if (-not $global:proc) {
        throw 'Impossibile avviare Datasette'
    }

    Show-Toast -Title 'Dashboard datasette avviata' -Message ("In ascolto su {0}:{1}" -f $bindHost, $bindPort)
}

function Stop-DS {
    param([System.Diagnostics.Process]$p)

    if ($p -and -not $p.HasExited) {
        Write-Host ("[STOP] PID {0}" -f $p.Id)
        try { $p.Kill() } catch {}
        $p.WaitForExit() | Out-Null
    }
}

# ===========================
#  LETTURA watch_dirs.ini
# ===========================
$watchListFile = Join-Path $root 'watch_dirs.ini'
$watchDirs = @()

if (Test-Path $watchListFile) {
    $lines = Get-Content $watchListFile |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -ne '' -and -not $_.StartsWith('#') -and -not $_.StartsWith(';') }

    foreach ($line in $lines) {
        $full = Join-Path $root $line
        if (Test-Path $full) {
            $watchDirs += $full
        } else {
            Write-Host "[WARN] Cartella da monitorare non trovata (ignorata): $line"
        }
    }
}

if (-not $watchDirs -or $watchDirs.Count -eq 0) {
    Write-Host "[WARN] Nessuna cartella valida in watch_dirs.ini, monitoro la root del progetto."
    $watchDirs = @($root)
}

# ===========================
#  WATCHER FILE + RIAVVIO
# ===========================

$global:changed      = $false
$global:lastRestart  = Get-Date

# Primo avvio
Start-DS

# Crea un watcher per ogni cartella
$notifyFilters = [IO.NotifyFilters]::FileName `
                 -bor [IO.NotifyFilters]::LastWrite `
                 -bor [IO.NotifyFilters]::DirectoryName

$watchers = @()

foreach ($dir in $watchDirs) {
    $fsw = New-Object IO.FileSystemWatcher $dir -Property @{
        IncludeSubdirectories = $true
        EnableRaisingEvents   = $true
        NotifyFilter          = $notifyFilters
    }

    $watchers += $fsw

    Register-ObjectEvent $fsw Changed -Action { $global:changed = $true } > $null
    Register-ObjectEvent $fsw Created -Action { $global:changed = $true } > $null
    Register-ObjectEvent $fsw Deleted -Action { $global:changed = $true } > $null
    Register-ObjectEvent $fsw Renamed -Action { $global:changed = $true } > $null

    Write-Host "[WATCH] Monitoro: $dir (incluse sottocartelle)"
}

# Loop principale con piccolo debounce
while ($true) {
    Start-Sleep -Milliseconds 500

    if ($global:changed) {
        $now = Get-Date
        # Debounce: aspetta almeno 1.5 secondi tra un riavvio e l'altro
        if (($now - $global:lastRestart).TotalSeconds -ge 1.5) {
            $global:changed = $false
            $global:lastRestart = $now

            Write-Host '[WATCH] Modifica rilevata in una cartella monitorata, riavvio Datasette...'

            # Piccola pausa per lasciare finire le scritture su disco
            Start-Sleep -Milliseconds 300

            Stop-DS $global:proc
            Start-DS
        } else {
            # Troppo vicino all’ultimo riavvio: ignoro questa raffica
            $global:changed = $false
        }
    }
}
