import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useMemo, useState } from "react";

export function BookPassCelebration({ books, onClose }) {
  const [idx, setIdx] = useState(0);
  const book = books[idx];
  const pieces = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.5,
    color: ["#ffd166", "#4aa3e8", "#E24B4A", "#7bd88f"][i % 4], dur: 1.5 + Math.random() * 1.2,
  })), [idx]);
  useEffect(() => {
    // 쾅 효과음 + 진동 (첫 진입이라 브라우저가 소리를 막으면 조용히 넘어간다 — 연출은 그대로)
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ac = new AC();
        if (ac.state === "suspended") ac.resume().catch(() => {});
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(150, ac.currentTime); o.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.16);
        g.gain.setValueAtTime(0.9, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.28);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.3);
      }
    } catch (e) { /* 무시 */ }
    try { if (navigator.vibrate) navigator.vibrate([20, 40, 90]); } catch (e) { /* 무시 */ }
  }, [idx]);
  if (!book) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,15,40,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <style>{`
        @keyframes mplPassSlam{0%{transform:scale(3.4) rotate(16deg);opacity:0}55%{transform:scale(.85) rotate(-9deg);opacity:1}75%{transform:scale(1.1) rotate(-11deg)}100%{transform:scale(1) rotate(-10deg)}}
        @keyframes mplConfetti{0%{transform:translateY(-30px) rotate(0);opacity:1}100%{transform:translateY(78vh) rotate(560deg);opacity:0}}
        @keyframes mplPassPop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
      `}</style>
      {pieces.map((pc, i) => (
        <span key={`${idx}_${i}`} style={{ position: "absolute", top: 0, left: `${pc.left}%`, width: 9, height: 14, background: pc.color, borderRadius: 2, animation: `mplConfetti ${pc.dur}s ease-in ${pc.delay}s both` }} />
      ))}
      <div key={book.id} style={{ textAlign: "center", animation: "mplPassPop .3s ease-out both" }}>
        <div style={{ color: "#ffd166", fontSize: 13, fontWeight: 900, letterSpacing: 4, marginBottom: 10 }}>BOOK CLEAR</div>
        <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, lineHeight: 1.35, wordBreak: "keep-all", marginBottom: 26 }}>{book.name}<br />완주!</div>
        <div style={{ width: 150, height: 150, margin: "0 auto 26px", borderRadius: "50%", border: "5px solid #E24B4A", background: "rgba(252,235,235,0.1)", color: "#ff6b6a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "mplPassSlam .45s cubic-bezier(.2,.9,.3,1.2) both" }}>
          <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: 4 }}>PASS</span>
          <span style={{ fontSize: 11, fontWeight: 800, marginTop: 4, letterSpacing: 1 }}>MAPLE ENGLISH</span>
        </div>
        <button onClick={() => { if (idx + 1 < books.length) setIdx(idx + 1); else onClose(); }}
          style={{ minHeight: TAP, padding: "12px 36px", borderRadius: 999, border: "none", background: "#ffd166", color: "#1a1a2e", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>
          {idx + 1 < books.length ? `다음 (${idx + 1}/${books.length})` : "확인"}
        </button>
      </div>
    </div>
  );
}
