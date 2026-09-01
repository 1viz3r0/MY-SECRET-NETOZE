# Test Tauri IPC from running EXE using Chrome DevTools Protocol
$pageWsUrl = "ws://127.0.0.1:9222/devtools/page/BF623ED95B339EA46BA9AF42863CDB9D"

$ws = New-Object System.Net.WebSockets.ClientWebSocket
try {
    $cts = New-Object System.Threading.CancellationTokenSource
    $task = $ws.ConnectAsync($pageWsUrl, $cts.Token)
    $task.Wait(5000)
    Write-Host "WebSocket connected!"
    
    # Try to use DCOM/ActiveX or just evaluate via a different method
    # Let's try sending a simple ping first
    # Actually, let's just try the eval using the proper CDP format
    
    # Build the JSON message for Runtime.evaluate
    $evalJson = '{"id":1,"method":"Runtime.evaluate","params":{"expression":"typeof window.__TAURI_INTERNALS__","contextId":1}}'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($evalJson + "`n`)
    
    # Use the Send method - check if it exists
    if ($ws.Send -is [method]) {
        $ws.Send($bytes)
        Write-Host "Send method worked"
    } else {
        Write-Host "No Send method, trying SendAsync"
        # Try SendAsync
        $ar = $ws.BeginSend($bytes, [Action[IAsyncResult]]((fun $ar2 { $ws.EndSend($ar2) })), $null)
    }
    
    # Try to receive
    try {
        $result = $ws.ReceiveAsync().GetAwaiter().GetResult(3000)
        $response = [System.Text.Encoding]::UTF8.GetString(result)
        Write-Host "Response: $response"
    } catch {
        Write-Host "Receive error: $_"
    }
    
    $ws.Dispose()
} catch {
    Write-Host "Error: $_"
}