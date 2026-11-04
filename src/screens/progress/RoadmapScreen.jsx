import { useState } from "react";
import { computeRoadmap, stageLabel } from "../../domain/roadmap.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";
import { StudentProgressTree } from "./StudentProgressTree.jsx";

// ═══ [149차수] 더보기 → 마플 로드맵 ═══
//   위: "나는 지금 N단계" + 7칸 막대. 가운데: 줄(단어·구문·독해·문법)마다 책을 단계 순서로 가로 스크롤 — 끝낸 책 ✓, 지금 하는 책 "📍 지금 여기".
//   아래: 전부터 있던 "학습 진도"(교재별 진행 상황)를 그대로 붙인다. 커리큘럼 자료가 아직 안 오면(옛 워커) 위·가운데는 안내 한 줄만.
const ST = {
  done: { bg: UI.okBg, line: UI.okFg, fg: UI.okFg, tag: "✓ 끝냈어요" },
  current: { bg: UI.blueBg, line: UI.blue, fg: UI.blue, tag: "📍 지금 여기" },
  next: { bg: "#fff", line: "#B9C6DD", fg: UI.sub, tag: "다음 책" },
  locked: { bg: "#fff", line: UI.line, fg: UI.dim, tag: "" },
  none: { bg: "#F7F8FB", line: UI.line, fg: UI.dim, tag: "" },
};
export function RoadmapScreen({ student, todos, progressTree, curriculum }) {
  const rm = computeRoadmap({ curriculum, student, todos, progressTree });
  const [open, setOpen] = useState("");   // 눌러서 펼친 책 id
  const hasTree = !!(progressTree?.lanes || []).length;
  return (
    <div>
      {rm ? (
        <>
          {/* 내 위치 */}
          <div style={{ background: UI.navy, borderRadius: 18, padding: "18px 16px 16px", color: "#fff" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{student?.name || "나"}의 마플 로드맵</div>
            {rm.myStage ? (
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, lineHeight: 1.3 }}>나는 지금 <span style={{ color: "#FFD166" }}>{rm.myStage}단계</span>{rm.stageInfo?.range ? <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}> · {rm.stageInfo.range}</span> : null}</div>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, lineHeight: 1.4 }}>아직 시작 전이에요<br /><span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>선생님이 교재를 배정하면 내 위치가 찍혀요</span></div>
            )}
            {/* 7칸 막대 */}
            <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
              {rm.stages.map((s) => {
                const no = Number(s.no); const on = rm.myStage && no <= rm.myStage; const here = no === rm.myStage;
                return (
                  <div key={no} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                    <div style={{ height: 10, borderRadius: 5, background: here ? "#FFD166" : on ? "rgba(255,209,102,0.55)" : "rgba(255,255,255,0.18)", boxShadow: here ? "0 0 10px rgba(255,209,102,0.8)" : "none" }} />
                    <div style={{ fontSize: 10.5, fontWeight: here ? 800 : 600, color: here ? "#FFD166" : "rgba(255,255,255,0.6)", marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{no}단계</div>
                    {s.range && <div style={{ fontSize: 9.5, color: here ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.range}</div>}
                  </div>
                );
              })}
            </div>
            {rm.current.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 12px" }}>
                지금 하는 책 · {rm.current.map((b) => `${b.name} ${b.done}/${b.total}과`).join(" · ")}
              </div>
            )}
          </div>
          {/* 줄마다 책 */}
          {rm.lanes.map((lane) => (
            <div key={lane.key} style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 2px 8px" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: UI.text }}>{lane.name}</span>
                <span style={{ fontSize: 12, color: UI.dim }}>{lane.books.filter((b) => b.st === "done").length}/{lane.books.length}권 끝</span>
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}>
                {lane.books.map((b) => {
                  const s = ST[b.st] || ST.none; const isOpen = open === lane.key + ":" + b.id;
                  return (
                    <button key={b.id} type="button" onClick={() => setOpen(isOpen ? "" : lane.key + ":" + b.id)}
                      style={{ flex: "0 0 auto", width: 128, minHeight: TAP, textAlign: "left", background: s.bg, border: `1.5px solid ${s.line}`, borderRadius: 14, padding: "10px 10px 9px", cursor: "pointer", fontFamily: "inherit", scrollSnapAlign: "start", opacity: b.st === "none" ? 0.65 : 1, boxShadow: b.st === "current" ? "0 0 0 3px rgba(36,102,217,0.15)" : "none" }}>
                      <div style={{ display: "inline-block", fontSize: 10.5, fontWeight: 800, color: s.fg, background: b.st === "current" ? "#fff" : "rgba(0,0,0,0.04)", borderRadius: 6, padding: "1px 6px" }}>{stageLabel(b)}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: b.st === "none" || b.st === "locked" ? UI.sub : UI.text, marginTop: 6, lineHeight: 1.3, minHeight: 34, wordBreak: "keep-all" }}>{b.name}</div>
                      {s.tag ? <div style={{ fontSize: 11.5, fontWeight: 800, color: s.fg, marginTop: 4 }}>{s.tag}</div> : <div style={{ fontSize: 11.5, color: UI.dim, marginTop: 4 }}>{b.lessons ? `${b.lessons}과` : " "}</div>}
                      {b.st === "current" && (
                        <div style={{ height: 5, borderRadius: 3, background: "#D5E2F8", marginTop: 6, overflow: "hidden" }}><div style={{ width: `${b.pct}%`, height: "100%", background: UI.blue }} /></div>
                      )}
                      {isOpen && <div style={{ fontSize: 11.5, color: UI.sub, marginTop: 6, lineHeight: 1.5 }}>{b.total ? `${b.total}과 중 ${b.done}과 끝 (${b.pct}%)` : b.st === "none" ? "아직 배정 안 된 책이에요" : `${b.lessons || "?"}과`}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: UI.dim, margin: "6px 2px 0", lineHeight: 1.5 }}>✓ 끝낸 책 · 📍 지금 하는 책 · 흐린 책은 아직 배정 안 된 책이에요. 책을 누르면 몇 과까지 했는지 나와요.</div>
        </>
      ) : (
        <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: "18px 16px", fontSize: 13.5, color: UI.sub, lineHeight: 1.6, textAlign: "center" }}>
          🗺️ 1~7단계 로드맵은 준비 중이에요<br /><span style={{ fontSize: 12.5, color: UI.dim }}>선생님이 준비하면 내가 어느 단계인지 여기 보여요</span>
        </div>
      )}
      {/* 전부터 있던 교재별 진행 상황 */}
      {hasTree && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, margin: "20px 2px 8px" }}>교재별 진행 상황</div>
          <StudentProgressTree student={student} todos={todos} progressTree={progressTree} />
        </>
      )}
    </div>
  );
}
