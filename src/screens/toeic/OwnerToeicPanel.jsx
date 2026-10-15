import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useRef, useState } from "react";
import { TOEIC_BOOKS, TOEIC_TESTS, fmtClock, parseToeicId, toeicDoneCount, toeicFileUrl, toeicId, toeicNextLc } from "../../domain/toeic.jsx";

// 토익 탭 화면
export function OwnerToeicPanel({ toeic, pickId, onPicked }) {
  const { tests, loaded, err, save } = toeic;
  const [sel, setSel] = useState(() => pickId || "");
  const [book, setBook] = useState(() => (parseToeicId(pickId) || {}).v || TOEIC_BOOKS[0]);
  const [rate, setRate] = useState(1);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [paused, setPaused] = useState(true);
  const [scoreText, setScoreText] = useState("");
  const audioRef = useRef(null);
  const lastSentRef = useRef(0);
  const resumedRef = useRef("");
  const posRef = useRef({ id: "", sec: -1, sent: -1 });   // 지금 듣는 회차와 위치 — 탭을 떠날 때 마지막으로 한 번 저장

  // 홈 카드에서 "바로 듣기"로 들어오면 그 회차를 연다
  useEffect(() => {
    if (!pickId) return;
    const p = parseToeicId(pickId);
    if (p) { setBook(p.v); setSel(pickId); resumedRef.current = ""; save(pickId, { open: true }); }
    if (onPicked) onPicked();
  }, [pickId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 처음 열 때 고른 게 없으면 다음에 풀 회차를 보여 준다
  useEffect(() => {
    if (sel || !loaded) return;
    const next = toeicNextLc(tests);
    const p = parseToeicId(next);
    if (p) setBook(p.v);
  }, [loaded]);   // eslint-disable-line react-hooks/exhaustive-deps

  const cur = parseToeicId(sel);
  const rec = (sel && tests[sel]) || {};
  useEffect(() => { setScoreText(rec.score != null ? String(rec.score) : ""); }, [sel, rec.score]);

  const open = (id) => {
    if (sel && cur && cur.part === "lc" && audioRef.current) { sendPos(true); try { audioRef.current.pause(); } catch (e) {} }
    setSel(id); setPos(0); setDur(0); setPaused(true); resumedRef.current = "";
    save(id, { open: true });
  };
  const sendPos = (force) => {
    const a = audioRef.current;
    if (!a || !sel || !cur || cur.part !== "lc") return;
    const now = Date.now();
    if (!force && now - lastSentRef.current < 15000) return;   // 15초에 한 번만 저장
    lastSentRef.current = now;
    const sec = Math.floor(a.currentTime || 0);
    posRef.current = { id: sel, sec, sent: sec };
    save(sel, { sec });
  };
  // 음원을 다시 열면 지난번 들은 곳부터
  const onMeta = () => {
    const a = audioRef.current;
    if (!a) return;
    setDur(a.duration || 0);
    a.playbackRate = rate;
    if (resumedRef.current !== sel) {
      resumedRef.current = sel;
      const at = Number(rec.sec) || 0;
      if (at > 5 && at < (a.duration || 0) - 10) a.currentTime = at;
    }
    try {
      if ("mediaSession" in navigator && cur) {
        navigator.mediaSession.metadata = new window.MediaMetadata({ title: `ETS 1000제 ${cur.v}권 LC TEST ${cur.nn}`, artist: "마플쌤 · 토익" });
        navigator.mediaSession.setActionHandler("seekbackward", () => skip(-5));
        navigator.mediaSession.setActionHandler("seekforward", () => skip(5));
      }
    } catch (e) {}
  };
  const skip = (d) => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, Math.min((a.duration || 0), (a.currentTime || 0) + d)); };
  const setSpeed = (r) => { setRate(r); if (audioRef.current) audioRef.current.playbackRate = r; };
  const toggle = () => { const a = audioRef.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); };
  // 탭을 떠날 때(화면이 사라질 때) 마지막 위치를 한 번 더 저장 — 이미 보낸 값이면 안 보낸다
  useEffect(() => () => {
    const p = posRef.current;
    if (p.id && p.sec >= 0 && p.sec !== p.sent) save(p.id, { sec: p.sec });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const saveScore = () => {
    const t = scoreText.trim();
    if (t === "") { save(sel, { score: null }); return; }
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 100) { window.alert("맞은 개수는 0~100 사이 숫자로 적어 주세요"); return; }
    save(sel, { score: n });
  };

  const cardBox = { background: "#fff", border: "1px solid #e8eaef", borderRadius: 14, padding: "13px 14px" };
  const chip = (on) => ({ flex: 1, minHeight: TAP, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 800,
    border: `1px solid ${on ? "#182848" : "#dfe3ef"}`, background: on ? "#182848" : "#fff", color: on ? "#fff" : "#7b8494" });
  const pdfBtn = { display: "flex", alignItems: "center", justifyContent: "center", minHeight: TAP, boxSizing: "border-box", width: "100%", textAlign: "center", padding: "11px 0", borderRadius: 10, marginTop: 8, fontSize: 14, fontWeight: 800,
    border: "1px solid #6b3fa0", background: "#f3eefa", color: "#6b3fa0", cursor: "pointer", fontFamily: "inherit", textDecoration: "none" };
  const grid = (part) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 8 }}>
      {TOEIC_TESTS.map(nn => {
        const id = toeicId(book, part, nn);
        const done = !!(tests[id] && tests[id].done);
        const on = sel === id;
        return (
          <button key={id} onClick={() => open(id)} style={{minHeight: TAP, 
            padding: "9px 0", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800,
            border: `1px solid ${on ? "#6b3fa0" : done ? "#1f7a4d" : "#d6d9de"}`,
            background: on ? "#6b3fa0" : done ? "#e3f3ea" : "#fff",
            color: on ? "#fff" : done ? "#1f7a4d" : "#4a5060",
          }}>{nn}{done && !on ? " ✓" : ""}</button>
        );
      })}
    </div>
  );

  if (!loaded) return <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {err && <div style={{ padding: "9px 12px", borderRadius: 10, background: "#f3eefa", border: "1px solid #d9c9ee", color: "#6b3fa0", fontSize: 12, fontWeight: 700 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4].map(v => <button key={v} onClick={() => setBook(v)} style={chip(book === v)}>{v}권</button>)}
      </div>

      <div style={cardBox}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#6b3fa0" }}>LC 듣기</span>
          <span style={{ fontSize: 11.5, color: "#9aa0ab", fontWeight: 700 }}>{toeicDoneCount(tests, book, "lc")} / 10회 · 초록 = 다 푼 회차</span>
        </div>
        {grid("lc")}
      </div>
      <div style={cardBox}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#1f7a4d" }}>RC 읽기</span>
          <span style={{ fontSize: 11.5, color: "#9aa0ab", fontWeight: 700 }}>{toeicDoneCount(tests, book, "rc")} / 10회</span>
        </div>
        {grid("rc")}
      </div>

      {cur && (
        <div style={{ ...cardBox, border: "1.5px solid #6b3fa0" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#1a1a2e" }}>{cur.v}권 {cur.part === "lc" ? "LC" : "RC"} TEST {cur.nn}</div>
          {cur.part === "lc" && (
            <div style={{ background: "#f4f6f9", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
              <audio ref={audioRef} key={sel} src={toeicFileUrl(cur.v, "lc", cur.nn, "mp3")} preload="metadata"
                onLoadedMetadata={onMeta} onTimeUpdate={(e) => { const t = e.currentTarget.currentTime || 0; setPos(t); if (posRef.current.id !== sel) posRef.current = { id: sel, sec: -1, sent: -1 }; posRef.current.sec = Math.floor(t); sendPos(false); }}
                onPlay={() => setPaused(false)} onPause={() => { setPaused(true); sendPos(true); }} onEnded={() => { setPaused(true); sendPos(true); }}
                style={{ display: "none" }} />
              <input type="range" min={0} max={Math.max(1, Math.floor(dur))} value={Math.floor(pos)}
                onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = Number(e.target.value); }}
                style={{ width: "100%", height: TAP, margin: 0, display: "block", accentColor: "#6b3fa0" }} />
              <div style={{ fontSize: 12, color: "#7b8494", fontWeight: 700 }}>{fmtClock(pos)} / {dur ? fmtClock(dur) : "--:--"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <button onClick={() => skip(-5)} style={{ minHeight: TAP, ...chip(false), flex: "0 0 30%" }}>◀ 5초</button>
                <button onClick={toggle} style={{ minHeight: TAP, ...chip(true), flex: "0 0 30%" }}>{paused ? "▶ 재생" : "❚❚ 멈춤"}</button>
                <button onClick={() => skip(5)} style={{ minHeight: TAP, ...chip(false), flex: "0 0 30%" }}>5초 ▶</button>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {[0.8, 1, 1.2].map(r => <button key={r} onClick={() => setSpeed(r)} style={{ minHeight: TAP, ...chip(rate === r), padding: "6px 0", fontSize: 12.5 }}>속도 {r.toFixed(1)}</button>)}
              </div>
              {Number(rec.sec) > 5 && pos < 1 && <div style={{ fontSize: 11.5, color: "#6b3fa0", fontWeight: 700, marginTop: 6 }}>지난번 {fmtClock(rec.sec)}까지 들었어요 — 재생하면 거기서 이어져요</div>}
            </div>
          )}
          <a href={toeicFileUrl(cur.v, cur.part, cur.nn, "q")} target="_blank" rel="noopener noreferrer" style={pdfBtn}>문제지 보기</a>
          <a href={toeicFileUrl(cur.v, cur.part, cur.nn, "a")} target="_blank" rel="noopener noreferrer" style={pdfBtn}>해설 보기</a>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "#1a1a2e" }}>맞은 개수</span>
            <input value={scoreText} onChange={(e) => setScoreText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} onBlur={saveScore}
              inputMode="numeric" placeholder="0" style={{ width: 72, minHeight: TAP, padding: "7px 8px", borderRadius: 8, boxSizing: "border-box", border: "1px solid #d6d9de", fontSize: 15, fontWeight: 800, fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "#7b8494" }}>/ 100</span>
          </div>
          <button onClick={() => save(sel, { done: !rec.done })} style={{minHeight: TAP, 
            display: "block", width: "100%", padding: "12px 0", borderRadius: 10, marginTop: 10, fontSize: 14.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
            border: "none", background: rec.done ? "#e3f3ea" : "#1f7a4d", color: rec.done ? "#1f7a4d" : "#fff",
          }}>{rec.done ? "✓ 다 풀었어요 (누르면 취소)" : "✓ 다 풀었어요"}</button>
        </div>
      )}
      {!cur && <div style={{ fontSize: 12.5, color: "#9aa0ab", fontWeight: 700, textAlign: "center", padding: 8 }}>위에서 회차를 누르면 음원·문제지·해설이 열려요</div>}
    </div>
  );
}
