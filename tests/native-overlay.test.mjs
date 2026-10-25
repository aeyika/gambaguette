import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFrame } from '../src/native-overlay.js';
const frame={visible:true,viewport:{width:1200,height:800,dpr:1.5},board:{left:40,top:100,width:480,height:480},from:'e2',to:'e4',color:'#65b9ff',move:'e4',darkMode:true};
test('native frames preserve board geometry and validated appearance',() => {
  const result=sanitizeFrame(frame);
  assert.equal(result.type,'frame');assert.equal(result.viewport.dpr,1.5);assert.equal(result.from,'e2');assert.equal(result.darkMode,true);
});
test('invalid native geometry is rejected and strings are bounded',() => {
  assert.equal(sanitizeFrame({...frame,viewport:{...frame.viewport,dpr:Infinity}}),null);
  assert.equal(sanitizeFrame({...frame,board:{...frame.board,width:-10}}),null);
  const result=sanitizeFrame({...frame,from:'x9',color:'url(evil)',status:'x'.repeat(2000)});
  assert.equal(result.from,null);assert.equal(result.color,'#ffbe55');assert.equal(result.status.length,160);
});
