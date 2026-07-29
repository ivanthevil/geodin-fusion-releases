param(
  [Parameter(Mandatory=$true)][string]$DatabasePath,
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][int]$LocationId
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.IO.Compression
[Console]::OutputEncoding = [Text.Encoding]::UTF8

if (-not (Test-Path -LiteralPath $DatabasePath)) {
  throw "GeoDIN-Datenbank wurde nicht gefunden."
}

$conn = New-Object Data.Odbc.OdbcConnection("Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$DatabasePath;Pooling=False;")
$tableNames = New-Object "Collections.Generic.HashSet[string]" ([StringComparer]::OrdinalIgnoreCase)

function Q([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }

function Table-Exists([string]$Name) {
  return $tableNames.Contains($Name)
}

function Column-Names([string]$Table) {
  if (-not (Table-Exists $Table)) { return @() }
  $cmd = $conn.CreateCommand()
  try {
    $cmd.CommandText = "SELECT * FROM [$Table] WHERE 1=0"
    $reader = $cmd.ExecuteReader()
    try {
      return @($reader.GetSchemaTable().Rows | Sort-Object { [int]$_['ColumnOrdinal'] } | ForEach-Object { [string]$_['ColumnName'] })
    } finally { $reader.Close(); $reader.Dispose() }
  } finally { $cmd.Dispose() }
}

function Convert-Value($Value) {
  if ($null -eq $Value -or $Value -eq [DBNull]::Value) { return $null }
  if ($Value -is [DateTime]) { return $Value.ToString("yyyy-MM-dd") }
  if ($Value -is [byte[]]) { return $null }
  return $Value
}

function Convert-GeoDinNumber($Value) {
  if ($null -eq $Value -or $Value -eq [DBNull]::Value) { return [double]::NaN }
  if ($Value -isnot [string]) {
    try { return [Convert]::ToDouble($Value,[Globalization.CultureInfo]::InvariantCulture) } catch {}
  }
  $text = ([string]$Value).Trim()
  $match = [regex]::Match($text,"[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)")
  if (-not $match.Success) { return [double]::NaN }
  $number = 0.0
  if ([double]::TryParse($match.Value.Replace(",","."),[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$number)) {
    return $number
  }
  return [double]::NaN
}

function Ramm-DisplayValue($Value, [double]$Number) {
  $text = if ($null -eq $Value -or $Value -eq [DBNull]::Value) { "" } else { ([string]$Value).Trim() }
  if ($text) { return $text }
  return $Number.ToString("0.##",[Globalization.CultureInfo]::InvariantCulture)
}

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand()
  try {
    $cmd.CommandText = $Sql
    $reader = $cmd.ExecuteReader()
    $rows = @()
    try {
      while ($reader.Read()) {
        $row = [ordered]@{}
        for ($i=0; $i -lt $reader.FieldCount; $i++) {
          $row[$reader.GetName($i)] = Convert-Value $reader.GetValue($i)
        }
        $rows += [pscustomobject]$row
      }
    } finally { $reader.Close(); $reader.Dispose() }
    return @($rows)
  } finally { $cmd.Dispose() }
}

function Point-Rows([string]$Table, [string]$Order = "RECID") {
  if (-not (Table-Exists $Table)) { return @() }
  $columns = @(Column-Names $Table)
  if ("PRJ_ID" -notin $columns -or "LOCID" -notin $columns) { return @() }
  $orderSql = if ($Order -and $Order -in $columns) { " ORDER BY [$Order]" } else { "" }
  return @(Invoke-Rows "SELECT * FROM [$Table] WHERE [PRJ_ID]=$(Q $ProjectId) AND [LOCID]=$LocationId$orderSql")
}

function Read-Ramm-Blob {
  if (-not (Table-Exists "GEODIN_LOC_SONDREG")) { return @() }
  $columns = @(Column-Names "GEODIN_LOC_SONDREG")
  if ("SNDDATA" -notin $columns) { return @() }
  $cmd = $conn.CreateCommand()
  try {
    $cmd.CommandText = "SELECT TOP 1 [SNDDATA] FROM [GEODIN_LOC_SONDREG] WHERE [PRJ_ID]=$(Q $ProjectId) AND [LOCID]=$LocationId ORDER BY [RECID]"
    $value = $cmd.ExecuteScalar()
    if ($null -eq $value -or $value -eq [DBNull]::Value -or -not ($value -is [byte[]])) { return @() }
    $memory = New-Object IO.MemoryStream(,$value)
    try {
      $zip = New-Object IO.Compression.ZipArchive($memory,[IO.Compression.ZipArchiveMode]::Read)
      try {
        if (-not $zip.Entries.Count) { return @() }
        $reader = New-Object IO.StreamReader($zip.Entries[0].Open(),[Text.Encoding]::Default)
        try {
          $rows = @()
          foreach ($line in ($reader.ReadToEnd() -split "\r?\n")) {
            $parts = $line.Trim() -split "[;`t ]+"
            if ($parts.Count -lt 2) { continue }
            $depth = Convert-GeoDinNumber $parts[0]
            $valueNumber = Convert-GeoDinNumber $parts[1]
            if (-not [double]::IsNaN($depth) -and -not [double]::IsNaN($valueNumber)) {
              $rawValue = ($parts[1..($parts.Count-1)] -join " ").Trim()
              $rows += [pscustomobject]@{ depth=$depth; blows=$valueNumber; display=(Ramm-DisplayValue $rawValue $valueNumber) }
            }
          }
          return @($rows)
        } finally { $reader.Dispose() }
      } finally { $zip.Dispose() }
    } finally { $memory.Dispose() }
  } catch {
    return @()
  } finally { $cmd.Dispose() }
}

try {
  $conn.Open()
  $schema = $conn.GetSchema("Tables")
  try {
    foreach ($row in $schema.Rows) {
      if ([string]$row["TABLE_TYPE"] -eq "TABLE") { [void]$tableNames.Add([string]$row["TABLE_NAME"]) }
    }
  } finally { $schema.Dispose() }

  $locations = @(Point-Rows "GEODIN_LOC_LOCREG" "")
  if (-not $locations.Count) { throw "Der Punkt wurde in der Datenbank nicht gefunden." }
  $location = $locations[0]
  $master = @(Point-Rows "GEODIN_LOC_SSGKRZT1" "")
  $metadata = if ($master.Count) { $master[0] } else { $null }

  $rawLayers = @(Point-Rows "GEODIN_LOC_SSGSVGEO")
  $layers = @()
  $from = 0.0
  foreach ($row in $rawLayers) {
    $to = Convert-GeoDinNumber $row.DEPTH
    if ([double]::IsNaN($to)) { $to = $from }
    $parts = @($row.PETRO,$row.GENESE,$row.FARBE,$row.ZUSATZ,$row.ERGBEM,$row.BESCHBG,$row.BESCHBV,$row.GRUPPE,$row.BEMERK) |
      ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ }
    $layers += [pscustomobject]@{
      from = $from
      to = $to
      petro = [string]$row.PETRO
      strat = [string]$row.STRAT
      description = ($parts -join " | ")
    }
    $from = $to
  }

  $ramm = @()
  foreach ($row in @(Point-Rows "GEODIN_LOC_SONDDATA")) {
    $rammDepth = Convert-GeoDinNumber $row.DEPTH
    $rammValue = Convert-GeoDinNumber $row.SNDVALUE
    if ([double]::IsNaN($rammDepth) -or [double]::IsNaN($rammValue)) { continue }
    $ramm += [pscustomobject]@{
      depth = $rammDepth
      blows = $rammValue
      display = Ramm-DisplayValue $row.SNDVALUE $rammValue
    }
  }
  if (-not $ramm.Count) { $ramm = @(Read-Ramm-Blob) }

  $gwmPipes = @(Point-Rows "GEODIN_LOC_ASBROHRE")
  $gwmFilters = @(Point-Rows "GEODIN_LOC_ASBFILTR")
  $gwmBackfill = @(Point-Rows "GEODIN_LOC_ASBVERFL")
  $gwmBorehole = @(Point-Rows "GEODIN_LOC_ASBBOHRL")
  $gwmStem = @(Point-Rows "GEODIN_LOC_ASBSTAMM")

  $out = [ordered]@{
    databasePath = [IO.Path]::GetFullPath($DatabasePath)
    projectId = $ProjectId
    locationId = $LocationId
    location = $location
    metadata = $metadata
    methods = [ordered]@{
      rks = $layers.Count -gt 0
      ramme = $ramm.Count -gt 0
      gwm = ($gwmPipes.Count + $gwmFilters.Count + $gwmBackfill.Count + $gwmBorehole.Count + $gwmStem.Count) -gt 0
    }
    layers = @($layers)
    ramm = @($ramm)
    gwm = [ordered]@{
      stem = @($gwmStem)
      pipes = @($gwmPipes)
      filters = @($gwmFilters)
      backfill = @($gwmBackfill)
      borehole = @($gwmBorehole)
    }
  }
  $out | ConvertTo-Json -Depth 12 -Compress
} finally {
  if ($conn.State -eq "Open") { $conn.Close() }
  $conn.Dispose()
  [Data.Odbc.OdbcConnection]::ReleaseObjectPool()
}
