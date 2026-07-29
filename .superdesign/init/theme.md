# Theme

## Compact token summary

- Paper: `#f0ede7`
- Surface: `#ffffff`
- Secondary surface: `#f7f5f0`
- Border: `#d8d0c4`
- Strong border: `#a89888`
- Accent amber: `#b87818`
- Accent wash: `#fffbf2`
- Text: `#000000`
- Muted: `#575757`
- Success: `#107c10`
- Error: `#b00020`
- Font: `"Bahnschrift SemiCondensed", "Arial Narrow", "Segoe UI", sans-serif`
- Button radius: `7px`; dialog radius: `10px`; panels stay square
- Desktop shell: 64px header, flexible three columns, 86px footer
- Breakpoint: `1200px`

## Raw source

Source: `styles.css`

```css
:root{--paper:#f0ede7;--surface:#fff;--s2:#f7f5f0;--border:#d8d0c4;--strong:#a89888;--accent:#b87818;--wash:#fffbf2;--text:#000;--muted:#575757;--green:#107c10;--red:#b00020;font-family:"Bahnschrift SemiCondensed","Arial Narrow","Segoe UI",sans-serif;color:var(--text)}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);height:100vh;overflow:hidden}
header{height:64px;background:#fff;border-bottom:2px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:8px 18px}
main{height:calc(100vh - 150px);display:grid;grid-template-columns:330px minmax(520px,1fr) 330px;gap:10px;padding:10px}
footer{height:86px;background:#fff;border-top:2px solid var(--border);display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 20px}
@media(max-width:1200px){main{grid-template-columns:280px minmax(470px,1fr) 280px}}
```
