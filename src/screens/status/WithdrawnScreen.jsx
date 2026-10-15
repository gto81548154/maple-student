import { TAP } from "../../theme/tokens.jsx";

// [121차수] 그만둔(정지) 학생 안내 화면 — App.jsx에서 그대로 옮김.
export function renderWithdrawnScreen(C) {
  const { loadData, refreshing, withdrawnName } = C;
  return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340, background: "#fff", borderRadius: 18, padding: "36px 24px", boxShadow: "0 8px 30px rgba(15,23,42,.08)" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🌱</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e", marginBottom: 10, lineHeight: 1.5 }}>
            {withdrawnName ? `${withdrawnName} 학생, ` : ""}지금은 수업이 멈춰 있어요
          </div>
          <div style={{ fontSize: 14, color: "#5a6076", lineHeight: 1.75 }}>
            다시 등록하면 <b style={{ color: "#1C66A5" }}>바로 이어서</b> 쓸 수 있어요.<br />
            그동안 공부한 기록은 그대로 남아 있습니다.
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", background: "#fff5f5", border: "1px solid #f7c9cd", borderRadius: 10, fontSize: 12.5, color: "#b03a2e", fontWeight: 700, lineHeight: 1.65 }}>
            다만 <b>새해가 되면 기록이 다 사라집니다</b>
          </div>
          <div style={{ marginTop: 12, padding: "12px 14px", background: "#eef2ff", borderRadius: 12, fontSize: 13, color: "#3552d4", fontWeight: 700, lineHeight: 1.6 }}>
            다시 시작하고 싶으면<br />원장님께 연락해 주세요
          </div>
          {/* [08-07] 다시 등록한 뒤 앱을 껐다 켜지 않아도 되게. 자동 새로고침은 멈춰 있으므로 이 단추가 유일한 재확인 통로다. */}
          <button onClick={() => loadData({ manual: true })} disabled={refreshing}
            style={{ minHeight: TAP, width: "100%", marginTop: 16, padding: "12px 0", borderRadius: 10, border: "1px solid #dfe3ef", background: refreshing ? "#f2f4f9" : "#fff", color: refreshing ? "#a0a8c0" : "#5a6076", fontSize: 13.5, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: "inherit" }}>
            {refreshing ? "확인 중..." : "다시 확인"}
          </button>
          {/* [08-07] 진짜로 링크가 잘못된 경우도 이 화면으로 온다 — 한 줄로만 알린다. */}
          <div style={{ fontSize: 11.5, color: "#a0a8c0", marginTop: 14, lineHeight: 1.6 }}>링크가 잘못됐을 수도 있어요</div>
          <div style={{ fontSize: 11.5, color: "#a0a8c0", marginTop: 6 }}>마플영어</div>
        </div>
      </div>
  );
}

