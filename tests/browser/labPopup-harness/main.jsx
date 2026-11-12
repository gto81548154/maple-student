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
// [170차수] ?league=running|upcoming|ended|first|zero|staff|bad — 가짜 단어 리그 자료(약속 (2) 모양). 없으면 "준비 중" 안내
const lgBase = { id: "lg_20261221", title: "겨울방학 단어 리그", startDate: "2026-12-21", endDate: "2027-01-30", status: "running", unit: "번",
  prizes: [{ rank: "1등", label: "5만원" }, { rank: "2등", label: "4만원" }, { rank: "3등", label: "3만원" }, { rank: "4~10등", label: "1만원" }],
  top: [{ rank: 1, name: "김○준", score: 64 }, { rank: 2, name: "이○화", score: 58 }, { rank: 3, name: "김○서", score: 51 }],
  me: { rank: 7, score: 34, next: { rank: 6, gap: 3 } }, total: 23, finisher: { days: 20, label: "커피 쿠폰", myDays: 12 }, updatedAt: "2026-12-28T09:00:00.000Z" };
const lgKind = new URLSearchParams(location.search).get("league");
const league = ({
  running: lgBase,
  upcoming: { ...lgBase, status: "upcoming", top: [], me: { rank: null, score: 0, next: null }, total: 0, finisher: { days: 20, label: "커피 쿠폰", myDays: 0 } },
  ended: { ...lgBase, status: "ended", me: { rank: 7, score: 41, next: null }, finisher: { days: 20, label: "커피 쿠폰", myDays: 21 } },
  first: { ...lgBase, me: { rank: 1, score: 64, next: null } },
  zero: { ...lgBase, top: [], prizes: [], finisher: null, me: { rank: null, score: 0, next: null }, total: 0 },
  staff: { ...lgBase, me: null, finisher: { days: 20, label: "커피 쿠폰" } },
  bad: { title: "", status: "what" },
})[lgKind] || null;
const groups = [{ title: "앱", items: [{ key: "settings", icon: "⚙️", title: "앱 설정", sub: "알림 · 홈 화면 추가 · 업데이트" }] }, { title: "안 쓰는 기능", items: [{ key: "labPopup", icon: "🧪", title: "새 팝업 (준비 중)", sub: "공지 · 시험 일정 · 단어 리그" }] }];
function App() {
  const [open, setOpen] = useState(false);
  window.__went = window.__went || [];
  return <div style={{ maxWidth: 600, margin: "0 auto", padding: 16, fontFamily: "'Pretendard Variable', 'Noto Sans CJK KR', sans-serif" }}>
    <MoreMenu groups={groups} onPick={(k) => { if (k === "labPopup") setOpen(true); }} />
    {open && <LabPopup pinnedMessages={notices} exam={exam} rangeText={empty ? "" : "교과서 7과 · 8과\n학교 프린트 2장"} doneTasks={1} totalTasks={empty ? 0 : 3} activeDate="2026-11-12" classLine="오늘 5시 등원" league={league}
      onClose={() => setOpen(false)} onGo={(k) => { window.__went.push(k); setOpen(false); }} />}
  </div>;
}
createRoot(document.getElementById("root")).render(<App />);
