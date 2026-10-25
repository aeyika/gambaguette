export function findBoard() {
  return [...document.querySelectorAll('wc-chess-board, chess-board')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 100 && r.height > 100 && getComputedStyle(b).visibility !== 'hidden'; })
    .sort((a,b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
}
export function placementOf(board) {
  const squares = new Map();
  for (const piece of board.querySelectorAll('.piece')) {
    if (piece.classList.contains('dragging')) continue;
    const classes = [...piece.classList];
    const code = classes.find(c => /^[wb][kqrbnp]$/.test(c));
    const sq = classes.find(c => /^square-[1-8][1-8]$/.test(c));
    if (!code || !sq || squares.has(sq.slice(7))) return null;
    squares.set(sq.slice(7), code[0] === 'w' ? code[1].toUpperCase() : code[1]);
  }
  if (!squares.size) return null;
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '', empty = 0;
    for (let file = 1; file <= 8; file++) {
      const piece = squares.get(`${file}${rank}`);
      if (piece) { if (empty) row += empty; empty = 0; row += piece; }
      else empty++;
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return ranks.join('/');
}
