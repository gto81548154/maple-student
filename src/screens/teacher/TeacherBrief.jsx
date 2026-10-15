import { TAP } from "../../theme/tokens.jsx";
import { buildTeacherDayBrief, computeTeacherDayRoster } from "../../domain/teacher.jsx";
import { fmtDateKR } from "../../domain/time.jsx";

// [122차수] 선생님 홈 — 오늘 수업 한눈에 보기(브리핑) 그리기. TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherBrief(C) {
  const { briefDay, cardBox, openStudent, roster, setBriefDay, today } = C;
          const brief = buildTeacherDayBrief(
            computeTeacherDayRoster(roster?.students || [], roster?.makeups || [], briefDay),
            briefDay,
            roster?.exams || []
          );
          const toneOf = (t) => (
            t === "today" ? { bg: "#fff", bd: "#c9b6f5", fg: "#5b21b6" } :
            t === "pin"   ? { bg: "#f3e8ff", bd: "#e2d3fb", fg: "#5b21b6" } :
            t === "hot"   ? { bg: "#fff0f0", bd: "#f7c9cd", fg: "#b03a2e" } :
            t === "warm"  ? { bg: "#fff8e1", bd: "#ffe4a1", fg: "#a45b00" } :
                            { bg: "#eef1ff", bd: "#d7dcfb", fg: "#2a4bb8" }
          );
          const nameBtn = (p, extra) => (
            <button key={p.id} onClick={() => openStudent(p)}
              style={{ minHeight: TAP, border: "none", background: "transparent", padding: "0 6px 0 0", margin: 0, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13.5, fontWeight: 700, color: "#1a1a2e", textAlign: "left", ...(extra || {}) }}>{p.name}</button>
          );
          return (
            <div>
              <button onClick={() => setBriefDay("")}
                style={{ minHeight: TAP, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", marginBottom: 12, borderRadius: 9, border: "1px solid #dfe3ef", background: "#fff", color: "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 홈</button>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: "#1a1a2e" }}>{fmtDateKR(briefDay)}</span>
                {briefDay === today && <span style={{ fontSize: 11, fontWeight: 800, color: "#1C66A5", background: "#eef1ff", borderRadius: 999, padding: "3px 9px" }}>오늘</span>}
              </div>

              {/* ① 오늘 챙길 것 */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "#7f8fa6", marginBottom: 8 }}>오늘 챙길 것</div>
              {brief.alerts.length === 0 ? (
                <div style={{ ...cardBox, cursor: "default", color: "#9aa0ab", fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
                  오늘은 특별히 챙길 것이 없습니다.
                </div>
              ) : (
                <div style={{ marginBottom: 18 }}>
                  {brief.alerts.map((a, i) => {
                    const c = toneOf(a.tone);
                    return (
                      <div key={`${a.kind}_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 12px", marginBottom: 7, borderRadius: 11, background: c.bg, border: `1px solid ${c.bd}` }}>
                        <span style={{ flexShrink: 0, fontSize: 13, lineHeight: 1.45 }}>{a.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: c.fg, lineHeight: 1.45, wordBreak: "keep-all" }}>{a.text}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", marginTop: 4 }}>
                            {a.names.map(p => nameBtn(p, { fontSize: 12.5, fontWeight: 700, color: "#5c6470" }))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ② 오는 순서 */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "#7f8fa6", marginBottom: 8 }}>오는 순서</div>
              {brief.slots.length === 0 ? (
                <div style={{ ...cardBox, cursor: "default", color: "#9aa0ab", fontSize: 13, fontWeight: 600 }}>이 날 수업하는 학생이 없습니다.</div>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #e8eaef", borderRadius: 14, overflow: "hidden" }}>
                  {brief.slots.map((sl, i) => (
                    <div key={sl.time} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #f1f3f7" }}>
                      <span style={{ flexShrink: 0, minWidth: 52, minHeight: TAP, display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 900, color: "#1C66A5" }}>{sl.time}</span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "6px 10px" }}>
                        {sl.rows.map(p => (
                          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {nameBtn(p)}
                            {p.kind !== "정규" && <span style={{ fontSize: 11, fontWeight: 800, color: "#a45b00", background: "#fff8e1", borderRadius: 999, padding: "2px 6px" }}>{p.kind}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 11.5, color: "#9aa0ab", fontWeight: 600, marginTop: 12 }}>이름을 누르면 그 학생의 앱 화면이 새 창으로 열립니다 (보기 전용).</div>
            </div>
          );
}
