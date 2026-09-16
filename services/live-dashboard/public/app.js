// Live-Prozesse Client — verbindet sich per SSE mit dem Dienst und rendert die
// Archify-Ansicht (Systeme, Karten, verifizierte Kanten) mit Live-Status.

const SYSTEM_COLOR = { n8n:"#00D9E8", claude:"#B991F5", openai:"#56DDB0", hubspot:"#F2A044", m365:"#4C9AFF", monday:"#F178C6", stripe:"#7C86FF", extern:"#8AA0B8" };
const SYSTEM_NAME = { hubspot:"HubSpot", n8n:"n8n", claude:"Claude", openai:"ChatGPT / OpenAI", m365:"Microsoft 365", monday:"monday.com", stripe:"Stripe", extern:"Externe Quellen" };
const TONE = { success:"#35C48D", error:"#F16D6D", running:"#4C9AFF", waiting:"#F2B441", idle:"#8A97AD", inactive:"#8A97AD", unknown:"#8A97AD" };
const SLABEL = { success:"Erfolgreich", error:"Fehlgeschlagen", running:"Läuft", waiting:"Wartet", idle:"Bereit", inactive:"Inaktiv", unknown:"Unbekannt" };
const SORDER = { running:0, error:1, waiting:2, success:3, idle:4, inactive:5, unknown:6 };
const CORE = ["hubspot","n8n","claude","openai"];
const ORDER = ["hubspot","n8n","extern","claude","openai","m365","monday","stripe"];
const COL_OF = { hubspot:0, n8n:1, extern:1, claude:2, openai:2, m365:3, monday:3, stripe:3 };
const CW=250, CG=64, CH=50, CGAP=9, HH=38, PB=14, GG=26, CP=14;

const state = { snap:null, error:null, lastOkAt:null, sort:"default", sysFilter:"all", statusFilter:"all",
  panelOpen:true, selected:null, paused:false, tx:0, ty:0, scale:1, fitted:false };

// ── DOM-Shell ──────────────────────────────────────────────────────────────────
const root = document.getElementById("root");
root.innerHTML = `
  <div class="row">
    <h1>Live-Prozesse</h1>
    <span class="pill" id="livePill" style="background:rgba(0,217,232,.13);color:var(--n8n)">Live</span>
    <span class="mono" id="stand" style="font-size:11px;color:var(--dim)"></span>
    <span class="spacer"></span>
    <select id="sortSel">
      <option value="default">Sortierung: Standard</option>
      <option value="status">Sortierung: Status</option>
      <option value="name">Sortierung: Name</option>
      <option value="updated">Sortierung: Zuletzt geändert</option>
      <option value="execs">Sortierung: Ausführungen</option>
    </select>
    <select id="sysSel"></select>
    <select id="statusSel"></select>
    <button class="btn" id="pauseBtn" title="Pause">⏸</button>
    <button class="btn" id="panelBtn" title="Workflow-Spalte einklappen">▤</button>
    <button class="btn" id="fsBtn" title="Vollbild">⛶</button>
  </div>
  <div class="notice" id="notice" style="display:none"></div>
  <div class="kpis" id="kpis"></div>
  <div class="legend" id="legend"></div>
  <div class="main">
    <div class="canvas" id="canvas"><div class="stage" id="stage"></div>
      <div class="zoom">
        <button id="zin">+</button><button id="zout">−</button><button id="zfit">⤢</button>
      </div>
    </div>
    <div class="panel" id="panel"><h2 id="panelHead">Workflows</h2><div class="list" id="list"></div></div>
  </div>`;

const $ = (id) => document.getElementById(id);
$("sysSel").innerHTML = `<option value="all">Alle Systeme</option>` + ORDER.map(s => `<option value="${s}">${SYSTEM_NAME[s]}</option>`).join("");
$("statusSel").innerHTML = `<option value="all">Alle Status</option>` + Object.keys(SLABEL).filter(k=>k!=="unknown").map(s => `<option value="${s}">${SLABEL[s]}</option>`).join("");
$("legend").innerHTML = `<b style="text-transform:uppercase;letter-spacing:.06em">Systeme</b>` +
  ORDER.map(s=>`<span class="chip"><span style="width:9px;height:9px;border-radius:3px;background:${SYSTEM_COLOR[s]}"></span>${SYSTEM_NAME[s]}</span>`).join("") +
  `<b style="text-transform:uppercase;letter-spacing:.06em;margin-left:8px">Status</b>` +
  ["running","success","error","waiting","idle","inactive"].map(s=>`<span class="chip"><span style="width:9px;height:9px;border-radius:999px;background:${TONE[s]}"></span>${SLABEL[s]}</span>`).join("");

// ── Controls ─────────────────────────────────────────────────────────────────
$("sortSel").onchange = e => { state.sort = e.target.value; render(); };
$("sysSel").onchange = e => { state.sysFilter = e.target.value; render(); };
$("statusSel").onchange = e => { state.statusFilter = e.target.value; render(); };
$("pauseBtn").onclick = () => { state.paused = !state.paused; $("pauseBtn").classList.toggle("active", state.paused); $("pauseBtn").textContent = state.paused ? "▶" : "⏸"; };
$("panelBtn").onclick = () => { state.panelOpen = !state.panelOpen; syncPanelBtn(); render(); };
$("fsBtn").onclick = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else root.requestFullscreen?.(); };
document.addEventListener("fullscreenchange", () => {
  const fs = document.fullscreenElement === root;
  state.panelOpen = !fs; syncPanelBtn(); render();
});
function syncPanelBtn(){ $("panelBtn").classList.toggle("active", !state.panelOpen); $("panelBtn").title = state.panelOpen ? "Workflow-Spalte einklappen" : "Workflow-Spalte ausklappen"; }

// ── Pan/Zoom ─────────────────────────────────────────────────────────────────
const canvas = $("canvas"), stage = $("stage");
let drag = null;
canvas.addEventListener("pointerdown", e => { if (e.target.closest("[data-card]")) return; drag = { x:e.clientX, y:e.clientY, tx:state.tx, ty:state.ty }; canvas.classList.add("grabbing"); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", e => { if (!drag) return; state.tx = drag.tx + (e.clientX-drag.x); state.ty = drag.ty + (e.clientY-drag.y); applyTransform(); });
canvas.addEventListener("pointerup", () => { drag=null; canvas.classList.remove("grabbing"); });
canvas.addEventListener("pointerleave", () => { drag=null; canvas.classList.remove("grabbing"); });
canvas.addEventListener("wheel", e => { e.preventDefault(); const r=canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; const f=e.deltaY<0?1.1:1/1.1; const ns=Math.min(2.5,Math.max(0.2,state.scale*f)); state.tx=mx-(mx-state.tx)*(ns/state.scale); state.ty=my-(my-state.ty)*(ns/state.scale); state.scale=ns; applyTransform(); }, { passive:false });
$("zin").onclick = () => { state.scale=Math.min(2.5,state.scale*1.2); applyTransform(); };
$("zout").onclick = () => { state.scale=Math.max(0.2,state.scale/1.2); applyTransform(); };
$("zfit").onclick = () => fit();
function applyTransform(){ stage.style.transform = `translate(${state.tx}px,${state.ty}px) scale(${state.scale})`; }

// ── Layout ───────────────────────────────────────────────────────────────────
function sortNodes(nodes){
  const by=state.sort; if(by==="default") return nodes;
  const a=[...nodes];
  if(by==="name") a.sort((x,y)=>x.name.localeCompare(y.name,"de"));
  else if(by==="status") a.sort((x,y)=>(SORDER[x.status]-SORDER[y.status])||x.name.localeCompare(y.name,"de"));
  else if(by==="updated") a.sort((x,y)=>new Date(y.updatedAt||0)-new Date(x.updatedAt||0));
  else if(by==="execs") a.sort((x,y)=>(y.execCount-x.execCount)||x.name.localeCompare(y.name,"de"));
  return a;
}
function layout(nodes){
  const bySys={}; nodes.forEach(n=>{(bySys[n.system]=bySys[n.system]||[]).push(n)});
  const shown=ORDER.filter(s=>(bySys[s]||[]).length>0||CORE.includes(s));
  const colY={0:20,1:20,2:20,3:20}; const groups=[]; const cr={};
  shown.forEach(s=>{const col=COL_OF[s];const items=bySys[s]||[];const x=20+col*(CW+CG);const y=colY[col];
    const bodyH=items.length?items.length*CH+(items.length-1)*CGAP:34;const h=HH+bodyH+PB;
    groups.push({s,x,y,w:CW,h,count:items.length});
    items.forEach((n,i)=>{const cx=x+CP,cy=y+HH+i*(CH+CGAP),w=CW-CP*2;cr[n.id]={x:cx,y:cy,w,h:CH,cx:cx+w/2,cy:cy+CH/2}});
    colY[col]=y+h+GG;});
  const maxCol=Math.max(0,...shown.map(s=>COL_OF[s]));
  return { groups, cr, W:40+(maxCol+1)*(CW)+maxCol*CG, H:Math.max(...Object.values(colY))+10, bySys };
}
function orth(s,t){ if(t.x>=s.x+s.w){const mx=(s.x+s.w+t.x)/2;return[[s.x+s.w,s.cy],[mx,s.cy],[mx,t.cy],[t.x,t.cy]]}
  if(t.x+t.w<=s.x){const mx=(s.x+t.x+t.w)/2;return[[s.x,s.cy],[mx,s.cy],[mx,t.cy],[t.x+t.w,t.cy]]}
  if(t.cy>=s.cy){const my=(s.y+s.h+t.y)/2;return[[s.cx,s.y+s.h],[s.cx,my],[t.cx,my],[t.cx,t.y]]}
  const my=(s.y+t.y+t.h)/2;return[[s.cx,s.y],[s.cx,my],[t.cx,my],[t.cx,t.y+t.h]]}
function pathD(p,r=8){let d=`M ${p[0][0]} ${p[0][1]}`;for(let i=1;i<p.length-1;i++){const[px,py]=p[i],[ax,ay]=p[i-1],[bx,by]=p[i+1];const v1x=Math.sign(px-ax),v1y=Math.sign(py-ay),v2x=Math.sign(bx-px),v2y=Math.sign(by-py);const rr=Math.min(r,Math.hypot(px-ax,py-ay)/2,Math.hypot(bx-px,by-py)/2);d+=` L ${px-v1x*rr} ${py-v1y*rr} Q ${px} ${py} ${px+v2x*rr} ${py+v2y*rr}`}const l=p[p.length-1];return d+` L ${l[0]} ${l[1]}`}
function arrow(p,s=6){const[px,py]=p[p.length-1],[qx,qy]=p[p.length-2];const a=Math.atan2(py-qy,px-qx);return `${px},${py} ${px+s*Math.cos(a+Math.PI-.5)},${py+s*Math.sin(a+Math.PI-.5)} ${px+s*Math.cos(a+Math.PI+.5)},${py+s*Math.sin(a+Math.PI+.5)}`}
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shortName = n => { const c=String(n).replace(/^P8NEX\s*[-–]\s*/,"").replace(/^HubSpot\s*[-–]\s*/,""); return c.length>40?c.slice(0,38)+"…":c; };

// ── Render ───────────────────────────────────────────────────────────────────
function badge(status){ const c=TONE[status]||TONE.unknown; return `<span class="badge" style="color:${c};background:${c}1f;border:1px solid ${c}55"><span class="${status==="running"?"pulse":""}" style="width:6px;height:6px;border-radius:999px;background:${c}"></span>${SLABEL[status]||status}</span>`; }

function render(){
  const snap = state.snap;
  $("livePill").textContent = state.error ? "Offline" : "Live";
  $("livePill").style.background = state.error ? "rgba(241,109,109,.15)" : "rgba(0,217,232,.13)";
  $("livePill").style.color = state.error ? "#F16D6D" : "var(--n8n)";
  $("stand").textContent = "Stand: " + (state.lastOkAt ? new Date(state.lastOkAt).toLocaleTimeString("de-DE") : "—");
  const notice=$("notice");
  if(state.error){ notice.style.display="block"; notice.textContent="Live-Daten nicht verfügbar: "+state.error+(snap?" (zeige letzten Stand)":""); }
  else notice.style.display="none";

  const k = snap?.kpis;
  $("kpis").innerHTML = [["Workflows",k?.workflowsTotal],["Aktiv",k?.workflowsActive],["Läuft",k?.running],["Erfolgreich",k?.success],["Fehlgeschlagen",k?.failed],["Wartet",k?.waiting]]
    .map(([l,v])=>`<div class="kpi"><b class="mono">${v==null?"—":v}</b><span>${l}</span></div>`).join("");

  // Panel-Sichtbarkeit
  $("panel").classList.toggle("hidden", !state.panelOpen);

  if(!snap){ stage.innerHTML=""; if(!canvas.querySelector(".center")){const c=document.createElement("div");c.className="center";c.textContent=state.error?"Keine Live-Daten.":"Lädt …";canvas.appendChild(c);} return; }
  const old=canvas.querySelector(".center"); if(old) old.remove();

  const nodes = sortNodes(snap.nodes);
  const lay = layout(nodes);
  stage.style.width=lay.W+"px"; stage.style.height=lay.H+"px";

  // SVG (Gruppen + Kanten)
  let svg="";
  lay.groups.forEach(g=>{const c=SYSTEM_COLOR[g.s];const run=(lay.bySys[g.s]||[]).some(n=>n.status==="running");
    svg+=`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12" fill="${c}0d" stroke="${c}" stroke-opacity=".45" stroke-width="1" stroke-dasharray="5 5" class="${run?"pulse":""}"/>`;});
  snap.edges.forEach(e=>{const s=lay.cr[e.from],t=lay.cr[e.to];if(!s||!t)return;const p=orth(s,t);const src=nodes.find(n=>n.id===e.from);const active=src&&src.status==="running";const col=src?SYSTEM_COLOR[src.system]:"#5b6b83";const stroke=active?col:"#5b6b83";
    svg+=`<path d="${pathD(p)}" fill="none" stroke="${stroke}" stroke-width="${active?2:1.5}" stroke-opacity="${active?.95:.6}"/><polygon points="${arrow(p)}" fill="${stroke}" fill-opacity="${active?.95:.7}"/>`;
    if(active)svg+=`<path d="${pathD(p)}" fill="none" stroke="${col}" stroke-width="2.5" stroke-opacity=".5" class="flow"/><circle r="3" fill="${col}" class="dot" style="offset-path:path('${pathD(p)}')"></circle>`;
    if(e.label)svg+=`<text x="${(p[1][0]+p[2][0])/2}" y="${(p[1][1]+p[2][1])/2-5}" fill="#98A3B5" font-size="9" text-anchor="middle" class="mono">${esc(e.label)}</text>`;});

  // Karten + Gruppentitel (HTML)
  let html=`<svg width="${lay.W}" height="${lay.H}" style="position:absolute;inset:0;overflow:visible">${svg}</svg>`;
  lay.groups.forEach(g=>{const c=SYSTEM_COLOR[g.s];
    html+=`<div style="position:absolute;left:${g.x+14}px;top:${g.y+11}px;width:${g.w-28}px;display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:2px;background:${c}"></span>
      <span class="mono" style="font-size:12px;font-weight:700">${SYSTEM_NAME[g.s]}</span>
      <span class="mono" style="margin-left:auto;font-size:10px;color:var(--dim)">${g.count}</span></div>`;
    if(g.count===0)html+=`<div class="mono" style="position:absolute;left:${g.x+14}px;top:${g.y+40}px;font-size:10px;color:var(--dim)">${g.s==="openai"?"nicht genutzt":"—"}</div>`;});
  nodes.forEach(n=>{const r=lay.cr[n.id];if(!r)return;const c=SYSTEM_COLOR[n.system];const run=n.status==="running";const dim=state.sysFilter!=="all"&&n.system!==state.sysFilter || state.statusFilter!=="all"&&n.status!==state.statusFilter;const seld=state.selected===n.id;
    html+=`<button data-card data-id="${n.id}" style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:var(--card);border:1px solid ${seld?c:"var(--border)"};border-left:3px solid ${c};border-radius:8px;padding:6px 9px;text-align:left;cursor:pointer;overflow:hidden;color:var(--text);opacity:${dim?.3:n.active?1:.7};${run?`box-shadow:0 0 0 1px ${c}55,0 0 16px -4px ${c}`:""}">
      <div style="font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(shortName(n.name))}</div>
      <div style="margin-top:5px;display:flex;align-items:center;gap:6px">${badge(n.status)}${!n.active?'<span class="mono" style="font-size:9px;color:var(--dim)">inaktiv</span>':""}
        ${(n.uses||[]).length?`<span style="margin-left:auto;display:flex;gap:4px">${n.uses.slice(0,3).map(u=>`<span style="width:6px;height:6px;border-radius:999px;background:${SYSTEM_COLOR[u]}"></span>`).join("")}</span>`:""}</div>
    </button>`;});
  stage.innerHTML=html;
  stage.querySelectorAll("[data-card]").forEach(b=>b.onclick=()=>{ state.selected = state.selected===b.dataset.id?null:b.dataset.id; render(); });

  if(!state.fitted){ fit(); state.fitted=true; } else applyTransform();

  renderSidePanel(nodes);
  renderFloat(nodes);
}

function nodeById(nodes,id){ return nodes.find(n=>n.id===id); }

function detailHTML(n){
  const c=SYSTEM_COLOR[n.system];
  const inc=(state.snap.edges||[]).filter(e=>e.to===n.id), out=(state.snap.edges||[]).filter(e=>e.from===n.id);
  const nm=Object.fromEntries(state.snap.nodes.map(x=>[x.id,x.name]));
  const f=(v)=>v?new Date(v).toLocaleString("de-DE"):"Nicht verfügbar";
  const row=(l,v)=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #29334455"><span style="color:var(--dim);font-size:11px">${l}</span><span class="mono" style="font-size:11px;text-align:right">${esc(v)}</span></div>`;
  const conns=(arr,lbl)=>arr.length?`<div style="margin-top:8px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin-bottom:6px">${lbl} (${arr.length})</div>${arr.map(e=>`<div class="item" data-goto="${e.from===n.id?e.to:e.from}"><span style="flex:1;font-size:11px">${esc(nm[e.from===n.id?e.to:e.from]||"")}</span><span class="mono" style="font-size:9px;color:var(--dim)">${esc(e.label||"")}</span></div>`).join("")}</div>`:"";
  return `<div style="padding:14px;background:linear-gradient(160deg,${c}14,var(--surface) 70%);border-bottom:1px solid var(--border)">
      <span class="badge" style="color:${c};background:${c}1c"><span style="width:6px;height:6px;border-radius:999px;background:${c}"></span>${SYSTEM_NAME[n.system]}</span>
      <div style="margin-top:8px;font-size:13px;font-weight:700;line-height:1.3">${esc(n.name)}</div>
      <div style="margin-top:8px;display:flex;gap:6px">${badge(n.status)}<span class="badge" style="background:${n.active?"#0e3b2e":"#26303f"};color:${n.active?"#6ee7b7":"var(--dim)"}">${n.active?"Aktiv":"Inaktiv"}</span></div>
    </div>
    <div style="flex:1;overflow:auto;padding:14px">
      ${n.note?`<div style="font-size:12px;color:var(--dim);margin-bottom:10px">${esc(n.note)}</div>`:""}
      ${row("Workflow-ID",n.id)}${row("Letzte Änderung",f(n.updatedAt))}${row("Letzter Lauf",f(n.lastRunAt))}${row("Ausführungen",n.execCount)}${n.uses.length?row("Nutzt",n.uses.map(u=>SYSTEM_NAME[u]).join(", ")):""}
      ${conns(inc,"Ausgelöst von")}${conns(out,"Löst aus")}
      <a href="#" data-n8n="${n.id}" style="display:inline-block;margin-top:12px;color:var(--n8n);font-size:12px;text-decoration:none">↗ In n8n öffnen</a>
    </div>`;
}
function wireDetail(el){
  el.querySelectorAll("[data-goto]").forEach(x=>x.onclick=()=>{ state.selected=x.dataset.goto; render(); });
  el.querySelectorAll("[data-n8n]").forEach(x=>x.onclick=(ev)=>{ ev.preventDefault(); window.open((window.__N8N_BASE__||"https://n8n.compliancemanufaktur.online")+"/workflow/"+x.dataset.n8n,"_blank","noopener"); });
}

function renderSidePanel(nodes){
  const panel=$("panel"); if(!state.panelOpen){ return; }
  const sel = state.selected ? nodeById(nodes,state.selected) : null;
  if(sel){ panel.innerHTML = `<h2>Detail</h2><div style="flex:1;display:flex;flex-direction:column;overflow:hidden" id="detailWrap"></div>`;
    const w=document.createElement("div"); w.style.cssText="flex:1;display:flex;flex-direction:column;overflow:hidden"; w.innerHTML=detailHTML(sel);
    $("detailWrap").replaceWith(w); wireDetail(w); return; }
  const filtered = nodes.filter(n=>(state.sysFilter==="all"||n.system===state.sysFilter)&&(state.statusFilter==="all"||n.status===state.statusFilter));
  panel.innerHTML = `<h2>Workflows <span class="mono" style="font-weight:400;color:var(--dim)">(${filtered.length})</span></h2><div class="list" id="list"></div>`;
  $("list").innerHTML = filtered.map(n=>`<button class="item" data-id="${n.id}"><span style="width:8px;height:8px;border-radius:3px;background:${SYSTEM_COLOR[n.system]};flex:none"></span><span style="flex:1;min-width:0"><span style="display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.name)}</span><small>${SYSTEM_NAME[n.system]}</small></span>${badge(n.status)}</button>`).join("") || `<div style="padding:12px;color:var(--dim);font-size:11px">Keine Workflows im Filter.</div>`;
  $("list").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{ state.selected=b.dataset.id; render(); });
}
function renderFloat(nodes){
  const ex=$("floatPanel"); if(ex) ex.remove();
  if(state.panelOpen || !state.selected) return;
  const sel=nodeById(nodes,state.selected); if(!sel) return;
  const fp=document.createElement("div"); fp.className="float"; fp.id="floatPanel";
  fp.style.cssText+=";display:flex;flex-direction:column;background:var(--surface)";
  fp.innerHTML = `<h2 style="display:flex;justify-content:space-between;align-items:center">Detail <button class="btn" id="floatClose" style="height:24px;min-width:24px">✕</button></h2>`+detailHTML(sel);
  canvas.appendChild(fp); wireDetail(fp);
  const cl=fp.querySelector("#floatClose"); if(cl) cl.onclick=()=>{ state.selected=null; render(); };
}

function fit(){
  const snap=state.snap; if(!snap) return; const nodes=sortNodes(snap.nodes); const lay=layout(nodes);
  const r=canvas.getBoundingClientRect(); const pad=32;
  const s=Math.min((r.width-pad)/lay.W,(r.height-pad)/lay.H,1.3)||1;
  state.scale=s>0?s:1; state.tx=(r.width-lay.W*s)/2; state.ty=(r.height-lay.H*s)/2; applyTransform();
}
window.addEventListener("resize", ()=>{ /* Position halten; nur bei Bedarf refit über Button */ });

// ── SSE ──────────────────────────────────────────────────────────────────────
function connect(){
  const es = new EventSource("/events");
  es.addEventListener("snapshot", ev => {
    if(state.paused) return;
    try{ const d=JSON.parse(ev.data); state.snap=d.snapshot||state.snap; state.error=d.error||null; state.lastOkAt=d.lastOkAt||state.lastOkAt; render(); }catch{}
  });
  es.onerror = () => { state.error="Verbindung zum Dienst unterbrochen (reconnect …)"; render(); };
}
syncPanelBtn(); render(); connect();
