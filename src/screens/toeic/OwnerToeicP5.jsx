import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useState } from "react";
import { teacherUrl } from "../../core/auth.jsx";
import { TOEIC_P5_TYPES, pickToeicP5, toeicP5Stats } from "../../domain/toeic.jsx";

// ═══ [116차수] 파트5 5문제씩 ═══
//   문제 = R2 toeic/p5.json (ETS 1~4권 RC 파트5 1,200문항, 정답·한 줄 해설·유형). 한 번 받으면 앱을 끌 때까지 다시 안 받는다.
//   고르는 순서: ① 지난번 틀린 문제(최대 2개) ② 아직 안 푼 문제(3→2→1→4권 순서) ③ 다 풀었으면 맞힌 적 적은 것부터
let TOEIC_P5_CACHE = null;
export function OwnerToeicP5({ toeic }) {
  const { p5, saveP5 } = toeic;
  const [all, setAll] = useState(TOEIC_P5_CACHE);
  const [loadErr, setLoadErr] = useState("");
  const [type, setType] = useState("전체");
  const [set, setSet] = useState(null);        // 이번 5문제
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState("");    // 고른 보기 글자
  const [results, setResults] = useState([]);  // [{id, ok}]
  useEffect(() => {
    if (TOEIC_P5_CACHE) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch(teacherUrl("/files/toeic/p5.json"));
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (!Array.isArray(d)) throw new Error("모양");
        TOEIC_P5_CACHE = d; if (!dead) setAll(d);
      } catch (e) { if (!dead) setLoadErr("파트5 문제를 못 받아왔어요 — 인터넷을 확인하고 다시 열어 주세요"); }
    })();
    return () => { dead = true; };
  }, []);
  const start = (ty = type) => {
    const s = pickToeicP5(all, p5, ty, 5);
    setSet(s); setIdx(0); setPicked(""); setResults([]);
  };
  const stats = toeicP5Stats(p5);
  const cardBox = { background: "#fff", border: "1px solid #e8eaef", borderRadius: 14, padding: "13px 14px" };
  const btn = (bg, fg, bd) => ({ display: "block", width: "100%", minHeight: TAP, padding: "12px 0", borderRadius: 10, fontSize: 14.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${bd || bg}`, background: bg, color: fg });

  if (loadErr) return <div style={{ ...cardBox, color: "#6b3fa0", fontSize: 13, fontWeight: 700 }}>{loadErr}</div>;
  if (!all) return <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>파트5 문제 불러오는 중...</div>;

  // 시작 화면
  if (!set) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1f7a4d" }}>파트5 5문제씩</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#1a1a2e", marginTop: 6 }}>푼 문제 {stats.done} / {all.length}</div>
          <div style={{ fontSize: 12, color: "#9aa0ab", fontWeight: 700, marginTop: 4 }}>다시 볼 문제(최근에 틀림) {stats.wrongNow}개 · 틀린 문제가 먼저 나와요</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {TOEIC_P5_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} style={{ minHeight: TAP, padding: "7px 11px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
              border: `1px solid ${type === t ? "#1f7a4d" : "#dfe3ef"}`, background: type === t ? "#1f7a4d" : "#fff", color: type === t ? "#fff" : "#7b8494" }}>{t}</button>
          ))}
        </div>
        <button onClick={() => start()} style={btn("#1f7a4d", "#fff")}>▶ 5문제 시작</button>
      </div>
    );
  }
  if (!set.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...cardBox, fontSize: 13.5, fontWeight: 700, color: "#4a5060" }}>이 유형에는 풀 문제가 없어요.</div>
        <button onClick={() => setSet(null)} style={btn("#fff", "#6b3fa0", "#6b3fa0")}>처음으로</button>
      </div>
    );
  }
  // 5문제 끝
  if (idx >= set.length) {
    const okN = results.filter(r => r.ok).length;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...cardBox, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1f7a4d" }}>끝났어요</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#1a1a2e", marginTop: 6 }}>{okN} / {set.length}</div>
          <div style={{ fontSize: 12, color: "#9aa0ab", fontWeight: 700, marginTop: 4 }}>틀린 문제는 다음 5문제에 먼저 다시 나와요</div>
        </div>
        <button onClick={() => start()} style={btn("#1f7a4d", "#fff")}>▶ 5문제 더</button>
        <button onClick={() => setSet(null)} style={btn("#fff", "#6b3fa0", "#6b3fa0")}>그만하기</button>
      </div>
    );
  }
  const q = set[idx];
  const answered = !!picked;
  const pick = (L) => {
    if (answered) return;
    const ok = L === q.a;
    setPicked(L); setResults(prev => [...prev, { id: q.id, ok }]);
    saveP5(q.id, ok);
  };
  const parts = String(q.q || "").split("-------");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1f7a4d" }}>{idx + 1} / {set.length}</span>
        <span style={{ fontSize: 11.5, color: "#9aa0ab", fontWeight: 700 }}>{q.v}권 TEST {String(q.t).padStart(2, "0")} · {q.n}번 · {q.type}</span>
        {p5[q.id] && p5[q.id].last === "X" && !answered && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "#6b3fa0" }}>지난번에 틀린 문제</span>}
      </div>
      <div style={{ ...cardBox, fontSize: 16, lineHeight: 1.6, fontWeight: 600, color: "#1a1a2e" }}>
        {parts.map((p, i) => (
          <span key={i}>{p}{i < parts.length - 1 && (
            <span style={{ display: "inline-block", minWidth: 70, borderBottom: "2px solid #1a1a2e", textAlign: "center", fontWeight: 900, color: answered ? "#1f7a4d" : "transparent" }}>
              {answered ? q.c["ABCD".indexOf(q.a)] : "_"}
            </span>)}</span>
        ))}
      </div>
      {q.c.map((c, i) => {
        const L = "ABCD"[i];
        const isAns = answered && L === q.a;
        const isMine = answered && L === picked && L !== q.a;
        return (
          <button key={L} onClick={() => pick(L)} style={{minHeight: TAP, 
            display: "flex", gap: 10, alignItems: "center", textAlign: "left", width: "100%", padding: "12px 14px", borderRadius: 12, fontFamily: "inherit",
            fontSize: 15, fontWeight: 700, cursor: answered ? "default" : "pointer",
            border: `1.5px solid ${isAns ? "#1f7a4d" : isMine ? "#6b3fa0" : "#dfe3ef"}`,
            background: isAns ? "#e3f3ea" : isMine ? "#f3eefa" : "#fff", color: "#1a1a2e",
          }}>
            <span style={{ fontWeight: 900, color: isAns ? "#1f7a4d" : isMine ? "#6b3fa0" : "#9aa0ab" }}>({L})</span>
            <span style={{ flex: 1 }}>{c}</span>
            {isAns && <span style={{ fontSize: 12, fontWeight: 900, color: "#1f7a4d" }}>정답</span>}
            {isMine && <span style={{ fontSize: 12, fontWeight: 900, color: "#6b3fa0" }}>내 답</span>}
          </button>
        );
      })}
      {answered && (
        <div style={{ ...cardBox, background: picked === q.a ? "#f2fbf7" : "#f8f5fc", border: `1px solid ${picked === q.a ? "#cfe9df" : "#e3d8f1"}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: picked === q.a ? "#1f7a4d" : "#6b3fa0" }}>{picked === q.a ? "맞았어요" : `틀렸어요 · 정답 (${q.a})`}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2a2a28", marginTop: 6, lineHeight: 1.55 }}>{q.why}</div>
        </div>
      )}
      {answered && <button onClick={() => { setIdx(idx + 1); setPicked(""); }} style={btn("#1f7a4d", "#fff")}>{idx + 1 < set.length ? "다음 문제 ›" : "결과 보기 ›"}</button>}
    </div>
  );
}
