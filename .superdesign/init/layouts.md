# Shared Layout

## Office command center shell

Source: `index.html`

The app uses a fixed header, a three-column workspace and a fixed action footer.

```html
<body>
  <header>
    <div class="brand"><img src="boden-icon.png"><div><b>bOden</b><span>GEODIN FUSION</span></div><i id="version">v0.1.1</i></div>
    <div class="header-actions"><button id="update">UPDATE PRÜFEN</button><button id="settings">EINSTELLUNGEN</button></div>
  </header>
  <main>
    <aside class="panel sources">
      <div class="panel-title"><span>1. QUELL-DATENBANKEN</span><button id="addSources">HINZUFÜGEN</button></div>
      <div id="sourceList" class="scroll empty">MDB-Dateien hinzufügen oder hier ablegen.</div>
      <button id="dropZone" class="drop">＋ MDB-DATEIEN AUSWÄHLEN</button>
    </aside>
    <section class="panel review">
      <div class="panel-title"><span>2. DATENANALYSE & AUSWAHL</span><label><input id="all" type="checkbox" checked> ALLE</label></div>
      <div class="table-wrap"><table><thead><tr><th></th><th>PROJEKT / PUNKT</th><th>VERFAHREN</th><th>QUELLE</th><th>STATUS</th><th>ENDTIEFE</th></tr></thead><tbody id="points"></tbody></table></div>
    </section>
    <aside class="panel target">
      <div class="panel-title"><span>3. MASTER-DATENBANK</span><button id="chooseTarget">ÄNDERN</button></div>
      <div id="targetCard" class="target-card empty">Noch keine Master-MDB ausgewählt.</div>
      <div class="section-label">KONFLIKT-BEHANDLUNG</div>
      <div class="policies">
        <button data-policy="skip">ÜBERSPRINGEN</button>
        <button data-policy="rename">UMBENENNEN</button>
        <button data-policy="replace" class="active">ERSETZEN</button>
      </div>
      <div class="section-label">SICHERHEIT</div>
      <div class="facts"><div>AUTOMATISCHES BACKUP <b>AKTIV</b></div><div>SCHEMA-PRÜFUNG <b id="schema">AUSSTEHEND</b></div><div>DUPLIKATE <b id="duplicates">0</b></div></div>
      <div id="notice" class="notice">Die Master-MDB muss während der Fusion in GeoDIN geschlossen sein.</div>
    </aside>
  </main>
  <footer>
    <div><b id="summary">Keine Datenbanken geladen.</b><span id="status">SYSTEM BEREIT</span></div>
    <button id="validate">PRÜFUNG STARTEN</button>
    <button id="merge" class="primary" disabled>SICHER FUSIONIEREN →</button>
  </footer>
</body>
```
