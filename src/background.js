import { supportedUrl, validFen, SEARCH_TIMES, DEFAULTS } from './core.js';
import { installNativeOverlay } from './native-overlay.js';
installNativeOverlay(chrome);
let creating;
async function ensureEngine() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  if (!creating) creating = chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['WORKERS'], justification: 'Run the bundled Stockfish WebAssembly worker for local chess hints.'
  }).finally(() => { creating = null; });
  await creating;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'background' || !['analyze','cancel'].includes(message.type)) return;
  if (!sender.tab || !supportedUrl(sender.url) || (message.type === 'analyze' && !validFen(message.fen)) ||
      typeof message.client !== 'string' || message.client.length > 80 || !Number.isSafeInteger(message.revision) || message.revision < 0) {
    respond({ error: 'Analysis requires a readable chess.com board.' }); return;
  }
  (async () => {
    await ensureEngine();
    return await chrome.runtime.sendMessage({ target: 'engine', type: message.type, tab: sender.tab.id,
      client:message.client, revision:message.revision, fen: message.fen,
      time: SEARCH_TIMES.includes(message.time) ? message.time : DEFAULTS.time });
  })().then(respond, error => respond({error: error.message}));
  return true;
});
