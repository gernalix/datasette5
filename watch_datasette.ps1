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
$plugins   = Join-Path $root 'plugins'     # <── CARTELLA PLUGIN

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
        $xmlTemplate  = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($templateType)
        $xml          = [Windows.Data.Xml.Dom.XmlDocument]::new()
        $xml.LoadXml($xmlTemplate.GetXml())

        $texts = $xml.GetElementsByTagName('text')
        $null  = $texts.Item(0).AppendChild($xml.CreateTextNode($Title))
        $null  = $texts.Item(1).AppendChild($xml.CreateTextNode($Message))

        $toast    = [Windows.UI.Notifications.ToastNotification]::new($xml)
        $appId    = 'DatasetteDashboard'
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
        '--metadata',     $metadata,
		'--setting','max_returned_rows','20000'

    )

    # === PLUGIN DIR =====================================================
    if (Test-Path -LiteralPath $plugins) {
        Write-Host ("[INFO] Plugins dir: {0}" -f $plugins)
        $args += @('--plugins-dir', $plugins)
    } else {
        Write-Host ("[WARN] Cartella plugin NON trovata: {0}" -f $plugins)
    }
    # ===================================================================

    $useHttps = (Test-Path -LiteralPath $cert) -and (Test-Path -LiteralPath $key)
    if ($useHttps) {
        $args += @('--ssl-certfile', $cert, '--ssl-keyfile', $key)
        Write-Host ("[INFO] Modalita': HTTPS (host={0} port={1})" -f $bindHost, $bindPort)
    } else {
        Write-Host ("[INFO] Modalita': HTTP (host={0} port={1})" -f $bindHost, $bindPort)
    }

    # Mostra il comando completo per debug
    Write-Host "[CMD] Avvio Datasette con comando:"
    Write-Host ("      {0} {1}" -f $venv, ($args -join ' '))

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

# =====================
#  FILESYSTEM WATCHER
# =====================

$global:changed    = $false
$global:lastChange = Get-Date

$watchPaths = @(
    (Join-Path $root 'templates'),
    (Join-Path $root 'plugins'),
    (Join-Path $root 'scripts'),
    (Join-Path $root 'custom'),
    (Join-Path $root 'static')
)

$watchers = @()

foreach ($path in $watchPaths) {
    if (-not (Test-Path -LiteralPath $path)) { continue }

    Write-Host ("[WATCH] Monitoro: {0} (incluse sottocartelle)" -f $path)

    $fsw = New-Object System.IO.FileSystemWatcher
    $fsw.Path                  = $path
    $fsw.IncludeSubdirectories = $true
    $fsw.EnableRaisingEvents   = $true
    $fsw.Filter                = '*.*'

    Register-ObjectEvent $fsw 'Changed' -Action {
        $global:changed    = $true
        $global:lastChange = Get-Date
    } | Out-Null
    Register-ObjectEvent $fsw 'Created' -Action {
        $global:changed    = $true
        $global:lastChange = Get-Date
    } | Out-Null
    Register-ObjectEvent $fsw 'Deleted' -Action {
        $global:changed    = $true
        $global:lastChange = Get-Date
    } | Out-Null
    Register-ObjectEvent $fsw 'Renamed' -Action {
        $global:changed    = $true
        $global:lastChange = Get-Date
    } | Out-Null

    $watchers += $fsw
}

Write-Host ''
Write-Host '========================================================='
Write-Host " Avvio Auto Calendar + Datasette in modalita'' WATCH"
Write-Host (" Root progetto: {0}" -f $root)
Write-Host '========================================================='
Write-Host ''

Start-DS

try {
    while ($true) {
        Start-Sleep -Milliseconds 500

        if ($global:changed -and ((Get-Date) - $global:lastChange).TotalMilliseconds -gt 500) {
            $global:changed = $false
            Write-Host '[WATCH] Modifica rilevata in una cartella monitorata, riavvio Datasette...'

            # Piccola pausa per lasciare finire le scritture su disco
            Start-Sleep -Milliseconds 300

            Stop-DS $global:proc
            Start-DS
        }
    }
} finally {
    foreach ($w in $watchers) {
        $w.EnableRaisingEvents = $false
        $w.Dispose()
    }
}
