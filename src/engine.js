export class Engine {
  constructor(workerFactory) {
    this.workerFactory = workerFactory;
    this.queue = [];
    this.running = false;
    this.revisions = new Map();
  }
  key(request) { return `${request.tab}:${request.client ?? ''}`; }
  rememberRevision(key,revision) {
    this.revisions.set(key,Math.max(this.revisions.get(key) ?? -1,revision));
    if (this.revisions.size > 256) this.revisions.delete(this.revisions.keys().next().value);
  }
  cancel(request) {
    const key = this.key(request), revision = request.revision ?? Infinity;
    this.rememberRevision(key,revision);
    this.queue = this.queue.filter(job => {
      if (this.key(job) !== key || (job.revision ?? 0) > revision) return true;
      this.cancelJob(job); return false;
    });
    if (this.active && this.key(this.active) === key && (this.active.revision ?? 0) <= revision) this.cancelJob(this.active);
  }
  cancelJob(job) {
    if (job.cancelled) return;
    job.cancelled = true;
    job.resolve({error:'Search superseded.'});
    if (job !== this.active || this.phase !== 'search') return;
    // Keep consuming the old search through bestmove before sending another go.
    this.worker.postMessage('stop');
    job.cancelTimer = setTimeout(() => {
      if (this.active !== job) return;
      const fail = this.onFailure;
      this.worker?.terminate(); this.worker = null;
      fail?.(new Error('Search superseded.'));
    },150);
  }
  analyze(request) {
    return new Promise(resolve => {
      if ((request.revision ?? 0) <= (this.revisions.get(this.key(request)) ?? -1)) {
        resolve({error:'Search superseded.'}); return;
      }
      if (request.revision !== undefined) this.rememberRevision(this.key(request),request.revision);
      this.queue = this.queue.filter(item => {
        if (item.tab !== request.tab) return true;
        this.cancelJob(item); return false;
      });
      if (this.active?.tab === request.tab) this.cancelJob(this.active);
      this.queue.push({...request, resolve});
      this.drain();
    });
  }
  async initialize() {
    if (this.worker) return;
    const worker = this.workerFactory(); this.worker = worker;
    worker.onmessage = event => {
      if (this.worker !== worker) return;
      for (const line of String(event.data).split('\n')) {
        this.onLine?.(line);
      }
    };
    worker.onerror = () => { if (this.worker === worker) this.onFailure?.(new Error('Stockfish failed to load. Reload the extension and page.')); };
    await this.waitFor('uci', line => line === 'uciok', 15000);
    this.worker.postMessage('setoption name Hash value 32');
    await this.waitFor('isready', line => line === 'readyok', 10000);
  }
  waitFor(command, predicate, timeout, observe = () => {}) {
    return new Promise((resolve,reject) => {
      const finish = (error, value) => {
        clearTimeout(timer); this.onLine = null; this.onFailure = null;
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Stockfish timed out. Try the hint again.')), timeout);
      this.onFailure = error => finish(error);
      this.onLine = line => { observe(line); if (predicate(line)) finish(null,line); };
      this.worker.postMessage(command);
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        this.active = job; this.phase = 'initializing';
        try {
          await this.initialize();
          if (job.cancelled) continue;
          this.worker.postMessage('ucinewgame');
          await this.waitFor('isready', line => line === 'readyok', 5000);
          if (job.cancelled) continue;
          this.worker.postMessage(`position fen ${job.fen}`);
          let depth = 0, score = null;
          this.phase = 'search';
          const line = await this.waitFor(`go movetime ${job.time}`, s => s.startsWith('bestmove '), job.time + 10000, s => {
            const d = s.match(/\bdepth (\d+)/); if (d) depth = Number(d[1]);
            const v = s.match(/\bscore (cp|mate) (-?\d+)/); if (v) score = {type:v[1], value:Number(v[2])};
          });
          if (!job.cancelled) job.resolve({fen:job.fen, move:line.split(' ')[1], depth, score});
        } catch (error) {
          this.worker?.terminate(); this.worker = null;
          if (!job.cancelled) job.resolve({error:error.message});
        } finally {
          clearTimeout(job.cancelTimer); this.active = null; this.phase = null;
        }
      }
    } finally { this.running = false; }
  }
}
