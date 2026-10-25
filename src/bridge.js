import { normalizeSide } from './core.js';
import { findBoard, placementOf } from './board.js';

// Runs in the page world: the isolated content script cannot see board.game.
const orientations = new WeakMap();
let observedBoard = null, scheduled = false;
const changes = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; sample(); });
});
function sample() {
  const board = findBoard();
  if (board !== observedBoard) {
    changes.disconnect(); observedBoard = board;
    if (board) changes.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
  if (!board) return;
  let fen = null;
  try { fen = board.game?.getFEN?.() ?? null; } catch { /* DOM tracking remains available. */ }
  let playerSide = null;
  try { playerSide = normalizeSide(board.game?.getPlayingAs?.()); } catch { /* Read the initial orientation instead. */ }
  let orientation = orientations.get(board);
  if (!orientation || orientation.path !== location.pathname) {
    orientation = {path:location.pathname, side:board.classList.contains('flipped') ? 'b' : 'w'};
    orientations.set(board,orientation);
  }
  window.postMessage({ source: 'gambaguette-position-v1', fen, placement: placementOf(board),
    playerSide: playerSide ?? orientation.side, sideSource: playerSide ? 'player' : 'orientation' }, location.origin);
}
// Metadata can change without a DOM mutation.
setInterval(sample,100);
sample();
