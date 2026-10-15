import { TAP } from "../theme/tokens.jsx";
import { useState } from "react";
import { IS_IOS_UA, IS_KAKAO_UA, PWA_BANNER_DISMISS_KEY, isPwaStandalone, openOutsideKakao } from "../core/pwa.jsx";

export function KakaoOpenBanner() {
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(PWA_BANNER_DISMISS_KEY) === "1"; } catch (e) { return false; } });
  if (!IS_KAKAO_UA || dismissed || isPwaStandalone()) return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(PWA_BANNER_DISMISS_KEY, "1"); } catch (e) {} };
  return (
    <div style={{ background: "#0f3460", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>📲</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>카카오톡 안에서는 홈 화면 추가가 안 돼요</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2, lineHeight: 1.5 }}>
          오른쪽 버튼으로 {IS_IOS_UA ? "Safari" : "브라우저"}에서 열면 바로 추가할 수 있어요
        </div>
      </div>
      <button type="button" onClick={openOutsideKakao}
        style={{ minHeight: TAP, border: "none", borderRadius: 8, background: "#ffd166", color: "#1a1a2e", fontWeight: 900, fontSize: 12, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{IS_IOS_UA ? "Safari로 열기" : "브라우저로 열기"}</button>
      <button type="button" onClick={dismiss} aria-label="배너 닫기" style={{ minHeight: TAP, minWidth: TAP, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: 900, cursor: "pointer", flexShrink: 0, padding: 4 }}>✕</button>
    </div>
  );
}
