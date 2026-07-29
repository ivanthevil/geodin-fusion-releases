param(
  [Parameter(Mandatory=$true)][string]$DatabasePath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Data
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Test-Path -LiteralPath $DatabasePath)) {
  throw "GeoDIN-Datenbank wurde nicht gefunden: $DatabasePath"
}

$cs = "Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$DatabasePath;"
$conn = New-Object System.Data.Odbc.OdbcConnection($cs)

function Close-Db {
  if ($null -ne $conn) {
    try { if ($conn.State -eq "Open") { $conn.Close() } } catch {}
    try { $conn.Dispose() } catch {}
  }
  [System.Data.Odbc.OdbcConnection]::ReleaseObjectPool()
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

function Invoke-Rows([string]$Sql) {
  $cmd = $conn.CreateCommand()
  try {
    $cmd.CommandText = $Sql
    $reader = $cmd.ExecuteReader()
    $rows = @()
    try {
      while ($reader.Read()) {
        $obj = [ordered]@{}
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
          $name = $reader.GetName($i)
          $value = $reader.GetValue($i)
          if ($null -eq $value -or $value -eq [DBNull]::Value) { $obj[$name] = $null }
          else { $obj[$name] = $value }
        }
        $rows += [pscustomobject]$obj
      }
    }
    finally {
      if ($null -ne $reader) {
        $reader.Close()
        $reader.Dispose()
      }
    }
    return $rows
  }
  finally {
    $cmd.Dispose()
  }
}

function Table-Exists([string]$Name) {
  $schema = $conn.GetSchema("Tables")
  foreach ($row in $schema.Rows) {
    if ([string]$row["TABLE_NAME"] -eq $Name) { return $true }
  }
  return $false
}

$jsonOutput = $null
try {
  $conn.Open()
  $tables = @()
  $schema = $conn.GetSchema("Tables")
  foreach ($row in $schema.Rows) {
    $name = [string]$row["TABLE_NAME"]
    $type = [string]$row["TABLE_TYPE"]
    if ($type -ne "TABLE") { continue }
    if ($name.StartsWith("MSys")) { continue }
    # Do not COUNT every table here. Large GeoDIN databases may contain
    # sequence/BLOB tables that crash the legacy Access ODBC driver when a
    # full count is requested. Table presence is sufficient for preflight.
    $tables += [pscustomobject]@{ name = $name; rows = $null }
  }

  $projects = @()
  if (Table-Exists "LOCPRMGR") {
    $projects = Invoke-Rows "SELECT [PRJ_ID], [PRJ_NAME], [PRJ_ALIAS], [PRJ_DATE], [PRJ_USER] FROM [LOCPRMGR] ORDER BY [PRJ_ID]"
  }

  $locations = @()
  if (Table-Exists "GEODIN_LOC_LOCREG") {
    $locations = Invoke-Rows "SELECT [PRJ_ID], [LOCID], [LOCTYPE], [SHORTNAME], [LONGNAME], [ZCOORDB], [ZCOORDE] FROM [GEODIN_LOC_LOCREG] ORDER BY [PRJ_ID], [LOCID]"
  }

  $methodTables = [ordered]@{
    RKS = "GEODIN_LOC_SSGSVGEO"
    RAMME = "GEODIN_LOC_SONDREG"
    GWM = "GEODIN_LOC_ASBSTAMM"
  }
  $methodKeys = @{}
  foreach ($entry in $methodTables.GetEnumerator()) {
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    if (Table-Exists $entry.Value) {
      try {
        foreach ($row in (Invoke-Rows "SELECT DISTINCT [PRJ_ID], [LOCID] FROM [$($entry.Value)]")) {
          [void]$set.Add("$($row.PRJ_ID)::$($row.LOCID)")
        }
      } catch {}
    }
    $methodKeys[$entry.Key] = $set
  }
  $locations = @($locations | ForEach-Object {
    $key = "$($_.PRJ_ID)::$($_.LOCID)"
    $_ | Add-Member -NotePropertyName RKS -NotePropertyValue $methodKeys.RKS.Contains($key) -Force
    $_ | Add-Member -NotePropertyName RAMME -NotePropertyValue $methodKeys.RAMME.Contains($key) -Force
    $_ | Add-Member -NotePropertyName GWM -NotePropertyValue $methodKeys.GWM.Contains($key) -Force
    $_
  })

  $out = [ordered]@{
    databasePath = (Resolve-Path -LiteralPath $DatabasePath).Path
    databaseName = [IO.Path]::GetFileName($DatabasePath)
    inspectedAt = (Get-Date).ToString("s")
    projects = @($projects)
    locations = @($locations)
    tables = @($tables | Sort-Object name)
  }
  $jsonOutput = $out | ConvertTo-Json -Depth 8 -Compress
}
finally {
  Close-Db
}

Write-Output $jsonOutput
exit 0
