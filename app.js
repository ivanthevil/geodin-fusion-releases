const state={sources:[],target:null,selected:new Set(),policy:"replace"};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const key=(source,point)=>`${source.path}::${point.PRJ_ID}::${point.LOCID}`;
const procedures=p=>[p.RKS&&"RKS",p.RAMME&&"RAMME",p.GWM&&"GWM"].filter(Boolean);
const friendly=e=>String(e?.message||e||"Unbekannter Fehler")
  .replace(/^Error invoking remote method '[^']+': Error:\s*/i,"")
  .slice(0,900);

async function inspectSources(paths){
  for(const path of paths){
    if(state.sources.some(x=>x.path===path))continue;
    setStatus(`PRÜFE ${path}`);
    try{const info=await window.fusionApi.inspect(path);state.sources.push({path,info,error:""});(info.locations||[]).forEach(p=>state.selected.add(key({path},p)));}
    catch(e){state.sources.push({path,info:{locations:[]},error:friendly(e)});}
  }
  render();
}
function render(){
  $("sourceList").classList.toggle("empty",!state.sources.length);
  $("sourceList").innerHTML=state.sources.length?state.sources.map(s=>`<div class="source-card"><strong>${esc(s.path.split(/[\\\\/]/).pop())}</strong><small>${esc(s.path)}</small><div class="source-meta"><span>${s.info.locations?.length||0} Punkte</span><b style="color:${s.error?"#b00020":"#107c10"}">${s.error?"FEHLER":"VERIFIZIERT"}</b></div></div>`).join(""):"MDB-Dateien hinzufügen oder hier ablegen.";
  const existing=new Set((state.target?.info?.locations||[]).map(p=>`${p.PRJ_ID}::${p.SHORTNAME}`.toUpperCase()));
  let dup=0,rows="";
  state.sources.forEach(s=>{if(s.error)return;rows+=`<tr class="group"><td colspan="6">${esc(s.path.split(/[\\\\/]/).pop())}</td></tr>`;(s.info.locations||[]).forEach(p=>{const k=key(s,p),d=existing.has(`${p.PRJ_ID}::${p.SHORTNAME}`.toUpperCase());if(d)dup++;rows+=`<tr class="${d?"duplicate":""}"><td><input data-key="${esc(k)}" type="checkbox" ${state.selected.has(k)?"checked":""}></td><td><b>${esc(p.PRJ_ID)}</b><br>${esc(p.SHORTNAME)}</td><td>${procedures(p).map(x=>`<span class="badge ${x.toLowerCase()}">${x}</span>`).join("")}</td><td>${esc(s.path.split(/[\\\\/]/).pop())}</td><td>${d?"DUPLIKAT":"BEREIT"}</td><td>${Number(p.ZCOORDE||0).toFixed(2)} m</td></tr>`;});});
  $("points").innerHTML=rows;
  $("duplicates").textContent=dup;$("summary").textContent=`${state.selected.size} Punkte aus ${state.sources.length} Quellen ausgewählt.`;$("merge").disabled=!state.target||!state.selected.size;$("schema").textContent=state.target?"OK":"AUSSTEHEND";
  document.querySelectorAll("#points input").forEach(x=>x.onchange=()=>{x.checked?state.selected.add(x.dataset.key):state.selected.delete(x.dataset.key);render();});
}
function setStatus(text){$("status").textContent=text;}
async function chooseSources(){const paths=await window.fusionApi.chooseSources();await inspectSources(paths);}
async function chooseTarget(){const path=await window.fusionApi.chooseTarget();if(!path)return;setStatus("MASTER-MDB WIRD GEPRÜFT");try{state.target={path,info:await window.fusionApi.inspect(path)};$("targetCard").classList.remove("empty");$("targetCard").innerHTML=`<strong>${esc(path.split(/[\\\\/]/).pop())}</strong><small>${esc(path)}</small><p>${state.target.info.locations?.length||0} vorhandene Punkte</p>`;setStatus("MASTER-MDB BEREIT");render();}catch(e){alert(friendly(e));setStatus("MASTER-MDB KONNTE NICHT GELESEN WERDEN");}}
async function checkUpdate(){setStatus("UPDATE WIRD GEPRÜFT");try{const u=await window.fusionApi.checkUpdate();if(u.updateAvailable&&confirm(`Version ${u.version} ist verfügbar. Download öffnen?`))window.fusionApi.openExternal(u.url);else alert("GeoDIN Fusion ist aktuell.");setStatus("UPDATE-PRÜFUNG ABGESCHLOSSEN");}catch(e){alert(friendly(e));setStatus("UPDATE-PRÜFUNG FEHLGESCHLAGEN");}}
$("addSources").onclick=$("dropZone").onclick=chooseSources;$("chooseTarget").onclick=chooseTarget;$("update").onclick=$("settingsUpdate").onclick=checkUpdate;$("settings").onclick=()=>$("settingsDialog").showModal();
$("all").onchange=e=>{state.sources.forEach(s=>(s.info.locations||[]).forEach(p=>e.target.checked?state.selected.add(key(s,p)):state.selected.delete(key(s,p))));render();};
document.querySelectorAll(".policies button").forEach(b=>b.onclick=()=>{state.policy=b.dataset.policy;document.querySelectorAll(".policies button").forEach(x=>x.classList.toggle("active",x===b));});
$("validate").onclick=()=>{if(!state.sources.length||!state.target)return alert("Bitte Quellen und Master-MDB auswählen.");render();setStatus("PRÜFUNG ERFOLGREICH");};
$("merge").onclick=async()=>{if(!confirm(`Master-MDB jetzt sichern und ${state.selected.size} Punkte fusionieren?`))return;const items=[];state.sources.forEach(s=>(s.info.locations||[]).forEach(p=>{if(state.selected.has(key(s,p)))items.push({sourcePath:s.path,prjId:p.PRJ_ID,locId:p.LOCID,shortName:p.SHORTNAME});}));setStatus("FUSION LÄUFT – NICHT SCHLIESSEN");$("merge").disabled=true;try{const out=await window.fusionApi.merge({targetPath:state.target.path,policy:state.policy,items});alert(`${out.count} Punkte fusioniert.\\nBackup: ${out.backupPath}`);await chooseTargetRefresh();setStatus("FUSION ERFOLGREICH");}catch(e){alert(friendly(e));setStatus("FUSION FEHLGESCHLAGEN");}finally{render();}};
async function chooseTargetRefresh(){state.target.info=await window.fusionApi.inspect(state.target.path);}
window.fusionApi.version().then(v=>$("version").textContent=`v${v}`);render();
