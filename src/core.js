import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
export { Chess };

export const SEARCH_TIMES = [100, 300, 800, 1500, 3000];
export const DEFAULTS = { enabled: true, automatic: true, side: 'both', autoSide: true, time: 100, arrowColor: '#ffbe55' };
export function supportedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ['www.chess.com', 'chess.com'].includes(u.hostname);
  } catch { return false; }
}
export function settings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    automatic: typeof value.automatic === 'boolean' ? value.automatic : DEFAULTS.automatic,
    side: ['both', 'w', 'b'].includes(value.side) ? value.side : DEFAULTS.side,
    autoSide: typeof value.autoSide === 'boolean' ? value.autoSide : DEFAULTS.autoSide,
    time: SEARCH_TIMES.includes(Number(value.time)) ? Number(value.time) : DEFAULTS.time,
    arrowColor: /^#[0-9a-f]{6}$/i.test(value.arrowColor) ? value.arrowColor.toLowerCase() : DEFAULTS.arrowColor,
  };
}
export function normalizeSide(value) {
  // chess.com's board API uses 1 = White, 2 = Black.
  if (value === 1) return 'w';
  if (value === 2) return 'b';
  if (typeof value !== 'string') return null;
  return ({w:'w',white:'w',b:'b',black:'b'})[value.toLowerCase()] ?? null;
}
export function arrowGeometry(from, to, flipped = false) {
  const [x1,y1] = squarePoint(from,flipped), [x2,y2] = squarePoint(to,flipped);
  const length = Math.hypot(x2-x1,y2-y1);
  if (length < 1) throw new Error('Arrow needs distinct squares');
  const tip = length-0.1, shoulder = tip-0.4;
  return {
    transform: `translate(${x1} ${y1}) rotate(${Math.atan2(y2-y1,x2-x1)*180/Math.PI})`,
    path: `M 0.34 -0.09 L ${shoulder} -0.09 L ${shoulder} -0.3 L ${tip} 0 L ${shoulder} 0.3 L ${shoulder} 0.09 L 0.34 0.09 Q 0.25 0.09 0.25 0 Q 0.25 -0.09 0.34 -0.09 Z`,
  };
}
export function validFen(fen) {
  return typeof fen === 'string' && fen.length < 160 && validateFen(fen).ok;
}
export function squarePoint(square, flipped = false) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error('Invalid square');
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return flipped ? [7.5 - file, rank + 0.5] : [file + 0.5, 7.5 - rank];
}
export function legalSuggestion(fen, uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci || '')) return null;
  try { return new Chess(fen).move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] }); }
  catch { return null; }
}

// A fallback never guesses side-to-move, castling rights or en passant.
// It starts at a known position and follows observed legal transitions.
export class PositionTracker {
  constructor() { this.reset(); }
  reset() { this.fen = DEFAULT_POSITION; }
  read(fen, placement) {
    if (validFen(fen) && (!placement || fen.split(' ')[0] === placement)) {
      this.remember(fen); return fen;
    }
    if (!placement) return null;
    if (this.fen.split(' ')[0] === placement) return this.fen;
    const chess = new Chess(this.fen);
    const first = chess.moves({verbose:true});
    for (const move of first) {
      if (move.after.split(' ')[0] === placement) { this.remember(move.after); return move.after; }
    }
    // A quick bot reply can land between two samples.
    for (const move of first) {
      const next = new Chess(move.after);
      for (const reply of next.moves({verbose:true})) {
        if (reply.after.split(' ')[0] === placement) { this.remember(move.after); this.remember(reply.after); return reply.after; }
      }
    }
    return null;
  }
  remember(fen) {
    this.fen = fen;
  }
}
