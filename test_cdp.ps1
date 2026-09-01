# Test Tauri IPC from running EXE using Chrome DevTools Protocol
# Connect to the page's WebSocket endpoint and evaluate window.__TAURI_INTERNALS__

$pageWsUrl = "ws://127.0.0.1:9222/devtools/page/BF623ED95B339EA46BA9AF42863CDB9D"

# Try to use .NET WebSocket to connect
$ws = New-Object System.Net.WebSockets.ClientWebSocket
try {
    $cts = New-Object System.Threading.CancellationTokenSource
    $task = $ws.ConnectAsync($pageWsUrl, $cts.Token)
    $task.Wait(5000)
    Write-Host "WebSocket connected!"
    
    # Send Runtime.evaluate command
    $evalCmd = @{
        id = 1
        method = "Runtime.evaluate"
        params = @{
            expression = "typeof window.__TAURI_INTERNALS__"
            contextId = 1
        }
    }
    $json = $evalCmd | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json + "`n")
    $ws.Send($bytes)
    
    # Receive response
    $buffer = New-Object System.Collections.Generic.List[byte]
    do {
        $result = $ws.ReceiveAsync().GetAwaiter().GetResult()
        $buffer.AddRange($result)
    } while ($result.EndOfMessage -ne "Text")
    
    $response = [System.Text.Encoding]::UTF8.GetString($buffer.ToArray())
    Write-Host "Response: $response"
    
    $ws.Dispose()
} catch {
    Write-Host "Error: $_"
}