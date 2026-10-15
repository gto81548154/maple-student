// ─── [127차수 10-12] 내신 단어 올리기 — 계산만 하는 곳(화면·인터넷 없음) ───
// 앱용 단어 파일(…앱단어.json)의 모양은 "앱용-단어-파일-규격-1012.md" 참고. 최종 검사는 마플싱커가 한다 —
//   여기서는 올리기 전에 "어느 학교 · 어느 시험 · 무슨 단어 · 몇 개"를 보여 주고, 뻔히 잘못된 파일을 미리 가려낸다.
const NS_KINDS = ["교과서", "부교재", "모의고사", "외부지문", "변형문제"];
export const NS_FILE_MAX_BYTES = 1000000;   // 파일 하나 1MB까지
const MAX_WORDS = 400;
// 글자 다듬기 — 마플싱커(nsText)와 똑같이: NFC, 제어 글자는 빈칸, 꺾쇠는 〈 〉, 빈칸 여러 개는 하나.
const clean = (v, max) => (typeof v === "string" || typeof v === "number"
  ? String(v).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/</g, "〈").replace(/>/g, "〉").replace(/\s+/g, " ").trim().slice(0, max) : "");

// 파일 글자 → { ok:true, set, key, line } 또는 { ok:false, error }.
//   line = 확인 줄에 쓸 값({ head:"하남고1 · 2학기 기말", kind, detail:"올림포스 13강 · 38개 · 3주차" })
export function readNsFile(text) {
  let raw;
  try { raw = JSON.parse(String(text || "").replace(/^﻿/, "")); } catch (e) { return { ok: false, error: "앱용 단어 파일이 아닙니다(읽을 수 없는 파일)" }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.app !== "maple-ns-words") return { ok: false, error: "앱용 단어 파일(…앱단어.json)이 아닙니다" };
  const schools = [...new Set((Array.isArray(raw.schools) ? raw.schools : []).map((s) => clean(s, 20)).filter(Boolean))].sort();
  if (!schools.length || schools.length > 6 || !schools.every((s) => /^[가-힣A-Za-z0-9]{2,20}$/.test(s))) return { ok: false, error: "학교가 올바르지 않습니다(예: 하남고1)" };
  const year = Number(raw.year);
  if (!Number.isInteger(year) || year < 2024 || year > 2100) return { ok: false, error: "연도가 올바르지 않습니다" };
  const exam = clean(raw.exam, 20);
  if (!/^[12]학기 (중간|기말)$/.test(exam)) return { ok: false, error: "시험 이름이 올바르지 않습니다(예: 2학기 기말)" };
  const kind = clean(raw.kind, 10);
  if (!NS_KINDS.includes(kind)) return { ok: false, error: "단어 종류가 올바르지 않습니다" };
  const title = clean(raw.title, 40);
  if (!title) return { ok: false, error: "묶음 이름이 없습니다" };
  const week = Number.isInteger(Number(raw.week)) && Number(raw.week) >= 0 && Number(raw.week) <= 30 ? Number(raw.week) : 0;
  const order = Number.isFinite(Number(raw.order)) && Number(raw.order) >= 0 && Number(raw.order) <= 9999 ? Number(raw.order) : 0;
  const words = [];
  for (const it of (Array.isArray(raw.words) ? raw.words : [])) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const w = clean(it.w, 80);
    const m = clean(Array.isArray(it.m) ? it.m.filter((x) => typeof x === "string").join(", ") : it.m, 300);
    if (!w) continue;
    if (!m.replace(/[,;\s]/g, "")) return { ok: false, error: `뜻이 비어 있는 단어가 있습니다: ${w}` };
    words.push({ w, m });
  }
  if (!words.length) return { ok: false, error: "단어가 하나도 없습니다" };
  if (words.length > MAX_WORDS) return { ok: false, error: `단어가 너무 많습니다(${words.length}개, 한 묶음 ${MAX_WORDS}개까지)` };
  const set = { app: "maple-ns-words", v: 1, schools, year, exam, kind, title, week, order, words };
  return { ok: true, set, key: nsSetKey(set), line: nsLine(set, words.length) };
}
// 같은 묶음인지 가리는 이름표(마플싱커와 같은 규칙). 서버 목록의 줄에도 쓸 수 있다(학교는 가나다순).
export const nsSetKey = (set) => [[...(set.schools || [])].sort().join(","), set.year, set.exam, set.kind, String(set.title).toLowerCase()].join("|");
// 화면 한 줄에 쓸 글자
//   연도는 올해가 아닐 때만 적는다(작년 파일을 올해 것으로 착각하지 않게).
export function nsLine(x, n, thisYear = new Date().getFullYear()) {
  const head = `${(x.schools || []).join("·")} · ${Number(x.year) && Number(x.year) !== thisYear ? `${x.year}년 ` : ""}${x.exam}`;
  const detail = [x.title, `${n}개`, Number(x.week) > 0 ? `${x.week}주차` : ""].filter(Boolean).join(" · ");
  return { head, kind: x.kind, detail };
}
// 한 요청에 묶음 maxSets개·"학교·시험" maxScopes가지까지 — 넘지 않게 나눈다.
export function chunkNsSets(sets, maxSets = 6, maxScopes = 8) {
  const out = []; let cur = []; let scopes = new Set();
  for (const s of sets) {
    const mine = s.schools.map((sc) => `${sc}|${s.year}|${s.exam}`);
    const merged = new Set([...scopes, ...mine]);
    if (cur.length && (cur.length >= maxSets || merged.size > maxScopes)) { out.push(cur); cur = []; scopes = new Set(); }
    cur.push(s); mine.forEach((k) => scopes.add(k));
  }
  if (cur.length) out.push(cur);
  return out;
}
// "오늘 6:54" / "어제" / "10/3"
export function fmtNsWhen(iso, now = new Date()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `오늘 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diff === 1) return "어제";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
