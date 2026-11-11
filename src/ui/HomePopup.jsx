import { useEffect, useState } from "react";
import { MAX_W, TAP, UI } from "../theme/tokens.jsx";

// ═══ [147차수] 앱을 켤 때 가운데 뜨는 안내 카드(여러 장이면 1/3 넘기기) ═══
//   카드: { key, tone("navy"|"warn"), icon, title, body, image, cta, tab, url }
//   아래 두 글자 단추: [오늘 하루 안 보기] [닫기]. 큰 단추(cta)를 누르면 그 화면으로 간다.
//   [163차수] 공지 카드(card.forever)를 보고 있을 때는 왼쪽 단추가 [앞으로 안 보기]로 바뀐다 — 그 공지만 영영 끄고, 다른 카드가 남아 있으면 창은 그대로 둔다.
export function HomePopup({ cards, onClose, onHideToday, onHideForever, onGo }) {
  const [idx, setIdx] = useState(0);
  const n = cards.length;
  const card = cards[Math.min(idx, n - 1)];
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  if (!card) return null;
  const warn = card.tone === "warn";
  const bg = warn ? "linear-gradient(160deg, #7A1F1F 0%, #3A1020 100%)" : `linear-gradient(160deg, ${UI.navy} 0%, #0F1A33 100%)`;
  const ctaBg = warn ? "#FF5A3C" : "#FF7A1A";
  const small = { minHeight: TAP, border: "none", background: "transparent", color: "rgba(255,255,255,0.92)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "8px 10px" };
  return (
    <div role="dialog" aria-modal="true" aria-label="안내" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,14,24,0.7)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: Math.min(MAX_W - 40, 400) }}>
        <div style={{ background: bg, borderRadius: 22, color: "#fff", overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.45)", position: "relative" }}>
          {n > 1 && <div style={{ position: "absolute", top: 12, right: 14, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{idx + 1} / {n}</div>}
          {card.image && <img src={card.image} alt="" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover" }} />}
          <div style={{ padding: card.image ? "18px 22px 20px" : "30px 22px 20px", textAlign: "center" }}>
            {!card.image && <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 14 }}>{card.icon}</div>}
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, wordBreak: "keep-all" }}>{card.title}</div>
            {card.body && <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,0.86)", marginTop: 10, whiteSpace: "pre-line", wordBreak: "keep-all" }}>{card.body}</div>}
            {card.cta && (
              <button type="button" onClick={() => onGo(card)}
                style={{ marginTop: 20, width: "100%", height: 52, border: "none", borderRadius: 26, background: ctaBg, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{card.cta}</button>
            )}
            {n > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }}>
                <button type="button" aria-label="이전" onClick={() => setIdx((i) => (i - 1 + n) % n)} style={{ ...small, minHeight: 36, padding: "4px 10px" }}>‹</button>
                {cards.map((c, i) => <span key={c.key} style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3, background: i === idx ? "#fff" : "rgba(255,255,255,0.4)", transition: "width .2s" }} />)}
                <button type="button" aria-label="다음" onClick={() => setIdx((i) => (i + 1) % n)} style={{ ...small, minHeight: 36, padding: "4px 10px" }}>›</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "0 4px" }}>
          {card.forever && onHideForever
            ? <button type="button" onClick={() => onHideForever(card)} style={small}>앞으로 안 보기</button>
            : <button type="button" onClick={onHideToday} style={small}>오늘 하루 안 보기</button>}
          <button type="button" onClick={onClose} style={small}>닫기</button>
        </div>
      </div>
    </div>
  );
}
