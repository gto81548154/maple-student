
// [교사] 링크가 죽었을 때(원장이 재발급했거나 계정이 지워짐)
export function TeacherLinkDeadScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Pretendard Variable', -apple-system, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 340, background: "#fff", borderRadius: 18, padding: "36px 24px", boxShadow: "0 8px 30px rgba(15,23,42,.08)" }}>
        <div style={{ fontSize: 42, marginBottom: 14 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e", marginBottom: 10, lineHeight: 1.5 }}>이 링크는 더 이상 쓸 수 없어요</div>
        <div style={{ fontSize: 13.5, color: "#7b8494", lineHeight: 1.75 }}>원장님이 링크를 새로 만들었거나<br />계정이 정리된 경우입니다.<br />원장님께 새 링크를 요청해 주세요.</div>
      </div>
    </div>
  );
}
