const state={sources:[],target:null,selected:new Set(),policy:"replace",busy:false,update:null};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const key=(source,point)=>`${source.path}::${point.PRJ_ID}::${point.LOCID}`;
const procedures=p=>[p.RKS&&"RKS",p.RAMME&&"RAMME",p.GWM&&"GWM"].filter(Boolean);
const fileName=p=>String(p||"").split(/[\\/]/).pop();
const friendly=e=>String(e?.message||e||"Unbekannter Fehler").replace(/^Error invoking remote method '[^']+': Error:\s*/i,"").slice(0,900);

function setStatus(text,progress){
  $("status").textContent=`SYSTEM: ${text}`;
  $("progressLabel").textContent=text;
  if(Number.isFinite(progress))$("progressBar").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function toast(message,type="ok"){
  const node=document.createElement("div");node.className=`toast ${type==="error"?"error":""}`;node.textContent=message;$("toastStack").append(node);
  setTimeout(()=>node.remove(),4200);
}
function closeModal(){$("modalLayer").hidden=true;$("modalActions").innerHTML="";$("modalProgress").hidden=true;}
function modal({title,eyebrow="GEODIN FUSION",html="",actions=[],closable=true,progress=false}){
  $("modalEyebrow").textContent=eyebrow;$("modalTitle").textContent=title;$("modalBody").innerHTML=html;
  $("modalClose").hidden=!closable;$("modalProgress").hidden=!progress;$("modalActions").innerHTML="";
  actions.forEach(({label,primary,onClick})=>{const b=document.createElement("button");b.type="button";b.textContent=label;if(primary)b.className="primary";b.onclick=onClick;$("modalActions").append(b);});
  $("modalLayer").hidden=false;
}
function message(title,text,error=false){
  modal({title,html:`<div class="${error?"error-box":""}">${esc(text)}</div>`,actions:[{label:"SCHLIESSEN",primary:true,onClick:closeModal}]});
}
function confirmAction(title,text,onConfirm){
  modal({title,eyebrow:"SICHERHEITSABFRAGE",html:`<p>${esc(text)}</p>`,actions:[
    {label:"ABBRECHEN",onClick:closeModal},
    {label:"BESTÄTIGEN",primary:true,onClick:async()=>{closeModal();await onConfirm();}}
  ]});
}

async function inspectSources(paths){
  for(const path of paths){
    if(state.sources.some(x=>x.path===path))continue;
    setStatus(`PRÜFE ${fileName(path)}`,15);
    try{
      const info=await window.fusionApi.inspect(path);
      const source={path,info,error:""};state.sources.push(source);
      (info.locations||[]).forEach(p=>state.selected.add(key(source,p)));
    }catch(e){state.sources.push({path,info:{locations:[]},error:friendly(e)});}
    render();
  }
  setStatus("QUELLEN VERIFIZIERT",30);
}
function renderSources(){
  if(!state.sources.length){
    $("sourceList").className="source-list custom-scrollbar empty-state";
    $("sourceList").innerHTML='<div class="empty-content"><span class="large-icon">▣</span><b>NOCH KEINE QUELLEN</b><small>GeoDIN-MDB-Dateien hinzufügen.</small></div>';return;
  }
  $("sourceList").className="source-list custom-scrollbar";
  $("sourceList").innerHTML=state.sources.map((s,index)=>{
    if(s.error)return `<article class="source-card source-error"><div class="source-title"><strong>${esc(fileName(s.path))}</strong><i>⚠</i></div><span class="source-path">${esc(s.path)}</span><p>${esc(s.error)}</p></article>`;
    const methods=new Set((s.info.locations||[]).flatMap(procedures));
    return `<article class="source-card ${index===state.sources.length-1?"active":""}">
      <div class="source-title"><strong>${esc(fileName(s.path))}</strong><i>▣</i></div>
      <span class="source-path">${esc(s.path)}</span>
      <div class="source-metrics"><div><small>PUNKTE</small><b>${s.info.locations?.length||0} DATENSÄTZE</b></div><div><small>STATUS</small><b class="success">VERIFIZIERT</b></div></div>
      <div class="source-badges">${[...methods].map(x=>`<span class="badge ${x.toLowerCase()}">${x}</span>`).join("")}</div>
    </article>`;
  }).join("");
}
function renderTable(){
  const existing=new Set((state.target?.info?.locations||[]).map(p=>`${p.PRJ_ID}::${p.SHORTNAME}`.toUpperCase()));
  let duplicateCount=0,rows="",total=0;
  state.sources.forEach(s=>{
    if(s.error)return;const locations=s.info.locations||[];total+=locations.length;
    rows+=`<tr class="group"><td colspan="6">▣ &nbsp; ${esc(fileName(s.path))} (${locations.length} PUNKTE)</td></tr>`;
    locations.forEach(p=>{
      const k=key(s,p),dup=existing.has(`${p.PRJ_ID}::${p.SHORTNAME}`.toUpperCase());if(dup)duplicateCount++;
      rows+=`<tr class="${dup?"duplicate":""}">
        <td><input data-key="${esc(k)}" type="checkbox" ${state.selected.has(k)?"checked":""}></td>
        <td class="point-id"><b>${esc(p.SHORTNAME||`PUNKT ${p.LOCID}`)}</b><small>${esc(p.PRJ_ID)}</small></td>
        <td class="description">${esc(p.LONGNAME||p.SHORTNAME||"–")}</td>
        <td>${procedures(p).map(x=>`<span class="badge ${x.toLowerCase()}">${x}</span>`).join(" ")||"–"}</td>
        <td class="${dup?"duplicate-text":"ready"}">${dup?"DUPLIKAT":"BEREIT"}</td>
        <td class="depth">${Number(p.ZCOORDE||0).toFixed(2)} m</td>
      </tr>`;
    });
  });
  $("points").innerHTML=rows;$("tableEmpty").hidden=total>0;$("totalCount").textContent=`GESAMT: ${total} PUNKTE`;
  $("duplicateNotice").textContent=duplicateCount?`${duplicateCount} Duplikate werden gemäß Auswahl behandelt.`:"Keine Duplikate erkannt.";
  const selectable=state.sources.flatMap(s=>s.error?[]:(s.info.locations||[]));
  $("all").checked=selectable.length>0&&selectable.every(p=>state.sources.some(s=>state.selected.has(key(s,p))));
  document.querySelectorAll("#points input").forEach(x=>x.onchange=()=>{x.checked?state.selected.add(x.dataset.key):state.selected.delete(x.dataset.key);renderSummary();});
  return duplicateCount;
}
function renderTarget(){
  if(!state.target){
    $("targetCard").className="master-card empty-state";
    $("targetCard").innerHTML='<span class="eyebrow">AKTIVE MASTER-DATENBANK</span><b>NOCH NICHT AUSGEWÄHLT</b><small>Wähle eine bestehende GeoDIN-MDB.</small>';
    $("activePath").textContent="KEINE MASTER-DATENBANK GEÖFFNET";return;
  }
  $("targetCard").className="master-card";
  $("targetCard").innerHTML=`<span class="eyebrow">AKTIVE MASTER-DATENBANK · ${state.target.info.locations?.length||0} PUNKTE</span><b>${esc(fileName(state.target.path))}</b><small>${esc(state.target.path)}</small>`;
  $("activePath").textContent=state.target.path;
}
function renderSummary(){
  $("summary").textContent=state.selected.size?`${state.selected.size} Punkte bereit zur Integration${state.target?` in ${fileName(state.target.path)}`:""}.`:"Keine Punkte ausgewählt.";
  $("merge").disabled=state.busy||!state.target||!state.selected.size;
}
function render(){
  renderSources();const d=renderTable();renderTarget();renderSummary();
  $("schema").textContent=state.target?"ERFOLGREICH":"AUSSTEHEND";$("schema").className=state.target?"success":"pending";
  document.querySelectorAll(".policies button").forEach(b=>b.classList.toggle("active",b.dataset.policy===state.policy));
  if(d&&state.target)setStatus("KONFLIKTE ERKANNT – REGEL PRÜFEN",45);
}

async function chooseSources(){const paths=await window.fusionApi.chooseSources();if(paths?.length)await inspectSources(paths);}
async function chooseTarget(){
  const path=await window.fusionApi.chooseTarget();if(!path)return;
  setStatus("MASTER-MDB WIRD GEPRÜFT",20);
  try{state.target={path,info:await window.fusionApi.inspect(path)};setStatus("MASTER-MDB BEREIT",50);render();}
  catch(e){message("MASTER-MDB KONNTE NICHT GELESEN WERDEN",friendly(e),true);setStatus("MASTER-MDB FEHLER",0);}
}
async function refreshTarget(){state.target.info=await window.fusionApi.inspect(state.target.path);}

async function performMerge(){
  const items=[];state.sources.forEach(s=>(s.info.locations||[]).forEach(p=>{if(state.selected.has(key(s,p)))items.push({sourcePath:s.path,prjId:p.PRJ_ID,locId:p.LOCID,shortName:p.SHORTNAME});}));
  state.busy=true;renderSummary();setStatus("FUSION LÄUFT – NICHT SCHLIESSEN",65);
  modal({title:"FUSION WIRD AUSGEFÜHRT",eyebrow:"GESICHERTER SCHREIBVORGANG",html:`<p>${items.length} Punkte werden in die Master-Datenbank übertragen.</p><p>GeoDIN Fusion erstellt zuerst ein vollständiges Backup.</p>`,closable:false,progress:true});
  $("modalProgressBar").style.width="65%";$("modalProgressText").textContent="65 %";
  try{
    const out=await window.fusionApi.merge({targetPath:state.target.path,policy:state.policy,items});
    await refreshTarget();closeModal();setStatus("FUSION ERFOLGREICH",100);toast(`${out.count} Punkte erfolgreich fusioniert.`);
    modal({title:"FUSION ABGESCHLOSSEN",eyebrow:"INTEGRITÄT BESTÄTIGT",html:`<p><b>${out.count} Punkte wurden fusioniert.</b></p><div class="update-notes">Backup:<br>${esc(out.backupPath)}</div>`,actions:[{label:"FERTIG",primary:true,onClick:closeModal}]});
  }catch(e){closeModal();message("FUSION FEHLGESCHLAGEN",friendly(e),true);setStatus("FUSION FEHLGESCHLAGEN",0);}
  finally{state.busy=false;render();}
}

async function checkUpdate(showCurrent=true){
  setStatus("UPDATE WIRD GEPRÜFT",10);$("updateState").textContent="UPDATEPRÜFUNG LÄUFT";
  try{
    const update=await window.fusionApi.checkUpdate();state.update=update;
    if(!update.updateAvailable){
      $("updateState").textContent="SYSTEM ONLINE / KEINE UPDATES";setStatus("SOFTWARE AKTUELL",0);
      if(showCurrent)toast(`GeoDIN Fusion ${update.currentVersion} ist aktuell.`);return;
    }
    $("updateState").textContent=`UPDATE ${update.version} VERFÜGBAR`;setStatus("UPDATE VERFÜGBAR",0);
    modal({title:`UPDATE ${update.version}`,eyebrow:"INKREMENTELLES SOFTWARE-UPDATE",html:`<p>Es werden ausschließlich geänderte Fusion-Komponenten geladen – nicht das vollständige Programm.</p><div class="update-notes">${esc(update.notes||"Stabilitäts- und Funktionsupdate.")}</div>`,actions:[
      {label:"SPÄTER",onClick:closeModal},
      {label:"JETZT INTERN INSTALLIEREN",primary:true,onClick:downloadUpdate}
    ]});
  }catch(e){$("updateState").textContent="UPDATEPRÜFUNG FEHLGESCHLAGEN";message("UPDATE KONNTE NICHT GEPRÜFT WERDEN",friendly(e),true);setStatus("UPDATEFEHLER",0);}
}
async function downloadUpdate(){
  closeModal();modal({title:"UPDATE WIRD VORBEREITET",eyebrow:"INTERNER UPDATER",html:"<p>Komponenten werden geladen und über SHA-256 geprüft. Fusion bleibt bis zum Neustart unverändert.</p>",closable:false,progress:true});
  try{
    const out=await window.fusionApi.downloadUpdate(state.update);
    $("modalProgressBar").style.width="100%";$("modalProgressText").textContent="100 %";
    modal({title:"UPDATE BEREIT",eyebrow:"PRÜFUNG ERFOLGREICH",html:`<p>Version ${esc(out.version)} ist vollständig vorbereitet.</p><p>Fusion wird intern neu gestartet. Es öffnet sich kein Browser und kein Windows-Installationsfenster.</p>`,actions:[
      {label:"SPÄTER NEU STARTEN",onClick:closeModal},
      {label:"JETZT NEU STARTEN",primary:true,onClick:()=>window.fusionApi.restartForUpdate()}
    ]});
  }catch(e){message("UPDATE FEHLGESCHLAGEN",friendly(e),true);}
}

$("addSources").onclick=$("dropZone").onclick=chooseSources;
$("chooseTarget").onclick=chooseTarget;
$("update").onclick=()=>checkUpdate(true);
$("settings").onclick=()=>modal({title:"EINSTELLUNGEN",html:`<p><b>Update-Kanal:</b> Stabil</p><p><b>Installation:</b> intern und inkrementell</p><p><b>Datenbank-Backups:</b> automatisch aktiv</p>`,actions:[{label:"UPDATE PRÜFEN",onClick:()=>{closeModal();checkUpdate(true)}},{label:"SCHLIESSEN",primary:true,onClick:closeModal}]});
$("modalClose").onclick=closeModal;
$("modalLayer").onclick=e=>{if(e.target===$("modalLayer"))closeModal();};
$("all").onchange=e=>{state.sources.forEach(s=>(s.info.locations||[]).forEach(p=>e.target.checked?state.selected.add(key(s,p)):state.selected.delete(key(s,p))));renderTable();renderSummary();};
document.querySelectorAll(".policies button").forEach(b=>b.onclick=()=>{state.policy=b.dataset.policy;render();});
$("validate").onclick=()=>{if(!state.sources.length||!state.target)return message("PRÜFUNG NICHT MÖGLICH","Bitte mindestens eine Quelle und eine Master-MDB auswählen.",true);setStatus("PRÜFUNG ERFOLGREICH",55);toast("Quellen und Master-Datenbank sind bereit.");};
$("merge").onclick=()=>confirmAction("FUSION BESTÄTIGEN",`Master-MDB sichern und ${state.selected.size} ausgewählte Punkte mit der Regel „${state.policy.toUpperCase()}“ fusionieren?`,performMerge);
["dragenter","dragover"].forEach(name=>$("dropZone").addEventListener(name,e=>{e.preventDefault();$("dropZone").classList.add("dragover");}));
["dragleave","drop"].forEach(name=>$("dropZone").addEventListener(name,e=>{e.preventDefault();$("dropZone").classList.remove("dragover");}));
$("dropZone").addEventListener("drop",async e=>{const paths=[...e.dataTransfer.files].map(f=>f.path).filter(p=>/\.mdb$/i.test(p));if(paths.length)await inspectSources(paths);});
window.fusionApi.onUpdateProgress?.(p=>{$("modalProgressBar").style.width=`${p.percent||0}%`;$("modalProgressText").textContent=`${p.percent||0} % · ${p.stage||""}`;});
window.fusionApi.version().then(v=>$("version").textContent=`v${v}`);
render();setTimeout(()=>checkUpdate(false),1200);
