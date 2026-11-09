import { TAP } from "../../theme/tokens.jsx";

export function ToeicSaveStatus({ toeic }) {
  const { pending = 0, saving, loaded, err, retry } = toeic;
  if (!loaded) return null;
  const attention = !!err;
  return <div role={attention ? "alert" : "status"} aria-live="polite"
    style={{ padding: "10px 12px", marginBottom: 10, borderRadius: 10, background: attention ? "#f3eefa" : "#f2fbf7", color: attention ? "#6b3fa0" : "#1f7a4d", fontSize: 13, lineHeight: 1.5 }}>
    <div style={{ fontWeight: 800 }}>{saving ? "저장 중…" : pending ? "저장 대기 " + pending + "개" : attention ? "저장 확인 필요" : "기록이 저장돼 있어요"}</div>
    {err && <div>{err}</div>}
    {pending > 0 && <div style={{ fontSize: 12 }}>보내지 못한 기록은 이 기기에 보관돼 있어요.</div>}
    {(attention || pending > 0) && <button disabled={saving} onClick={() => { void retry(); }}
      style={{ minHeight: TAP, marginTop: 6, padding: "6px 14px", fontFamily: "inherit", fontWeight: 800, borderRadius: 8, border: "1px solid currentColor", color: "inherit", background: "#fff", cursor: saving ? "default" : "pointer" }}>
      {saving ? "저장 중…" : "다시 저장"}
    </button>}
  </div>;
}
