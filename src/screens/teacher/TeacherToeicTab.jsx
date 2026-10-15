import { TAP } from "../../theme/tokens.jsx";
import { OwnerToeicP5 } from "../toeic/OwnerToeicP5.jsx";
import { OwnerToeicPanel } from "../toeic/OwnerToeicPanel.jsx";

// [122차수] 원장 토익 탭 그리기. TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherToeicTab(C) {
  const { setToeicMode, setToeicPick, toeic, toeicMode, toeicPick } = C;
  return (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[{ key: "tests", label: "회차 (LC·RC)" }, { key: "p5", label: "파트5 5문제" }].map(m => (
                <button key={m.key} onClick={() => setToeicMode(m.key)} style={{minHeight: TAP, 
                  flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 800,
                  border: `1px solid ${toeicMode === m.key ? "#182848" : "#dfe3ef"}`, background: toeicMode === m.key ? "#182848" : "#fff", color: toeicMode === m.key ? "#fff" : "#7b8494",
                }}>{m.label}</button>
              ))}
            </div>
            {toeicMode === "p5"
              ? <OwnerToeicP5 toeic={toeic} />
              : <OwnerToeicPanel toeic={toeic} pickId={toeicPick} onPicked={() => setToeicPick("")} />}
          </div>
  );
}
