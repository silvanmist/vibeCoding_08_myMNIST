$port = 5501
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "=========================================="
Write-Host "손글씨 AI 인식기 웹 서버가 실행되었습니다!" -ForegroundColor Cyan
Write-Host "접속 주소: $prefix" -ForegroundColor Green
Write-Host "종료하려면 Ctrl+C를 누르세요."
Write-Host "=========================================="

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # CORS 헤더
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $urlPath = $request.Url.AbsolutePath
        $localPath = $urlPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($localPath)) { $localPath = 'index.html' }
        $filePath = Join-Path $PSScriptRoot $localPath

        if (Test-Path $filePath) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            if ($ext -eq '.html') { $response.ContentType = 'text/html; charset=utf-8' }
            elseif ($ext -eq '.css') { $response.ContentType = 'text/css; charset=utf-8' }
            elseif ($ext -eq '.js') { $response.ContentType = 'application/javascript; charset=utf-8' }
            elseif ($ext -eq '.json') { $response.ContentType = 'application/json; charset=utf-8' }
            elseif ($ext -eq '.png') { $response.ContentType = 'image/png' }
            elseif ($ext -eq '.svg') { $response.ContentType = 'image/svg+xml' }
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
