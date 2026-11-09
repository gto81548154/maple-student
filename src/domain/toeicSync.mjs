// Durable, ordered outbox. Locks coordinate tabs; the server deduplicates client/sequence pairs.
export const TOEIC_SYNC_VERSION = 1;
export const TOEIC_QUEUE_LIMIT = 500;
const emptyBase = () => ({ tests: {}, p5: {}, _syncClients: {}, _syncRev: 0 });

export function projectToeic(base, ops, clientId) {
  const tests = { ...base.tests }, p5 = { ...base.p5 };
  const confirmed = Number(base._syncClients?.[clientId]?.seq) || 0;
  for (const op of ops) {
    if (op.seq <= confirmed) continue; // A lost response must not count an accepted answer twice.
    const body = op.payload;
    if (body.id) {
      const cur = { ...tests[body.id] };
      if ('done' in body) { if (body.done) cur.done = true; else { delete cur.done; delete cur.doneAt; } }
      if ('score' in body) { delete cur.grade; if (body.score === null) delete cur.score; else cur.score = body.score; }
      if ('sec' in body) cur.sec = body.sec;
      if ('answerDraft' in body) cur.answerDraft = body.answerDraft;
      if ('submitAnswers' in body) { cur.answerDraft = body.submitAnswers; cur.gradePending = true; }
      tests[body.id] = cur;
    }
    for (const item of body.p5 || []) {
      const cur = { ...p5[item.id] };
      cur.r = (Number(cur.r) || 0) + (item.ok ? 1 : 0);
      cur.w = (Number(cur.w) || 0) + (item.ok ? 0 : 1);
      cur.last = item.ok ? 'O' : 'X';
      p5[item.id] = cur;
    }
  }
  return { tests, p5 };
}

export function createToeicSync({ storage, locks, key, url, fetcher = fetch, uuid = () => crypto.randomUUID(), timeoutMs = 12000 }) {
  const listeners = new Set();
  let loaded = false, saving = false, error = '', canSync = false, blocked = false;
  let flushing = null, loading = null, fallback = null, answerSheetVersion = 0;
  const queueLock = key + ':edit', sendLock = key + ':send';
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) return fallback || (fallback = { clientId: uuid(), nextSeq: 1, ops: [], base: emptyBase() });
    const state = JSON.parse(raw);
    if (!state || typeof state.clientId !== 'string' || !Number.isSafeInteger(state.nextSeq) || state.nextSeq < 1 || !Array.isArray(state.ops) || !state.base || !state.base.tests || !state.base.p5 || state.ops.some(op => !Number.isSafeInteger(op.seq) || !op.payload)) {
      throw new Error('저장 대기 기록을 읽을 수 없어요. 브라우저 데이터를 지우지 말고 확인해 주세요.');
    }
    return state;
  };
  const write = state => { storage.setItem(key, JSON.stringify(state)); fallback = state; };
  const locked = fn => {
    if (!locks?.request) return Promise.reject(new Error('이 브라우저에서는 안전하게 저장할 수 없어요. 최신 Chrome 또는 Safari로 열어 주세요.'));
    return locks.request(queueLock, fn);
  };
  const snapshot = () => {
    try {
      const state = read();
      return { ...projectToeic(state.base, state.ops, state.clientId), loaded, saving, err: error, pending: state.ops.length };
    } catch (e) {
      return { tests: {}, p5: {}, loaded: true, saving: false, err: e.message, pending: 0 };
    }
  };
  const emit = () => { const value = snapshot(); for (const listener of listeners) listener(value); };
  const fail = e => { blocked = true; error = e instanceof TypeError || e.name === 'AbortError' ? '인터넷 연결을 확인한 뒤 다시 저장을 눌러 주세요.' : e.message || '저장하지 못했어요. 다시 시도해 주세요.'; emit(); };
  const request = async (method, body) => {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('응답이 늦어 저장 여부를 확인하지 못했어요. 다시 시도해 주세요.')); }, timeoutMs);
    });
    try {
      return await Promise.race([(async () => {
        const response = await fetcher(url(), { method, cache: 'no-store', signal: controller.signal,
          ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
        if (response.status === 401 || response.status === 403) throw new Error('원장 링크를 다시 열어 주세요. 저장 대기 기록은 이 기기에 남아 있어요.');
        if (!response.ok) throw new Error('서버에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        let data;
        try { data = await response.json(); } catch { throw new Error('서버 응답을 확인하지 못했어요. 다시 시도해 주세요.'); }
        if (!data?.success) throw new Error('서버가 저장을 완료하지 못했어요. 다시 시도해 주세요.');
        if (data.syncVersion !== TOEIC_SYNC_VERSION) throw new Error('저장 기능 업데이트가 필요해요. 저장 대기 기록은 이 기기에 남아 있어요.');
        if (!data.toeic?.tests || !data.toeic?.p5) throw new Error('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.');
        answerSheetVersion = data.answerSheetVersion || 0;
        return data;
      })(), timeout]);
    } finally { clearTimeout(timer); }
  };
  const acceptBase = (state, base) => {
    if ((Number(base._syncRev) || 0) >= (Number(state.base._syncRev) || 0)) state.base = base;
    const confirmed = Number(state.base._syncClients?.[state.clientId]?.seq) || 0;
    state.ops = state.ops.filter(op => op.seq > confirmed);
    state.nextSeq = Math.max(state.nextSeq, confirmed + 1);
  };
  const flush = () => {
    if (flushing) return flushing;
    if (!canSync || blocked) return Promise.resolve(false);
    flushing = (async () => {
      if (!locks?.request) throw new Error('최신 브라우저에서 다시 열어 주세요.');
      return await locks.request(sendLock, { ifAvailable: true }, async lock => {
        if (!lock) return false;
        saving = true; emit();
        try {
          // Finite drain; further user actions can start another drain.
          for (let n = 0; n < TOEIC_QUEUE_LIMIT; n++) {
            const state = await locked(() => read());
            const op = state.ops[0];
            if (!op) { error = ''; return true; }
            if (('answerDraft' in op.payload || 'submitAnswers' in op.payload) && answerSheetVersion !== 1) {
              throw new Error('답안 저장·채점 서버 업데이트가 필요해요. 입력은 이 기기에 보관했어요.');
            }
            const data = await request('POST', { ...op.payload, syncVersion: ('answerDraft' in op.payload || 'submitAnswers' in op.payload) ? 2 : TOEIC_SYNC_VERSION, clientId: state.clientId, seq: op.seq });
            if (data.ack?.clientId !== state.clientId || data.ack?.seq !== op.seq || (Number(data.toeic._syncClients?.[state.clientId]?.seq) || 0) < op.seq) {
              throw new Error('저장 확인이 맞지 않아요. 대기 기록을 유지했어요.');
            }
            await locked(() => { const latest = read(); acceptBase(latest, data.toeic); write(latest); });
            emit();
          }
          return true;
        } finally { saving = false; emit(); }
      });
    })().catch(e => { fail(e); return false; }).finally(() => { flushing = null; });
    return flushing;
  };
  const load = () => {
    if (loading) return loading;
    loading = (async () => {
      const data = await request('GET');
      await locked(() => { const state = read(); acceptBase(state, data.toeic); write(state); });
      canSync = true; blocked = false; error = '';
      return true;
    })().catch(e => { canSync = false; fail(e); return false; }).finally(() => { loaded = true; loading = null; emit(); });
    return loading;
  };
  const enqueue = async payload => {
    try {
      await locked(() => {
        const state = read();
        if (state.ops.length >= TOEIC_QUEUE_LIMIT) throw new Error('저장 대기 기록이 많아요. 먼저 다시 저장을 눌러 주세요. 이번 입력은 저장하지 못했어요.');
        // Persist before showing the optimistic result. Credentials never enter the outbox.
        const next = { ...state, ops: [...state.ops, { seq: state.nextSeq, payload }], nextSeq: state.nextSeq + 1 };
        write(next);
      });
      emit(); void flush(); return true;
    } catch (e) { fail(new Error(e.name === 'QuotaExceededError' ? '기기 저장 공간이 부족해 이번 입력을 보관하지 못했어요.' : e.message)); return false; }
  };
  const retry = async () => { if (flushing) return flushing; if (!await load()) return false; return flush(); };
  return { snapshot, subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    load, flush, retry, enqueue, refresh: emit };
}
