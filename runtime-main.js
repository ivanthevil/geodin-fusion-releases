const { BrowserWindow, dialog, ipcMain } = require("electron");
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");

const UPDATE_URL = "https://github.com/ivanthevil/geodin-fusion-releases/releases/latest/download/update.json";
const RUNTIME_FILES = [
  "runtime-main.js","preload.js","index.html","app.js","styles.css",
  "fusion-engine.ps1","geodin-fusion-inspect.ps1","boden-icon.png","boden-icon.ico"
];

function versionParts(version) {
  return String(version || "0").split(".").map(x => Number.parseInt(x, 10) || 0);
}
function isNewer(left, right) {
  const a=versionParts(left),b=versionParts(right);
  for(let i=0;i<Math.max(a.length,b.length);i++){
    if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0);
  }
  return false;
}
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function allowedUrl(value) {
  const url = new URL(value);
  if(url.protocol!=="https:"||!["github.com","raw.githubusercontent.com","objects.githubusercontent.com"].includes(url.hostname)){
    throw new Error("Updatequelle ist nicht freigegeben.");
  }
  return url;
}

function start({ app, bundledRoot, runtimeRoot, runtimeVersion }) {
  let win;
  let checkedManifest=null;
  const resolveRuntime=file=>{
    const active=path.join(runtimeRoot,file);
    return fs.existsSync(active)?active:path.join(bundledRoot,file);
  };
  const sendProgress=(percent,stage)=>win?.webContents.send("update-progress",{percent,stage});

  function runPowerShell(script,args=[]){
    return new Promise((resolve,reject)=>{
      execFile("powershell.exe",["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",resolveRuntime(script),...args],{
        windowsHide:true,maxBuffer:100*1024*1024
      },(error,stdout,stderr)=>{
        const text=String(stdout||"").trim();
        if(error){
          const raw=String(stderr||text||error.message).trim();
          if(/AccessViolationException|geschützten Speicher/i.test(raw)){
            return reject(new Error("Die Access-Datenbank konnte vom Windows-Treiber nicht sicher gelesen werden. Bitte GeoDIN schließen und die MDB erneut auswählen."));
          }
          const concise=raw.split(/\r?\n/).map(line=>line.trim()).filter(line=>
            line&&!/^\s*(bei|at)\s+/i.test(line)&&!/System\.Management\.Automation|InterpretedFrame|CallSite|CategoryInfo|FullyQualifiedErrorId/i.test(line)
          ).slice(0,5).join("\n");
          return reject(new Error((concise||"GeoDIN-Datenbank konnte nicht verarbeitet werden.").slice(0,900)));
        }
        const begin=text.indexOf("{"),end=text.lastIndexOf("}");
        if(begin<0||end<begin)return reject(new Error("GeoDIN-Ausgabe konnte nicht gelesen werden."));
        try{resolve(JSON.parse(text.slice(begin,end+1)));}catch{reject(new Error("GeoDIN-Ausgabe ist ungültig."));}
      });
    });
  }

  function createWindow(){
    win=new BrowserWindow({
      width:1440,height:900,minWidth:1180,minHeight:700,
      backgroundColor:"#f0ede7",icon:resolveRuntime("boden-icon.ico"),
      show:false,
      webPreferences:{preload:resolveRuntime("preload.js"),contextIsolation:true,nodeIntegration:false}
    });
    win.setMenuBarVisibility(false);
    win.loadFile(resolveRuntime("index.html"));
    win.once("ready-to-show",()=>win.show());
  }

  ipcMain.handle("choose-sources",async()=>{
    const out=await dialog.showOpenDialog(win,{title:"Quell-Datenbanken auswählen",properties:["openFile","multiSelections"],filters:[{name:"GeoDIN MDB",extensions:["mdb"]}]});
    return out.canceled?[]:out.filePaths;
  });
  ipcMain.handle("choose-target",async()=>{
    const out=await dialog.showOpenDialog(win,{title:"Master-Datenbank auswählen",properties:["openFile"],filters:[{name:"GeoDIN MDB",extensions:["mdb"]}]});
    return out.canceled?"":out.filePaths[0];
  });
  ipcMain.handle("inspect-db",(_,dbPath)=>runPowerShell("geodin-fusion-inspect.ps1",["-DatabasePath",dbPath]));
  ipcMain.handle("merge-databases",async(_,payload)=>{
    const requestPath=path.join(os.tmpdir(),`geodin-fusion-${Date.now()}-${process.pid}.json`);
    fs.writeFileSync(requestPath,JSON.stringify(payload),"utf8");
    try{return await runPowerShell("fusion-engine.ps1",["-RequestPath",requestPath]);}
    finally{try{fs.unlinkSync(requestPath);}catch{}}
  });
  ipcMain.handle("check-update",async()=>{
    const response=await fetch(`${UPDATE_URL}?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`Update-Prüfung fehlgeschlagen (${response.status}).`);
    const data=await response.json();
    checkedManifest=data;
    return{version:data.version,notes:data.notes,currentVersion:runtimeVersion,updateAvailable:isNewer(data.version,runtimeVersion)};
  });
  ipcMain.handle("download-update",async()=>{
    if(!checkedManifest||!isNewer(checkedManifest.version,runtimeVersion))throw new Error("Kein geprüftes Update verfügbar.");
    if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(String(checkedManifest.version)))throw new Error("Die Update-Version ist ungültig.");
    const files=Array.isArray(checkedManifest.files)?checkedManifest.files:[];
    if(!files.length)throw new Error("Das Update enthält keine internen Komponenten. Für diese Version ist einmalig der vollständige Basis-Download erforderlich.");
    const byName=new Map(files.map(file=>[file.path,file]));
    for(const name of byName.keys())if(!RUNTIME_FILES.includes(name))throw new Error(`Unzulässige Updatekomponente: ${name}`);
    const updatesRoot=path.resolve(app.getPath("userData"),"updates");
    const staging=path.resolve(updatesRoot,checkedManifest.version);
    if(!staging.startsWith(updatesRoot+path.sep))throw new Error("Das Update-Ziel ist ungültig.");
    await fsp.rm(staging,{recursive:true,force:true});
    await fsp.mkdir(staging,{recursive:true});
    sendProgress(5,"VORBEREITEN");
    for(const [index,name] of RUNTIME_FILES.entries()){
      const destination=path.join(staging,name);
      const updateFile=byName.get(name);
      if(updateFile){
        const response=await fetch(allowedUrl(updateFile.url),{cache:"no-store"});
        if(!response.ok)throw new Error(`${name} konnte nicht geladen werden (${response.status}).`);
        const buffer=Buffer.from(await response.arrayBuffer());
        if(sha256(buffer).toLowerCase()!==String(updateFile.sha256||"").toLowerCase())throw new Error(`Prüfsumme für ${name} ist ungültig.`);
        await fsp.writeFile(destination,buffer);
      }else{
        await fsp.copyFile(resolveRuntime(name),destination);
      }
      sendProgress(Math.round(10+((index+1)/RUNTIME_FILES.length)*85),`PRÜFE ${name.toUpperCase()}`);
    }
    const statePath=path.join(app.getPath("userData"),"fusion-runtime.json");
    await fsp.writeFile(statePath,JSON.stringify({version:checkedManifest.version,root:staging,installedAt:new Date().toISOString()}),"utf8");
    sendProgress(100,"UPDATE BEREIT");
    return{version:checkedManifest.version};
  });
  ipcMain.handle("restart-for-update",()=>{app.relaunch();app.exit(0);});
  ipcMain.handle("app-version",()=>runtimeVersion);

  createWindow();
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
  app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
}

module.exports={start};
