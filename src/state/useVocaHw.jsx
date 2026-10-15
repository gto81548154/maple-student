import { useEffect, useRef, useState } from "react";
import { IS_TEACHER_MODE } from "../core/auth.jsx";
import { getSelfAccessToken } from "../core/bundle.jsx";
import { WORKER_ORIGIN } from "../core/config.jsx";
import { computeActiveTodoDateEarly } from "../domain/todo.jsx";

// [120차수] 앱 단어 숙제 완료 도장 읽기 — App.jsx에서 그대로 옮김.
// [137차수] 마플싱커(리마스터 2차~)가 학생 자료 묶음에 도장을 같이 실어 준다(bundleVocaHw = { 날짜: 도장 }).
//   · 묶음에 도장이 오면: 앱을 열 때 따로 묻지 않고, 평소에도 묻지 않는다(묶음이 90초마다 새로 온다).
//     단어 탭을 보고 있는 동안만 1분마다, 그리고 단어 탭에서 나올 때 한 번 묻는다 — 방금 통과한 숙제가 예전처럼 늦지 않게 표시되게.
//   · 묶음에 도장이 안 오면(옛 워커·서버가 못 읽음·폰 저장본): 136까지와 같다(열 때 한 번 + 1분마다 + 단어 탭에서 나올 때).
//     다만 앱을 열 때 두 번 묻던 것은 한 번으로 줄였다(눈에 띈 것 a).
//   · 아직 첫 묶음이 안 왔으면(undefined) 기다린다 — 묶음이 도장을 줄지 모르는 채로 먼저 묻지 않는다.
export function useVocaHw(D) {
  const { bundleVocaHw, selectedDate, studentId, tab, todos } = D;
  // ─── [0825 5차수 → 6차수 고침] 앱 단어 숙제 완료 도장 읽기 ───
  // 6차수 = 학생 본인 문 /voca/hw-status?id=&t=&date= — 내 열쇠(주소의 t, 마스터로 볼 때도 학생 t가 실려 온다)로
  // 내 도장 하나만 받아온다. ① 홈·숙제 탭 "앱 단어" 줄 초록 체크 ② 단어 탭 동작(숙제 남음 = 숙제 TEST 먼저) 판단.
  // 도장이 있으면 = 그 수업 날짜의 단어 숙제를 통과한 것. 못 읽으면 null(표시만 안 할 뿐 오류 없음).
  const [fetched, setFetched] = useState(null);          // 따로 물어서 받은 도장({ date, rec })
  const vocaHwLoadRef = useRef(null);
  const prevTabRef = useRef(tab);
  const vocaHwDate = computeActiveTodoDateEarly(todos, studentId, selectedDate);
  const hasBundleMap = !!bundleVocaHw && typeof bundleVocaHw === "object";
  const waitBundle = bundleVocaHw === undefined;          // 첫 묶음 전
  useEffect(() => {
    let dead = false;
    setFetched(null);
    // [교사 08-27] 선생님이 학생 화면을 열어본 것은 학생 본인 문(t가 필요)이라 부를 수 없다 — 아예 건너뛴다.
    if (!WORKER_ORIGIN || !vocaHwDate || !studentId || IS_TEACHER_MODE || waitBundle) { vocaHwLoadRef.current = null; return undefined; }
    const load = async () => {
      try {
        const r = await fetch(`${WORKER_ORIGIN}/voca/hw-status?id=${encodeURIComponent(String(studentId))}&t=${encodeURIComponent(getSelfAccessToken())}&date=${encodeURIComponent(vocaHwDate)}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!dead && r.ok && j && j.success) setFetched({ date: vocaHwDate, rec: j.record || null });
      } catch (e) {}
    };
    vocaHwLoadRef.current = load;
    if (hasBundleMap) return () => { dead = true; vocaHwLoadRef.current = null; };   // 묶음이 도장을 준다 → 열 때·1분마다 묻지 않는다
    load();
    const iv = setInterval(load, 60000);   // 등원 시간대에 저절로 갱신되게 1분마다
    return () => { dead = true; clearInterval(iv); vocaHwLoadRef.current = null; };
  }, [vocaHwDate, studentId, hasBundleMap, waitBundle]);
  // 단어 탭에서 나오면 곧바로 한 번 더 읽는다 — 방금 통과한 숙제가 기다리지 않고 표시되게.
  //   [137차수] "단어 탭에서 다른 탭으로 나올 때"만 읽는다. 136까지는 앱을 열 때와 아무 탭이나 바꿀 때마다 읽었다(눈에 띈 것 a).
  useEffect(() => {
    const prev = prevTabRef.current; prevTabRef.current = tab;
    if (prev === "voca" && tab !== "voca" && vocaHwLoadRef.current) vocaHwLoadRef.current();
  }, [tab]);
  // [137차수] 묶음이 도장을 줄 때도, 단어 탭을 보고 있는 동안은 1분마다 읽는다 — 단어 탭 안에서 숙제를 통과한 것이
  //   다음 묶음(90초~)을 기다리지 않고 136처럼 1분 안에 표시되게(빨간 "단어" 탭이 꺼지고 "통과" 띠가 뜬다).
  useEffect(() => {
    if (!hasBundleMap || tab !== "voca") return undefined;
    const iv = setInterval(() => { if (vocaHwLoadRef.current) vocaHwLoadRef.current(); }, 60000);
    return () => clearInterval(iv);
  }, [tab, hasBundleMap]);
  // 도장은 한 번 찍히면 없어지지 않는다 → 따로 물어 받은 것과 묶음에 실려 온 것 가운데 있는 쪽을 쓴다.
  const fromFetch = fetched && fetched.date === vocaHwDate ? fetched.rec : null;
  const fromBundle = (!IS_TEACHER_MODE && hasBundleMap && vocaHwDate) ? (bundleVocaHw[vocaHwDate] || null) : null;
  const vocaHwRec = fromFetch || fromBundle || null;
  return { vocaHwRec };
}
