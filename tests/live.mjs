import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
const output = path.resolve('test-results'); await mkdir(output,{recursive:true});
const extension = path.resolve('dist');
const context = await chromium.launchPersistentContext('', {
  channel:'chromium',headless:true,viewport:{width:1440,height:1000},
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
});
let page;
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.storage.local.set({settings:{enabled:true,automatic:true,side:'both',time:100}}));
  page = await context.newPage();
  await page.goto('https://www.chess.com/play/computer',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#gambaguette-arrow').waitFor({state:'visible',timeout:45000});
  const fen = await page.locator('wc-chess-board').evaluate(board => board.game.getFEN());
  const san = await page.locator('#gambaguette #move').innerText();
  assert.ok(new Chess(fen).moves().includes(san));
  // The first-time modal sits above the cookie banner.
  const start = page.getByRole('button',{name:'Start',exact:true});
  if (await start.isVisible().catch(() => false)) await start.click({timeout:5000});
  for (const name of ['Reject All','I Accept']) {
    const button = page.getByRole('button',{name,exact:true});
    if (await button.isVisible().catch(() => false)) { await button.click({timeout:5000}); await button.waitFor({state:'hidden',timeout:5000}); break; }
  }
  await page.waitForFunction(() => document.querySelector('#gambaguette')?.shadowRoot.querySelector('#side').value === 'w');
  assert.equal(await page.locator('#gambaguette #auto-side').isChecked(),true);
  await page.locator('#gambaguette #settings-toggle').click();
  await page.screenshot({path:path.join(output,'live-chess-com.png')});
  console.log(JSON.stringify({result:'PASS live chess.com: full FEN, local Stockfish, improved arrow, automatic White detection',fen,san,screenshot:'test-results/live-chess-com.png'}));
} catch (error) {
  if (page) {
    console.log(JSON.stringify(await page.evaluate(() => ({
      title:document.title, status:document.querySelector('#gambaguette')?.shadowRoot?.querySelector('#status')?.textContent,
      fen:document.querySelector('wc-chess-board')?.game?.getFEN?.(),
      pieces:[...document.querySelectorAll('wc-chess-board .piece')].map(p=>p.className),
      text:document.body.innerText.slice(-1000)
    })),null,2));
    await page.screenshot({path:path.join(output,'live-failure.png')});
  }
  throw error;
} finally { await context.close(); }
