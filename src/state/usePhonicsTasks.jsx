import { useEffect, useRef, useState } from "react";
import { getSelfAccessToken } from "../core/bundle.jsx";
import { WORKER_ORIGIN } from "../core/config.jsx";
import { fetchWithTimeout } from "../core/net.jsx";
import { mergePhonicsTasks, normalizePhonicsTasks } from "../domain/phonics.jsx";

// ═══ [152차수] 파닉스 숙제 목록 — 홈 단추와 🎤 파닉스 화면이 같은 목록을 본다 ═══
//   앱을 켤 때 한 번 받고, 파닉스 화면에 들어갈 때·녹음을 보낸 뒤 다시 받는다(reload). 워커가 아직 없거나(404) 연결이 안 되면 "fail" — 앱은 멈추지 않고 홈 단추만 안 보인다.
//   답은 { success:true, items:[…] }(또는 배열)일 때만 정상으로 본다 — 200인데 JSON이 아니거나 success 가 없는 답은 "fail"(숙제가 없는 것처럼 보이지 않게).
//   다시 받은 목록은 폰에 있는 것과 합친다(mergePhonicsTasks) — 방금 보낸 녹음이 서버 답에 아직 없어도 되돌아가지 않는다.
//   reload({ ifStale:true }) = 받는 중이거나 3초 안에 받았으면 건너뛴다(앱을 #phonics 로 바로 열 때 같은 요청이 두 번 나가지 않게).
//   state: loading / ok / fail
const STALE_MS = 3000;
export function usePhonicsTasks({ studentId, enabled }) {
  const [tasks, setTasks] = useState([]);
  const [state, setState] = useState("loading");
  const aliveRef = useRef(true);
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const loadedAtRef = useRef(0);
  const reload = async (opts = {}) => {
    if (!enabled || !studentId) return;
    if (opts.ifStale && (inFlightRef.current || (loadedAtRef.current && Date.now() - loadedAtRef.current < STALE_MS))) return;
    if (!WORKER_ORIGIN) { setState("fail"); return; }
    const seq = ++seqRef.current;
    inFlightRef.current = true;
    try {
      const url = `${WORKER_ORIGIN}/student/phonics-tasks?studentId=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}`;
      const resp = await fetchWithTimeout(url, { method: "GET" }, 15000);
      const data = await resp.json().catch(() => null);
      const list = Array.isArray(data) ? data : (data && data.success === true) ? (Array.isArray(data.items) ? data.items : Array.isArray(data.tasks) ? data.tasks : []) : null;
      if (!resp.ok || !list) throw new Error("list");
      if (!aliveRef.current || seq !== seqRef.current) return;
      loadedAtRef.current = Date.now();
      const next = normalizePhonicsTasks(list);
      setTasks((prev) => mergePhonicsTasks(prev, next));
      setState("ok");
    } catch (e) { if (aliveRef.current && seq === seqRef.current) setState("fail"); }
    finally { if (seq === seqRef.current) inFlightRef.current = false; }
  };
  useEffect(() => { aliveRef.current = true; reload(); return () => { aliveRef.current = false; }; }, [studentId, enabled]);
  return { phonicsTasks: tasks, setPhonicsTasks: setTasks, phonicsState: state, reloadPhonics: reload };
}
