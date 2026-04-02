param(
    [string]$WorkbookPath = "C:\Users\luhmc\Downloads\Planilha Gerador.xlsx",
    [string]$OutputDir = "D:\projetos\uniformes-app"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-EntryText {
    param($Zip, [string]$Name)
    $entry = $Zip.GetEntry($Name)
    if (-not $entry) { return $null }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Normalize-Text {
    param($Value)
    if ($null -eq $Value) { return "" }
    if ($Value -is [System.Xml.XmlElement]) { return ([string]$Value.InnerText).Trim() }
    if ($Value -is [System.Array]) {
        return (($Value | ForEach-Object { Normalize-Text $_ }) -join "").Trim()
    }
    return ([string]$Value).Trim()
}

function Get-SharedStrings {
    param($Zip)
    [xml]$sharedXml = Get-EntryText $Zip "xl/sharedStrings.xml"
    $items = @()
    if ($sharedXml -and $sharedXml.sst.si) {
        foreach ($si in $sharedXml.sst.si) {
            if ($si.t) {
                if ($si.t -is [string]) {
                    $items += $si.t
                } else {
                    $items += [string]$si.t.InnerText
                }
            } elseif ($si.r) {
                $items += (($si.r | ForEach-Object {
                    if ($_.t -is [string]) { $_.t } else { [string]$_.t.InnerText }
                }) -join "")
            } else {
                $items += ""
            }
        }
    }
    return $items
}

function Get-CellValue {
    param($Cell, [string[]]$SharedStrings)
    if (-not $Cell) { return $null }
    $type = [string]$Cell.t
    $raw = [string]$Cell.v
    if ($type -eq "s" -and $raw -ne "") {
        return $SharedStrings[[int]$raw]
    }
    return $raw
}

function Get-RowMap {
    param($Row, [string[]]$SharedStrings)
    $map = @{}
    foreach ($cell in @($Row.c)) {
        $column = ([string]$cell.r -replace '\d', '')
        $map[$column] = Get-CellValue $cell $SharedStrings
    }
    return $map
}

function Convert-ExcelSerialToDateTime {
    param($Value)
    if (-not $Value) { return $null }
    $number = 0.0
    if (-not [double]::TryParse([string]$Value, [ref]$number)) { return $null }
    if ($number -lt 1 -or $number -gt 60000) { return $null }
    return ([datetime]"1899-12-30").AddDays($number)
}

function Format-DateValue {
    param($Value)
    $date = Convert-ExcelSerialToDateTime $Value
    if ($date) { return $date.ToString("dd/MM/yyyy") }
    return Normalize-Text $Value
}

function Format-DateTimeValue {
    param($Value)
    $date = Convert-ExcelSerialToDateTime $Value
    if ($date) { return $date.ToString("dd/MM/yyyy HH:mm") }
    return Normalize-Text $Value
}

function Format-TimeValue {
    param($Value)
    $date = Convert-ExcelSerialToDateTime $Value
    if ($date) { return $date.ToString("HH:mm") }
    return Normalize-Text $Value
}

function Resolve-DateText {
    param(
        $PrimaryValue,
        $FallbackValues
    )
    $primary = Format-DateValue $PrimaryValue
    if ($primary -match '^\d{2}/\d{2}/\d{4}$') {
        return $primary
    }
    foreach ($fallback in @($FallbackValues)) {
        $candidate = Format-DateValue $fallback
        if ($candidate -match '^\d{2}/\d{2}/\d{4}$') {
            return $candidate
        }
    }
    return $primary
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($WorkbookPath)
try {
    $sharedStrings = Get-SharedStrings $zip
    $sheetMap = [ordered]@{
        dashboard = "xl/worksheets/sheet1.xml"
        lancamentos = "xl/worksheets/sheet2.xml"
        auditoria = "xl/worksheets/sheet3.xml"
        manutencoes = "xl/worksheets/sheet4.xml"
        status = "xl/worksheets/sheet5.xml"
    }

    $sheets = @{}
    foreach ($key in $sheetMap.Keys) {
        [xml]$sheetXml = Get-EntryText $zip $sheetMap[$key]
        $sheets[$key] = @($sheetXml.worksheet.sheetData.row)
    }

    $dashboardTitle = Normalize-Text ((Get-RowMap $sheets.dashboard[0] $sharedStrings)["A"])
    $dashboardSubtitle = Normalize-Text ((Get-RowMap $sheets.dashboard[1] $sharedStrings)["A"])
    $dashboardHoursLabel = Normalize-Text ((Get-RowMap $sheets.dashboard[2] $sharedStrings)["D"])
    $currentHours = Normalize-Text ((Get-RowMap $sheets.dashboard[3] $sharedStrings)["B"])
    $dashboardGeneratorLabel = Normalize-Text ((Get-RowMap $sheets.dashboard[5] $sharedStrings)["A"])
    $dashboardIcon = Normalize-Text ((Get-RowMap $sheets.dashboard[7] $sharedStrings)["A"])
    $dashboardMainAlert = Normalize-Text ((Get-RowMap $sheets.dashboard[9] $sharedStrings)["A"])
    $dashboardOleoLine = Normalize-Text ((Get-RowMap $sheets.dashboard[11] $sharedStrings)["A"])
    $dashboardGeralLine = Normalize-Text ((Get-RowMap $sheets.dashboard[11] $sharedStrings)["C"])
    $dashboardArrefecimentoLine = Normalize-Text ((Get-RowMap $sheets.dashboard[12] $sharedStrings)["A"])
    $dashboardFooterAlert = Normalize-Text ((Get-RowMap $sheets.dashboard[15] $sharedStrings)["A"])

    $statusRows = foreach ($row in ($sheets.status | Select-Object -Skip 1)) {
        $cells = Get-RowMap $row $sharedStrings
        if (-not $cells["A"]) { continue }
        [pscustomobject]@{
            gerador = Normalize-Text $cells["A"]
            horimetroAtual = Normalize-Text $cells["B"]
            statusOleo = Normalize-Text $cells["D"]
            statusGeral = Normalize-Text $cells["F"]
            statusArrefecimento = Normalize-Text $cells["H"]
            manutencaoCritica = Normalize-Text $cells["J"]
            statusGeralHibrido = Normalize-Text $cells["N"]
        }
    }

    $lancamentos = foreach ($row in ($sheets.lancamentos | Select-Object -Skip 1)) {
        $cells = Get-RowMap $row $sharedStrings
        if (-not $cells["A"] -and -not $cells["B"]) { continue }
        [pscustomobject]@{
            data = Format-DateValue $cells["A"]
            gerador = Normalize-Text $cells["B"]
            horaInicio = Format-TimeValue $cells["C"]
            horaFim = Format-TimeValue $cells["D"]
            horasTrabalhadas = Normalize-Text $cells["E"]
            horimetroInicio = Normalize-Text $cells["F"]
            horimetroFim = Normalize-Text $cells["G"]
            responsavel = Normalize-Text $cells["J"]
            observacoes = Normalize-Text $cells["K"]
        }
    }

    $auditoria = foreach ($row in ($sheets.auditoria | Select-Object -Skip 1)) {
        $cells = Get-RowMap $row $sharedStrings
        if (-not $cells["A"]) { continue }
        [pscustomobject]@{
            dataHora = Format-DateTimeValue $cells["A"]
            tipo = Normalize-Text $cells["B"]
            gerador = Normalize-Text $cells["C"]
            acao = Normalize-Text $cells["D"]
            detalhe = Normalize-Text $cells["E"]
        }
    }

    $manutencoes = foreach ($row in ($sheets.manutencoes | Select-Object -Skip 1)) {
        $cells = Get-RowMap $row $sharedStrings
        if (-not $cells["A"]) { continue }
        [pscustomobject]@{
            gerador = Normalize-Text $cells["A"]
            oleo = Resolve-DateText $cells["B"] @($cells["H"])
            preventiva = Normalize-Text $cells["C"]
            intervaloOleoDias = Normalize-Text $cells["D"]
            intervaloPreventivaHoras = Normalize-Text $cells["E"]
            arrefecimento = Resolve-DateText $cells["F"] @($cells["H"], $cells["B"])
            intervaloArrefecimentoDias = Normalize-Text $cells["G"]
            geral = Resolve-DateText $cells["H"] @($cells["B"])
            manutencaoPreventivaDias = Normalize-Text $cells["I"]
            realizado = Normalize-Text $cells["J"]
        }
    }

    $automaticCount = @($lancamentos | Where-Object { $_.responsavel -eq "AUTOMÁTICO" -or $_.responsavel -eq "AUTOMATICO" }).Count
    $criticalCount = @($statusRows | Where-Object { $_.manutencaoCritica -or $_.statusOleo -match "Vencida" }).Count

    $payload = [ordered]@{
        origem = [System.IO.Path]::GetFileName($WorkbookPath)
        atualizadoEm = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        dashboard = [ordered]@{
            titulo = $dashboardTitle
            subtitulo = $dashboardSubtitle
            horasLabel = $dashboardHoursLabel
            horasAtuais = $currentHours
            geradorReferencia = $dashboardGeneratorLabel
            icone = $dashboardIcon
            alertaPrincipal = $dashboardMainAlert
            linhaOleo = $dashboardOleoLine
            linhaGeral = $dashboardGeralLine
            linhaArrefecimento = $dashboardArrefecimentoLine
            alertaRodape = $dashboardFooterAlert
        }
        resumo = [ordered]@{
            horasAtuais = $currentHours
            geradores = @($statusRows | Where-Object { $_.gerador }).Count
            lancamentosAutomaticos = $automaticCount
            registrosAuditoria = @($auditoria).Count
            manutencoesCriticas = $criticalCount
        }
        status = @($statusRows)
        lancamentos = @($lancamentos)
        auditoria = @($auditoria)
        manutencoes = @($manutencoes)
    }

    $json = $payload | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText((Join-Path $OutputDir "gerador-data.json"), $json, [System.Text.UTF8Encoding]::new($true))
    [System.IO.File]::WriteAllText((Join-Path $OutputDir "gerador-data.js"), "window.GERADOR_DATA = $json;", [System.Text.UTF8Encoding]::new($true))
    Write-Output "Gerador importado com sucesso."
} finally {
    $zip.Dispose()
}
