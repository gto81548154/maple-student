import { useEffect, useState } from "react";
import { IS_STUDENT_TOEIC, TOEIC_STUDENT_ID, toeicPeekUrl } from "../../core/toeicAccess.jsx";
import { renderTeacherToeicTab } from "../teacher/TeacherToeicTab.jsx";
import { useOwnerToeic } from "./useOwnerToeic.jsx";

// [185차수 원장 결정 11-19] 학생 토익 — 원장이 원장 화면의 학생 탭에서 켜 준 학생에게만 더보기에 "토익"이 생긴다.
//   화면·저장 방식은 선생님 토익과 같다(같은 화면 파일). 기록은 학생마다 따로(서버 칸 toeic3:s_{학생id}).
// 켜져 있는지 — 서버에 가볍게 묻고(peek) 이 기기에 적어 둔다. 적어 둔 값으로 먼저 그리고, 5분이 지났으면 다시 묻는다.
//   tick 이 바뀔 때(학생 자료를 새로 받았을 때)도 5분 규칙 안에서 다시 묻는다. 못 물었으면 적어 둔 값을 그대로 쓴다.
const ON_KEY = "mapl_toeic_on_v1:" + TOEIC_STUDENT_ID;
const readOn = () => { try { const v = JSON.parse(localStorage.getItem(ON_KEY) || "null"); return v && typeof v.on === "boolean" ? v : null; } catch (e) { return null; } };
export function useStudentToeicOn(tick) {
  const [on, setOn] = useState(() => !!(IS_STUDENT_TOEIC && readOn()?.on));
  useEffect(() => {
    if (!IS_STUDENT_TOEIC) return undefined;
    const cached = readOn();
    if (cached && Date.now() - (Number(cached.at) || 0) < 5 * 60 * 1000) return undefined;
    let dead = false;
    fetch(toeicPeekUrl(), { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (dead || !d || !d.success || typeof d.on !== "boolean") return;
      try { localStorage.setItem(ON_KEY, JSON.stringify({ on: d.on, at: Date.now() })); } catch (e) { /* 못 적어도 화면은 맞게 그린다 */ }
      setOn(d.on);
    }).catch(() => { /* 인터넷이 끊겼으면 적어 둔 값 그대로 */ });
    return () => { dead = true; };
  }, [tick]);
  return on;
}
// 더보기 → 토익 화면
export function StudentToeicScreen() {
  const [toeicPick, setToeicPick] = useState("");
  const [toeicMode, setToeicMode] = useState("tests");
  const toeic = useOwnerToeic(true);
  return renderTeacherToeicTab({ setToeicMode, setToeicPick, toeic, toeicMode, toeicPick });
}
