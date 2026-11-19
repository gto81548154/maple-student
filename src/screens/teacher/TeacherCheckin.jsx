import { TAP, UI } from "../../theme/tokens.jsx";

// [181차수 원장 요청 11-19] 출근 기록 — 선생님이 [출근] 단추를 눌러 오늘 출근을 직접 적는다.
//   기록은 워커 /teacher/checkin 이 서버 시계·서버 날짜로 적는다(폰 시계를 바꿔도 소용없다). 지난 날은 못 고치고, 오늘 것만 [취소]할 수 있다.
//   서버가 home.checkin 을 내려줄 때만 보인다 — 옛 서버이거나 원장 화면이면 아무것도 안 그린다.
// 누른 시각(ISO)을 한국 시각 "17:52"로
export const fmtCheckinTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; }
};
// 오늘 출근 칸 — 홈 맨 위와 캘린더(오늘을 골랐을 때)에 같은 것을 그린다.
export function renderCheckinBox(C) {
  const { checkIn, checkinBusy, checkinMsg, home, today } = C;
  if (!home || home.checkin !== true) return null;
  const rec = home.checkins && home.checkins[today];
  return (
    <div data-testid="checkin-box" style={{ background: UI.card, border: `1px solid ${rec ? "#cfe9df" : UI.line}`, borderRadius: 14, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: rec ? UI.okFg : UI.sub }}>오늘 출근</div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: UI.text, marginTop: 3 }}>{rec ? `${fmtCheckinTime(rec.at)} 출근 기록됨` : "아직 기록 전이에요"}</div>
        {checkinMsg && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: UI.warnFg, marginTop: 4 }}>{checkinMsg}</div>}
      </div>
      {rec ? (
        <button type="button" disabled={checkinBusy} onClick={() => { if (window.confirm("오늘 출근 기록을 지울까요?")) checkIn(true); }}
          style={{ flexShrink: 0, minHeight: TAP, padding: "0 12px", borderRadius: 10, border: `1px solid ${UI.line}`, background: "#fff", color: UI.sub, fontSize: 12.5, fontWeight: 700, cursor: checkinBusy ? "wait" : "pointer", fontFamily: "inherit", opacity: checkinBusy ? 0.6 : 1 }}>취소</button>
      ) : (
        <button type="button" disabled={checkinBusy} onClick={() => checkIn(false)}
          style={{ flexShrink: 0, minHeight: TAP, padding: "0 18px", borderRadius: 10, border: "none", background: UI.navy, color: "#fff", fontSize: 14, fontWeight: 800, cursor: checkinBusy ? "wait" : "pointer", fontFamily: "inherit", opacity: checkinBusy ? 0.6 : 1 }}>{checkinBusy ? "기록 중…" : "출근"}</button>
      )}
    </div>
  );
}
