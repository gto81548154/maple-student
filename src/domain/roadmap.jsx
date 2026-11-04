import { computeTreeProgressForStudent, effectiveTreeDone } from "./progress.jsx";

// ═══ [149차수] 마플 로드맵 — 원장앱 "정규 커리큘럼" 지도(1~7단계)에 내 위치를 찍는다 ═══
//   curriculum(워커 14단계가 학생 묶음에 실어 준다):
//     { stages:[{ no:1, name:"1단계", range:"초5~초6" }, …], lanes:[{ key:"voca", name:"단어", color, books:[{ id, name, alias, lessons, stage:2, stageEnd:5 }] }] }
//   내 책·진도는 진도 맵(progressTree = 원장앱 ptree3)과 숙제 기록에서 지금 "학습 진도"와 같은 규칙으로 계산한다.
//   책 맞추기: 커리큘럼 책 id = 진도 맵 책 id → 없으면 이름(별칭 포함, 공백·하이픈 무시)으로.
const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-_·()]/g, "");
export const stageLabel = (b) => (b.stageEnd && b.stageEnd !== b.stage ? `${b.stage}~${b.stageEnd}단계` : `${b.stage}단계`);
// 진도 맵의 책마다 상태(done/current/next/locked)와 done/total — StudentProgressTree 와 같은 판정
export const computeMyBooks = (student, todos, progressTree) => {
  const sid = student?.id;
  const out = {};   // id → { id, name, alias, st, done, total, pct }
  if (!sid || !progressTree) return out;
  const prog = computeTreeProgressForStudent(sid, todos, progressTree);
  const ovrMap = (progressTree.ovr || {})[String(sid)] || (progressTree.ovr || {})[sid] || {};
  (progressTree.lanes || []).forEach((l) => (l.nodes || []).forEach((n, idx, nodes) => {
    const matched = prog.units[n.id] ? prog.units[n.id].size : 0;
    const done = effectiveTreeDone(n, matched, ovrMap[n.id] || null);
    const total = n.total || 0;
    let st;
    if (total > 0 && done >= total) st = "done";
    else if (done > 0) st = "current";
    else {
      const prev = nodes[idx - 1];
      if (!prev) st = "next";
      else { const pm = prog.units[prev.id] ? prog.units[prev.id].size : 0; st = effectiveTreeDone(prev, pm, ovrMap[prev.id] || null) >= (prev.total || 0) ? "next" : "locked"; }
    }
    out[String(n.id)] = { id: String(n.id), name: String(n.name || ""), alias: String(n.alias || ""), st, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }));
  return out;
};
// 커리큘럼 책 하나에 내 진도 맵 책을 붙인다(id → 이름/별칭)
const matchBook = (book, myBooks, byName) => {
  if (!book) return null;
  if (book.id != null && myBooks[String(book.id)]) return myBooks[String(book.id)];
  const keys = [book.name, ...String(book.alias || "").split(",")].map(norm).filter(Boolean);
  for (const k of keys) { if (byName[k]) return byName[k]; }
  return null;
};
// 로드맵 전체 계산: 단계 목록, 줄마다 책(내 상태 포함), 내 단계
export const computeRoadmap = ({ curriculum, student, todos, progressTree }) => {
  const stages = Array.isArray(curriculum?.stages) ? curriculum.stages.filter((s) => s && s.no) : [];
  const lanesIn = Array.isArray(curriculum?.lanes) ? curriculum.lanes : [];
  if (!stages.length || !lanesIn.length) return null;
  const myBooks = computeMyBooks(student, todos, progressTree);
  const byName = {};
  Object.values(myBooks).forEach((b) => { [b.name, ...b.alias.split(",")].map(norm).filter(Boolean).forEach((k) => { if (!byName[k]) byName[k] = b; }); });
  let curStage = 0, doneStage = 0, assignedMin = 0;
  const lanes = lanesIn.map((l) => {
    const books = (Array.isArray(l.books) ? l.books : []).filter((b) => b && b.name).map((b) => {
      const mine = matchBook(b, myBooks, byName);
      const stage = Number(b.stage) || 1;
      const st = mine ? mine.st : "none";   // none = 나한테 배정 안 된 책
      if (st === "current") curStage = Math.max(curStage, stage);
      if (st === "done") doneStage = Math.max(doneStage, Number(b.stageEnd) || stage);
      if (mine && (st === "next" || st === "locked")) assignedMin = assignedMin ? Math.min(assignedMin, stage) : stage;
      return { id: String(b.id ?? b.name), name: String(b.name), lessons: Number(b.lessons) || (mine ? mine.total : 0), stage, stageEnd: Number(b.stageEnd) || 0, st, done: mine ? mine.done : 0, total: mine ? mine.total : 0, pct: mine ? mine.pct : 0 };
    }).sort((a, b) => a.stage - b.stage);
    return { key: String(l.key || l.name), name: String(l.name || ""), color: l.color || "", books };
  });
  // 내 단계 = 지금 하는 책의 단계 → 없으면 끝낸 책의 다음(끝낸 가장 높은 단계) → 없으면 배정된 첫 책 단계 → 없으면 0(배정 전)
  const myStage = curStage || doneStage || assignedMin || 0;
  const stageInfo = stages.find((s) => Number(s.no) === myStage) || null;
  const current = lanes.flatMap((l) => l.books.filter((b) => b.st === "current").map((b) => ({ ...b, lane: l.name })));
  return { stages, lanes, myStage, stageInfo, current };
};
