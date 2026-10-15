import { SEARCH_REGULAR_BOOKS, buildSearchRows, goodSearchRows, makeSearchSource, pickNaesinSource, pickUploadedNaesin } from "../domain/wordSearch.jsx";

// ─── [125차수 10-12] 단어 검색 재료 받아 오기 ───
// 마플싱커의 공개 주소(마플보카가 이미 쓰는 것)만 쓴다 — 워커는 고치지 않는다.
//   GET /voca/books-meta            책마다 지문(v)·준비된 책 목록
//   GET /voca/books/ns_units.json   학교표(어느 학교가 어느 교과서 단어책을 쓰는지)
//   GET /voca/books/{책id}.json     단어책
//   GET /voca/ns-index?sc=학교코드  [129차수] 선생님이 올린 내신 묶음 목록(워커 10-12판부터 있다. 옛 워커는 404 → "올린 것 없음"으로 본다)
// 검색 칸을 처음 누를 때 한 번 받는다(앱을 켤 때는 아무것도 안 받는다).
// 받은 책은 가벼운 줄([낱말, 뜻, 단원])로 줄여 폰(IndexedDB)에 넣어 두고, 지문(v)이 같으면 다음부터는 다시 안 받는다.

const DB_NAME = "maple_wordsearch";
const STORE = "books";
const idbOpen = () => new Promise((resolve) => {
  setTimeout(() => resolve(null), 2500);   // 폰 저장소가 대답을 안 하면(일부 아이폰) 기다리지 않고 저장 없이 간다
  try {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch (e) {} };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  } catch (e) { resolve(null); }
});
const idbGet = (db, key) => new Promise((resolve) => {
  if (!db) { resolve(null); return; }
  try {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  } catch (e) { resolve(null); }
});
const idbPut = (db, key, value) => { if (!db) return; try { db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key); } catch (e) {} };

// httpFail = 서버가 "없음·거절"(404 등)로 답했을 때 돌려줄 값. 인터넷이 끊겨 답을 못 받은 것(null)과 구분할 때 쓴다.
async function fetchJson(url, timeoutMs, fresh = false, httpFail = null) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, fresh ? { signal: ac.signal, cache: "no-store" } : { signal: ac.signal });
    if (!r.ok) return httpFail;
    return await r.json();
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}

// 지금 상태(화면이 구독해서 본다). status: idle(아직 안 받음) · loading · ready · error(하나도 못 받음)
//   failed = 못 받은 책 수, nsMissed = 학교표(또는 올린 묶음 목록)를 못 받아 내신 단어가 빠졌는지. 둘 중 하나라도 있으면 다음에 검색 칸을 누를 때 다시 받아 본다.
let state = { status: "idle", key: "", sources: [], total: 0, done: 0, failed: 0, nsMissed: false };
let runId = 0;
const listeners = new Set();
const emit = (next) => { state = next; listeners.forEach((fn) => { try { fn(); } catch (e) {} }); };
export const subscribeWordIndex = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getWordIndex = () => state;

// 책 한 권: 폰에 저장해 둔 것이 최신이면 그것을, 아니면 새로 받아 줄인다. 못 받으면 옛 저장본이라도 쓴다.
async function loadRows(db, base, id, wantV) {
  const saved = await idbGet(db, id);
  const savedOk = !!(saved && goodSearchRows(saved.rows));
  if (savedOk && wantV && saved.v === wantV) return saved.rows;
  const list = await fetchJson(`${base}/voca/books/${id}.json`, 20000);
  if (Array.isArray(list) && list.length) {
    const rows = buildSearchRows(list);
    idbPut(db, id, { v: wantV || "", rows });
    return rows;
  }
  return savedOk ? saved.rows : null;
}

// 검색 재료 받기 시작. origin = 워커 주소, sc·nsl = 내 학교코드·이번 시험범위 과, year·exam = 지금 준비하는 시험(올린 내신 묶음 고르기),
//   firstBooks = 내가 배우는 단어장(먼저 받고 먼저 보여 준다).
//   같은 조건으로 이미 받았거나 받는 중이면 아무것도 안 한다. force=true면 다시 받는다([다시 시도]).
export function startWordIndex({ origin, sc = "", nsl = [], year = 0, exam = "", firstBooks = [] }, force = false) {
  const base = String(origin || "").replace(/\/+$/, "");
  const key = `${base}|${sc}|${(nsl || []).join(",")}|${year || ""}|${exam || ""}`;
  if (!base) { emit({ status: "error", key, sources: [], total: 0, done: 0, failed: 0, nsMissed: false }); return; }
  if (!force && state.key === key && (state.status === "loading" || (state.status === "ready" && !state.failed && !state.nsMissed))) return;
  const my = ++runId;
  // 같은 범위를 다시 받는 것이면(못 받은 책 다시 받기) 이미 받은 책은 새 것이 올 때까지 그대로 보여 준다.
  const keep = state.key === key ? state.sources : [];
  emit({ status: "loading", key, sources: keep, total: 0, done: 0, failed: 0, nsMissed: false });
  (async () => {
    const wantNs = !!(sc && (nsl || []).length);
    const [db, meta, unitsJson, nsIndex] = await Promise.all([
      idbOpen(),
      fetchJson(`${base}/voca/books-meta`, 6000, true),
      wantNs ? fetchJson(`${base}/voca/books/ns_units.json`, 6000, true) : Promise.resolve(null),
      sc ? fetchJson(`${base}/voca/ns-index?sc=${encodeURIComponent(sc)}`, 6000, true, { exams: [] }) : Promise.resolve({ exams: [] }),   // [129차수]
    ]);
    if (my !== runId) return;
    const nsMissed = (wantNs && !unitsJson) || !nsIndex;
    const vOf = {};
    (meta && Array.isArray(meta.books) ? meta.books : []).forEach((b) => { if (b && b.id) vOf[String(b.id)] = String(b.v || ""); });
    const ready = meta && Array.isArray(meta.ready) ? meta.ready.map(String) : null;
    const regular = SEARCH_REGULAR_BOOKS.filter((id) => !ready || ready.includes(id));
    const mine = (firstBooks || []).filter((id) => regular.includes(id));
    const plan = [];                                              // 보여 주는 순서: 내신 → 내가 배우는 책 → 나머지 책
    const nsSrc = pickNaesinSource(unitsJson, sc, nsl);
    if (nsSrc) plan.push({ id: nsSrc.id, ns: true, lecNames: nsSrc.lecNames });
    const upSrc = pickUploadedNaesin(nsIndex, year, exam);       // [129차수] 선생님이 올린 내신 묶음(지금 준비하는 시험)
    if (upSrc) plan.push({ id: upSrc.id, ns: true, lecNames: upSrc.lecNames });
    [...mine, ...regular.filter((id) => !mine.includes(id))].forEach((id) => plan.push({ id, ns: false, lecNames: null }));
    const slots = plan.map(() => null);
    let done = 0, failed = 0;
    const publish = () => {
      if (my !== runId) return;
      const finished = done >= plan.length;
      const sources = finished ? slots.filter(Boolean) : plan.map((p, i) => slots[i] || keep.find((s) => s.id === p.id) || null).filter(Boolean);
      emit({ status: finished ? (sources.length ? "ready" : "error") : "loading", key, sources, total: plan.length, done, failed, nsMissed });
    };
    publish();
    await Promise.all(plan.map(async (p, i) => {
      const rows = await loadRows(db, base, p.id, vOf[p.id] || "");
      if (rows) slots[i] = makeSearchSource({ id: p.id, ns: p.ns, lecNames: p.lecNames, rows });
      else failed++;
      done++;
      publish();
    }));
  })().catch(() => {   // 예상 못 한 오류(자료 모양이 깨짐 등) — "불러오는 중"에 멈추지 않게 실패로 끝낸다
    if (my === runId) emit({ status: "error", key, sources: [], total: 0, done: 0, failed: 0, nsMissed: false });
  });
}
