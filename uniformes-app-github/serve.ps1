param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

function Get-LocalIPv4 {
    $output = ipconfig | Out-String
    $matches = [regex]::Matches($output, 'IPv4[^\:]*:\s*(\d{1,3}(?:\.\d{1,3}){3})')
    foreach ($match in $matches) {
        $ip = $match.Groups[1].Value
        if ($ip -and $ip -ne "127.0.0.1" -and -not $ip.StartsWith("169.254.")) {
            return $ip
        }
    }
    return $null
}

function Get-ContentType([string]$Path) {
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html; charset=utf-8"; break }
        ".css"  { "text/css; charset=utf-8"; break }
        ".js"   { "application/javascript; charset=utf-8"; break }
        ".json" { "application/json; charset=utf-8"; break }
        ".svg"  { "image/svg+xml"; break }
        ".png"  { "image/png"; break }
        ".jpg"  { "image/jpeg"; break }
        ".jpeg" { "image/jpeg"; break }
        ".ico"  { "image/x-icon"; break }
        ".txt"  { "text/plain; charset=utf-8"; break }
        default { "application/octet-stream" }
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$localIp = Get-LocalIPv4

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Host ""
Write-Host "Servidor do app iniciado." -ForegroundColor Green
Write-Host "Pasta: $root"
Write-Host "Local: http://localhost:$Port/"
if ($localIp) {
    Write-Host "Rede local: http://$localIp`:$Port/"
}
Write-Host "Pressione Ctrl+C para parar."
Write-Host ""

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)

        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            $client.Close()
            continue
        }

        $parts = $requestLine.Split(" ")
        $method = if ($parts.Length -ge 1) { $parts[0].ToUpperInvariant() } else { "GET" }
        $rawTarget = if ($parts.Length -ge 2) { $parts[1] } else { "/" }

        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
        }

        if ($method -ne "GET" -and $method -ne "HEAD") {
            $body = [System.Text.Encoding]::UTF8.GetBytes("Metodo nao suportado")
            $header = "HTTP/1.1 405 Method Not Allowed`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne "HEAD") {
                $stream.Write($body, 0, $body.Length)
            }
            $client.Close()
            continue
        }

        $uri = [System.Uri]("http://localhost$rawTarget")
        $relativePath = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = "index.html"
        }

        if ($relativePath.EndsWith("/")) {
            $relativePath = $relativePath.TrimEnd("/") + "/index.html"
        }

        $candidate = Join-Path $root $relativePath
        $resolvedRoot = [IO.Path]::GetFullPath($root)
        $resolvedPath = [IO.Path]::GetFullPath($candidate)

        if (-not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes("Acesso negado")
            $header = "HTTP/1.1 403 Forbidden`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne "HEAD") {
                $stream.Write($body, 0, $body.Length)
            }
            $client.Close()
            continue
        }

        if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado")
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne "HEAD") {
                $stream.Write($body, 0, $body.Length)
            }
            $client.Close()
            continue
        }

        $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
        $contentType = Get-ContentType $resolvedPath
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        if ($method -ne "HEAD") {
            $stream.Write($bytes, 0, $bytes.Length)
        }
    }
    catch {
        try {
            $stream = $client.GetStream()
            $body = [System.Text.Encoding]::UTF8.GetBytes("Erro interno do servidor")
            $header = "HTTP/1.1 500 Internal Server Error`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
        } catch {}
    }
    finally {
        $client.Close()
    }
}
