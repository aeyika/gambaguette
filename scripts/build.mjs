import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Crown, Settings2, Minus, Plus, Pause, Play, Sparkles, Palette, ScanFace, Clock3, RefreshCw, ArrowUpRight, Moon, EyeOff } from 'lucide-react';
const components = {crown:Crown,settings:Settings2,minus:Minus,plus:Plus,pause:Pause,play:Play,sparkles:Sparkles,palette:Palette,scan:ScanFace,clock:Clock3,refresh:RefreshCw,external:ArrowUpRight,moon:Moon,private:EyeOff};
// Render icons at build time to avoid shipping the React runtime.
const icons = Object.fromEntries(Object.entries(components).map(([name,Component]) => [name,renderToStaticMarkup(createElement(Component,{size:18,strokeWidth:1.7,'aria-hidden':true,focusable:false}))]));
const iconPlugin = {name:'lucide-react-icons',setup(builder) {
  builder.onResolve({filter:/^gambaguette:icons$/},() => ({path:'icons',namespace:'gambaguette'}));
  builder.onLoad({filter:/.*/,namespace:'gambaguette'},() => ({contents:`export const icons = ${JSON.stringify(icons)};`,loader:'js'}));
}};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out = path.join(root,'dist');
await mkdir(path.join(out,'engine'),{recursive:true});
for (const name of ['background','bridge','content','offscreen','popup']) {
  await build({entryPoints:[path.join(root,`src/${name}.js`)],outfile:path.join(out,`${name}.js`),bundle:true,format: name === 'popup' ? 'esm' : 'iife',target:'chrome116',legalComments:'eof',plugins:[iconPlugin],loader:{'.css':'text'}});
}
for (const name of ['manifest.json','offscreen.html','popup.html','popup.css','theme.css']) await copyFile(path.join(root,'src',name),path.join(out,name));
const popup = await readFile(path.join(out,'popup.html'),'utf8');
await writeFile(path.join(out,'popup.html'),popup.replace('<script src="popup.js">','<script type="module" src="popup.js">'));
for (const name of ['stockfish-19-lite-single.js','stockfish-19-lite-single.wasm']) await copyFile(path.join(root,'node_modules/stockfish/bin',name),path.join(out,'engine',name));
await copyFile(path.join(root,'node_modules/stockfish/Copying.txt'),path.join(out,'LICENSE.txt'));
await copyFile(path.join(root,'node_modules/chess.js/LICENSE'),path.join(out,'CHESS-JS-LICENSE.txt'));
await copyFile(path.join(root,'THIRD_PARTY.md'),path.join(out,'THIRD_PARTY.md'));
await copyFile(path.join(root,'node_modules/lucide-react/LICENSE'),path.join(out,'LUCIDE-LICENSE.txt'));
console.log('Built Gambaguette in dist/ — load this folder as an unpacked Chrome extension.');
