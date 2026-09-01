# Use .NET to check Tauri globals via CDP
# First, get the list of targets
$httpClient = New-Object System.Net.Http.HttpClient
$response = $httpClient.GetAsync("http://127.0.0.1:9222/json/list").Result
$targets = $response.Content.ReadAsStringAsync().Result
Write-Host "Targets: $targets"

# Find the page target
$targetsObj = $targets | ConvertFrom-Json
foreach ($t in $targetsObj) {
    if ($t.type -eq "page") {
        Write-Host "Page URL: $($t.url)"
        Write-Host "Page title: $($t.title)"
        
        # Get the webSocketDebuggerUrl
        $wsUrl = $t.webSocketDebuggerUrl
        Write-Host "WebSocket URL: $wsUrl"
        
        # Try to connect and evaluate
        try {
            $ws = New-Object System.Net.WebSockets.ClientWebSocket
            $cts = New-Object System.Threading.CancellationTokenSource
            $task = $ws.ConnectAsync($wsUrl, $cts.Token)
            $task.Wait(5000)
            Write-Host "WebSocket connected!"
            
            # Send a simple eval command
            $evalJson = '{"id":1,"method":"Runtime.evaluate","params":{"expression":"typeof window.__TAURI_INTERNALS__","contextId":1}}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($evalJson + "`n")
            
            # Try to send
            $sendTask = $ws.SendAsync(new-Object byte[][]($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token)
            $sendTask.Wait(5000)
            Write-Host "Send complete"
            
            # Receive response
            $receiveTask = $ws.ReceiveAsync().GetAwaiter().GetResult(5000)
            $responseStr = [System.Text.Encoding]::UTF8.GetString($receiveTask)
            Write-Host "Evaluate response: $responseStr"
            
            $ws.Dispose()
        } catch {
            Write-Host "Error: $_"
        }
        break
    }
}