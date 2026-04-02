param(
    [string]$SourceFile = "C:\Users\luhmc\Downloads\CONTROLE UNIFORMES TECNICOS.xlsx",
    [string]$OutputFile = (Join-Path $PSScriptRoot "data.json")
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Get-ZipXml([System.IO.Compression.ZipArchive]$Zip, [string]$EntryName) {
    $entry = $Zip.GetEntry($EntryName)
    if (-not $entry) {
        return $null
    }

    $reader = New-Object System.IO.StreamReader($entry.Open())
    try {
        [xml]$reader.ReadToEnd()
    } finally {
        $reader.Dispose()
    }
}

function Get-SharedStrings([xml]$SharedXml) {
    $items = @()
    if (-not $SharedXml -or -not $SharedXml.sst.si) {
        return $items
    }

    foreach ($si in $SharedXml.sst.si) {
        $items += [string]$si.InnerText
    }

    return $items
}

function Get-CellText($Cell, [string[]]$SharedStrings) {
    if ($null -eq $Cell) {
        return ""
    }

    $type = [string]$Cell.t
    $value = [string]$Cell.v

    if ($type -eq "s" -and $value -match "^\d+$") {
        return $SharedStrings[[int]$value]
    }

    if ($type -eq "inlineStr" -and $Cell.is -and $Cell.is.t) {
        return [string]$Cell.is.t.InnerText
    }

    if ($Cell.is -and $Cell.is.t) {
        return [string]$Cell.is.t.InnerText
    }

    return $value
}

function Convert-ExcelDate($Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    try {
        return [datetime]::FromOADate([double]$Value).ToString("yyyy-MM-dd")
    } catch {
        return [string]$Value
    }
}

function Normalize-Text([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    $text = ($Value -replace "\s+", " ").Trim()
    if ($text -eq "System.Xml.XmlElement") {
        return ""
    }

    if ($text -match "[Ãâ]") {
        try {
            $bytes = [System.Text.Encoding]::GetEncoding("ISO-8859-1").GetBytes($text)
            $fixed = [System.Text.Encoding]::UTF8.GetString($bytes)
            if (-not [string]::IsNullOrWhiteSpace($fixed)) {
                $text = $fixed
            }
        } catch {
        }
    }

    $text = $text.Replace("MANUTENÃ‡ÃƒO", "MANUTENÇÃO")
    $text = $text.Replace("CalÃ§a", "Calça")
    $text = $text.Replace("CalÃ§as", "Calças")

    return $text
}

function Get-SheetRows([System.IO.Compression.ZipArchive]$Zip, [xml]$WorkbookXml, [xml]$WorkbookRelsXml, [string[]]$SharedStrings, [string]$SheetName) {
    $sheet = $WorkbookXml.workbook.sheets.sheet | Where-Object { $_.name -eq $SheetName }
    if (-not $sheet) {
        return @()
    }

    $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $target = ($WorkbookRelsXml.Relationships.Relationship | Where-Object { $_.Id -eq $rid }).Target
    if (-not $target.StartsWith("/")) {
        $target = "xl/" + $target.TrimStart("/")
    }

    $sheetXml = Get-ZipXml $Zip $target
    $rows = @()

    foreach ($row in $sheetXml.worksheet.sheetData.row) {
        $map = @{}
        foreach ($cell in $row.c) {
            $map[[string]$cell.r] = Get-CellText $cell $SharedStrings
        }
        $rows += $map
    }

    return $rows
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($SourceFile)

try {
    $workbookXml = Get-ZipXml $zip "xl/workbook.xml"
    $workbookRelsXml = Get-ZipXml $zip "xl/_rels/workbook.xml.rels"
    $sharedStrings = Get-SharedStrings (Get-ZipXml $zip "xl/sharedStrings.xml")

    $estoqueRows = Get-SheetRows $zip $workbookXml $workbookRelsXml $sharedStrings "Estoque"
    $funcionarioRows = Get-SheetRows $zip $workbookXml $workbookRelsXml $sharedStrings "Funcionarios"
    $movRows = Get-SheetRows $zip $workbookXml $workbookRelsXml $sharedStrings "Movimentacoes"
    $resumoRows = Get-SheetRows $zip $workbookXml $workbookRelsXml $sharedStrings "Resumo"

    $estoque = foreach ($row in $estoqueRows | Select-Object -Skip 1) {
        $tipo = ($row.Keys | Where-Object { $_ -like "A*" } | Select-Object -First 1)
        $tamanho = ($row.Keys | Where-Object { $_ -like "B*" } | Select-Object -First 1)
        $inicial = ($row.Keys | Where-Object { $_ -like "C*" } | Select-Object -First 1)
        $atual = ($row.Keys | Where-Object { $_ -like "D*" } | Select-Object -First 1)

        if (-not $tipo -or [string]::IsNullOrWhiteSpace($row[$tipo])) {
            continue
        }

        [pscustomobject]@{
            tipo = Normalize-Text $row[$tipo]
            tamanho = Normalize-Text $row[$tamanho]
            quantidadeInicial = [int][double]$row[$inicial]
            quantidadeAtual = [int][double]$row[$atual]
        }
    }

    $funcionarios = foreach ($row in $funcionarioRows | Select-Object -Skip 1) {
        $nomeKey = ($row.Keys | Where-Object { $_ -like "A*" } | Select-Object -First 1)
        $setorKey = ($row.Keys | Where-Object { $_ -like "B*" } | Select-Object -First 1)
        $posseKey = ($row.Keys | Where-Object { $_ -like "C*" } | Select-Object -First 1)

        if (-not $nomeKey) {
            continue
        }

        $nome = Normalize-Text $row[$nomeKey]
        if ([string]::IsNullOrWhiteSpace($nome)) {
            continue
        }

        [pscustomobject]@{
            nome = $nome
            setor = if ($setorKey) { Normalize-Text $row[$setorKey] } else { "" }
            uniformesEmPosse = if ($posseKey) { Normalize-Text $row[$posseKey] } else { "" }
        }
    }

    $movimentacoes = foreach ($row in $movRows | Select-Object -Skip 1) {
        $dataKey = ($row.Keys | Where-Object { $_ -like "A*" } | Select-Object -First 1)
        $tipoKey = ($row.Keys | Where-Object { $_ -like "B*" } | Select-Object -First 1)
        $tamanhoKey = ($row.Keys | Where-Object { $_ -like "C*" } | Select-Object -First 1)
        $funcionarioKey = ($row.Keys | Where-Object { $_ -like "D*" } | Select-Object -First 1)
        $quantidadeKey = ($row.Keys | Where-Object { $_ -like "E*" } | Select-Object -First 1)
        $movimentoKey = ($row.Keys | Where-Object { $_ -like "F*" } | Select-Object -First 1)

        if (-not $tipoKey -or [string]::IsNullOrWhiteSpace($row[$tipoKey])) {
            continue
        }

        $funcionario = Normalize-Text $row[$funcionarioKey]
        if ([string]::IsNullOrWhiteSpace($funcionario)) {
            $funcionario = "Funcionario nao identificado"
        }

        [pscustomobject]@{
            data = Convert-ExcelDate $row[$dataKey]
            tipo = Normalize-Text $row[$tipoKey]
            tamanho = Normalize-Text $row[$tamanhoKey]
            funcionario = $funcionario
            quantidade = [int][double]$row[$quantidadeKey]
            movimento = Normalize-Text $row[$movimentoKey]
        }
    }

    $resumo = foreach ($row in $resumoRows | Select-Object -Skip 1) {
        $tipoKey = ($row.Keys | Where-Object { $_ -like "A*" } | Select-Object -First 1)
        $qtdKey = ($row.Keys | Where-Object { $_ -like "B*" } | Select-Object -First 1)
        if (-not $tipoKey -or [string]::IsNullOrWhiteSpace($row[$tipoKey])) {
            continue
        }

        [pscustomobject]@{
            tipo = Normalize-Text $row[$tipoKey]
            quantidade = [int][double]$row[$qtdKey]
        }
    }

    $payload = [pscustomobject]@{
        atualizadoEm = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        origem = [System.IO.Path]::GetFileName($SourceFile)
        estoque = @($estoque)
        funcionarios = @($funcionarios)
        movimentacoes = @($movimentacoes)
        resumo = @($resumo)
    }

    $json = $payload | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($OutputFile, $json, $utf8Bom)
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "data.js"), "window.UNIFORMES_DATA = $json;", $utf8Bom)
    Write-Host "Dados exportados para $OutputFile" -ForegroundColor Green
} finally {
    $zip.Dispose()
}
