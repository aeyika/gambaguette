import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';

function fakeWorker({onGo,onStop} = {}) {
  return {
    postMessage(command) {
      if (command === 'uci') setTimeout(() => this.onmessage({data:'uciok'}),1);
      else if (command === 'isready') setTimeout(() => this.onmessage({data:'readyok'}),1);
      else if (command.startsWith('go ')) {
        if (onGo) onGo(this,command);
        else setTimeout(() => this.onmessage({data:'bestmove e2e4'}),1);
      } else if (command === 'stop') onStop?.(this);
    }, terminate() { this.terminated = true; }
  };
}

test('engine serializes searches and replaces pending requests from the same tab', async () => {
  const positions = [];
  let active = 0, maxActive = 0;
  const engine = new Engine(() => ({
    postMessage(command) {
      if (command === 'uci') setTimeout(() => this.onmessage({data:'uciok'}),1);
      if (command === 'isready') setTimeout(() => this.onmessage({data:'readyok'}),1);
      if (command.startsWith('position fen ')) positions.push(command.slice(13));
      if (command.startsWith('go ')) {
        active++; maxActive = Math.max(maxActive,active);
        setTimeout(() => { active--; this.onmessage({data:'info depth 8 score cp 22\nbestmove e2e4'}); },15);
      }
    }, terminate() {}
  }));
  const first = engine.analyze({tab:1,fen:'first',time:300});
  const superseded = engine.analyze({tab:2,fen:'old',time:300});
  const last = engine.analyze({tab:2,fen:'new',time:300});
  const results = await Promise.all([first,superseded,last]);
  assert.deepEqual(positions,['first','new']);
  assert.equal(maxActive,1);
  assert.equal(results[1].error,'Search superseded.');
  assert.equal(results[2].fen,'new');
  assert.deepEqual(results[2].score,{type:'cp',value:22});
});

test('worker failures resolve an error and allow a fresh engine for the next request', async () => {
  let created = 0;
  const engine = new Engine(() => {
    const broken = ++created === 1;
    return {
      postMessage(command) {
        setTimeout(() => {
          if (broken) this.onerror();
          else if (command === 'uci') this.onmessage({data:'uciok'});
          else if (command === 'isready') this.onmessage({data:'readyok'});
          else if (command.startsWith('go ')) this.onmessage({data:'bestmove e2e4'});
        },1);
      }, terminate() {}
    };
  });
  assert.match((await engine.analyze({tab:1,fen:'x',time:300})).error,/failed to load/);
  assert.equal((await engine.analyze({tab:1,fen:'x',time:300})).move,'e2e4');
  assert.equal(created,2);
});

test('a newer search stops its active predecessor and drains its result before starting', async () => {
  let started, searches = 0, stopped = 0, active = false;
  const searching = new Promise(resolve => {started=resolve;});
  const engine = new Engine(() => fakeWorker({
    onGo(worker) {
      assert.equal(active,false,'UCI searches must not overlap'); active=true;
      if (++searches === 1) started();
      else setTimeout(() => {active=false;worker.onmessage({data:'bestmove e2e4'});},1);
    },
    onStop(worker) {stopped++;setTimeout(() => {active=false;worker.onmessage({data:'bestmove a2a3'});},5);}
  }));
  const old = engine.analyze({tab:1,client:'page',revision:1,fen:'old',time:3000});
  await searching;
  const fresh = engine.analyze({tab:1,client:'page',revision:2,fen:'fresh',time:100});
  assert.equal((await old).error,'Search superseded.');
  assert.equal((await fresh).move,'e2e4','the old bestmove must never become the new result');
  assert.equal(stopped,1); assert.equal(searches,2);
});

test('cancel arriving before analyze rejects delayed work and allows newer revisions', async () => {
  const engine = new Engine(() => fakeWorker());
  engine.cancel({tab:1,client:'page',revision:3});
  assert.equal((await engine.analyze({tab:1,client:'page',revision:2,fen:'stale',time:3000})).error,'Search superseded.');
  assert.equal((await engine.analyze({tab:1,client:'page',revision:4,fen:'fresh',time:100})).fen,'fresh');
});

test('late older requests cannot supersede an already accepted newer revision', async () => {
  const engine = new Engine(() => fakeWorker());
  const fresh = engine.analyze({tab:1,client:'page',revision:4,fen:'fresh',time:100});
  const stale = engine.analyze({tab:1,client:'page',revision:2,fen:'stale',time:3000});
  assert.equal((await stale).error,'Search superseded.');
  assert.equal((await fresh).fen,'fresh');
});

test('cancellation leaves a different tab queued for analysis', async () => {
  let started;
  const searching = new Promise(resolve => {started=resolve;});
  let searches=0;
  const engine = new Engine(() => fakeWorker({
    onGo(worker) {
      if (++searches === 1) started();
      else setTimeout(() => worker.onmessage({data:'bestmove e2e4'}),1);
    },
    onStop(worker) {setTimeout(() => worker.onmessage({data:'bestmove a2a3'}),1);}
  }));
  const old = engine.analyze({tab:1,client:'first',revision:1,fen:'old',time:3000});
  await searching;
  const other = engine.analyze({tab:2,client:'second',revision:1,fen:'other',time:100});
  engine.cancel({tab:1,client:'first',revision:1});
  assert.equal((await old).error,'Search superseded.');
  assert.equal((await other).fen,'other');
});

test('an unresponsive stop replaces the worker and ignores its late output', async () => {
  let started, first, created=0;
  const searching = new Promise(resolve => {started=resolve;});
  const engine = new Engine(() => {
    const index = ++created;
    const worker = fakeWorker({onGo(current) {
      if (index === 1) started();
      else {
        first.onmessage({data:'bestmove a2a3'});
        setTimeout(() => current.onmessage({data:'bestmove e2e4'}),1);
      }
    }});
    if (index === 1) first = worker;
    return worker;
  });
  const old = engine.analyze({tab:1,client:'page',revision:1,fen:'old',time:3000});
  await searching;
  engine.cancel({tab:1,client:'page',revision:1});
  const fresh = engine.analyze({tab:1,client:'page',revision:2,fen:'fresh',time:100});
  assert.equal((await old).error,'Search superseded.');
  assert.equal((await fresh).move,'e2e4');
  assert.equal(first.terminated,true); assert.equal(created,2);
});
