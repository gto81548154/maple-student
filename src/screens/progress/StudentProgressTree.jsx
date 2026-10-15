import { useMemo } from "react";
import { computeTreeProgressForStudent, effectiveTreeDone } from "../../domain/progress.jsx";

export function StudentProgressTree({ student, todos, progressTree }) {
  const G = { bg: "linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)", tile: "#1d2b4e", tileDim: "#172441", glow: "#4aa3e8", gold: "#ffd166", text: "#e9edff", dim: "#8fa3c8" };
  const sid = student?.id;
  const prog = useMemo(() => computeTreeProgressForStudent(sid, todos, progressTree), [sid, todos, progressTree]);
  const ovrMap = (progressTree?.ovr || {})[String(sid)] || (progressTree?.ovr || {})[sid] || {};
  const getOvr = (nid) => ovrMap[nid] || null;

  const nodeInfo = (node, idx, nodes) => {
    const matched = prog.units[node.id] ? prog.units[node.id].size : 0;
    const done = effectiveTreeDone(node, matched, getOvr(node.id));
    const total = node.total || 0;
    let st;
    if (total > 0 && done >= total) st = "done";
    else if (done > 0) st = "current";
    else {
      const prev = nodes[idx - 1];
      if (!prev) st = "next";
      else {
        const pm = prog.units[prev.id] ? prog.units[prev.id].size : 0;
        st = effectiveTreeDone(prev, pm, getOvr(prev.id)) >= (prev.total || 0) ? "next" : "locked";
      }
    }
    return { done, total, st, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  let sumDone = 0, sumTotal = 0, doneBooks = 0;
  (progressTree?.lanes || []).forEach(l => (l.nodes || []).forEach((n, i, arr) => {
    const info = nodeInfo(n, i, arr);
    sumDone += Math.min(info.done, info.total); sumTotal += info.total;
    if (info.st === "done") doneBooks += 1;
  }));
  const overall = sumTotal ? Math.round((sumDone / sumTotal) * 100) : 0;

  return (
    <div style={{ background: G.bg, borderRadius: 16, padding: "20px 16px", color: G.text, border: "1px solid #2a3a66" }}>
      <style>{`@keyframes mplTreePulse{0%{box-shadow:0 0 0 0 rgba(74,163,232,.5)}70%{box-shadow:0 0 0 12px rgba(74,163,232,0)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 900, fontSize: 16 }}>{String(student?.name || "").split("-")[0]}의 스킬트리</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: G.gold, border: `1px solid ${G.gold}66`, borderRadius: 8, padding: "2px 9px" }}>LV.{doneBooks} · 정복 {doneBooks}권</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, height: 9, borderRadius: 6, background: "#0a0f28", overflow: "hidden" }}>
          <div style={{ width: `${overall}%`, height: "100%", background: `linear-gradient(90deg,#1C66A5,#4aa3e8,${G.gold})`, transition: "width .4s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 900, color: G.glow }}>{overall}%</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {(progressTree?.lanes || []).map(lane => (
          <div key={lane.id}>
            <div style={{ fontWeight: 900, fontSize: 12, color: G.dim, letterSpacing: 2, marginBottom: 9 }}>{lane.name}</div>
            {/* [수정 07-31] 칸 사이 연결선을 없앴다. 줄바꿈되면 새 줄 맨 앞에도 선이 붙어
                아무것도 잇지 않는 선이 허공에 떴기 때문. 대신 columnGap으로 칸 사이를 띄운다. */}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 12, columnGap: 10 }}>
              {(lane.nodes || []).map((n, i) => {
                const info = nodeInfo(n, i, lane.nodes);
                return (
                  <div key={n.id} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{
                      width: 104, padding: "11px 8px", borderRadius: 13, textAlign: "center", position: "relative",
                      background: info.st === "locked" ? G.tileDim : G.tile,
                      border: `1.5px solid ${info.st === "done" ? G.gold : info.st === "current" ? (lane.color || G.glow) : info.st === "next" ? "#33477e" : "#22335f"}`,
                      boxShadow: info.st === "done" ? `0 0 14px ${G.gold}55` : info.st === "current" ? `0 0 16px ${(lane.color || G.glow)}66` : "none",
                      animation: info.st === "current" ? "mplTreePulse 2.2s infinite" : "none",
                      opacity: info.st === "locked" ? 0.5 : 1,
                    }}>
                      <div style={{ fontWeight: 900, fontSize: 11.5, color: info.st === "done" ? G.gold : G.text, lineHeight: 1.3, minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{n.name}</div>
                      {info.st === "done" && <div aria-hidden="true" style={{ position: "absolute", top: -9, right: -9, width: 36, height: 36, borderRadius: "50%", border: "2.5px solid #E24B4A", background: "#1a1a2e", color: "#ff6b6a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, transform: "rotate(-14deg)", letterSpacing: 0.5 }}>PASS</div>}
                      {info.st === "done" && <div style={{ fontSize: 11, fontWeight: 900, color: G.gold, marginTop: 4 }}>정복 완료</div>}
                      {info.st === "current" && (<>
                        <div style={{ height: 6, borderRadius: 4, background: "#0a0f28", marginTop: 6, overflow: "hidden" }}>
                          <div style={{ width: `${info.pct}%`, height: "100%", background: `linear-gradient(90deg, ${lane.color || "#1C66A5"}, #4aa3e8)`, transition: "width .4s" }} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 900, color: G.glow, marginTop: 4 }}>{info.done}/{info.total} · {info.pct}%</div>
                      </>)}
                      {info.st === "next" && <div style={{ fontSize: 11, fontWeight: 900, color: "#7f97c6", marginTop: 4, letterSpacing: 1 }}>NEXT</div>}
                      {info.st === "locked" && <div style={{ fontSize: 11, fontWeight: 900, color: "#4e618f", marginTop: 4, letterSpacing: 1 }}>LOCKED</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: G.dim, fontWeight: 600 }}>진도는 학원 수업 기록으로 자동 계산돼요. 궁금한 건 선생님께!</div>
    </div>
  );
}
