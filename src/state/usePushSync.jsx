import { useEffect, useRef } from "react";
import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { pushSupport, registerMaplSw, subscribeMaplPush } from "../core/pwa.jsx";
import { setPushSubState } from "../ui/settingCards.jsx";

// [120차수] 알림 구독을 조용히 최신으로 — App.jsx에서 그대로 옮김.
export function usePushSync(D) {
  const { student } = D;
  const pushSyncedRef = useRef(false);
  useEffect(() => {
    if (!student?.id || IS_STAFF_VIEW || pushSupport() === "unsupported" || pushSyncedRef.current) return;
    pushSyncedRef.current = true;
    (async () => {
      const reg = await registerMaplSw();
      if (!reg) return;
      if (Notification.permission === "granted") {
        // 허용은 되어 있는데 구독이 끊겼거나 새 기기인 경우를 대비해 매 실행마다 저장을 갱신한다
        // [108차수 · 검토 3번] 결과를 앱 설정 카드가 볼 수 있게 남긴다(성공/실패)
        try { await subscribeMaplPush(student); setPushSubState("ok", ""); }
        catch (e) { console.warn("푸시 구독 갱신 실패:", e?.message || e); setPushSubState("fail", String(e?.message || e)); }
      }
    })();
  }, [student?.id]);
}
