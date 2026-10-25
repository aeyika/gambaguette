import { Chess, PositionTracker, settings, normalizeSide, arrowGeometry, legalSuggestion } from './core.js';
import { findBoard, placementOf } from './board.js';
import { icons } from 'gambaguette:icons';
import themeCSS from './theme.css';

const tracker = new PositionTracker();
let prefs, board, panel, shadow, svg, arrowGroup, arrowShape, lastSnapshot = 0, fen = null;
let playerSide = null, sideSource = null, lastPath = location.pathname;
let revision = 0, lastSearch = '', suggestion = null, ready = false;
const client = crypto.randomUUID();
let pendingTicket = null;
let dragging = false, refreshTimer;
const $ = selector => shadow.querySelector(selector);
const effectiveSide = () => prefs.autoSide ? playerSide : prefs.side;

function syncSettings() {
  if (!shadow) return;
  $('#side').value = effectiveSide() ?? 'both';
  $('#auto-side').checked = prefs.autoSide;
  panel.dataset.theme = prefs.darkMode ? 'dark' : 'light';
  $('#dark-mode').checked = prefs.darkMode;
  $('#private-overlay').checked = prefs.privateOverlay;
  if (prefs.privateOverlay) panel.style.setProperty('display','none','important');
  else panel.style.removeProperty('display');
  $('#time').value = String(prefs.time); $('#automatic').checked = prefs.automatic;
  $('#arrow-color').value = prefs.arrowColor; $('#color-value').textContent = prefs.arrowColor.toUpperCase();
  for (const preset of shadow.querySelectorAll('[data-color]')) preset.setAttribute('aria-pressed',String(preset.dataset.color === prefs.arrowColor));
  $('#side-note').textContent = prefs.autoSide
    ? playerSide ? `${playerSide === 'w' ? 'White' : 'Black'} ${sideSource === 'player' ? 'detected' : 'perspective'}` : 'Detecting side…'
    : 'Manual';
}

function setStatus(text) { if (shadow) $('#status').textContent = text; }
function invalidate() {
  if (prefs?.privateOverlay) chrome.runtime.sendMessage({target:'overlay',action:'hide'}).catch(() => {});
  if (pendingTicket !== null) {
    const obsolete = pendingTicket; pendingTicket = null;
    chrome.runtime.sendMessage({target:'background',type:'cancel',client,revision:obsolete}).catch(() => {});
  }
  revision++; suggestion = null; lastSearch = '';
  if (svg) svg.style.display = 'none';
  if (shadow) { $('#move').textContent = '—'; $('#detail').textContent = ''; $('#evaluation').textContent = ''; }
}
function mount() {
  panel = document.createElement('div'); panel.id = 'gambaguette';
  panel.style.cssText = 'all:initial!important;position:fixed!important;bottom:20px!important;right:20px!important;z-index:1000000!important;';
  shadow = panel.attachShadow({mode:'open'});
  shadow.innerHTML = `
    <style>
      ${themeCSS}
      *{box-sizing:border-box}svg{display:block;flex-shrink:0}button,select,input{font:inherit}button{cursor:pointer}
      .card{width:292px;max-width:calc(100vw - 24px);background:var(--gb-bg);color:var(--gb-title);border:1px solid var(--gb-outline);border-radius:8px;box-shadow:0 10px 40px #10233d26,0 2px 6px #10233d0d;font:13px/1.45 system-ui,sans-serif;overflow:hidden}
      header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--gb-border);cursor:move;touch-action:none;user-select:none}.brand{display:flex;align-items:center;gap:9px;font-size:14px;letter-spacing:-.3px;font-weight:600}.brand svg{color:var(--gb-accent)}
      button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--gb-outline);background:var(--gb-bg);color:var(--gb-text);border-radius:5px;padding:8px 10px}button:hover{background:var(--gb-hover)}button:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--gb-focus);outline-offset:2px}
      .tools{display:flex;gap:2px}#fold,#settings-toggle{width:28px;height:28px;padding:5px;border-color:transparent}#settings-toggle[aria-expanded="true"]{background:var(--gb-selected);color:var(--gb-accent)}.body{max-height:calc(100vh - 100px);overflow-y:auto}
      .summary{border-left:3px solid var(--gb-accent);background:var(--gb-selected);padding:13px 16px}.label{display:flex;align-items:center;justify-content:space-between;color:var(--gb-accent);font-size:11px;font-weight:500}.label span:first-child{display:flex;align-items:center;gap:7px}.label svg{width:14px;height:14px}#side-badge{font-size:10px;color:var(--gb-muted)}
      .result{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:4px 0}#move{font-size:30px;font-weight:600;letter-spacing:-.8px;color:var(--gb-title)}#evaluation{font-size:12px;color:var(--gb-muted);font-variant-numeric:tabular-nums}#detail{font-size:12px;color:var(--gb-muted);min-height:17px}#status{font-size:11px;color:var(--gb-muted);margin:4px 0 0;min-height:16px}
      #settings-panel{padding:0 16px 6px;border-bottom:1px solid var(--gb-border)}.row{display:flex;align-items:center;gap:8px;min-height:43px;border-bottom:1px solid var(--gb-border)}.row:last-child{border-bottom:0}.row label{flex:1;display:flex;align-items:center;gap:9px;color:var(--gb-text)}.row label svg{color:var(--gb-muted);width:16px;height:16px}.toggle{justify-content:space-between;flex-direction:row-reverse}.toggle span{display:flex;align-items:center;gap:9px}
      select{max-width:126px;color:var(--gb-text);background:var(--gb-field);border:1px solid var(--gb-outline);border-radius:4px;padding:5px 7px;font-size:12px;cursor:pointer}input{accent-color:var(--gb-accent)}input[type="checkbox"]{width:14px;height:14px;margin:0}.note{font-size:10px;color:var(--gb-muted);margin:4px 0 8px;padding-left:25px}.color-control{display:flex;align-items:center;gap:8px}input[type="color"]{width:28px;height:25px;border:1px solid var(--gb-outline);padding:2px;border-radius:4px;cursor:pointer;background:var(--gb-bg)}#color-value{font-size:10px;color:var(--gb-muted);font-family:ui-monospace,monospace}.swatches{display:flex;gap:9px;padding:7px 0 11px 25px;border-bottom:1px solid var(--gb-border)}.swatch{width:20px;height:20px;padding:0;border:2px solid var(--gb-bg);outline:1px solid var(--gb-outline);border-radius:50%;background:var(--swatch)}.swatch:hover{background:var(--swatch);outline-color:var(--gb-accent)}.swatch[aria-pressed="true"]{outline:2px solid var(--gb-accent)}
      .actions{display:flex;gap:8px;padding:12px 14px}.actions button{flex:1;font-size:12px}.actions svg{width:15px;height:15px}#hint{background:var(--gb-primary);color:var(--gb-on-primary);border-color:var(--gb-primary)}#hint:hover{background:var(--gb-primary-hover)}
      [hidden]{display:none!important}
    </style>
    <section class="card" aria-label="Gambaguette chess coach">
      <header title="Drag to move"><div class="brand">${icons.crown}Gambaguette</div><div class="tools"><button id="settings-toggle" aria-label="Settings" title="Settings" aria-controls="settings-panel" aria-expanded="false">${icons.settings}</button><button id="fold" aria-label="Collapse panel" title="Collapse" aria-expanded="true">${icons.minus}</button></div></header>
      <div class="body" id="body">
        <div class="summary"><div class="label"><span>${icons.sparkles}Hint</span><span id="side-badge"></span></div><div class="result"><span id="move">—</span><span id="evaluation"></span></div>
        <div id="detail"></div><div id="status" role="status" aria-live="polite">Reading board…</div></div>
        <div id="settings-panel" role="region" aria-label="Settings" hidden>
          <div class="row"><label for="arrow-color">${icons.palette}Arrow colour</label><div class="color-control"><span id="color-value"></span><input type="color" id="arrow-color" aria-label="Arrow colour"></div></div>
          <div class="swatches" aria-label="Arrow colour presets">
            <button class="swatch" data-color="#ffbe55" style="--swatch:#ffbe55" aria-label="Gold arrow"></button><button class="swatch" data-color="#65b9ff" style="--swatch:#65b9ff" aria-label="Blue arrow"></button><button class="swatch" data-color="#69e0a3" style="--swatch:#69e0a3" aria-label="Green arrow"></button><button class="swatch" data-color="#ed85cf" style="--swatch:#ed85cf" aria-label="Pink arrow"></button><button class="swatch" data-color="#ffffff" style="--swatch:#ffffff" aria-label="White arrow"></button>
          </div>
          <div class="row"><label class="toggle"><input type="checkbox" id="dark-mode"><span>${icons.moon}Dark mode</span></label></div>
          <div class="row"><label class="toggle"><input type="checkbox" id="private-overlay"><span>${icons.private}Private overlay</span></label></div>
          <div class="row"><label class="toggle"><input type="checkbox" id="auto-side"><span>${icons.scan}Auto-detect side</span></label></div>
          <div class="row"><label for="side">${icons.crown}Side</label><select id="side"><option value="both">Both sides</option><option value="w">White only</option><option value="b">Black only</option></select></div>
          <p id="side-note" class="note"></p>
          <div class="row"><label for="time">${icons.clock}Search time</label><select id="time"><option value="100">Instant · 0.1 s</option><option value="300">0.3 s</option><option value="800">0.8 s</option><option value="1500">1.5 s</option><option value="3000">3 s</option></select></div>
          <div class="row"><label class="toggle"><input type="checkbox" id="automatic"><span>${icons.refresh}Auto hints</span></label></div>
        </div>
        <div class="actions"><button id="pause">${icons.pause}<span>Pause</span></button><button id="hint">${icons.sparkles}<span>Get hint</span></button></div>
      </div>
    </section>`;
  document.documentElement.append(panel);
  syncSettings();
  $('#pause').innerHTML = `${prefs.enabled ? icons.pause : icons.play}<span>${prefs.enabled ? 'Pause' : 'Resume'}</span>`;
  const header = $('header');
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect(), offsetX = event.clientX-rect.left, offsetY = event.clientY-rect.top;
    header.setPointerCapture(event.pointerId);
    const move = point => {
      const bounds = panel.getBoundingClientRect();
      panel.style.setProperty('left',`${Math.max(0,Math.min(innerWidth-bounds.width,point.clientX-offsetX))}px`,'important');
      panel.style.setProperty('top',`${Math.max(0,Math.min(innerHeight-bounds.height,point.clientY-offsetY))}px`,'important');
      panel.style.setProperty('right','auto','important'); panel.style.setProperty('bottom','auto','important');
    };
    const stop = () => { header.removeEventListener('pointermove',move); header.removeEventListener('pointerup',stop); header.removeEventListener('pointercancel',stop); };
    header.addEventListener('pointermove',move); header.addEventListener('pointerup',stop); header.addEventListener('pointercancel',stop);
  });
  $('#fold').addEventListener('click', () => {
    const closed = !$('#body').hidden; $('#body').hidden = closed;
    $('#fold').innerHTML = closed ? icons.plus : icons.minus;
    $('#fold').setAttribute('aria-expanded', String(!closed));
    $('#fold').setAttribute('aria-label', closed ? 'Expand panel' : 'Collapse panel');
  });
  $('#settings-toggle').addEventListener('click', () => {
    const open = $('#settings-panel').hidden;
    $('#settings-panel').hidden = !open; $('#settings-toggle').setAttribute('aria-expanded',String(open));
    if (open && $('#body').hidden) $('#fold').click();
    const rect = panel.getBoundingClientRect();
    if (rect.bottom > innerHeight) panel.style.setProperty('top',`${Math.max(0,innerHeight-rect.height-12)}px`,'important');
  });
  const save = async () => {
    invalidate(); syncSettings(); syncState();
    try { await chrome.storage.local.set({settings:prefs}); } catch { setStatus('Extension updated. Reload this page.'); }
  };
  $('#pause').addEventListener('click', () => { prefs.enabled = !prefs.enabled; save(); });
  $('#side').addEventListener('change', () => { prefs.side = $('#side').value; prefs.autoSide = false; save(); });
  $('#auto-side').addEventListener('change', () => { prefs.autoSide = $('#auto-side').checked; save(); });
  $('#dark-mode').addEventListener('change', async () => {
    prefs.darkMode = $('#dark-mode').checked; syncSettings();
    try { await chrome.storage.local.set({settings:prefs}); } catch { setStatus('Extension updated. Reload this page.'); }
  });
  $('#private-overlay').addEventListener('change', async () => {
    const input=$('#private-overlay');input.disabled=true;
    try {
      if (input.checked) {
        const result=await chrome.runtime.sendMessage({target:'overlay',action:'status',connect:true});
        if (!result?.ready) {input.checked=false;setStatus('Install the Windows helper from the toolbar popup.');return;}
      }
      prefs.privateOverlay=input.checked;syncSettings();draw();
      await chrome.storage.local.set({settings:prefs});
    } catch(error) {input.checked=prefs.privateOverlay;setStatus(error.message);}
    finally {input.disabled=false;}
  });
  $('#time').addEventListener('change', () => { prefs.time = Number($('#time').value); save(); });
  $('#automatic').addEventListener('change', () => { prefs.automatic = $('#automatic').checked; save(); });
  $('#hint').addEventListener('click', () => { lastSearch = ''; analyze(); });
  const setColor = async color => {
    prefs.arrowColor = color; syncSettings(); draw();
    try { await chrome.storage.local.set({settings:prefs}); } catch { setStatus('Extension updated. Reload this page.'); }
  };
  $('#arrow-color').addEventListener('input', () => setColor($('#arrow-color').value));
  for (const preset of shadow.querySelectorAll('[data-color]')) preset.addEventListener('click', () => setColor(preset.dataset.color));

  const ns = 'http://www.w3.org/2000/svg';
  svg = document.createElementNS(ns,'svg'); svg.id = 'gambaguette-arrow';
  svg.setAttribute('viewBox','0 0 8 8'); svg.setAttribute('aria-hidden','true');
  svg.style.cssText = 'position:fixed!important;pointer-events:none!important;z-index:999999!important;overflow:hidden!important;display:none;';
  svg.innerHTML = '<g><path class="arrow-shape" stroke="#172119" stroke-opacity="0.55" stroke-width="0.035" stroke-linejoin="round" paint-order="stroke" opacity="0.94" style="filter:drop-shadow(0 0.025px 0.035px #0005)"/></g>';
  arrowGroup = svg.querySelector('g'); arrowShape = svg.querySelector('path'); document.documentElement.append(svg);
}
function syncState() {
  if (!shadow) return;
  $('#pause').innerHTML = `${prefs.enabled ? icons.pause : icons.play}<span>${prefs.enabled ? 'Pause' : 'Resume'}</span>`;
  const side = effectiveSide();
  $('#side-badge').textContent = side === 'w' ? 'White only' : side === 'b' ? 'Black only' : 'Both sides';
  $('#hint').disabled = !prefs.enabled || !fen || dragging || !side || (side !== 'both' && side !== fen.split(' ')[1]);
  if (!prefs.enabled) { setStatus('Paused'); return; }
  if (!fen) { setStatus('Waiting for position…'); return; }
  if (!side) { setStatus('Detecting your player colour…'); return; }
  const turn = fen.split(' ')[1];
  if (side !== 'both' && side !== turn) { setStatus(`Waiting for ${side === 'w' ? 'White' : 'Black'} to move.`); return; }
  if (prefs.automatic && !dragging) analyze();
  else if (!suggestion) setStatus('Ready');
}
async function analyze() {
  if (!ready || !prefs.enabled || !fen || dragging || !board?.isConnected) return;
  const side = effectiveSide();
  if (!side || (side !== 'both' && side !== fen.split(' ')[1])) return;
  const key = `${fen}|${prefs.time}`;
  if (key === lastSearch) return;
  const chess = new Chess(fen);
  if (chess.isGameOver()) {
    setStatus(chess.isCheckmate() ? 'Checkmate' : 'Drawn position');
    lastSearch = key; return;
  }
  lastSearch = key;
  const ticket = ++revision, position = fen, target = board;
  pendingTicket = ticket;
  setStatus(`Thinking for ${chess.turn() === 'w' ? 'White' : 'Black'}…`);
  try {
    const result = await chrome.runtime.sendMessage({target:'background',type:'analyze',client,revision:ticket,fen:position,time:prefs.time});
    if (ticket !== revision || fen !== position || board !== target || !board?.isConnected || !prefs.enabled) return;
    if (lastSnapshot < Date.now() - 1500 || placementOf(board) !== position.split(' ')[0]) {
      invalidate(); setStatus('Board changed. Reading the new position…'); return;
    }
    if (result?.error) throw new Error(result.error);
    if (result?.fen !== position) throw new Error('Position changed. Get another hint.');
    const move = legalSuggestion(position,result.move);
    if (!move) throw new Error('No legal suggestion for this position. Try again.');
    suggestion = {uci:result.move, move};
    $('#move').textContent = move.san;
    $('#detail').textContent = `${move.color === 'w' ? 'White' : 'Black'} · ${move.from} → ${move.to}${move.promotion ? ` · promote to ${{q:'queen',r:'rook',b:'bishop',n:'knight'}[move.promotion]}` : ''}`;
    const score = result.score;
    if (score) {
      const value = score.value * (move.color === 'w' ? 1 : -1);
      $('#evaluation').textContent = score.type === 'mate' ? `White: ${value < 0 ? '−' : '+'}M${Math.abs(value)}` : `White: ${value >= 0 ? '+' : ''}${(value/100).toFixed(2)}`;
    }
    setStatus(`Depth ${result.depth}`); draw();
  } catch (error) {
    if (ticket !== revision) return;
    setStatus(`${error.message} Use Get hint to retry.`);
  } finally {
    if (pendingTicket === ticket) pendingTicket = null;
  }
}
function draw() {
  if (prefs?.privateOverlay) {
    if (svg) svg.style.display='none';
    if (panel) panel.style.setProperty('display','none','important');
    if (!board?.isConnected || document.visibilityState !== 'visible') return;
    const rect=board.getBoundingClientRect();
    chrome.runtime.sendMessage({target:'overlay',action:'frame',frame:{visible:rect.bottom > 0 && rect.top < innerHeight,
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},board:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},
      from:suggestion?.move.from,to:suggestion?.move.to,flipped:board.classList.contains('flipped'),color:prefs.arrowColor,darkMode:prefs.darkMode,
      move:$('#move').textContent,detail:$('#detail').textContent,evaluation:$('#evaluation').textContent,status:$('#status').textContent}}).catch(() => {});
    return;
  }
  if (panel) panel.style.removeProperty('display');
  if (!svg || !suggestion || !board?.isConnected || dragging || !prefs.enabled) {
    if (svg) svg.style.display = 'none'; return;
  }
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { svg.style.display = 'none'; return; }
  const flipped = board.classList.contains('flipped');
  const geometry = arrowGeometry(suggestion.move.from,suggestion.move.to,flipped);
  arrowGroup.setAttribute('transform',geometry.transform);
  arrowShape.setAttribute('d',geometry.path); arrowShape.setAttribute('fill',prefs.arrowColor);
  svg.dataset.from = suggestion.move.from; svg.dataset.to = suggestion.move.to;
  Object.assign(svg.style,{display:'block',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
}
function refresh() {
  if (!ready) return;
  const current = findBoard();
  if (lastPath !== location.pathname) {
    lastPath = location.pathname; playerSide = sideSource = null; fen = null; tracker.reset(); invalidate();
  }
  if (!current) {
    if (panel) { invalidate(); panel.remove(); svg.remove(); panel = shadow = svg = null; }
    board = null; fen = null; playerSide = sideSource = null; lastSnapshot = 0; tracker.reset(); return;
  }
  if (!panel) mount();
  if (current !== board) { board = current; fen = null; playerSide = sideSource = null; lastSnapshot = 0; tracker.reset(); invalidate(); syncSettings(); syncState(); }
  if (!board || lastSnapshot < Date.now() - 2000) {
    if (fen) { fen = null; invalidate(); }
    setStatus('Waiting for board data. Reload the page if this continues.');
  }
  // Hide immediately when DOM moves ahead of the page-world snapshot.
  if (fen && placementOf(board) !== fen.split(' ')[0]) {
    if (suggestion || pendingTicket !== null) invalidate();
  } else draw();
}
window.addEventListener('message', event => {
  if (!ready || event.source !== window || event.origin !== location.origin || event.data?.source !== 'gambaguette-position-v1') return;
  refresh(); if (!board) return;
  const snapshot = event.data;
  // Require agreement with the live DOM; animation intermediates are ignored.
  const placement = placementOf(board);
  if (!placement || placement !== snapshot.placement) return;
  lastSnapshot = Date.now();
  const oldSide = effectiveSide(), oldSource = sideSource;
  playerSide = normalizeSide(snapshot.playerSide); sideSource = snapshot.sideSource;
  const next = tracker.read(snapshot.fen, placement);
  if (next !== fen || oldSide !== effectiveSide()) { fen = next; invalidate(); syncSettings(); syncState(); }
  else if (oldSource !== sideSource) syncSettings();
  draw();
});
document.addEventListener('pointerdown', event => {
  if (board?.contains(event.target)) { dragging = true; invalidate(); }
},true);
function releaseBoard() {
  if (!dragging) return;
  dragging = false;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refresh(); syncState(); },50);
}
document.addEventListener('pointerup',releaseBoard,true);
document.addEventListener('pointercancel',releaseBoard,true);
window.addEventListener('scroll',draw,true); window.addEventListener('resize',draw);
document.addEventListener('visibilitychange',() => {
  if (document.visibilityState !== 'visible' && prefs?.privateOverlay) chrome.runtime.sendMessage({target:'overlay',action:'hide'}).catch(() => {});
  else draw();
});
chrome.storage.onChanged.addListener((changes,area) => {
  if (area !== 'local' || !changes.settings) return;
  const next = settings(changes.settings.newValue);
  if (JSON.stringify(next) === JSON.stringify(prefs)) return;
  const {arrowColor:oldColor,darkMode:oldTheme,privateOverlay:oldPrivate,...oldAnalysis} = prefs ?? {};
  const {arrowColor:newColor,darkMode:newTheme,privateOverlay:newPrivate,...newAnalysis} = next;
  prefs = next; syncSettings();
  if (JSON.stringify(oldAnalysis) !== JSON.stringify(newAnalysis)) { invalidate(); syncState(); }
  else draw();
});
chrome.storage.local.get('settings').then(value => {
  prefs = settings(value.settings); ready = true; refresh(); setInterval(refresh,100);
});
