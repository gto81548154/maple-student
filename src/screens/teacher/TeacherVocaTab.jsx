import { TAP } from "../../theme/tokens.jsx";
import { VocaFrame } from "../voca/VocaFrame.jsx";

// [122차수] 선생님 단어 탭 그리기. TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherVocaTab(C) {
  const { reloadHome, setVocaHwTask, setVocaMode, setVocaTask, vocaHwTask, vocaMode, vocaPickSrc, vocaSrc, vocaTask } = C;
  return (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[
                { key: "study", label: "내 단어장" },
                { key: "pick", label: "단어 선별" },
              ].map(m => (
                <button key={m.key} onClick={() => { setVocaMode(m.key); if (m.key === "pick") setVocaTask(null); }}
                  style={{minHeight: TAP, 
                    flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${vocaMode === m.key ? "#182848" : "#dfe3ef"}`,
                    background: vocaMode === m.key ? "#182848" : "#fff",
                    color: vocaMode === m.key ? "#fff" : "#7b8494",
                    fontSize: 13.5, fontWeight: 800,
                  }}>{m.label}</button>
              ))}
            </div>
            <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #eceef2" }}>
              {vocaMode === "pick"
                ? <VocaFrame title="단어 선별" src={vocaPickSrc} onPicked={reloadHome} />
                : <VocaFrame title="내 단어장" src={vocaSrc} openTask={vocaTask} onOpenTaskDone={() => setVocaTask(null)}
                    hwTask={vocaHwTask} onHwTaskDone={() => setVocaHwTask(null)} />}
            </div>
          </div>
  );
}
