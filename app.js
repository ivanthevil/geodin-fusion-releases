const state={sources:[],target:null,selected:new Set(),policy:"replace",busy:false,update:null,expanded:"",details:new Map(),nameOverrides:new Map()};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const key=(source,point)=>`${source.path}::${point.PRJ_ID}::${point.LOCID}`;
const procedures=p=>[p.RKS&&"RKS",p.RAMME&&"RAMME",p.GWM&&"GWM"].filter(Boolean);
const fileName=p=>String(p||"").split(/[\\/]/).pop();
const friendly=e=>String(e?.message||e||"Unbekannter Fehler").replace(/^Error invoking remote method '[^']+': Error:\s*/i,"").slice(0,900);
const asArray=value=>Array.isArray(value)?value:(value?[value]:[]);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const norm=value=>String(value??"").trim().toUpperCase().replace(/\s+/g," ");
const depth=value=>`${number(value).toFixed(2)} m`;

function targetMatch(point){
  return (state.target?.info?.locations||[]).find(candidate=>norm(candidate.PRJ_ID)===norm(point.PRJ_ID)&&norm(candidate.SHORTNAME)===norm(point.SHORTNAME))||null;
}
function pointByKey(k){
  for(const source of state.sources){
    const point=(source.info?.locations||[]).find(candidate=>key(source,candidate)===k);
    if(point)return{source,point};
  }
  return null;
}
function suggestedName(point){
  const used=new Set((state.target?.info?.locations||[]).filter(p=>norm(p.PRJ_ID)===norm(point.PRJ_ID)).map(p=>norm(p.SHORTNAME)));
  const base=String(point.SHORTNAME||`PUNKT ${point.LOCID}`).trim();
  let n=2,candidate=`${base} (${n})`;
  while(used.has(norm(candidate))){n++;candidate=`${base} (${n})`;}
  return candidate;
}
function methodNames(detail){
  return [detail?.methods?.rks&&"RKS",detail?.methods?.ramme&&"RAMME",detail?.methods?.gwm&&"GWM"].filter(Boolean);
}
function profileDepth(detail){
  return Math.max(number(detail?.location?.ZCOORDE),...asArray(detail?.layers).map(x=>number(x.to)),...asArray(detail?.ramm).map(x=>number(x.depth)),...asArray(detail?.gwm?.borehole).map(x=>number(x.BLEND)),0);
}
function textSimilarity(a,b){
  const left=new Set(norm(a).split(/[^A-Z0-9ÄÖÜß]+/).filter(Boolean)),right=new Set(norm(b).split(/[^A-Z0-9ÄÖÜß]+/).filter(Boolean));
  if(!left.size&&!right.size)return 100;
  const common=[...left].filter(x=>right.has(x)).length;
  return Math.round((2*common/Math.max(1,left.size+right.size))*100);
}
function compareDetails(source,target){
  if(!target)return{score:null,label:"KEIN MASTER-VERGLEICH",tone:"neutral",facts:[]};
  const sourceMethods=methodNames(source),targetMethods=methodNames(target);
  const methodScore=sourceMethods.length||targetMethods.length?Math.round(100*sourceMethods.filter(x=>targetMethods.includes(x)).length/Math.max(sourceMethods.length,targetMethods.length)):100;
  const sourceDepth=profileDepth(source),targetDepth=profileDepth(target);
  const depthDiff=Math.abs(sourceDepth-targetDepth);
  const depthScore=Math.max(0,Math.round(100-(depthDiff/Math.max(1,sourceDepth,targetDepth))*100));
  const scores=[methodScore,depthScore],facts=[
    {label:"Verfahren",source:sourceMethods.join(" + ")||"–",target:targetMethods.join(" + ")||"–",same:methodScore===100},
    {label:"Endtiefe",source:depth(sourceDepth),target:depth(targetDepth),same:depthDiff<0.011}
  ];
  if(source?.methods?.rks&&target?.methods?.rks){
    const left=asArray(source.layers),right=asArray(target.layers);
    const layerScores=left.map((layer,index)=>{
      const other=right[index];if(!other)return 0;
      return Math.round((Math.max(0,100-Math.abs(number(layer.to)-number(other.to))*25)+textSimilarity(layer.description,other.description))/2);
    });
    const layerScore=layerScores.length?Math.round(layerScores.reduce((a,b)=>a+b,0)/Math.max(left.length,right.length)):0;
    scores.push(layerScore);facts.push({label:"RKS-Schichten",source:`${left.length} Schichten`,target:`${right.length} Schichten`,same:layerScore>=90});
  }
  if(source?.methods?.ramme&&target?.methods?.ramme){
    const left=asArray(source.ramm),right=asArray(target.ramm),matches=[];
    left.forEach(row=>{const other=right.find(x=>Math.abs(number(x.depth)-number(row.depth))<0.011);if(other)matches.push(Math.abs(number(row.blows)-number(other.blows)));});
    const avg=matches.length?matches.reduce((a,b)=>a+b,0)/matches.length:99;
    const rammScore=Math.max(0,Math.round(100-avg*5-Math.abs(left.length-right.length)*3));
    scores.push(rammScore);facts.push({label:"Rammprofil",source:`${left.length} Werte`,target:`${right.length} Werte`,same:rammScore>=90});
  }
  if(source?.methods?.gwm&&target?.methods?.gwm){
    const left=asArray(source.gwm?.filters),right=asArray(target.gwm?.filters);
    const gwmScore=Math.max(0,Math.round(100-Math.abs(left.length-right.length)*20-Math.abs(sourceDepth-targetDepth)*10));
    scores.push(gwmScore);facts.push({label:"GWM-Ausbau",source:`${left.length} Filter`,target:`${right.length} Filter`,same:gwmScore>=90});
  }
  const score=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  return{score,label:score>=85?"SEHR ÄHNLICH":score>=65?"ÄHNLICH":"DEUTLICH ABWEICHEND",tone:score>=85?"good":score>=65?"warn":"bad",facts};
}

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
function layerTable(title,layers){
  const rows=asArray(layers);
  return `<details class="profile-block" open><summary>${esc(title)} <b>${rows.length}</b></summary>
    ${rows.length?`<div class="profile-table"><div class="profile-head"><span>TEUFE</span><span>ANSPRACHE / PETROGRAPHIE</span></div>${rows.map(row=>`<div><span>${number(row.from).toFixed(2)}–${number(row.to).toFixed(2)} m</span><span>${esc(row.description||row.petro||"Keine Beschreibung")}</span></div>`).join("")}</div>`:'<p class="profile-empty">Keine Schichten gespeichert.</p>'}
  </details>`;
}
function rammTable(rows){
  const values=asArray(rows);
  return `<details class="profile-block"><summary>RAMMPROFIL <b>${values.length}</b></summary>
    ${values.length?`<div class="ramm-grid">${values.map(row=>`<span>${number(row.depth).toFixed(2)} m</span><b>${number(row.blows)}</b>`).join("")}</div>`:'<p class="profile-empty">Keine Schlagzahlen gespeichert.</p>'}
  </details>`;
}
function gwmTable(gwm){
  const pipes=asArray(gwm?.pipes),filters=asArray(gwm?.filters),backfill=asArray(gwm?.backfill);
  const entries=[
    ...pipes.map(x=>({range:`${number(x.ELBEG).toFixed(2)}–${number(x.ELEND).toFixed(2)} m`,label:x.ELTYP||x.ELCODE||"Rohr"})),
    ...filters.map(x=>({range:`${number(x.INVZBEG).toFixed(2)}–${number(x.INVZEND).toFixed(2)} m`,label:x.INVNAME||"Filterstrecke"})),
    ...backfill.map(x=>({range:`${number(x.VFBEG).toFixed(2)}–${number(x.VFEND).toFixed(2)} m`,label:x.VFTYP||x.VFCODE||"Verfüllung"}))
  ];
  return `<details class="profile-block"><summary>GWM-AUSBAU <b>${entries.length}</b></summary>
    ${entries.length?`<div class="profile-table"><div class="profile-head"><span>TEUFE</span><span>AUSBAU</span></div>${entries.map(row=>`<div><span>${esc(row.range)}</span><span>${esc(row.label)}</span></div>`).join("")}</div>`:'<p class="profile-empty">Kein GWM-Ausbau gespeichert.</p>'}
  </details>`;
}
function pointCard(label,detail,master=false){
  if(!detail)return`<article class="compare-card empty"><span>${label}</span><b>NICHT VORHANDEN</b></article>`;
  const location=detail.location||{},meta=detail.metadata||{};
  return `<article class="compare-card ${master?"master":""}">
    <span>${esc(label)}</span><b>${esc(location.SHORTNAME||`PUNKT ${location.LOCID}`)}</b>
    <small>${esc(location.LONGNAME||"Keine Langbezeichnung")}</small>
    <dl><div><dt>PROJEKT</dt><dd>${esc(location.PRJ_ID)}</dd></div><div><dt>ENDTIEFE</dt><dd>${depth(profileDepth(detail))}</dd></div><div><dt>DATUM</dt><dd>${esc(meta.BOHRZ_VON||"–")}</dd></div></dl>
  </article>`;
}
function renderInspector(k,source,point){
  const entry=state.details.get(k);
  if(!entry)return`<tr class="inspector-row"><td colspan="6"><div class="inspector loading">PUNKTDETAILS WERDEN GELADEN …</div></td></tr>`;
  if(entry.error)return`<tr class="inspector-row"><td colspan="6"><div class="inspector error-box">${esc(entry.error)}</div></td></tr>`;
  const comparison=compareDetails(entry.source,entry.target),suggestion=suggestedName(point),override=state.nameOverrides.get(k)||point.SHORTNAME||"",isChanged=norm(override)!==norm(point.SHORTNAME);
  return `<tr class="inspector-row"><td colspan="6"><section class="inspector">
    <div class="inspector-top">
      <div class="compare-pair">${pointCard(`QUELLE · ${fileName(source.path)}`,entry.source)}<i>VS</i>${pointCard(`MASTER · ${fileName(state.target?.path)}`,entry.target,true)}</div>
      <div class="similarity ${comparison.tone}"><span>HEURISTISCHE ÄHNLICHKEIT</span><b>${comparison.score===null?"–":`${comparison.score}%`}</b><strong>${comparison.label}</strong><small>Arbeitshilfe, keine fachliche Freigabe</small></div>
    </div>
    ${comparison.facts.length?`<div class="difference-strip">${comparison.facts.map(f=>`<div class="${f.same?"same":"changed"}"><span>${esc(f.label)}</span><b>${esc(f.source)}</b><i>→</i><b>${esc(f.target)}</b></div>`).join("")}</div>`:""}
    <div class="inspector-grid">
      <div class="profiles">
        <h3>PUNKTDATEN & ANSPRACHE</h3>
        ${entry.source?.methods?.rks?layerTable("RKS-SCHICHTEN",entry.source.layers):""}
        ${entry.source?.methods?.ramme?rammTable(entry.source.ramm):""}
        ${entry.source?.methods?.gwm?gwmTable(entry.source.gwm):""}
        ${!methodNames(entry.source).length?'<p class="profile-empty">Keine Detailtabellen zu diesem Punkt gefunden.</p>':""}
      </div>
      <div class="rename-box">
        <h3>PUNKTBEZEICHNUNG FÜR DIE FUSION</h3>
        <label>MANUELLER PUNKTNAME</label>
        <input data-name-input="${esc(k)}" value="${esc(override)}" maxlength="120">
        <div class="suggestion"><span><small>KOLLISIONSFREIER VORSCHLAG</small><b>${esc(suggestion)}</b></span><button data-suggest="${esc(k)}" type="button">VORSCHLAG ÜBERNEHMEN</button></div>
        <button class="save-name" data-save-name="${esc(k)}" type="button">PUNKTNAME SPEICHERN</button>
        <p>${isChanged?`Die Quelle bleibt unverändert. Beim Import wird der Punkt als <b>${esc(override)}</b> angelegt.`:"Noch keine abweichende Importbezeichnung gespeichert."}</p>
      </div>
    </div>
  </section></td></tr>`;
}
async function toggleInspector(k){
  if(state.expanded===k){state.expanded="";renderTable();return;}
  state.expanded=k;renderTable();
  if(state.details.has(k))return;
  const found=pointByKey(k);if(!found)return;
  try{
    const match=targetMatch(found.point);
    const [sourceDetail,targetDetail]=await Promise.all([
      window.fusionApi.pointDetail(found.source.path,found.point.PRJ_ID,found.point.LOCID),
      match&&state.target?window.fusionApi.pointDetail(state.target.path,match.PRJ_ID,match.LOCID):Promise.resolve(null)
    ]);
    state.details.set(k,{source:sourceDetail,target:targetDetail});
  }catch(e){state.details.set(k,{error:friendly(e)});}
  renderTable();
}
function renderTable(){
  let duplicateCount=0,rows="",total=0;
  state.sources.forEach(s=>{
    if(s.error)return;const locations=s.info.locations||[];total+=locations.length;
    rows+=`<tr class="group"><td colspan="6">▣ &nbsp; ${esc(fileName(s.path))} (${locations.length} PUNKTE)</td></tr>`;
    locations.forEach(p=>{
      const k=key(s,p),dup=!!targetMatch(p),open=state.expanded===k,displayName=state.nameOverrides.get(k)||p.SHORTNAME;if(dup)duplicateCount++;
      rows+=`<tr class="${dup?"duplicate":""} ${open?"open":""}">
        <td><input data-key="${esc(k)}" type="checkbox" ${state.selected.has(k)?"checked":""}></td>
        <td class="point-id"><b>${esc(displayName||`PUNKT ${p.LOCID}`)}</b><small>${esc(p.PRJ_ID)}</small></td>
        <td class="description">${esc(p.LONGNAME||p.SHORTNAME||"–")}</td>
        <td>${procedures(p).map(x=>`<span class="badge ${x.toLowerCase()}">${x}</span>`).join(" ")||"–"}</td>
        <td class="${dup?"duplicate-text":"ready"}"><span>${dup?"DUPLIKAT":"BEREIT"}</span><button class="inspect-button" data-inspect="${esc(k)}" type="button">${dup?"VERGLEICHEN":p.RKS?"ANSPRACHE":"DETAILS"}</button></td>
        <td class="depth">${Number(p.ZCOORDE||0).toFixed(2)} m <button class="chevron" data-inspect="${esc(k)}" type="button">${open?"⌃":"⌄"}</button></td>
      </tr>`;
      if(open)rows+=renderInspector(k,s,p);
    });
  });
  $("points").innerHTML=rows;$("tableEmpty").hidden=total>0;$("totalCount").textContent=`GESAMT: ${total} PUNKTE`;
  $("duplicateNotice").textContent=duplicateCount?`${duplicateCount} Duplikate werden gemäß Auswahl behandelt.`:"Keine Duplikate erkannt.";
  const selectable=state.sources.flatMap(s=>s.error?[]:(s.info.locations||[]));
  $("all").checked=selectable.length>0&&selectable.every(p=>state.sources.some(s=>state.selected.has(key(s,p))));
  document.querySelectorAll("#points input[type=checkbox]").forEach(x=>x.onchange=()=>{x.checked?state.selected.add(x.dataset.key):state.selected.delete(x.dataset.key);renderSummary();});
  document.querySelectorAll("[data-inspect]").forEach(button=>button.onclick=()=>toggleInspector(button.dataset.inspect));
  document.querySelectorAll("[data-suggest]").forEach(button=>button.onclick=()=>{const found=pointByKey(button.dataset.suggest);if(found){state.nameOverrides.set(button.dataset.suggest,suggestedName(found.point));renderTable();}});
  document.querySelectorAll("[data-save-name]").forEach(button=>button.onclick=()=>{
    const k=button.dataset.saveName,input=document.querySelector(`[data-name-input="${CSS.escape(k)}"]`),found=pointByKey(k),value=String(input?.value||"").trim();
    if(!value)return toast("Der Punktname darf nicht leer sein.","error");
    const collision=(state.target?.info?.locations||[]).some(p=>norm(p.PRJ_ID)===norm(found?.point.PRJ_ID)&&norm(p.SHORTNAME)===norm(value));
    if(collision&&norm(value)!==norm(found?.point.SHORTNAME))return toast("Dieser Punktname ist in der Master-Datenbank bereits vorhanden.","error");
    state.nameOverrides.set(k,value);toast("Importbezeichnung gespeichert.");renderTable();
  });
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
  try{state.target={path,info:await window.fusionApi.inspect(path)};state.details.clear();state.expanded="";setStatus("MASTER-MDB BEREIT",50);render();}
  catch(e){message("MASTER-MDB KONNTE NICHT GELESEN WERDEN",friendly(e),true);setStatus("MASTER-MDB FEHLER",0);}
}
async function refreshTarget(){state.target.info=await window.fusionApi.inspect(state.target.path);}

async function performMerge(){
  const items=[];state.sources.forEach(s=>(s.info.locations||[]).forEach(p=>{const k=key(s,p);if(state.selected.has(k)){const item={sourcePath:s.path,prjId:p.PRJ_ID,locId:p.LOCID,shortName:p.SHORTNAME},override=String(state.nameOverrides.get(k)||"").trim();if(override&&norm(override)!==norm(p.SHORTNAME))item.newName=override;items.push(item);}}));
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
