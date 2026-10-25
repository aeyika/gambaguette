import { spawn,spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildHelper,helperExe } from '../scripts/helper.mjs';
await buildHelper();
await mkdir('test-results',{recursive:true});
const child=spawn(helperExe,['--test-mode'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let buffered=Buffer.alloc(0), waiter, queued=[];
child.stdout.on('data',chunk => {
  buffered=Buffer.concat([buffered,chunk]);
  while (buffered.length >= 4 && buffered.length >= 4+buffered.readUInt32LE(0)) {
    const length=buffered.readUInt32LE(0), message=JSON.parse(buffered.subarray(4,4+length).toString('utf8'));
    buffered=buffered.subarray(4+length);
    if (waiter) {const next=waiter;waiter=null;next(message);} else queued.push(message);
  }
});
function receive() {return new Promise((resolve,reject) => {
  const timer=setTimeout(() => {waiter=null;reject(new Error('Windows helper response timed out'));},5000);
  const finish=value => {clearTimeout(timer);resolve(value);};
  if (queued.length) finish(queued.shift());else waiter=finish;
});}
function send(value) {
  const bytes=Buffer.from(JSON.stringify(value)), length=Buffer.alloc(4);length.writeUInt32LE(bytes.length);
  child.stdin.write(Buffer.concat([length,bytes]));
}
try {
  const hello=await receive();assert.equal(hello.ready,true,JSON.stringify(hello));assert.equal(hello.captureProtected,true);
  send({type:'frame',visible:true,darkMode:true,color:'#65b9ff',from:'e2',to:'e4',move:'e4',status:'Depth 16',viewport:{width:680,height:480,dpr:1},board:{left:24,top:24,width:400,height:400}});
  const shown=await receive();assert.equal(shown.visible,true);assert.equal(shown.affinity,0x11);assert.equal(shown.width,680);
  if (process.argv.includes('--capture-check')) {
    send({type:'test-unprotect'});await receive();
    const heartbeat=setInterval(() => send({type:'frame',visible:true,darkMode:true,color:'#65b9ff',from:'e2',to:'e4',move:'e4',status:'Capture exclusion test',viewport:{width:680,height:480,dpr:1},board:{left:24,top:24,width:400,height:400}}),300);
    console.log('Unprotected baseline window active. Send any input to enable capture exclusion.');
    await new Promise(resolve => {const timer=setTimeout(resolve,30000);process.stdin.once('data',() => {clearTimeout(timer);resolve();});});
    send({type:'test-protect'});
    console.log('Capture exclusion enabled on the same window for 30 seconds.');
    await new Promise(resolve => setTimeout(resolve,30000));clearInterval(heartbeat);process.stdin.pause();
  }
  send({type:'hide'});
  let hidden=await receive();while (hidden.visible) hidden=await receive();
  assert.equal(hidden.visible,false);
  console.log('PASS real Windows helper: native messaging, drawing, hide, and OS-verified WDA_EXCLUDEFROMCAPTURE (0x11)');
} finally {child.stdin.end();setTimeout(() => {if (child.exitCode === null) child.kill();},1500).unref();}
const preview=spawnSync(helperExe,['--preview',path.resolve('test-results/native-overlay.png')],{windowsHide:true});
assert.equal(preview.status,0);
console.log('Native overlay preview: test-results/native-overlay.png');
