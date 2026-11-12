// [168차수] 새 팝업(LabPopup)만 가짜 자료로 띄워 보는 화면 — 서버는 안 쓴다. ?empty = 공지·시험이 없을 때
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LabPopup } from "../../../src/ui/LabPopup.jsx";
import { MoreMenu } from "../../../src/ui/StudentChrome.jsx";
const empty = new URLSearchParams(location.search).has("empty");
const notices = empty ? [] : [
  ["2026-11-12", { text: "기말고사 직전 보충 안내\n시험 전 주 토요일에 보충 수업이 있어요.", author: "원장님" }],
  ["2026-11-10", { text: "변형문제 2차 나눠 줬어요. 채점은 앱 답지로 해요.", author: "선생님" }],
];
const exam = empty ? null : { name: "윤슬중 2학기 기말고사(1,2학년)", ddayLabel: "D-26", dateLabel: "12/8(화)", isEngTarget: true, type: "내신" };
const groups = [{ title: "앱", items: [{ key: "settings", icon: "⚙️", title: "앱 설정", sub: "알림 · 홈 화면 추가 · 업데이트" }] }, { title: "안 쓰는 기능", items: [{ key: "labPopup", icon: "🧪", title: "새 팝업 (준비 중)", sub: "공지 · 시험 일정 · 단어 리그" }] }];
function App() {
  const [open, setOpen] = useState(false);
  window.__went = window.__went || [];
  return <div style={{ maxWidth: 600, margin: "0 auto", padding: 16, fontFamily: "'Pretendard Variable', 'Noto Sans CJK KR', sans-serif" }}>
    <MoreMenu groups={groups} onPick={(k) => { if (k === "labPopup") setOpen(true); }} />
    {open && <LabPopup pinnedMessages={notices} exam={exam} rangeText={empty ? "" : "교과서 7과 · 8과\n학교 프린트 2장"} doneTasks={1} totalTasks={empty ? 0 : 3} activeDate="2026-11-12" classLine="오늘 5시 등원"
      onClose={() => setOpen(false)} onGo={(k) => { window.__went.push(k); setOpen(false); }} />}
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
