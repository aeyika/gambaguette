import { spawnSync } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const hostName='com.gambaguette.overlay';
export const helperExe=path.join(root,'helper/bin/GambaguetteOverlay.exe');
const hostManifest=path.join(root,'helper/bin/host.json');
const keys=['Google\\Chrome','BraveSoftware\\Brave-Browser','Microsoft\\Edge','Chromium'].map(browser=>`HKCU\\Software\\${browser}\\NativeMessagingHosts\\${hostName}`);
function run(command,args) {
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true});
  if (result.status !== 0) throw new Error(result.error?.message || result.stdout || result.stderr || `${command} failed`);
}
export async function buildHelper() {
  if (process.platform !== 'win32') throw new Error('The overlay helper requires Windows.');
  await mkdir(path.dirname(helperExe),{recursive:true});
  const framework=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319');
  run(path.join(framework,'csc.exe'),['/nologo','/target:winexe','/optimize+','/codepage:65001',`/out:${helperExe}`,`/win32manifest:${path.join(root,'helper/app.manifest')}`,
    '/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',path.join(root,'helper/OverlayHost.cs')]);
  return helperExe;
}
export async function installHelper(extensionId) {
  if (!/^[a-p]{32}$/.test(extensionId || '')) throw new Error('Usage: npm run helper:install -- YOUR_EXTENSION_ID');
  await buildHelper();
  let previous=[];
  try {previous=JSON.parse(await readFile(hostManifest,'utf8')).allowed_origins ?? [];} catch {}
  const allowed=[...new Set([...previous,`chrome-extension://${extensionId}/`])];
  await writeFile(hostManifest,JSON.stringify({name:hostName,description:'Gambaguette private overlay',path:helperExe,type:'stdio',allowed_origins:allowed},null,2));
  for (const key of keys) run('reg.exe',['add',key,'/ve','/t','REG_SZ','/d',hostManifest,'/f']);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'install') {await installHelper(process.argv[3]);console.log('Windows helper installed. Enable Private overlay in the extension settings.');}
    else if (process.argv[2] === 'remove') {for (const key of keys) spawnSync('reg.exe',['delete',key,'/f'],{windowsHide:true,stdio:'ignore'});console.log('Windows helper unregistered.');}
    else {await buildHelper();console.log('Built helper/bin/GambaguetteOverlay.exe');}
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
