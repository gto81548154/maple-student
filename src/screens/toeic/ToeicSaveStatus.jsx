import { useState } from "react";
import { TAP } from "../../theme/tokens.jsx";
import { parseToeicId } from "../../domain/toeic.jsx";

// [162] 막힌 기록이 무엇인지 사람 말로.
const KIND_LABEL = { submitAnswers: "채점 요청", answerDraft: "답 저장", p5: "파트5 풀이 결과", score: "점수 입력", done: "완료 표시", sec: "음원 위치", open: "회차 열기", etc: "기록" };
export function describeStuck(stuck) {
  if (!stuck) return "";
  const p = parseToeicId(stuck.id);
  const where = p ? `${p.v}권 ${p.part.toUpperCase()} ${Number(p.nn)}회 ` : "";
  return where + (KIND_LABEL[stuck.kind] || KIND_LABEL.etc);
}

const button = (saving, extra = {}) => ({ minHeight: TAP, marginTop: 6, padding: "6px 14px", fontFamily: "inherit", fontWeight: 800, borderRadius: 8, border: "1px solid currentColor", color: "inherit", background: "#fff", cursor: saving ? "default" : "pointer", ...extra });

export function ToeicSaveStatus({ toeic }) {
  const { pending = 0, saving, loaded, err, retry, stuck, discard } = toeic;
  const [confirm, setConfirm] = useState(false);
  if (!loaded) return null;
  const attention = !!err;
  const canDiscard = !!stuck && typeof discard === "function";
  const label = describeStuck(stuck);
  const keepsAnswers = stuck?.kind === "submitAnswers" || stuck?.kind === "answerDraft";
  return <div role={attention ? "alert" : "status"} aria-live="polite"
    style={{ padding: "10px 12px", marginBottom: 10, borderRadius: 10, background: attention ? "#f3eefa" : "#f2fbf7", color: attention ? "#6b3fa0" : "#1f7a4d", fontSize: 13, lineHeight: 1.5 }}>
    <div style={{ fontWeight: 800 }}>{saving ? "저장 중…" : pending ? "저장 대기 " + pending + "개" : attention ? "저장 확인 필요" : "기록이 저장돼 있어요"}</div>
    {err && <div>{err}</div>}
    {pending > 0 && <div style={{ fontSize: 12 }}>보내지 못한 기록은 이 기기에 보관돼 있어요.</div>}
    {canDiscard && <div style={{ fontSize: 12, marginTop: 4 }}>
      맨 앞에 막힌 기록: <b>{label}</b>. 서버가 받지 않아서 뒤의 기록도 못 보내고 있어요.
      {keepsAnswers ? " 버리면 그 답은 이 기기 보관 답으로 돌아와요(사라지지 않아요)." : " 버리면 이 기록만 없어지고 나머지는 이어서 보내요."}
    </div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(attention || pending > 0) && <button disabled={saving} onClick={() => { void retry(); }} style={button(saving)}>
        {saving ? "저장 중…" : "다시 저장"}
      </button>}
      {canDiscard && !confirm && <button disabled={saving} onClick={() => setConfirm(true)} style={button(saving)}>막힌 기록 버리기</button>}
      {canDiscard && confirm && <>
        <button disabled={saving} onClick={() => { setConfirm(false); void discard(); }} style={button(saving, { background: "#6b3fa0", color: "#fff", borderColor: "#6b3fa0" })}>정말 버리기</button>
        <button disabled={saving} onClick={() => setConfirm(false)} style={button(saving)}>취소</button>
      </>}
    </div>
  </div>;
}
