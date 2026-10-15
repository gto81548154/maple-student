import { useCallback, useEffect, useState } from "react";
import { teacherUrl } from "../../core/auth.jsx";

// 원장 토익 기록 받아오기·저장하기 — TeacherHome이 늘 부르고, 원장일 때만 실제로 받는다.
export function useOwnerToeic(enabled) {
  const [tests, setTests] = useState({});
  const [p5, setP5] = useState({});   // [116차수] 파트5 기록 { 문항id: { r, w, last } }
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch(teacherUrl("/teacher/toeic"), { cache: "no-store" });
      if (r.status === 403) { setErr("토익 기록을 볼 수 없어요(원장 링크만)"); return; }
      const d = await r.json().catch(() => null);
      if (d && d.success && d.toeic) { setTests(d.toeic.tests || {}); setP5(d.toeic.p5 || {}); setErr(""); }
      else setErr("토익 기록을 못 받아왔어요");
    } catch (e) { setErr("토익 기록을 못 받아왔어요 — 인터넷을 확인해 주세요"); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  // 보낸 칸만 바꾼다. 화면은 먼저 바꾸고, 서버가 돌려준 값으로 한 번 더 맞춘다.
  const save = useCallback(async (id, patch) => {
    setTests(prev => {
      const cur = { ...(prev[id] || {}) };
      if ("done" in patch) { if (patch.done) { cur.done = true; cur.doneAt = cur.doneAt || new Date().toISOString(); } else { delete cur.done; delete cur.doneAt; } }
      if ("score" in patch) { if (patch.score === null) delete cur.score; else cur.score = patch.score; }
      if ("sec" in patch) cur.sec = patch.sec;
      if (patch.open) cur.openedAt = new Date().toISOString();
      return { ...prev, [id]: cur };
    });
    try {
      const r = await fetch(teacherUrl("/teacher/toeic"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }), keepalive: true,
      });
      const d = await r.json().catch(() => null);
      if (d && d.success && d.item) setTests(prev => ({ ...prev, [id]: d.item }));
      else if (d && d.error) setErr(String(d.error));
    } catch (e) { /* 이어듣기 위치 같은 것은 다음에 다시 보낸다 */ }
  }, []);
  // [116차수] 파트5 한 문제 결과 — 화면 먼저 바꾸고 서버에 보낸다(실패해도 풀이는 계속)
  const saveP5 = useCallback(async (id, ok) => {
    setP5(prev => {
      const cur = { ...(prev[id] || {}) };
      cur.r = (Number(cur.r) || 0) + (ok ? 1 : 0); cur.w = (Number(cur.w) || 0) + (ok ? 0 : 1); cur.last = ok ? "O" : "X";
      return { ...prev, [id]: cur };
    });
    try {
      await fetch(teacherUrl("/teacher/toeic"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p5: [{ id, ok }] }), keepalive: true,
      });
    } catch (e) {}
  }, []);
  return { tests, p5, loaded, err, load, save, saveP5 };
}
