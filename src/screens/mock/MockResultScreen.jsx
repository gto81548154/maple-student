import { TAP } from "../../theme/tokens.jsx";
import { useState } from "react";
import { MOCK_CIRCLED, mockRoundTitle } from "../../domain/mock.jsx";

// ─── 결과 화면: 점수·등급·듣기/독해·틀린 문항 (제출한 뒤에만 정답이 보인다) ───
export function MockResultScreen({ round, result, onDone }) {
  const [showAll, setShowAll] = useState(false);
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 18 };
  const wrong = Array.isArray(result.wrong) ? result.wrong : [];
  const ca = Array.isArray(result.correctAnswers) ? result.correctAnswers : [];
  const myMap = {};
  wrong.forEach(w => { myMap[w.n] = w; });
  const startN = result.noListening ? 18 : 1;
  return (
    <div>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#999" }}>{mockRoundTitle(round)}{result.noListening ? " · 듣기 제외" : ""}</div>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.2, marginTop: 4 }}>{result.score}<span style={{ fontSize: 22 }}>점</span></div>
        <span style={{ display: "inline-block", marginTop: 4, fontSize: 14, fontWeight: 800, background: "#e8f8f5", color: "#0b7a5c", padding: "4px 14px", borderRadius: 999 }}>{result.band}등급</span>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, background: "#f7f8fa", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11.5, color: "#999" }}>듣기{result.noListening ? " (만점 처리)" : ""}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{result.listenScore} / 37</div>
          </div>
          <div style={{ flex: 1, background: "#f7f8fa", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11.5, color: "#999" }}>독해</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{result.readScore} / 63</div>
          </div>
        </div>
        <div style={{ textAlign: "left", borderTop: "1px solid #f0f0f0", marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{wrong.length ? `틀린 문항 ${wrong.length}개` : "다 맞았어요! 🎉"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {wrong.map(w => (
              <span key={w.n} style={{ fontSize: 12.5, fontWeight: 700, background: "#ffecec", color: "#c0392b", padding: "4px 10px", borderRadius: 999 }}>{w.n}번 {w.type}{w.pts === 3 ? " · 3점" : ""}</span>
            ))}
          </div>
        </div>
        <button onClick={() => setShowAll(s => !s)} style={{ minHeight: TAP, marginTop: 14, border: "1px solid #e5e5e5", background: "#fff", color: "#666", fontSize: 13, fontWeight: 700, borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>
          {showAll ? "정답 접기" : "정답 전체 보기"}
        </button>
        {showAll && (
          <div style={{ textAlign: "left", marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
            {Array.from({ length: 45 - startN + 1 }, (_, i) => startN + i).map(n => {
              const w = myMap[n];
              const mine = w ? (w.my == null ? "—" : MOCK_CIRCLED[w.my]) : MOCK_CIRCLED[ca[n - 1]];
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "3px 0", color: w ? "#c0392b" : "#555" }}>
                  <span style={{ width: 26, textAlign: "right", fontWeight: 700 }}>{n}</span>
                  <span style={{ width: 60 }}>내 답 {mine}</span>
                  <span style={{ width: 60 }}>정답 {MOCK_CIRCLED[ca[n - 1]] || "?"}</span>
                  <span style={{ fontWeight: 800 }}>{w ? "✗" : "○"}</span>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onDone} style={{ minHeight: TAP, width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 12, border: "none", background: "#1C66A5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>확인</button>
      </div>
    </div>
  );
}
