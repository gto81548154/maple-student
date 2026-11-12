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

// {id, sec}만 있는 "음원 위치" 기록인지.
export const isPosition = p => !!p && typeof p.id === 'string' && 'sec' in p && Object.keys(p).length === 2;

export function opKind(payload) {
  if (!payload) return '';
  if ('submitAnswers' in payload) return 'submitAnswers';
  if ('answerDraft' in payload) return 'answerDraft';
  if ('p5' in payload) return 'p5';
  if ('score' in payload) return 'score';
  if ('done' in payload) return 'done';
  if ('sec' in payload) return 'sec';
  if ('open' in payload) return 'open';
  return 'etc';
}

export function createToeicSync({ storage, locks, key, url, fetcher = fetch, uuid = () => crypto.randomUUID(), timeoutMs = 12000 }) {
  const listeners = new Set();
  let loaded = false, saving = false, error = '', canSync = false, blocked = false;
  let flushing = null, loading = null, fallback = null, answerSheetVersion = 0;
  // [162] 서버가 거절한(4xx/5xx) 맨 앞 기록. 다시 보내도 같은 답이 올 수 있어 "버리기"를 열어 준다.
  let stuck = null;
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
      const head = state.ops[0];
      const stuckInfo = stuck && head && head.seq === stuck.seq ? { ...stuck, id: head.payload.id || '', kind: opKind(head.payload) } : null;
      return { ...projectToeic(state.base, state.ops, state.clientId), loaded, saving, err: error, pending: state.ops.length, stuck: stuckInfo };
    } catch (e) {
      return { tests: {}, p5: {}, loaded: true, saving: false, err: e.message, pending: 0, stuck: null };
    }
  };
  const emit = () => { const value = snapshot(); for (const listener of listeners) listener(value); };
  const fail = (e, op) => {
    blocked = true;
    error = e instanceof TypeError || e.name === 'AbortError' ? '인터넷 연결을 확인한 뒤 다시 저장을 눌러 주세요.' : e.message || '저장하지 못했어요. 다시 시도해 주세요.';
    stuck = op && e.status >= 400 ? { seq: op.seq, status: e.status, reason: e.reason || '' } : null;
    emit();
  };
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
        if (!response.ok) {
          // [162] 서버가 보낸 거절 이유를 그대로 보여 준다(전에는 "서버에 저장하지 못했어요"로 뭉개졌음).
          let reason = '';
          try { reason = String((await response.json())?.error || '').trim().slice(0, 200); } catch {}
          const e = new Error(reason ? `서버가 거절했어요: ${reason}` : `서버에 저장하지 못했어요(${response.status}). 잠시 후 다시 시도해 주세요.`);
          e.status = response.status;
          e.reason = reason;
          throw e;
        }
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
  // [162] 대기 기록 번호를 start부터 1씩 다시 매긴다(내용은 그대로).
  const renumber = (state, start) => {
    const ops = state.ops.map((op, i) => ({ ...op, seq: start + i }));
    return { ...state, ops, nextSeq: start + ops.length };
  };
  // force: 서버가 번호를 거절한 직후 새로 읽은 기록 — 서버 판이 더 옛날(복원)이어도 그대로 믿고 대기 번호를 이어 붙인다.
  const acceptBase = (state, base, force = false) => {
    if (force || (Number(base._syncRev) || 0) >= (Number(state.base._syncRev) || 0)) state.base = base;
    const confirmed = Number(state.base._syncClients?.[state.clientId]?.seq) || 0;
    state.ops = state.ops.filter(op => op.seq > confirmed);
    if (force && state.ops.length && state.ops[0].seq !== confirmed + 1) Object.assign(state, renumber(state, confirmed + 1));
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
        let current = null, resyncedSeq = 0;
        try {
          // Finite drain; further user actions can start another drain.
          for (let n = 0; n < TOEIC_QUEUE_LIMIT; n++) {
            const state = await locked(() => read());
            const op = current = state.ops[0];
            if (!op) { error = ''; stuck = null; return true; }
            if (('answerDraft' in op.payload || 'submitAnswers' in op.payload) && answerSheetVersion !== 1) {
              throw new Error('답안 저장·채점 서버 업데이트가 필요해요. 입력은 이 기기에 보관했어요.');
            }
            let data;
            try {
              data = await request('POST', { ...op.payload, syncVersion: ('answerDraft' in op.payload || 'submitAnswers' in op.payload) ? 2 : TOEIC_SYNC_VERSION, clientId: state.clientId, seq: op.seq });
            } catch (e) {
              // [162] 409는 "번호가 안 이어진다"일 수 있다(서버 기록을 백업에서 되돌린 뒤 등).
              // 보내기 잠금을 쥔 채 서버 영수증을 새로 읽어, 번호만 어긋난 것이면 이어 붙이고 한 번 더 보낸다.
              if (e.status !== 409 || resyncedSeq === op.seq) throw e;
              const fresh = await request('GET');
              const serverSeq = Number(fresh.toeic._syncClients?.[state.clientId]?.seq) || 0;
              if (serverSeq + 1 >= op.seq) throw e;           // 번호가 이어지는데(또는 이미 쓴 번호인데) 거절 → 진짜 충돌(내용 다름·겹침). 번호가 비어 있을 때만 이어 붙인다.
              await locked(() => { const latest = read(); acceptBase(latest, fresh.toeic, true); write(latest); });
              resyncedSeq = serverSeq + 1;
              emit();
              continue;
            }
            if (data.ack?.clientId !== state.clientId || data.ack?.seq !== op.seq || (Number(data.toeic._syncClients?.[state.clientId]?.seq) || 0) < op.seq) {
              throw new Error('저장 확인이 맞지 않아요. 대기 기록을 유지했어요.');
            }
            await locked(() => { const latest = read(); acceptBase(latest, data.toeic); write(latest); });
            stuck = null; emit();
          }
          return true;
        } catch (e) { e.op = current; throw e; } finally { saving = false; emit(); }
      });
    })().catch(e => { fail(e, e.op); return false; }).finally(() => { flushing = null; });
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
        // [162] 음원 위치(15초마다)는 같은 회차의 바로 앞 위치 기록을 덮어쓴다. 보내는 중일 수 있는 맨 앞 기록은 건드리지 않는다.
        const last = state.ops[state.ops.length - 1];
        // [177차수] 맨 앞 기록에는 절대 합치지 않는다. 전에는 "이 창이 보내는 중이 아니면" 합쳤는데, 다른 창(탭)이 그 기록을 보내는 중일 수 있어
        //   새 위치가 덮어써진 채 사라졌다(듣던 곳이 뒤로 돌아감). 대신 대기 기록이 한 개 더 생길 수 있다.
        const coalesce = isPosition(payload) && last && isPosition(last.payload) && last.payload.id === payload.id && state.ops.length > 1;
        if (coalesce) { write({ ...state, ops: [...state.ops.slice(0, -1), { seq: last.seq, payload }] }); return; }
        if (state.ops.length >= TOEIC_QUEUE_LIMIT) throw new Error('저장 대기 기록이 많아요. 먼저 다시 저장을 눌러 주세요. 이번 입력은 저장하지 못했어요.');
        // Persist before showing the optimistic result. Credentials never enter the outbox.
        const next = { ...state, ops: [...state.ops, { seq: state.nextSeq, payload }], nextSeq: state.nextSeq + 1 };
        write(next);
      });
      emit(); void flush(); return true;
    } catch (e) { fail(new Error(e.name === 'QuotaExceededError' ? '기기 저장 공간이 부족해 이번 입력을 보관하지 못했어요.' : e.message)); return false; }
  };
  const retry = async () => { if (flushing) return flushing; if (!await load()) return false; return flush(); };
  // [162] 서버가 거절한 맨 앞 기록만 버린다(번호가 맞을 때만). 버린 기록의 내용을 돌려줘 호출한 쪽이 답을 기기에 남길 수 있게 한다.
  const discardHead = async () => {
    if (flushing) await flushing.catch(() => {});
    // [177차수] 버리기 전에 서버 기록을 한 번 다시 본다. 서버가 실은 저장해 놓고 오류로 답한 경우(중간에서 끊김 등)에는
    //   그 번호가 이미 쓰였으므로, 뒤 기록을 그 번호로 다시 매기면 뒤 기록이 "이미 받은 것"으로 처리돼 조용히 사라졌다.
    //   다시 봐서 맨 앞 기록이 이미 저장돼 있으면 버릴 것이 없다(대기에서만 빠진다). 서버를 못 보면 예전처럼 진행한다.
    const stuckSeq = stuck ? stuck.seq : null;
    try {
      const data = await request('GET');
      await locked(() => { const state = read(); acceptBase(state, data.toeic); write(state); });
    } catch { /* 서버를 못 봤다 — 아래에서 예전 방식대로 */ }
    let removed = null, alreadySaved = false;
    try {
      await locked(() => {
        const state = read();
        const head = state.ops[0];
        if (stuckSeq != null && (!head || head.seq > stuckSeq)) { alreadySaved = true; return; }   // 서버에 이미 들어가 있었다
        if (!head || !stuck || head.seq !== stuck.seq) return;
        // 같은 회차의 답을 담은 더 나중 기록이 대기에 남아 있는지 — 있으면 버린 답을 화면에 되살리면 안 된다(더 새 답을 가린다).
        const superseded = state.ops.slice(1).some(op => op.payload && op.payload.id === head.payload.id && (op.payload.submitAnswers || op.payload.answerDraft));
        removed = { ...head.payload, _superseded: superseded };
        // 서버는 기기별 번호가 1씩 이어져야 받는다. 거절된 기록은 서버에 영수증이 없으므로 뒤 기록을 그 번호부터 다시 매긴다.
        write(renumber({ ...state, ops: state.ops.slice(1) }, head.seq));
      });
    } catch (e) { fail(e); return null; }
    if (alreadySaved) { stuck = null; blocked = false; error = ''; emit(); if (canSync) void flush(); return null; }
    if (!removed) return null;
    stuck = null; blocked = false; error = '';
    emit();
    if (canSync) void flush();
    return removed;
  };
  return { snapshot, subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    load, flush, retry, enqueue, discardHead, refresh: emit };
}
