# Test Tauri IPC from running EXE
$wc = New-Object System.Net.WebClient
try {
    $version = $wc.DownloadString('http://127.0.0.1:9222/json/version')
    Write-Host "DevTools endpoint available: $version"
    
    # Try to evaluate window.__TAURI_INTERNALS__ in the page context
    # Using the CDP (Chrome DevTools Protocol)
    $cdp = New-Object System.Net.WebClient
    $targets = $cdp.DownloadString('http://127.0.0.1:9222/json/list')
    Write-Host "Targets: $targets"
    
    # Find the edge/iframe target
    $targetsObj = $version | ConvertFrom-Json
    foreach ($t in $targetsObj) {
        Write-Host "Target: $t.url - $t.title"
    }
} catch {
    Write-Host "Error: $_"
}