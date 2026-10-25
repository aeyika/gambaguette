import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, PositionTracker, supportedUrl, squarePoint, arrowGeometry, normalizeSide, legalSuggestion, settings, DEFAULTS } from '../src/core.js';

test('analysis accepts all chess.com paths and keeps the same-origin boundary', () => {
  for (const path of ['/play/computer','/play/online','/game/live/123','/game/daily/456','/analysis','/puzzles','/fr/play/computer']) assert.ok(supportedUrl(`https://www.chess.com${path}`));
  for (const url of ['https://evil.test/play/computer','https://www.chess.com.evil.test/game/live/1','http://chess.com/play/computer','not a url']) assert.equal(supportedUrl(url),false);
});
test('arrow silhouette is a single closed shape for short, long, diagonal and flipped moves', () => {
  for (const [from,to] of [['e2','e3'],['e2','e4'],['a1','h8'],['b1','c3'],['a1','h1']]) {
    for (const flipped of [false,true]) {
      const shape = arrowGeometry(from,to,flipped);
      assert.match(shape.path,/^M .* Z$/); assert.ok(!shape.path.includes('NaN'));
      assert.match(shape.transform,/^translate\(/);
    }
  }
  assert.throws(() => arrowGeometry('e2','e2'));
});
test('side detection handles actual board API numbers and string identities', () => {
  for (const value of [1,'w','white','White']) assert.equal(normalizeSide(value),'w');
  for (const value of [2,'b','black','Black']) assert.equal(normalizeSide(value),'b');
  for (const value of [0,undefined,'observer','both']) assert.equal(normalizeSide(value),null);
});
test('arrow geometry follows white and black orientation', () => {
  assert.deepEqual(squarePoint('a1'),[0.5,7.5]);
  assert.deepEqual(squarePoint('h8'),[7.5,0.5]);
  assert.deepEqual(squarePoint('e2',true),[3.5,1.5]);
  assert.throws(() => squarePoint('z9'));
});
test('suggestions reject illegal moves and preserve promotion and castling', () => {
  const start = new Chess().fen();
  assert.equal(legalSuggestion(start,'e2e5'),null);
  assert.equal(legalSuggestion(start,'e2e4').san,'e4');
  assert.equal(legalSuggestion('4k3/P7/8/8/8/8/8/4K3 w - - 0 1','a7a8q').promotion,'q');
  assert.equal(legalSuggestion('4k3/8/8/8/8/8/8/4K2R w K - 0 1','e1g1').san,'O-O');
});
test('position reader trusts full FEN only when board placement agrees', () => {
  const tracker = new PositionTracker();
  const chess = new Chess(); chess.move('e4');
  assert.equal(tracker.read(chess.fen(), chess.fen().split(' ')[0]),chess.fen());
  assert.equal(tracker.read('not a fen','4k3/8/8/8/8/8/8/4K3'),null);
});
test('DOM fallback follows two plies and retains lost castling rights', () => {
  const tracker = new PositionTracker(), chess = new Chess();
  chess.move('e4'); chess.move('e5');
  assert.equal(tracker.read(null,chess.fen().split(' ')[0]),chess.fen());
  const rook = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  tracker.read(rook.fen(),rook.fen().split(' ')[0]);
  for (const move of ['Rh2','Rh7','Rh1','Rh8']) {
    rook.move(move); tracker.read(null,rook.fen().split(' ')[0]);
  }
  assert.equal(tracker.fen,rook.fen());
  assert.equal(tracker.fen.split(' ')[2],'Qq');
});
test('settings constrain search times and sanitize stored values', () => {
  assert.deepEqual(settings({side:'x',time:900000,enabled:'yes',arrowColor:'url(evil)'}),DEFAULTS);
  assert.equal(settings({arrowColor:'#AABBCC'}).arrowColor,'#aabbcc');
  assert.equal(settings(null).autoSide,true);
  assert.equal(settings({time:100}).time,100);
  assert.equal(settings().time,100);
  assert.equal(settings({enabled:false,side:'b'}).autoSide,true,'existing installs gain automatic detection');
});
