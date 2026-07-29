# Shared UI Components

GeoDIN Fusion is a single-page Electron application built with semantic HTML, vanilla JavaScript and CSS. It has no separate component library; reusable primitives are expressed by shared classes in `index.html` and rendered list/table fragments in `app.js`.

## Source card

Source: `app.js`

```js
state.sources.map(s=>`<div class="source-card">
  <strong>${esc(s.path.split(/[\\/]/).pop())}</strong>
  <small>${esc(s.path)}</small>
  <div class="source-meta">
    <span>${s.info.locations?.length||0} Punkte</span>
    <b style="color:${s.error?"#b00020":"#107c10"}">${s.error?"FEHLER":"VERIFIZIERT"}</b>
  </div>
</div>`)
```

## Point table row

Source: `app.js`

```js
`<tr class="${d?"duplicate":""}">
  <td><input data-key="${esc(k)}" type="checkbox" ${state.selected.has(k)?"checked":""}></td>
  <td><b>${esc(p.PRJ_ID)}</b><br>${esc(p.SHORTNAME)}</td>
  <td>${procedures(p).map(x=>`<span class="badge ${x.toLowerCase()}">${x}</span>`).join("")}</td>
  <td>${esc(s.path.split(/[\\/]/).pop())}</td>
  <td>${d?"DUPLIKAT":"BEREIT"}</td>
  <td>${Number(p.ZCOORDE||0).toFixed(2)} m</td>
</tr>`
```

## Shared button and panel primitives

Source: `styles.css`

```css
button{font:800 13px inherit;letter-spacing:.04em;background:#fff;border:1.5px solid #111;border-radius:7px;padding:9px 12px;cursor:pointer}
button:hover{transform:translateY(-1px)}
button:disabled{opacity:.4;cursor:not-allowed;transform:none}
.panel{background:#fff;border:2px solid var(--strong);min-width:0;display:flex;flex-direction:column}
.panel-title{min-height:47px;background:var(--s2);border-bottom:1px solid var(--border);padding:8px 10px;display:flex;align-items:center;justify-content:space-between;font-weight:900;font-size:13px;letter-spacing:.07em}
.primary{background:#111;color:#fff;padding:14px 22px}
```
