import { useState } from "react";
import { teacherUrl } from "../../core/auth.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";

// [181차수 원장 요청 11-19] 출근 기록 — 선생님이 [출근] 단추를 눌러 오늘 출근을 직접 적는다.
//   기록은 워커 /teacher/checkin 이 서버 시계·서버 날짜로 적는다(폰 시계를 바꿔도 소용없다). 선생님은 지난 날을 못 고치고, 오늘 것만 [취소]할 수 있다.
//   서버가 home.checkin 을 내려줄 때만 보인다 — 옛 서버이거나 원장 화면이면 아무것도 안 그린다.
// [182차수] 퇴근 기록 · 원장이 고치기 · 달별 모아보기 추가(서버가 home.checkinV >= 2 일 때).
//   하루 기록 = { at: 출근, out?: 퇴근, fix?: 원장이 적거나 고친 기록 }
// 누른 시각(ISO)을 한국 시각 "17:52"로
export const fmtCheckinTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; }
};
// 출근~퇴근 사이 분. 퇴근이 없으면 0.
export const checkinMinutes = (rec) => {
  if (!rec || !rec.at || !rec.out) return 0;
  const m = Math.round((new Date(rec.out).getTime() - new Date(rec.at).getTime()) / 60000);
  return Number.isFinite(m) && m > 0 ? m : 0;
};
export const fmtMinutes = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`; };
// "17:52" 또는 "17:52–22:05"
export const fmtCheckinSpan = (rec) => rec ? (rec.out ? `${fmtCheckinTime(rec.at)}–${fmtCheckinTime(rec.out)}` : fmtCheckinTime(rec.at)) : "";

// 오늘 출근 칸 — 홈 맨 위와 캘린더(오늘을 골랐을 때)에 같은 것을 그린다.
export function renderCheckinBox(C) {
  const { checkIn, checkinBusy, checkinMsg, home, today } = C;
  if (!home || home.checkin !== true) return null;
  const rec = home.checkins && home.checkins[today];
  const canOut = Number(home.checkinV) >= 2;
  const small = { flexShrink: 0, minHeight: TAP, padding: "0 12px", borderRadius: 10, border: `1px solid ${UI.line}`, background: "#fff", color: UI.sub, fontSize: 12.5, fontWeight: 700, cursor: checkinBusy ? "wait" : "pointer", fontFamily: "inherit", opacity: checkinBusy ? 0.6 : 1 };
  const big = { flexShrink: 0, minHeight: TAP, padding: "0 18px", borderRadius: 10, border: "none", background: UI.navy, color: "#fff", fontSize: 14, fontWeight: 800, cursor: checkinBusy ? "wait" : "pointer", fontFamily: "inherit", opacity: checkinBusy ? 0.6 : 1 };
  return (
    <div data-testid="checkin-box" style={{ background: UI.card, border: `1px solid ${rec ? "#cfe9df" : UI.line}`, borderRadius: 14, padding: "11px 14px", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: rec ? UI.okFg : UI.sub }}>오늘 출근{rec && rec.fix ? " · 원장님이 적음" : ""}</div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: UI.text, marginTop: 3 }}>
          {!rec ? "아직 기록 전이에요" : rec.out ? `${fmtCheckinTime(rec.at)} 출근 · ${fmtCheckinTime(rec.out)} 퇴근` : `${fmtCheckinTime(rec.at)} 출근 기록됨`}
        </div>
        {rec && rec.out && <div style={{ fontSize: 12, fontWeight: 700, color: UI.sub, marginTop: 2 }}>{fmtMinutes(checkinMinutes(rec))} 근무</div>}
        {checkinMsg && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: UI.warnFg, marginTop: 4 }}>{checkinMsg}</div>}
      </div>
      {!rec && <button type="button" disabled={checkinBusy} onClick={() => checkIn("in")} style={big}>{checkinBusy ? "기록 중…" : "출근"}</button>}
      {rec && !rec.out && <button type="button" disabled={checkinBusy} onClick={() => { if (window.confirm("오늘 출근 기록을 지울까요?")) checkIn("undo"); }} style={small}>취소</button>}
      {rec && !rec.out && canOut && <button type="button" disabled={checkinBusy} onClick={() => checkIn("out")} style={big}>{checkinBusy ? "기록 중…" : "퇴근"}</button>}
      {rec && rec.out && <button type="button" disabled={checkinBusy} onClick={() => { if (window.confirm("퇴근 기록을 지울까요? 출근 기록은 그대로 남아요.")) checkIn("undoOut"); }} style={small}>퇴근 취소</button>}
    </div>
  );
}

// ─── [182차수] 원장 캘린더 — 고른 날의 선생님 출근 기록(고치기) + 그 달 모아보기 ───
//   고치기는 원장만(워커 /teacher/checkin-edit 이 원장 링크만 받는다). 미래 날짜는 못 적는다.
//   시각은 24시간으로 넣는다(예: 저녁 6시 = 18:00).
export function OwnerCheckinPanel({ home, setHome, calSel, calYm, today }) {
  const [edit, setEdit] = useState(null);   // { id, in, out }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const staff = Array.isArray(home?.staffCheckins) ? home.staffCheckins : null;
  if (!home?.isOwner || !staff) return null;
  const canEdit = Number(home.checkinV) >= 2 && calSel <= today;
  // 그 날: 지금 있는 선생님 전부 + (계정은 없어졌지만) 그 날 기록이 있는 사람
  const dayRows = staff.filter(x => x && (!x.gone || (x.days && x.days[calSel])));
  const ymPrefix = `${calYm.y}-${String(calYm.m + 1).padStart(2, "0")}-`;
  const monthRows = staff.map(x => {
    const days = Object.keys(x.days || {}).filter(d => d.startsWith(ymPrefix));
    return { id: x.id, name: x.name, n: days.length, min: days.reduce((a, d) => a + checkinMinutes(x.days[d]), 0), noOut: days.filter(d => !x.days[d].out).length };
  }).filter(r => r.n > 0 || !staff.find(x => x.id === r.id)?.gone);
  const save = async (body) => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(teacherUrl("/teacher/checkin-edit"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.success) throw new Error((j && j.error) || "");
      setHome(prev => prev ? { ...prev, staffCheckins: (prev.staffCheckins || []).map(x => String(x.id) === String(j.teacherId) ? { ...x, days: j.days || {} } : x) } : prev);
      setEdit(null);
    } catch (e) {
      setMsg(e && e.message && !(e instanceof TypeError) ? `저장하지 못했어요: ${e.message}` : "저장하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally { setBusy(false); }
  };
  const inp = { minHeight: TAP, padding: "0 8px", borderRadius: 9, border: `1px solid ${UI.line}`, fontFamily: "inherit", fontSize: 14, color: UI.text, background: "#fff" };
  const btn = (primary) => ({ minHeight: TAP, padding: "0 12px", borderRadius: 9, border: primary ? "none" : `1px solid ${UI.line}`, background: primary ? UI.navy : "#fff", color: primary ? "#fff" : UI.sub, fontSize: 12.5, fontWeight: 800, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 });
  return (
    <div data-testid="owner-checkin">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: UI.sub, marginBottom: 6 }}>선생님 출근 기록</div>
        {dayRows.length === 0 && <div style={{ fontSize: 13, color: UI.dim }}>선생님 계정이 없습니다.</div>}
        {dayRows.map(x => {
          const rec = x.days && x.days[calSel];
          const open = edit && edit.id === x.id;
          return (
            <div key={x.id} style={{ borderTop: `1px solid ${UI.line}`, padding: "7px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: UI.text }}>{x.name || "이름 없음"}{rec && rec.fix && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: UI.sub }}>고침</span>}</span>
                {rec
                  ? <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: UI.okFg, background: UI.okBg, padding: "3px 8px", borderRadius: 8 }}>{fmtCheckinSpan(rec)}</span>
                  : <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: UI.dim }}>기록 없음</span>}
                {canEdit && !x.gone && !open && <button type="button" onClick={() => { setMsg(""); setEdit({ id: x.id, in: rec ? fmtCheckinTime(rec.at) : "", out: rec && rec.out ? fmtCheckinTime(rec.out) : "" }); }} style={btn(false)}>고치기</button>}
              </div>
              {open && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: UI.bg }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: UI.sub }}>출근 <input type="time" value={edit.in} onChange={e => setEdit({ ...edit, in: e.target.value })} style={inp} aria-label={`${x.name} 출근 시각`} /></label>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: UI.sub }}>퇴근 <input type="time" value={edit.out} onChange={e => setEdit({ ...edit, out: e.target.value })} style={inp} aria-label={`${x.name} 퇴근 시각`} /></label>
                  </div>
                  <div style={{ fontSize: 11.5, color: UI.sub, marginTop: 6 }}>퇴근은 비워 둘 수 있어요.</div>
                  {msg && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: UI.warnFg, marginTop: 6 }}>{msg}</div>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <button type="button" disabled={busy || !edit.in} onClick={() => save({ teacherId: x.id, date: calSel, in: edit.in, out: edit.out || null })} style={{ ...btn(true), opacity: busy || !edit.in ? 0.5 : 1 }}>저장</button>
                    {rec && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`${x.name || "이 선생님"}의 이 날 기록을 지울까요?`)) save({ teacherId: x.id, date: calSel, in: null }); }} style={{ ...btn(false), color: UI.warnFg }}>기록 지우기</button>}
                    <button type="button" disabled={busy} onClick={() => { setEdit(null); setMsg(""); }} style={btn(false)}>닫기</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${UI.line}`, paddingTop: 11, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: UI.sub, marginBottom: 6 }}>{calYm.m + 1}월 선생님 출근 모음</div>
        {monthRows.length === 0 && <div style={{ fontSize: 13, color: UI.dim }}>이 달 기록이 없습니다.</div>}
        {monthRows.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 0", borderTop: `1px solid ${UI.line}` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: UI.text }}>{r.name || "이름 없음"}</span>
            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: UI.text }}>{r.n}일</span>
            <span style={{ flexShrink: 0, minWidth: 92, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: UI.sub }}>{r.min ? fmtMinutes(r.min) : "–"}{r.noOut > 0 && r.n > 0 ? ` · 퇴근 없음 ${r.noOut}` : ""}</span>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: UI.dim, marginTop: 6 }}>시간은 퇴근까지 적힌 날만 더합니다.</div>
      </div>
    </div>
  );
}
