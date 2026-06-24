$ErrorActionPreference = "Stop"

# ── Caricamento credenziali da .env.local ────────────────────────
# Le credenziali NON devono mai essere hardcoded nel codice sorgente.
$envFile = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), "Process")
        }
    }
}

$user    = $env:ARUBA_FTP_USER
$pass    = $env:ARUBA_FTP_PASS
$ftpHost = $env:ARUBA_FTP_HOST
$ftpDir  = $env:ARUBA_FTP_DIR

if (-not $user -or -not $pass -or -not $ftpHost -or -not $ftpDir) {
    Write-Error "Credenziali FTP mancanti. Assicurati che ARUBA_FTP_USER, ARUBA_FTP_PASS, ARUBA_FTP_HOST e ARUBA_FTP_DIR siano definiti in .env.local"
    exit 1
}

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($user, $pass)

# Upload index.html
$localFile = "C:\Users\info\Documents\cane\Toilettatura\marketing-aruba\index.html"
$remoteFile = "ftp://$ftpHost/$ftpDir/index.html"
Write-Host "Uploading index.html..."
$webclient.UploadFile($remoteFile, $localFile)

# Upload privacy.html
$localPrivacyFile = "C:\Users\info\Documents\cane\Toilettatura\marketing-aruba\privacy.html"
$remotePrivacyFile = "ftp://$ftpHost/$ftpDir/privacy.html"
Write-Host "Uploading privacy.html..."
$webclient.UploadFile($remotePrivacyFile, $localPrivacyFile)

# Upload demo-home.html
$localDemoFile = "C:\Users\info\Documents\cane\Toilettatura\marketing-aruba\demo-home.html"
$remoteDemoFile = "ftp://$ftpHost/$ftpDir/demo-home.html"
Write-Host "Uploading demo-home.html..."
$webclient.UploadFile($remoteDemoFile, $localDemoFile)

# Upload extra marketing images for Bento Grid
$extraImages = @("hero-station.png", "facility-map.png", "happy-dog.png")
foreach ($img in $extraImages) {
    $localImgFile = "C:\Users\info\Documents\cane\Toilettatura\marketing-aruba\$img"
    $remoteImgFile = "ftp://$ftpHost/$ftpDir/$img"
    Write-Host "Uploading $img to root on FTP..."
    $webclient.UploadFile($remoteImgFile, $localImgFile)
}



# Create immagini_sito
$dirUri = "ftp://$ftpHost/$ftpDir/immagini_sito/"
try {
    $request = [System.Net.FtpWebRequest]::Create($dirUri)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
    $response = $request.GetResponse()
    $response.Close()
    Write-Host "Created directory immagini_sito on FTP."
} catch {
    Write-Host "Directory immagini_sito might already exist."
}

# Create immagini_sito/sezione_2
$dirUri2 = "ftp://$ftpHost/$ftpDir/immagini_sito/sezione_2/"
try {
    $request = [System.Net.FtpWebRequest]::Create($dirUri2)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
    $response = $request.GetResponse()
    $response.Close()
    Write-Host "Created directory immagini_sito/sezione_2 on FTP."
} catch {
    Write-Host "Directory immagini_sito/sezione_2 might already exist."
}

$images = @(
    "icona_modello ibrido.png",
    "icona_self-service-H24.png",
    "icona_toilettatura assistita.png"
)

foreach ($img in $images) {
    $localImg = "C:\Users\info\Documents\cane\Toilettatura\immagini_sito\$img"
    $remoteImgName = [uri]::EscapeDataString($img)
    $remoteImg = "ftp://$ftpHost/$ftpDir/immagini_sito/$remoteImgName"
    Write-Host "Uploading $img to $remoteImg ..."
    $webclient.UploadFile($remoteImg, $localImg)
}

$images_sez2 = @(
    "icona_check-in_QR_gpt.png",
    "icona_monitoraggio_postazione_gpt.png",
    "icona_pagamenti_crediti_GPT.png",
    "icona_prenotazione_gpt.png"
)

foreach ($img in $images_sez2) {
    $localImg = "C:\Users\info\Documents\cane\Toilettatura\immagini_sito\sezione_2\$img"
    $remoteImgName = [uri]::EscapeDataString($img)
    $remoteImg = "ftp://$ftpHost/$ftpDir/immagini_sito/sezione_2/$remoteImgName"
    Write-Host "Uploading $img to $remoteImg ..."
    $webclient.UploadFile($remoteImg, $localImg)
}

Write-Host "All files uploaded successfully."

# Create immagini_sito/selezione_3
$dirUri3 = "ftp://$ftpHost/$ftpDir/immagini_sito/selezione_3/"
try {
    $request = [System.Net.FtpWebRequest]::Create($dirUri3)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
    $response = $request.GetResponse()
    $response.Close()
    Write-Host "Created directory immagini_sito/selezione_3 on FTP."
} catch {
    Write-Host "Directory immagini_sito/selezione_3 might already exist."
}

$images_sez3 = @(
    "icona_Dashboard_Admin_Completa.png",
    "icona_Profili_Cane_Multi-Pet.png",
    "icona_QR-code.png",
    "icona_Report_Analytics.png",
    "icona_Sessioni_Live_con_Timer.png",
    "icona_Sicurezza_Enterprise.png",
    "icona_Sistema_Ibrido_Assistenza.png",
    "icona_prenotazione.png",
    "icona_wallet.png"
)

foreach ($img in $images_sez3) {
    $localImg = "C:\Users\info\Documents\cane\Toilettatura\immagini_sito\selezione_3\$img"
    $remoteImgName = [uri]::EscapeDataString($img)
    $remoteImg = "ftp://$ftpHost/$ftpDir/immagini_sito/selezione_3/$remoteImgName"
    Write-Host "Uploading $img to $remoteImg ..."
    $webclient.UploadFile($remoteImg, $localImg)
}

Write-Host "All files uploaded successfully including selezione_3."
