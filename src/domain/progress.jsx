import { stripLessonSessionPrefix } from "./todo.jsx";

// ─── StudentProgressTree: 진도 스킬트리 (원장앱 진도 맵과 동일 산출 규칙, 읽기 전용) ───
// 트리 정의/보정은 원장앱 ptree3에서 그대로 내려오고, 진도는 이 학생의 투두 기록에서 계산한다.
const extractTodoLinesForProgress = (row) => {
  const out = [];
  // [112차수] 줄 앞 "1차-"는 떼고 본다 — 그 1을 과 번호로 세면 진도·완주 축하가 틀린다(원장앱 170차수 진도 map과 같은 규칙)
  const push = (v) => String(v || "").split(/\r?\n/).forEach(l => { const t = stripLessonSessionPrefix(l.trim()).trim(); if (t) out.push(t); });
  if (row && row.steps5) ["step1","step2","step3","step4","step5"].forEach(k => push(row.steps5[k]));
  else if (row) { push(row.homework); push(row.academy); }
  return out;
};
export const computeTreeProgressForStudent = (sid, todos, tree) => {
  const result = { units: {}, recent: {} };
  if (!sid || !tree) return result;
  const prepared = (tree.lanes || []).flatMap(l => l.nodes || [])
    // [0814] 예전에는 별칭이 있으면 교재명을 아예 안 봤다(String(n.alias || n.name)).
    //        그래서 투두에 교재명이 그대로 적히면 진도가 안 쌓였다. 이제 교재명 + 별칭을 모두 본다.
    .map(n => ({ n, keys: [...new Set([String(n.name || ""), ...String(n.alias || "").split(",")].map(v => v.trim()).filter(Boolean))] }));
  Object.keys(todos || {}).sort().forEach(dk => {
    const day = todos[dk] || {};
    const row = day[String(sid)] !== undefined ? day[String(sid)] : day[sid];
    if (!row) return;
    extractTodoLinesForProgress(row).forEach(line => {
      prepared.forEach(({ n, keys }) => {
        if (!keys.length || !keys.some(k => k && line.includes(k))) return;
        const set = result.units[n.id] || (result.units[n.id] = new Set());
        // 별칭 자체의 숫자(예: "그래머2")가 과번호로 집계되지 않게 별칭을 지운 뒤 숫자 추출
        let scan = line;
        keys.forEach(k => { if (k) scan = scan.split(k).join(" "); });
        (scan.match(/\d{1,3}/g) || []).forEach(v => { const num = +v; if (num >= 1 && num <= (n.total || 0)) set.add(num); });
        result.recent[n.id] = `${dk.slice(5).replace("-", "/")} · ${line.slice(0, 40)}`;
      });
    });
  });
  return result;
};
export const effectiveTreeDone = (node, matched, ovr) => {
  if (ovr && ovr.forceDone) return node.total || 0;
  return Math.min(node.total || 0, (matched || 0) + (Number(ovr && ovr.baseDone) || 0));
};
// ─── [PASS] 교재 완주 축하 (2026-07-23) ───
// 진도 트리에서 100%가 된 교재(투두 자동 집계 + 원장 보정/완료 처리 포함)를 찾아,
// 폰에 기억해 둔 "이미 축하한 책"과 비교해 새로 완주한 책만 앱 진입 시 축하한다.
export const computeCompletedBooks = (sid, todos, tree) => {
  if (!sid || !tree) return null;
  const prog = computeTreeProgressForStudent(sid, todos, tree);
  const ovrMap = (tree.ovr || {})[String(sid)] || (tree.ovr || {})[sid] || {};
  const out = [];
  (tree.lanes || []).forEach(l => (l.nodes || []).forEach(n => {
    const matched = prog.units[n.id] ? prog.units[n.id].size : 0;
    const done = effectiveTreeDone(n, matched, ovrMap[n.id] || null);
    if ((n.total || 0) > 0 && done >= (n.total || 0)) out.push({ id: String(n.id), name: String(n.name || "교재") });
  }));
  return out;
};
