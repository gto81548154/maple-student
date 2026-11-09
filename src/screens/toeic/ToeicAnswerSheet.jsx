import { useEffect, useRef, useState } from "react";
import { TAP } from "../../theme/tokens.jsx";
import { TEACHER_AUTH } from "../../core/auth.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { toeicChoices, toeicQuestionNumbers } from "../../domain/toeicAnswerKeys.mjs";
import { validateToeicAnswers } from "../../domain/toeicGrading.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = () => Array(100).fill(null);
export function ToeicAnswerSheet({ id, toeic }) {
  const rec = toeic.tests[id] || {}, section = id.split("-")[1];
  const storageKey = "mapl_toeic_draft_v1:" + WORKER_ORIGIN + ":" + (TEACHER_AUTH?.tid || "") + ":" + id;
  const read = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return { answers: raw ? validateToeicAnswers(id, JSON.parse(raw)) : null, error: "" };
    } catch { return { answers: null, error: "기기에 보관한 답을 읽지 못했어요. 저장된 답을 불러오거나 브라우저 설정을 확인해 주세요." }; }
  };
  const [local, setLocal] = useState(read);
  const [page, setPage] = useState(0), [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const lock = useRef(false), submitted = useRef("");
  const edits = useRef(Promise.resolve());
  const draftLock = fn => navigator.locks?.request
    ? navigator.locks.request(storageKey + ":edit", fn)
    : Promise.reject(new Error("최신 브라우저에서 답을 입력해 주세요."));
  const latestAnswers = () => {
    const current = read();
    if (current.error) throw new Error(current.error);
    return current.answers || validateToeicAnswers(id, toeic.current().tests[id]?.answerDraft || empty());
  };
  const answers = local.answers || rec.answerDraft || empty();
  const numbers = toeicQuestionNumbers(section), count = answers.filter(a => a !== null).length;
  const grade = rec.grade, unchanged = grade && same(answers, grade.answers);
  const isPending = !!rec.gradePending;
  useEffect(() => {
    if (unchanged && !isPending && message.startsWith("채점을 요청")) setMessage("채점 결과가 저장됐어요.");
  }, [unchanged, isPending, message]);
  useEffect(() => {
    const changed = e => { if (e.key === storageKey) { setLocal(read()); setMessage("다른 창에서 바꾼 이 기기의 답을 불러왔어요."); setConfirm(false); } };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // An optimistic server draft is already durable in the ordered outbox.
  useEffect(() => {
    if (!busy && local.answers && same(local.answers, rec.answerDraft)) {
      let active = true;
      void draftLock(() => {
        if (!active) return;
        const current = read();
        if (!current.error && same(current.answers, local.answers) && same(current.answers, toeic.current().tests[id]?.answerDraft)) {
          localStorage.removeItem(storageKey);
          setLocal({ answers: null, error: "" });
        } else if (!same(current.answers, local.answers) || current.error) setLocal(current);
      }).catch(() => { /* Keep the draft if storage is unavailable. */ });
      return () => { active = false; };
    }
  }, [rec.answerDraft, local.answers, storageKey, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (index, value) => {
    if (lock.current) return;
    // Read the newest stored draft inside the cross-tab lock, never a render's old array.
    edits.current = edits.current.then(() => draftLock(() => {
      const next = latestAnswers().slice(); next[index] = value;
      localStorage.setItem(storageKey, JSON.stringify(next));
      setLocal({ answers: next, error: "" }); setConfirm(false); setMessage(""); submitted.current = "";
    })).catch(() => { setMessage("기기 저장 공간이 부족하거나 저장이 차단되어 이번 답을 보관하지 못했어요."); });
  };
  const send = async (gradeNow) => {
    if (lock.current || local.error || (gradeNow && isPending)) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      await edits.current;
      await draftLock(async () => {
        const next = latestAnswers(), fingerprint = JSON.stringify(next);
        if (gradeNow && submitted.current === fingerprint) return;
        if (gradeNow && next.includes(null) && confirm !== fingerprint) { setLocal(read()); setConfirm(fingerprint); return; }
        const ok = await toeic.save(id, gradeNow ? { submitAnswers: next.slice() } : { answerDraft: next.slice() });
        if (ok) {
          if (gradeNow) submitted.current = fingerprint;
          setMessage(gradeNow ? "채점을 요청했어요. 연결되면 결과가 저장돼요." : "답 저장을 요청했어요. 위의 저장 상태를 확인해 주세요.");
          setConfirm(false);
        } else setMessage("저장 요청을 보관하지 못했어요. 이 기기의 답을 유지했어요.");
      });
    } catch (e) { setMessage(e.message || "답을 저장하지 못했어요. 이 기기의 답을 유지했어요."); }
    finally { lock.current = false; setBusy(false); }
  };
  const restore = async () => {
    if (lock.current || isPending) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      await edits.current;
      const before = localStorage.getItem(storageKey);
      if (before && !window.confirm("이 기기에 보관한 답을 바꾸고 서버에 저장된 최신 답을 불러올까요?")) return;
      if (!await toeic.reload()) { setMessage("최신 답을 불러오지 못했어요. 이 기기의 답을 유지했어요."); return; }
      await draftLock(() => {
        if (localStorage.getItem(storageKey) !== before) { setLocal(read()); setMessage("불러오는 동안 다른 창에서 답이 바뀌어 그 답을 유지했어요."); return; }
        localStorage.removeItem(storageKey); setLocal({ answers: null, error: "" }); setConfirm(false); submitted.current = ""; setMessage("서버에 저장된 최신 답을 불러왔어요.");
      });
    } catch { setMessage("기기 저장 설정을 확인해 주세요. 이 기기의 답을 유지했어요."); }
    finally { lock.current = false; setBusy(false); }
  };
  const btn = on => ({ minHeight: TAP, padding: "8px 10px", borderRadius: 9, fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1px solid " + (on ? "#6b3fa0" : "#dfe3ef"), background: on ? "#6b3fa0" : "#fff", color: on ? "#fff" : "#344054" });
  return <section aria-label="토익 답 입력" style={{ marginTop: 18, borderTop: "1px solid #e8eaef", paddingTop: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 800 }}><span>답 입력</span><span>{count} / 100개 입력</span></div>
    <p style={{ fontSize: 12, color: "#667085", lineHeight: 1.6 }}>답은 이 기기에 먼저 보관돼요. 다른 기기에서도 이어 풀려면 답 저장을 눌러 주세요.</p>
    {local.answers && <p style={{ fontSize: 12, color: "#6b3fa0" }}>이 기기에만 보관한 변경이 있어요.</p>}
    {local.error && <p role="alert">{local.error}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
      {Array.from({ length: 10 }, (_, n) => <button key={n} style={{ ...btn(page === n), padding: "8px 2px", fontSize: 11, whiteSpace: "nowrap" }} aria-label={numbers[n * 10] + "번부터 " + numbers[n * 10 + 9] + "번"} aria-pressed={page === n} onClick={() => { setPage(n); setConfirm(false); }}>{numbers[n * 10]}–{numbers[n * 10 + 9]}</button>)}
    </div>
    <div style={{ marginTop: 10 }}>
      {numbers.slice(page * 10, page * 10 + 10).map(number => {
        const index = number - numbers[0];
        return <div key={number} role="group" aria-label={number + "번 답"} style={{ padding: "5px 0", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 32, flexShrink: 0, fontSize: 13, fontWeight: 800 }}>{number}</span>
          {toeicChoices(section, number).split("").map(choice => <button key={choice} disabled={busy || !!local.error} aria-label={number + "번 " + choice} aria-pressed={answers[index] === choice} onClick={() => edit(index, choice)} style={{ ...btn(answers[index] === choice), flex: 1 }}>{choice}</button>)}
          <button aria-label={number + "번 답 지우기"} disabled={busy || !!local.error || answers[index] === null} onClick={() => edit(index, null)} style={btn(false)}>지움</button>
        </div>;
      })}
    </div>
    <button style={{ ...btn(false), width: "100%", marginTop: 8 }} disabled={count === 100} onClick={() => { setPage(Math.floor(answers.indexOf(null) / 10)); setConfirm(false); }}>첫 미입력 문항으로</button>
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <button style={{ ...btn(false), flex: 1 }} disabled={busy || !!local.error || same(answers, rec.answerDraft)} onClick={() => send(false)}>답 저장</button>
      <button style={{ ...btn(true), flex: 1 }} disabled={busy || !!local.error || isPending || unchanged || count === 0} onClick={() => send(true)}>{isPending ? "채점 대기 중" : "채점하기"}</button>
    </div>
    {confirm && <div role="alert" style={{ padding: 12, background: "#fff4df", marginTop: 8, borderRadius: 10 }}>
      <p style={{ fontSize: 13 }}>미입력 {100 - count}개를 오답으로 채점할까요?</p>
      <button style={btn(true)} disabled={busy} onClick={() => send(true)}>미입력 포함 채점</button>{" "}
      <button style={btn(false)} onClick={() => setConfirm(false)}>계속 입력</button>
    </div>}
    {message && <p role="status" style={{ fontSize: 12, lineHeight: 1.6 }}>{message}</p>}
    <button style={{ ...btn(false), width: "100%", marginTop: 8 }} disabled={busy || isPending} onClick={restore}>저장된 답 불러오기</button>
    {grade && <div aria-label="최근 채점 결과" style={{ marginTop: 14, padding: 12, background: "#f4f6f9", borderRadius: 10 }}>
      <div style={{ fontSize: 17, fontWeight: 900 }}>최근 채점 결과 · {grade.score} / 100</div>
      <p style={{ fontSize: 12 }}>맞음 {grade.score}개 · 틀림 {100 - grade.score}개 (미입력 {grade.unanswered}개 포함)</p>
      {!unchanged && <p style={{ fontSize: 12, color: "#9b6500" }}>답이 바뀌었어요. 아래는 이전 채점 결과예요.</p>}
      <p style={{ fontSize: 12 }}>공식 토익 환산 점수가 아닌 맞은 개수예요.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, fontSize: 12 }}>{grade.parts.map(p => <span key={p.part}>Part {p.part} · {p.correct}/{p.total}</span>)}</div>
      <details style={{ marginTop: 12 }}><summary style={{ minHeight: TAP, cursor: "pointer", fontSize: 13 }}>틀린 답 확인 ({100 - grade.score}개)</summary>
        {grade.correct.map((ok, i) => !ok && <div key={i} style={{ padding: "5px 0", fontSize: 13 }}>{numbers[i]}번 · 내 답 {grade.answers[i] || "미입력"} → 정답 {grade.correctAnswers[i]}</div>)}
        {grade.score === 100 && <p>모두 맞혔어요!</p>}
      </details>
    </div>}
  </section>;
}
