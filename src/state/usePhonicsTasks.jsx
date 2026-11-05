import { useEffect, useRef, useState } from "react";
import { getSelfAccessToken } from "../core/bundle.jsx";
import { WORKER_ORIGIN } from "../core/config.jsx";
import { fetchWithTimeout } from "../core/net.jsx";
import { normalizePhonicsTasks } from "../domain/phonics.jsx";

// ═══ [152차수] 파닉스 숙제 목록 — 홈 단추와 🎤 파닉스 화면이 같은 목록을 본다 ═══
//   앱을 켤 때 한 번 받고, 파닉스 화면에 들어갈 때·녹음을 보낸 뒤 다시 받는다(reload). 워커가 아직 없거나(404) 연결이 안 되면 "fail" — 앱은 멈추지 않고 홈 단추만 안 보인다.
//   state: loading / ok / fail
export function usePhonicsTasks({ studentId, enabled }) {
  const [tasks, setTasks] = useState([]);
  const [state, setState] = useState("loading");
  const aliveRef = useRef(true);
  const seqRef = useRef(0);
  const reload = async () => {
    if (!enabled || !studentId) return;
    if (!WORKER_ORIGIN) { setState("fail"); return; }
    const seq = ++seqRef.current;
    try {
      const url = `${WORKER_ORIGIN}/student/phonics-tasks?studentId=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}`;
      const resp = await fetchWithTimeout(url, { method: "GET" }, 15000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success === false) throw new Error("list");
      if (!aliveRef.current || seq !== seqRef.current) return;
      setTasks(normalizePhonicsTasks(data.items !== undefined ? data.items : data.tasks !== undefined ? data.tasks : data));
      setState("ok");
    } catch (e) { if (aliveRef.current && seq === seqRef.current) setState("fail"); }
  };
  useEffect(() => { aliveRef.current = true; reload(); return () => { aliveRef.current = false; }; }, [studentId, enabled]);
  return { phonicsTasks: tasks, setPhonicsTasks: setTasks, phonicsState: state, reloadPhonics: reload };
}
