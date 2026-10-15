import { useEffect, useRef, useState } from "react";
import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { computeCompletedBooks } from "../domain/progress.jsx";

// [120차수] 교재 완주 축하 띄울 목록 — App.jsx에서 그대로 옮김.
export function usePassQueue(D) {
  const { progressTree, student, todos } = D;
  // [PASS] 새로 완주한 책 감지 → 앱 진입 시 축하 연출 (책당 딱 1번, 이 폰 기준)
  // ※ 반드시 위의 student·todos·progressTree state 선언 "뒤"에 있어야 함 — 앞에 두면 TDZ 크래시로 앱이 안 열림
  const [passQueue, setPassQueue] = useState([]);
  const passCheckedRef = useRef(false);
  useEffect(() => {
    if (passCheckedRef.current || !student?.id || IS_STAFF_VIEW) return;   // [교사] 축하 화면은 학생 것
    if (!progressTree || !Array.isArray(progressTree.lanes) || !Object.keys(todos || {}).length) return;
    passCheckedRef.current = true;
    try {
      const completed = computeCompletedBooks(student.id, todos, progressTree) || [];
      const key = `mapl_pass_seen_${student.id}`;
      let seen = null;
      try { seen = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { seen = null; }
      const ids = completed.map(b => String(b.id));
      if (!seen || !Array.isArray(seen.ids)) {
        // 첫 실행: 이미 끝나 있던 책은 기준선으로만 기록 (과거 완주까지 축하가 쏟아지지 않게)
        localStorage.setItem(key, JSON.stringify({ ids }));
        return;
      }
      const fresh = completed.filter(b => !seen.ids.includes(String(b.id)));
      localStorage.setItem(key, JSON.stringify({ ids }));
      if (fresh.length) setPassQueue(fresh);
    } catch (e) { console.warn("완주 감지 실패:", e?.message || e); }
  }, [student?.id, todos, progressTree]);
  return { passQueue, setPassQueue };
}
