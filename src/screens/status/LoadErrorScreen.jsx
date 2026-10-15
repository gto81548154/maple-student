import { TAP } from "../../theme/tokens.jsx";

// [121차수] 연결 오류 화면 — App.jsx에서 그대로 옮김.
export function renderLoadErrorScreen(C) {
  const { loadErrorCode } = C;
  return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>연결 오류</div>
          {/* [110차수 09-09] 서버 DB가 바쁜 경우(E503-DB지연)는 이유를 쉽게 — 학생이 인터넷 탓인 줄 알고 와이파이를 껐다 켜지 않게 */}
          <div style={{ fontSize: 14, color: "#999", marginBottom: 20, lineHeight: 1.6 }}>
            {/^E503/.test(String(loadErrorCode || "")) ? <>학원 서버가 잠시 바빠요.<br />1~2분 뒤 [다시 시도]를 눌러 주세요.</> : "잠시 후 다시 시도해주세요"}
          </div>
          <button onClick={() => window.location.reload()} style={{ minHeight: TAP, padding: "10px 24px", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>다시 시도</button>
          {/* [08-10] 학생이 이 코드만 알려줘도 원장이 원인을 바로 좁힐 수 있다 (E500=서버 오류, E-시간초과=20초 무응답, E-네트워크=인터넷 끊김 등) */}
          <div style={{ fontSize: 11.5, color: "#c3c9d8", marginTop: 16 }}>오류 코드: {loadErrorCode || "E-알수없음"}</div>
        </div>
      </div>
  );
}

