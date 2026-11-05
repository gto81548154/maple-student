import { fmtDateShort, shiftYmd } from "./time.jsx";

// ═══ [152차수] 파닉스 숙제 — 워커 답을 앱이 쓰는 모양으로 고치고, 상태(다 보냄·마감 지남·보낼 수 있음)를 정한다 ═══
//   워커 길(13단계 워커 지시문 기준): GET /student/phonics-tasks?studentId=&t= → { success, items:[숙제…] }
//   숙제 한 개: { id, title("워드마스터 Basic DAY 3"), due("2026-11-07"), memo, words:[{ no, word, meaning, recording:{ id, key, dur, at, heard, memo } | null }], done, total }
//   워커 쪽 값 이름이 조금 달라도 읽히게 여기서 한 번에 받아 준다(taskId·dueDate·deadline·wordNo·label·mean…). 이름이 다르면 이 파일만 고친다.
export const PHONICS_WORD_MAX_SEC = 20;     // 한 단어 최대 20초 — 원장 결정 11-05
export const PHONICS_GRACE_DAYS = 7;        // 마감 뒤 7일까지 보임·보낼 수 있음 — 원장 결정 11-05
const str = (v) => (v == null ? "" : String(v));
const ymd = (v) => { const s = str(v).trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; };
const normRec = (r) => {
  if (!r || typeof r !== "object") return null;
  const key = str(r.key || r.fileKey || "");
  const id = str(r.id || r.recordingId || key || "");
  if (!id && !key) return null;
  return { id, key, dur: Number(r.dur || r.sec || 0) || 0, at: str(r.at || r.createdAt || ""), mime: str(r.mime || ""), heard: !!(r.heard || r.heardAt), memo: str(r.memo || r.note || "") };
};
const normWord = (w, i) => {
  if (w == null) return null;
  if (typeof w === "string") return { no: i + 1, word: w, meaning: "", rec: null };
  const no = Number(w.no ?? w.wordNo ?? w.n ?? w.idx ?? (i + 1)) || (i + 1);
  const word = str(w.word ?? w.label ?? w.en ?? w.text ?? w.spelling ?? "").trim();
  const meaning = str(w.meaning ?? w.mean ?? w.ko ?? w.kr ?? w.def ?? "").trim();
  let rec = normRec(w.recording || w.rec || w.sent || w.submission || null);
  if (!rec && (w.key || w.recordingId)) rec = normRec({ id: w.recordingId, key: w.key, dur: w.dur, at: w.at || w.sentAt, heard: w.heard, memo: w.memo });
  return { no, word, meaning, rec };
};
export const normalizePhonicsTask = (t) => {
  if (!t || typeof t !== "object") return null;
  const id = str(t.id ?? t.taskId ?? "");
  if (!id) return null;
  const rawWords = Array.isArray(t.words) ? t.words : Array.isArray(t.items) ? t.items : [];
  const words = rawWords.map(normWord).filter(Boolean);
  // 녹음이 단어 안이 아니라 따로 올 때({ wordNo, key … } 목록) — 단어 번호로 붙인다
  const recs = Array.isArray(t.recordings) ? t.recordings : Array.isArray(t.submissions) ? t.submissions : [];
  recs.forEach((r) => { const no = Number(r && (r.wordNo ?? r.no)); const w = words.find((x) => x.no === no); if (w && !w.rec) w.rec = normRec(r); });
  const doneRaw = Number(t.done ?? t.doneCount ?? t.sent ?? NaN);
  const done = Number.isFinite(doneRaw) ? doneRaw : words.filter((w) => w.rec).length;
  const totalRaw = Number(t.total ?? t.wordCount ?? NaN);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : words.length;
  return {
    id,
    title: str(t.title || t.book || t.name || t.label || "파닉스 숙제").trim(),
    due: ymd(t.due || t.dueDate || t.deadline || t.until || t.dueAt),
    memo: str(t.memo || t.note || t.comment || "").trim(),
    words, done: Math.max(0, Math.min(total, done)), total,
    at: str(t.at || t.createdAt || ""),
  };
};
// 마감 가까운 것 먼저(마감 없는 것은 뒤), 같으면 만든 순서
export const sortPhonicsTasks = (list) => [...list].sort((a, b) => {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (!!a.due !== !!b.due) return a.due ? -1 : 1;
  return str(a.at).localeCompare(str(b.at));
});
export const normalizePhonicsTasks = (raw) => {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.items) ? raw.items : raw && Array.isArray(raw.tasks) ? raw.tasks : [];
  return sortPhonicsTasks(list.map(normalizePhonicsTask).filter(Boolean));
};
// 상태
export const isPhonicsDone = (t) => !!t && t.total > 0 && t.done >= t.total;
export const isPhonicsOverdue = (t, todayStr) => !!(t && t.due && todayStr > t.due);
// 마감 뒤 7일까지는 보낼 수 있다(워커도 같은 규칙으로 7일 지난 것은 아예 안 준다)
export const canSendPhonics = (t, todayStr) => !t || !t.due || todayStr <= shiftYmd(t.due, PHONICS_GRACE_DAYS);
export const phonicsRemaining = (t) => Math.max(0, (t?.total || 0) - (t?.done || 0));
// 안 끝난 숙제 = 덜 보낸 것(마감이 지났어도 7일 안이면 포함). 홈 단추·더보기 설명이 쓴다
export const pendingPhonicsTasks = (list, todayStr) => sortPhonicsTasks((list || []).filter((t) => !isPhonicsDone(t) && canSendPhonics(t, todayStr)));
// "11/7(목)까지"
export const fmtPhonicsDue = (due) => { const s = fmtDateShort(due); return s ? s + "까지" : ""; };
// "11/7까지"(홈 단추용 짧은 글)
export const fmtPhonicsDueShort = (due) => {
  if (!due) return "";
  const d = new Date(due + "T00:00:00"); if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}까지`;
};
// 보내기 답의 task.done/total 로 그 숙제 숫자를 바로 고친다(없으면 단어 목록으로 다시 센다)
export const applyPhonicsSent = (list, taskId, wordNo, rec, taskPatch) => (list || []).map((t) => {
  if (String(t.id) !== String(taskId)) return t;
  const words = t.words.map((w) => (w.no === wordNo ? { ...w, rec } : w));
  const doneRaw = Number(taskPatch && taskPatch.done);
  const totalRaw = Number(taskPatch && taskPatch.total);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : t.total;
  const done = Number.isFinite(doneRaw) ? doneRaw : words.filter((w) => w.rec).length;
  return { ...t, words, done: Math.max(0, Math.min(total, done)), total };
});
// 서버 목록(next)에 방금 보낸 녹음이 아직 없으면(서버가 잠깐 옛 목록을 줄 때) 폰에 있는 것(prev)을 지키고 숫자를 다시 센다.
//   같은 단어에 둘 다 있으면 더 나중 것(at)을 쓴다. 서버에 없는 숙제는 서버대로(마감 뒤 7일 지남 등).
const atMs = (r) => { const t = r && r.at ? new Date(r.at).getTime() : 0; return Number.isFinite(t) ? t : 0; };
export const mergePhonicsTasks = (prev, next) => {
  if (!Array.isArray(prev) || !prev.length) return next;
  return next.map((t) => {
    const old = prev.find((p) => String(p.id) === String(t.id));
    if (!old) return t;
    let kept = false;
    const words = t.words.map((w) => {
      const ow = old.words.find((x) => x.no === w.no);
      if (!ow || !ow.rec) return w;
      if (!w.rec || atMs(ow.rec) > atMs(w.rec)) { kept = true; return { ...w, rec: ow.rec }; }
      return w;
    });
    if (!kept) return t;
    const done = Math.max(t.done, words.filter((w) => w.rec).length);
    return { ...t, words, done: Math.min(t.total, done) };
  });
};
