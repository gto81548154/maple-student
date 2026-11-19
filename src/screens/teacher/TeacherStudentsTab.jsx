import { TAP, UI } from "../../theme/tokens.jsx";
import { HOLIDAYS } from "../../data/holidays.jsx";
import { fmtDateKR, shiftYmd } from "../../domain/time.jsx";

// [122차수] 선생님 학생 탭 그리기. TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherStudentsTab(C) {
  const { card, dateStr, home, openStudent, roll, roster, setDateStr, setStuQ, stuQ, today, toeicStuBusy, toggleToeicStudent } = C;
  // [185차수] 원장: 학생마다 토익 켜고 끄기 단추. 서버가 목록(home.toeicStudents)을 내려줄 때만 보인다(옛 서버·선생님 화면에는 없음).
  const toeicIds = home?.isOwner && Array.isArray(home.toeicStudents) ? home.toeicStudents.map(String) : null;
  const toeicBtn = (s) => {
    if (!toeicIds) return null;
    const on = toeicIds.includes(String(s.id)), wait = toeicStuBusy === String(s.id);
    return (
      <button type="button" disabled={!!toeicStuBusy} aria-pressed={on} aria-label={`${s.name} 토익 ${on ? "끄기" : "켜기"}`}
        onClick={() => { if (on ? window.confirm(`${s.name} 학생의 토익을 끌까요? 기록은 지워지지 않고, 다시 켜면 이어집니다.`) : window.confirm(`${s.name} 학생의 앱에 토익을 켤까요?`)) toggleToeicStudent(s, !on); }}
        style={{ flexShrink: 0, minHeight: TAP, minWidth: 68, marginBottom: 8, padding: "0 10px", borderRadius: 12, border: `1px solid ${on ? "#6b3fa0" : UI.line}`, background: on ? "#f3eefa" : "#fff", color: on ? "#6b3fa0" : UI.sub, fontSize: 12, fontWeight: 800, cursor: toeicStuBusy ? "wait" : "pointer", fontFamily: "inherit", opacity: wait ? 0.5 : 1 }}>
        {wait ? "…" : on ? "토익 켬" : "토익 끔"}
      </button>
    );
  };
  const row = (key, s, body) => toeicIds ? <div key={key} style={{ display: "flex", alignItems: "stretch", gap: 6 }}><div style={{ flex: 1, minWidth: 0 }}>{body}</div>{toeicBtn(s)}</div> : body;
  // [184차수] 원장: 이름으로 전체 학생 찾기(예전 마스터 홈의 학생 탭). 찾는 글자가 있으면 날짜별 명단 대신 찾은 학생이 나온다.
  const kw = String(stuQ || "").trim().toLowerCase();
  const found = kw ? (roster?.students || []).filter(s => String(s.name || "").toLowerCase().includes(kw)) : [];
  return (
          <div>
            {home?.isOwner && (
              <input value={stuQ} onChange={(e) => setStuQ(e.target.value)} placeholder="학생 이름 검색 (전체 학생)" aria-label="학생 이름 검색"
                style={{ width: "100%", minHeight: TAP, padding: "10px 14px", fontSize: 15, border: `1px solid ${UI.line}`, borderRadius: 10, boxSizing: "border-box", background: "#fff", outline: "none", marginBottom: 12, fontFamily: "inherit", color: UI.text }} />
            )}
            {kw ? (
              <div>
                <div style={{ fontSize: 12.5, color: UI.dim, marginBottom: 10 }}>이름을 누르면 그 학생의 앱 화면이 열립니다 (보기 전용).</div>
                {found.length === 0 && <div style={{ padding: 34, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>일치하는 학생이 없습니다.</div>}
                {found.map((s) => row(s.id, s,
                  <button key={s.id} onClick={() => openStudent(s)} style={card}>
                    <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: "#eef1f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: UI.sub }}>{String(s.name || "?")[0]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: UI.text }}>{s.name}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: UI.dim, marginTop: 2 }}>{[s.school || s.schoolName, s.grade].filter(Boolean).join(" ")}</span>
                    </span>
                    <span style={{ flexShrink: 0, color: "#c8cdd8", fontSize: 15 }}>›</span>
                  </button>
                ))}
              </div>
            ) : (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setDateStr(d => shiftYmd(d, -1))} style={{ minHeight: TAP, minWidth: TAP, flexShrink: 0, padding: "9px 13px", borderRadius: 10, border: `1px solid ${UI.line}`, background: "#fff", color: UI.sub, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>◀</button>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: UI.text }}>{fmtDateKR(dateStr)}</div>
                <div style={{ fontSize: 11.5, color: UI.dim, marginTop: 2 }}>
                  {dateStr === today ? "오늘" : dateStr < today ? "지난 날" : "앞으로"}
                  {HOLIDAYS[dateStr] ? ` · ${HOLIDAYS[dateStr]}` : ""}
                </div>
              </div>
              <button onClick={() => setDateStr(d => shiftYmd(d, 1))} style={{ minHeight: TAP, minWidth: TAP, flexShrink: 0, padding: "9px 13px", borderRadius: 10, border: `1px solid ${UI.line}`, background: "#fff", color: UI.sub, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>▶</button>
            </div>
            {dateStr !== today && (
              <button onClick={() => setDateStr(today)} style={{ minHeight: TAP, width: "100%", marginBottom: 12, padding: "9px 12px", borderRadius: 10, border: "1px solid #cfe0f5", background: UI.blueBg, color: UI.blue, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>오늘로 돌아가기</button>
            )}
            <div style={{ fontSize: 12.5, color: UI.dim, marginBottom: 10 }}>이름을 누르면 그 학생의 앱 화면이 열립니다 (보기 전용).</div>
            {roll.length === 0
              ? <div style={{ padding: 34, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>이 날 수업하는 학생이 없습니다.</div>
              : roll.map(({ student: s, time, kind }) => row(s.id, s,
                <button key={s.id} onClick={() => openStudent(s)} style={card}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: "#eef1f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: UI.sub }}>{String(s.name || "?")[0]}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: UI.text }}>
                      {s.name}
                      {kind !== "정규" && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "#b45309", background: "#fef3e7", padding: "2px 7px", borderRadius: 999 }}>{kind}</span>}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: UI.dim, marginTop: 2 }}>{[s.school || s.schoolName, s.grade].filter(Boolean).join(" ")}</span>
                  </span>
                  {time && <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: UI.blue, background: UI.blueBg, padding: "4px 9px", borderRadius: 8 }}>{time}</span>}
                  <span style={{ flexShrink: 0, color: "#c8cdd8", fontSize: 15 }}>›</span>
                </button>
              ))}
            </>)}
          </div>
  );
}
