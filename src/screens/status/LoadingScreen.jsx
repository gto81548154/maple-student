
// [121차수] "불러오는 중" 화면 — App.jsx에서 그대로 옮김.
export function renderLoadingScreen(C) {
  const { loadingSlow } = C;
  return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#1C66A5", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 14, color: "#999" }}>불러오는 중...</div>
          {/* [110차수 09-09] 6초 넘게 걸리면 이유를 한 줄 — 서버가 느린 날 학생이 "고장났나" 하고 껐다 켜기를 반복하지 않게 */}
          {loadingSlow && <div style={{ fontSize: 12.5, color: "#b0b6c6", marginTop: 8, lineHeight: 1.5 }}>서버가 조금 느려요. 잠시만 기다려 주세요…<br />(저장된 자료가 있으면 최대 20초 뒤 열려요)</div>}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
  );
}
