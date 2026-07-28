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
    $count = $null
    try {
      $countRows = Invoke-Rows "SELECT COUNT(*) AS C FROM [$name]"
      $count = [int]$countRows[0].C
    } catch {}
    $tables += [pscustomobject]@{ name = $name; rows = $count }
  }

  $projects = @()
  if (Table-Exists "LOCPRMGR") {
    $projects = Invoke-Rows "SELECT [PRJ_ID], [PRJ_NAME], [PRJ_ALIAS], [PRJ_DATE], [PRJ_USER] FROM [LOCPRMGR] ORDER BY [PRJ_ID]"
  }

  $locations = @()
  if ((Table-Exists "GEODIN_LOC_LOCREG") -and (Table-Exists "GEODIN_LOC_SSGKRZT1")) {
    $locations = Invoke-Rows @"
SELECT
  L.[PRJ_ID],
  L.[LOCID],
  L.[LOCTYPE],
  L.[SHORTNAME],
  L.[LONGNAME],
  L.[ZCOORDB],
  L.[ZCOORDE],
  S.[BRGORT],
  S.[AUFTRAG],
  S.[PROJEKT],
  S.[BEARBEITER],
  S.[BEARB_DAT],
  S.[BRGTYP],
  IIF((SELECT COUNT(*) FROM [GEODIN_LOC_SSGSVGEO] G WHERE G.[PRJ_ID]=L.[PRJ_ID] AND G.[LOCID]=L.[LOCID])>0,True,False) AS RKS,
  IIF((SELECT COUNT(*) FROM [GEODIN_LOC_SONDREG] D WHERE D.[PRJ_ID]=L.[PRJ_ID] AND D.[LOCID]=L.[LOCID])>0,True,False) AS RAMME,
  IIF((SELECT COUNT(*) FROM [GEODIN_LOC_ASBSTAMM] W WHERE W.[PRJ_ID]=L.[PRJ_ID] AND W.[LOCID]=L.[LOCID])>0,True,False) AS GWM
FROM [GEODIN_LOC_LOCREG] L
LEFT JOIN [GEODIN_LOC_SSGKRZT1] S
  ON L.[PRJ_ID] = S.[PRJ_ID] AND L.[LOCID] = S.[LOCID]
ORDER BY L.[PRJ_ID], L.[LOCID]
"@
  } elseif (Table-Exists "GEODIN_LOC_LOCREG") {
    $locations = Invoke-Rows "SELECT [PRJ_ID], [LOCID], [LOCTYPE], [SHORTNAME], [LONGNAME], [ZCOORDB], [ZCOORDE] FROM [GEODIN_LOC_LOCREG] ORDER BY [PRJ_ID], [LOCID]"
  }

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
