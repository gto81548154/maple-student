import { useCallback, useEffect, useRef, useState } from "react";
import { teacherLinkDead, teacherUrl } from "../../core/auth.jsx";
import { applyServerAppSettings } from "../../data/holidays.jsx";

// [122차수] 선생님 홈 자료 불러오기(첫 불러오기·자동 새로고침·[다시 받아오기]) — TeacherHome.jsx에서 그대로 옮김.
export function useTeacherData(D) {
  const { setDateStr, setErr, setHome, setLoading, setRoster } = D;
  // [선별 78차수] 선생님 홈만 다시 받아온다 — 단어를 고르고 나면 "몇 칸 골랐는지"가 바로 바뀌어야 한다
  const reloadHome = useCallback(async () => {
    try {
      const r = await fetch(teacherUrl("/teacher/home"), { cache: "no-store" });
      if (r.status === 403) { teacherLinkDead(); return; }
      const d = await r.json().catch(() => null);
      if (d && d.success) { applyServerAppSettings(d.settings); setHome(d); }   // [137차수] 앱 설정(공휴일)을 먼저 반영
    } catch (e) { /* 실패하면 다음에 다시 — 화면은 그대로 둔다 */ }
  }, []);
  // [96차수 09-05] 선생님 홈도 다시 받아온다 — 예전엔 처음 열 때 딱 한 번만 받아서, 앱을 켜 둔 채 다음 날 다시 열면
  //   "오늘 할일"·출근 안내가 어제 것 그대로였다(학생 화면엔 화면 켤 때 새로 받는 장치가 있는데 여기엔 없었음).
  //   ① 화면을 다시 켤 때 — 마지막으로 받은 지 1분이 넘었으면 조용히 다시 받는다
  //   ② 머리글 ↻ 단추 — 직접 다시 받는다
  //   다시 받을 때 실패하면 화면은 그대로 두고 안내만 3초 띄운다. 서버의 "오늘"이 바뀌었으면(날짜가 넘어감) 학생 탭 날짜도 오늘로 옮긴다.
  const [refreshing, setRefreshing] = useState(false);
  const lastLoadAtRef = useRef(0);
  const deadRef = useRef(false);
  const lastTodayRef = useRef("");
  const loadAll = useCallback(async ({ initial = false, manual = false } = {}) => {
    if (manual) setRefreshing(true);
    try {
      const [rh, rs] = await Promise.all([
        fetch(teacherUrl("/teacher/home"), { cache: "no-store" }),
        fetch(teacherUrl("/teacher/students"), { cache: "no-store" }),
      ]);
      if (rh.status === 403 || rs.status === 403) { teacherLinkDead(); return; }
      const dh = await rh.json().catch(() => null);
      const dsx = await rs.json().catch(() => null);
      if (deadRef.current) return;
      lastLoadAtRef.current = Date.now();
      if (dh && dh.success) applyServerAppSettings(dh.settings);   // [137차수] 앱 설정(공휴일)을 화면보다 먼저 반영 — 달력·다음 출근 계산이 이 표를 읽는다
      setHome(prev => (dh && dh.success ? dh : prev));
      setRoster(prev => (dsx && dsx.success ? dsx : prev));
      if (dh && dh.success && dh.today) {
        if (initial || dh.today !== lastTodayRef.current) setDateStr(dh.today);
        lastTodayRef.current = dh.today;
      }
      if (!dh?.success || !dsx?.success) {
        setErr("일부 자료를 불러오지 못했습니다.");
        if (!initial) setTimeout(() => setErr(""), 3000);
      }
    } catch (e) {
      if (deadRef.current) return;
      setErr(initial ? "불러오지 못했습니다. 인터넷 연결을 확인해주세요." : "다시 받아오지 못했어요. 인터넷 연결을 확인해 주세요.");
      if (!initial) setTimeout(() => setErr(""), 3000);
    } finally {
      if (!deadRef.current) { setLoading(false); if (manual) setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    deadRef.current = false;
    loadAll({ initial: true });
    const onVis = () => {
      if (document.hidden) return;
      if (Date.now() - lastLoadAtRef.current < 60000) return;   // 방금 받았으면 안 받는다
      loadAll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { deadRef.current = true; document.removeEventListener("visibilitychange", onVis); };
  }, [loadAll]);
  return { loadAll, refreshing, reloadHome };
}
