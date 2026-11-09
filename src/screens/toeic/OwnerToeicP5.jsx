import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useRef, useState } from "react";
import { teacherUrl } from "../../core/auth.jsx";
import { TOEIC_P5_TYPES, pickToeicP5, toeicP5Stats, toeicP5TypeStats } from "../../domain/toeic.jsx";

// ═══ [116차수] 파트5 5문제씩 ═══
//   문제 = R2 toeic/p5.json (ETS 1~4권 RC 파트5 1,200문항, 정답·한 줄 해설·유형). 한 번 받으면 앱을 끌 때까지 다시 안 받는다.
//   고르는 순서: ① 지난번 틀린 문제(최대 2개) ② 아직 안 푼 문제(3→2→1→4권 순서) ③ 다 풀었으면 맞힌 적 적은 것부터
let TOEIC_P5_CACHE = null;
export function OwnerToeicP5({ toeic }) {
  const { p5, saveP5, loaded } = toeic;
  const [all, setAll] = useState(TOEIC_P5_CACHE);
  const [loadErr, setLoadErr] = useState("");
  const [type, setType] = useState("전체");
  const [mode, setMode] = useState("practice");
  const [answering, setAnswering] = useState(false);
  const [answerErr, setAnswerErr] = useState("");
  const [set, setSet] = useState(null);        // 이번 5문제
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState("");    // 고른 보기 글자
  const pickBusy = useRef(false);
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
  const start = (nextMode = 'practice') => {
    const s = pickToeicP5(all, p5, type, 5, [], nextMode);
    pickBusy.current = false;
    setMode(nextMode); setAnswering(false); setAnswerErr('');
    setSet(s); setIdx(0); setPicked(''); setResults([]);
  };
  const stats = toeicP5Stats(p5, all);
  const selected = toeicP5Stats(p5, all, type);
  const typeStats = toeicP5TypeStats(all, p5);
  const reviewCount = Math.min(5, selected.wrongNow);
  const cardBox = { background: "#fff", border: "1px solid #e8eaef", borderRadius: 14, padding: "13px 14px" };
  const btn = (bg, fg, bd) => ({ display: "block", width: "100%", minHeight: TAP, padding: "12px 0", borderRadius: 10, fontSize: 14.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${bd || bg}`, background: bg, color: fg });

  if (loadErr) return <div style={{ ...cardBox, color: "#6b3fa0", fontSize: 13, fontWeight: 700 }}>{loadErr}</div>;
  if (!all) return <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>파트5 문제 불러오는 중...</div>;

  if (loaded === false) return <div style={cardBox}>학습 기록을 불러오는 중이에요...</div>;

  // 시작 화면: 유형별 누적 정답률과 최근 답이 오답인 문제를 구분한다.
  if (!set) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1f7a4d' }}>파트5 · RC 읽기</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#1a1a2e', marginTop: 6 }}>푼 문제 {stats.done} / {all.length}</div>
          <div style={{ fontSize: 13, color: '#4a5060', fontWeight: 700, marginTop: 7 }}>누적 정답률 {stats.accuracy == null ? '—' : stats.accuracy + '%'} · 복습할 오답 {stats.wrongNow}개</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="문제 유형 선택">
          {TOEIC_P5_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} aria-pressed={type === t} style={{ minHeight: TAP, padding: '7px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
              border: '1px solid ' + (type === t ? '#1f7a4d' : '#dfe3ef'), background: type === t ? '#1f7a4d' : '#fff', color: type === t ? '#fff' : '#7b8494' }}>{t}</button>
          ))}
        </div>
        <div style={{ ...cardBox, background: '#f8fafc' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 9 }}>{type} · 복습할 오답 {selected.wrongNow}개</div>
          <button onClick={() => start('practice')} style={btn('#1f7a4d', '#fff')}>▶ 5문제 시작</button>
          <button disabled={!reviewCount} onClick={() => start('wrong')} style={{ ...btn('#fff', '#6b3fa0', '#6b3fa0'), marginTop: 8, opacity: reviewCount ? 1 : 0.5, cursor: reviewCount ? 'pointer' : 'default' }}>
            {reviewCount ? '오답만 ' + reviewCount + '문제 복습' : '복습할 오답이 없어요'}
          </button>
          <div style={{ fontSize: 12, color: '#647084', lineHeight: 1.6, marginTop: 8 }}>오답 복습은 마지막에 틀린 문제만 나와요. 다시 맞히면 복습 목록에서 빠져요.</div>
        </div>
        <section aria-label="유형별 정답률" style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#1a1a2e' }}>유형별 정답률</div>
          <div style={{ fontSize: 12, color: '#647084', lineHeight: 1.6, marginTop: 5 }}>정답 횟수 ÷ 전체 풀이 횟수예요. 복습도 포함해요.<br />유형을 누르면 그 유형을 골라 풀 수 있어요.</div>
          {typeStats.map(s => (
            <button key={s.type} onClick={() => setType(s.type)} aria-pressed={type === s.type} aria-label={s.type + ' 정답률 ' + (s.accuracy == null ? '기록 없음' : s.accuracy + '%')} style={{ width: '100%', minHeight: TAP, textAlign: 'left', padding: '12px 0', fontFamily: 'inherit', cursor: 'pointer', border: 0, borderBottom: '1px solid #e8eaef', background: 'transparent', color: '#1a1a2e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}><span>{s.type}{type === s.type ? ' ✓' : ''}</span><span>{s.accuracy == null ? '기록 없음' : s.accuracy + '%'}</span></div>
              <div style={{ height: 5, background: '#e8eaef', borderRadius: 4, marginTop: 8 }}><div style={{ width: (s.accuracy || 0) + '%', height: '100%', background: '#1f7a4d', borderRadius: 4 }} /></div>
              <div style={{ fontSize: 11.5, color: '#647084', marginTop: 6 }}>정답 {s.correct} / 풀이 {s.attempts}회 · 남은 오답 {s.wrongNow}개</div>
            </button>
          ))}
        </section>
      </div>
    );
  }
  if (!set.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...cardBox, fontSize: 13.5, fontWeight: 700, color: "#4a5060" }}>{mode === "wrong" ? "이 유형에는 복습할 오답이 없어요." : "이 유형에는 풀 문제가 없어요."}</div>
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
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1f7a4d" }}>{mode === "wrong" ? "오답 복습을 마쳤어요" : "끝났어요"}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#1a1a2e", marginTop: 6 }}>{okN} / {set.length}</div>
          <div style={{ fontSize: 12, color: "#9aa0ab", fontWeight: 700, marginTop: 4 }}>{type} · 남은 오답 {selected.wrongNow}개</div>
        </div>
        {reviewCount > 0 && <button onClick={() => start('wrong')} style={btn('#6b3fa0', '#fff')}>오답만 {reviewCount}문제 복습</button>}
        {mode === 'wrong' && !reviewCount && <div role="status" style={{ ...cardBox, color: '#1f7a4d', fontSize: 13, fontWeight: 800 }}>이 유형의 오답을 모두 복습했어요!</div>}
        <button onClick={() => start('practice')} style={btn('#1f7a4d', '#fff')}>▶ 5문제 더</button>
        <button onClick={() => setSet(null)} style={btn("#fff", "#6b3fa0", "#6b3fa0")}>그만하기</button>
      </div>
    );
  }
  const q = set[idx];
  const answered = !!picked;
  const pick = async (L) => {
    if (answered || pickBusy.current) return;
    pickBusy.current = true;
    setAnswering(true); setAnswerErr('');
    const ok = L === q.a;
    try {
      if (!await saveP5(q.id, ok)) { pickBusy.current = false; setAnswerErr('답을 기록하지 못했어요. 다시 눌러 주세요.'); return; }
      setPicked(L); setResults(prev => [...prev, { id: q.id, ok }]);
    } catch {
      pickBusy.current = false; setAnswerErr('답을 기록하지 못했어요. 다시 눌러 주세요.');
    } finally { setAnswering(false); }
  };
  const parts = String(q.q || "").split("-------");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1f7a4d" }}>{mode === "wrong" ? "오답 복습 · " : ""}{idx + 1} / {set.length}</span>
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
          <button key={L} disabled={answered || answering} onClick={() => pick(L)} style={{minHeight: TAP, 
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
      {answering && <div role="status" style={{ fontSize: 12, color: "#647084" }}>답을 기록하고 있어요...</div>}
      {answerErr && <div role="alert" style={{ fontSize: 13, color: "#6b3fa0" }}>{answerErr}</div>}
      {answered && (
        <div style={{ ...cardBox, background: picked === q.a ? "#f2fbf7" : "#f8f5fc", border: `1px solid ${picked === q.a ? "#cfe9df" : "#e3d8f1"}` }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: picked === q.a ? "#1f7a4d" : "#6b3fa0" }}>{picked === q.a ? "맞았어요" : `틀렸어요 · 정답 (${q.a})`}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2a2a28", marginTop: 6, lineHeight: 1.55 }}>{q.why}</div>
        </div>
      )}
      {answered && <button onClick={() => { if (!pickBusy.current) return; pickBusy.current = false; setIdx(idx + 1); setPicked(""); }} style={btn("#1f7a4d", "#fff")}>{idx + 1 < set.length ? "다음 문제 ›" : "결과 보기 ›"}</button>}
      <button disabled={answering} onClick={() => setSet(null)} style={btn("#fff", "#647084", "#dfe3ef")}>목록으로</button>
    </div>
  );
}
