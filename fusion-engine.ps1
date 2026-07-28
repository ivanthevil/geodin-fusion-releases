param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference="Stop"
Add-Type -AssemblyName System.Data
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$req=Get-Content -Raw -LiteralPath $RequestPath|ConvertFrom-Json
$target=[IO.Path]::GetFullPath([string]$req.targetPath)
if(!(Test-Path -LiteralPath $target)){throw "Master-MDB nicht gefunden."}
$items=@($req.items)
if(!$items.Count){throw "Keine Punkte ausgewählt."}
$policy=[string]$req.policy
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=[IO.Path]::Combine([IO.Path]::GetDirectoryName($target),([IO.Path]::GetFileNameWithoutExtension($target)+"_BACKUP_"+$stamp+".mdb"))
$work=[IO.Path]::Combine([IO.Path]::GetDirectoryName($target),([IO.Path]::GetFileNameWithoutExtension($target)+".fusion-"+[guid]::NewGuid().ToString("N")+".mdb"))
Copy-Item -LiteralPath $target -Destination $backup
Copy-Item -LiteralPath $target -Destination $work
$tables=@("GEODIN_LOC_LOCREG","GEODIN_LOC_SSGKRZT1","GEODIN_LOC_SSGSVGEO","GEODIN_LOC_SSGPROBE","GEODIN_LOC_PRBREG","GEODIN_LOC_SONDREG","GEODIN_LOC_SONDDATA","GEODIN_LOC_ASBSTAMM","GEODIN_LOC_ASBROHRE","GEODIN_LOC_ASBFILTR","GEODIN_LOC_ASBVERFL","GEODIN_LOC_ASBSEINB","GEODIN_LOC_ASBBOHRL")
function Conn($p){$c=New-Object Data.Odbc.OdbcConnection("Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$p;");$c.Open();$c}
function Exists($c,$n){$s=$c.GetSchema("Tables");foreach($r in $s.Rows){if([string]$r.TABLE_NAME-eq$n){return $true}}$false}
function Scalar($c,$sql){$q=$c.CreateCommand();try{$q.CommandText=$sql;$q.ExecuteScalar()}finally{$q.Dispose()}}
function Rows($c,$sql){$a=New-Object Data.Odbc.OdbcDataAdapter($sql,$c);$d=New-Object Data.DataTable;[void]$a.Fill($d);$a.Dispose();return (,$d)}
function Q($s){"'"+([string]$s).Replace("'","''")+"'"}
function DeletePoint($c,$prj,$loc){foreach($t in $tables){if(Exists $c $t){$q=$c.CreateCommand();try{$q.CommandText="DELETE FROM [$t] WHERE [PRJ_ID]=$(Q $prj) AND [LOCID]=$loc";[void]$q.ExecuteNonQuery()}finally{$q.Dispose()}}}}
function InsertTable($src,$dst,$table,$prj,$loc,$newPrj,$newLoc,$newName,$projectGuid){
 if(!(Exists $src $table)-or!(Exists $dst $table)){return}
 $dt=Rows $src "SELECT * FROM [$table] WHERE [PRJ_ID]=$(Q $prj) AND [LOCID]=$loc"
 foreach($row in $dt.Rows){
  $cols=@();$vals=@()
   foreach($col in $dt.Columns){$name=[string]$col.ColumnName;$v=$row[$name];if($name -eq "PRJ_ID"){$v=$newPrj};if($name -eq "LOCID"){$v=$newLoc};if($name -eq "ProjectGUID"){$v=$projectGuid};if($name -eq "GEODINGUID"){$v=[guid]::NewGuid().ToString()};if(($name -in @("SHORTNAME","LONGNAME")) -and $newName){$v=$newName};$cols+="[$name]";$vals+=$v}
   $marks=(1..$vals.Count|ForEach-Object{"?"})-join","
   $q=$dst.CreateCommand();try{$q.CommandText="INSERT INTO [$table] ("+($cols -join ",")+") VALUES ($marks)";foreach($v in $vals){$p=$q.CreateParameter();$p.Value=if($null -eq $v -or $v -eq [DBNull]::Value){[DBNull]::Value}else{$v};[void]$q.Parameters.Add($p)};[void]$q.ExecuteNonQuery()}finally{$q.Dispose()}
 }
}
$dst=$null
try{
 $dst=Conn $work;$count=0
 foreach($item in $items){$src=$null;try{$src=Conn ([string]$item.sourcePath);$prj=[string]$item.prjId;$loc=[int]$item.locId;$name=[string]$item.shortName;$existing=Scalar $dst "SELECT TOP 1 [LOCID] FROM [GEODIN_LOC_LOCREG] WHERE [PRJ_ID]=$(Q $prj) AND [SHORTNAME]=$(Q $name)"
  if($null-ne$existing-and$existing-ne[DBNull]::Value){if($policy-eq"skip"){continue};if($policy-eq"replace"){DeletePoint $dst $prj ([int]$existing)}else{$base=$name;$n=2;do{$name="$base ($n)";$n++;$hit=Scalar $dst "SELECT COUNT(*) FROM [GEODIN_LOC_LOCREG] WHERE [PRJ_ID]=$(Q $prj) AND [SHORTNAME]=$(Q $name)"}while([int]$hit-gt0)}}
  $max=Scalar $dst "SELECT MAX([LOCID]) FROM [GEODIN_LOC_LOCREG] WHERE [PRJ_ID]=$(Q $prj)";$newLoc=if($null-eq$max-or$max-eq[DBNull]::Value){1}else{[int]$max+1}
  $pg=Scalar $dst "SELECT TOP 1 [GEODINGUID] FROM [LOCPRMGR] WHERE [PRJ_ID]=$(Q $prj)"
  if($null -eq $pg -or $pg -eq [DBNull]::Value){$pdt=Rows $src "SELECT * FROM [LOCPRMGR] WHERE [PRJ_ID]=$(Q $prj)";if($pdt.Rows.Count){$pg=[guid]::NewGuid().ToString();$row=$pdt.Rows[0];$cols=@();$vals=@();foreach($col in $pdt.Columns){$cn=[string]$col.ColumnName;$v=$row[$cn];if($cn -eq "GEODINGUID"){$v=$pg};$cols+="[$cn]";$vals+=$v};$marks=(1..$vals.Count|ForEach-Object{"?"})-join",";$q=$dst.CreateCommand();try{$q.CommandText="INSERT INTO [LOCPRMGR] ("+($cols -join ",")+") VALUES ($marks)";foreach($v in $vals){$p=$q.CreateParameter();$p.Value=if($null -eq $v -or $v -eq [DBNull]::Value){[DBNull]::Value}else{$v};[void]$q.Parameters.Add($p)};[void]$q.ExecuteNonQuery()}finally{$q.Dispose()}}}
  foreach($t in $tables){InsertTable $src $dst $t $prj $loc $prj $newLoc $name $pg};$count++
 }finally{if($src){$src.Close();$src.Dispose()}}}
 $dst.Close();$dst.Dispose();$dst=$null
 [IO.File]::Delete($target)
 try {[IO.File]::Move($work,$target)} catch {Copy-Item -LiteralPath $backup -Destination $target -Force;throw}
 @{count=$count;backupPath=$backup;targetPath=$target}|ConvertTo-Json -Compress
}catch{if($dst){$dst.Close();$dst.Dispose()};if(Test-Path $work){Remove-Item -LiteralPath $work -Force};throw}
