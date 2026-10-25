import { Engine } from './engine.js';
const engine = new Engine(() => new Worker(chrome.runtime.getURL('engine/stockfish-19-lite-single.js')));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'engine' || sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.type === 'cancel') { engine.cancel(message); respond({cancelled:true}); return; }
  if (message.type !== 'analyze') return;
  engine.analyze(message).then(respond);
  return true;
});
