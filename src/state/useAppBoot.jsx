import { useEffect } from "react";
import { setupStudentPwa } from "../core/pwa.jsx";

// [120차수] 앱이 켜질 때 한 번 하는 일(설치 정보 넣기·아이콘 배지 지우기) — App.jsx에서 그대로 옮김.
export function useAppBoot() {
  // [PWA] manifest·아이콘 메타 주입 (학생별 start_url 포함) — 1회
  useEffect(() => { setupStudentPwa(); }, []);
  // [푸시] 앱을 열면: 배지(빨간 숫자) 지우기 + 서비스 워커 등록 + 이미 허용된 폰이면 구독을 조용히 최신으로 갱신
  useEffect(() => {
    const clearBadge = () => { try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) {} };
    clearBadge();
    const onVis = () => { if (document.visibilityState === "visible") clearBadge(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
}
