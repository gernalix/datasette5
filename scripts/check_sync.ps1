param(
  [string]$RepoPath = ".",
  [string]$Branch = "master",
  [string]$RenderUrl = ""   # e.g. https://datasette5.onrender.com
)

function Write-Section($title) {
  Write-Host ""
  Write-Host ("==== " + $title + " ====") -ForegroundColor Cyan
}

# Move to repo
Set-Location -Path $RepoPath

# Ensure it's a git repo
$gitRoot = (& git rev-parse --show-toplevel) 2>$null
if (-not $gitRoot) {
  Write-Host ("ERROR: Non sembra una repo Git: " + $RepoPath) -ForegroundColor Red
  exit 1
}

Write-Section "Percorso repository"
Write-Host $gitRoot

# Local HEAD
$localHead = (& git rev-parse --short HEAD).Trim()
Write-Section "HEAD locale"
Write-Host $localHead

# Uncommitted changes
$dirty = (& git status --porcelain)
if ($dirty) {
  Write-Host "WARNING: Modifiche locali non committate presenti" -ForegroundColor Yellow
  $dirty | ForEach-Object { Write-Host ("  " + $_) }
} else {
  Write-Host "OK: Working tree pulito"
}

# Remote HEAD
Write-Section ("HEAD remoto (origin/" + $Branch + ")")
# Fetch without switching branches
& git fetch origin $Branch --quiet
$remoteHead = (& git rev-parse --short ("origin/" + $Branch)).Trim()
if ($LASTEXITCODE -ne 0 -or -not $remoteHead) {
  Write-Host ("ERROR: Impossibile leggere origin/" + $Branch) -ForegroundColor Red
  exit 2
}
Write-Host $remoteHead

# Compare local vs remote
Write-Section "Confronto locale vs remoto"
if ($localHead -eq $remoteHead) {
  Write-Host ("OK: Allineato - " + $localHead) -ForegroundColor Green
} else {
  Write-Host ("WARNING: Differenza - locale " + $localHead + " vs remoto " + $remoteHead) -ForegroundColor Yellow
  Write-Host "Suggerimenti:"
  Write-Host ("  - Per inviare le modifiche: git add . && git commit -m ""sync"" && git push origin " + $Branch)
  Write-Host ("  - Per allinearti al remoto: git pull origin " + $Branch)
}

# Optional: check Render by reading /custom/version.txt
if ($RenderUrl) {
  Write-Section ("Verifica Render (" + $RenderUrl + ")")
  try {
    $versionUrl = ($RenderUrl.TrimEnd('/') + "/custom/version.txt")
    $resp = Invoke-WebRequest -Uri $versionUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $renderVersion = $resp.Content.Trim()
    if ($renderVersion) {
      Write-Host ("Versione su Render: " + $renderVersion)
      if ($renderVersion -eq $localHead) {
        Write-Host "OK: Render deploya lo stesso commit locale" -ForegroundColor Green
      } elseif ($renderVersion -eq $remoteHead) {
        Write-Host "INFO: Render allineato al remoto, diverso dal locale" -ForegroundColor Yellow
      } else {
        Write-Host ("WARNING: Render non allineato (locale: " + $localHead + ", remoto: " + $remoteHead + ")") -ForegroundColor Yellow
      }
    } else {
      Write-Host "INFO: /custom/version.txt non trovato o vuoto su Render"
    }
  } catch {
    Write-Host "INFO: Impossibile contattare Render oppure /custom/version.txt non esiste" -ForegroundColor DarkYellow
  }
}
