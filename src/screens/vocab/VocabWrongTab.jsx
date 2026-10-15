import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useRef, useState } from "react";
// [95차수 09-05] 오답 TEST에서 "다음 단어"를 누르는 손가락 동작 안에서 화면을 바로 그리고 입력칸에 커서를 두기 위해(폰 자판이 뜨려면 이 순서여야 한다)
import { flushSync } from "react-dom";
import { buildVocabAcceptList, buildVocabAnswerDisplay } from "../../domain/vocabAnswer.jsx";
import { judgeVocabTest, makeVocabAttemptId, postVocabTestResult } from "../../domain/vocabTest.jsx";
import { IS_STAFF_VIEW } from "../../core/auth.jsx";

// ─── VocabWrongTab: 월별 오답 단어 TEST ───
// 숙제/과제의 "2. 단어 TEST"와 섞지 않고 상단 별도 탭에서만 보여준다.
// 2차: 완료 결과를 Worker로 보내고, 통과한 단어는 다음 풀에서 제외되도록 한다.
export function VocabWrongTab({ vocabWrongWords = {}, studentId, onProgress }) {
  const [mode, setMode] = useState("list"); // list | test | done
  const [active, setActive] = useState(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [judged, setJudged] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [startedAt, setStartedAt] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sendStatus, setSendStatus] = useState("");
  // [3차 ③] 테스트 도중에 목록으로 나가려 할 때 띄우는 확인 카드
  const [askLeave, setAskLeave] = useState(false);
  // [95차수 09-05] 정답 입력칸 — 다음 단어로 넘어갈 때 커서를 다시 두어 폰 자판이 내려가지 않게 한다
  const inputRef = useRef(null);
  // [95차수 09-05] "하나라도 풀었는지"를 부모(학생앱)에게 알린다 — 위 탭 줄로 나갈 때 확인창을 띄우기 위해.
  //   이 화면이 사라질 때(탭 이동)는 반드시 "진행 중 아님"으로 되돌린다.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const inProgress = mode === "test" && (idx > 0 || revealed);
  useEffect(() => {
    if (onProgressRef.current) onProgressRef.current(inProgress);
    return () => { if (onProgressRef.current) onProgressRef.current(false); };
  }, [inProgress]);
  const focusInput = () => { try { inputRef.current?.focus(); } catch (e) { /* ignore */ } };

  const monthLabel = (mk) => {
    const [y, m] = String(mk || "").split("-");
    return y && m ? `${y}년 ${Number(m)}월` : mk;
  };

  const fmtWrongDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };

  // 학생앱은 AI 채점 없음. 정답 배열과 단순 비교만 한다.
  // [08-04] 띄어쓰기뿐 아니라 물결(~)·문장부호·대소문자도 무시한다.
  // 예전에는 "~에 싫증나다"를 "에 싫증나다"로 저장해 두면 안 맞았다.
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s~·ㆍ.,;:'"\u2018\u2019\u201c\u201d\-]/g, "");

  const months = Object.keys(vocabWrongWords || {})
    .map((mk) => {
      const all = Object.values(vocabWrongWords[mk]?.words || {});
      const words = all
        .filter((w) => (w.status || "active") === "active" && Array.isArray(w.correctAnswers) && w.correctAnswers.length > 0)
        .sort((a, b) => String(a.word || "").localeCompare(String(b.word || "")));
      const starredCount = all.filter(w => w.starred && (w.status || "active") !== "archived").length;
      const lastWrongAt = all.map(w => w.lastWrongAt || w.firstWrongAt || "").filter(Boolean).sort().slice(-1)[0] || "";
      return { monthKey: mk, words, count: words.length, starredCount, lastWrongAt };
    })
    .filter((m) => m.count > 0 || m.starredCount > 0)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const resetProgress = () => {
    setIdx(0);
    setInput("");
    setRevealed(false);
    setJudged(null);
    setAnswers([]);
    setSummary(null);
    setSendStatus("");
    setAskLeave(false); // [3차 ③] 새로 시작하거나 목록으로 돌아갈 때 확인 카드는 항상 닫아둔다
  };

  const startTest = (m) => {
    if (!m.words.length) return;
    // [95차수 09-05] 단추를 누른 손가락 동작 안에서 화면을 바로 그리고 입력칸에 커서를 둔다(폰 자판이 바로 뜨게)
    flushSync(() => {
      setActive(m);
      resetProgress();
      setStartedAt(new Date().toISOString());
      setMode("test");
    });
    focusInput();
  };

  const backToList = () => {
    setMode("list");
    setActive(null);
    resetProgress();
    setStartedAt(null);
  };

  const buildFinalSummary = (finalAnswers) => {
    const words = active?.words || [];
    const wrongItems = words.filter((w, i) => finalAnswers[i] && finalAnswers[i].correct === false);
    const wrongWordKeys = wrongItems.map(w => w.wordKey || String(w.word || "").trim().toLowerCase()).filter(Boolean);
    const wrongLabels = wrongItems.map(w => w.word || w.wordKey).filter(Boolean);
    const total = words.length;
    const wrong = wrongWordKeys.length;
    const { accuracy, result } = judgeVocabTest(total, wrong);
    return { total, correct: Math.max(0, total - wrong), wrong, accuracy, result, wrongWordKeys, wrongLabels };
  };

  const sendResult = async (finalSummary) => {
    const completedAt = new Date().toISOString();
    const payload = {
      attemptId: makeVocabAttemptId(studentId, active?.monthKey),
      studentId: String(studentId || ""),
      monthKey: active?.monthKey || "",
      testedWordKeys: (active?.words || []).map(w => w.wordKey || String(w.word || "").trim().toLowerCase()).filter(Boolean),
      wrongWords: finalSummary.wrongWordKeys,
      wrongWordLabels: finalSummary.wrongLabels,
      totalCount: finalSummary.total,
      correctCount: finalSummary.correct,
      wrongCount: finalSummary.wrong,
      accuracy: finalSummary.accuracy,
      result: finalSummary.result,
      startedAt,
      completedAt,
    };
    if (IS_STAFF_VIEW) { setSendStatus("선생님·원장 화면에서는 결과가 저장되지 않습니다."); return; }   // [135차수] 보기 전용 — 학생 기록에 남기지도, 대기열에 쌓지도 않음
    const ok = await postVocabTestResult(payload);
    setSendStatus(ok ? "원장앱에 결과가 저장되었습니다." : "인터넷 연결 후 원장앱으로 자동 전송됩니다.");
  };

  if (mode === "list") {
    return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: "#2A2A28" }}>오답 단어 TEST</div>
        <div style={{ fontSize: 13, color: "#777", marginBottom: 16 }}>원장앱 채점에서 틀린 단어만 월별로 복습합니다.</div>
        {months.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14, background: "#fff", borderRadius: 14 }}>
            아직 오답 단어가 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {months.map((m) => (
              <div key={m.monthKey} style={{ background: "#fff", border: "1px solid #eceef2", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#2A2A28" }}>{monthLabel(m.monthKey)}</div>
                    <div style={{ fontSize: 13, color: "#777", marginTop: 4 }}>
                      테스트할 단어 <b style={{ color: "#2A6FDB" }}>{m.count}</b>개
                      {m.starredCount > 0 && <span style={{ color: "#E8890C", marginLeft: 8 }}>★ 어려운 단어 {m.starredCount}개</span>}
                    </div>
                    {m.lastWrongAt && <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>최근 오답: {fmtWrongDate(m.lastWrongAt)}</div>}
                  </div>
                  <button onClick={() => startTest(m)} disabled={m.count === 0} style={{ minHeight: TAP, padding: "11px 17px", borderRadius: 10, border: "none", background: m.count === 0 ? "#f2f3f6" : "#182848", color: m.count === 0 ? "#9aa0ab" : "#fff", fontWeight: 800, fontSize: 13, cursor: m.count === 0 ? "default" : "pointer", flexShrink: 0 }}>
                    {m.count === 0 ? "모두 통과" : "TEST 시작"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (mode === "done" && summary) {
    const pass = summary.result === "pass";
    return (
      <div>
        <button onClick={backToList} style={{ minHeight: TAP, padding: "4px 10px 4px 0", border: "none", background: "transparent", color: "#777", fontSize: 14, cursor: "pointer", marginBottom: 4, fontFamily: "inherit" }}>← 월별 목록</button>
        <div style={{ background: "#fff", border: "1px solid #eceef2", borderRadius: 14, padding: 24, textAlign: "center" }}>
          {pass ? (
            <div aria-hidden="true" style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: "50%", border: "3px solid #E24B4A", color: "#E24B4A", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-10deg)", fontWeight: 900, fontSize: 15, letterSpacing: 1 }}>PASS</div>
          ) : (
            <div style={{ fontSize: 34, marginBottom: 10 }}>⭐</div>
          )}
          <div style={{ fontSize: 20, fontWeight: 900, color: pass ? "#0b7a5c" : "#c0392b", marginBottom: 6 }}>{pass ? "통과!" : "재시험 필요"}</div>
          <div style={{ fontSize: 13, color: "#777", marginBottom: 18 }}>{monthLabel(active?.monthKey)} 오답 단어 TEST 결과입니다.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "#f2f3f6" }}><b>{summary.total}</b><br/><span style={{ fontSize: 12, color: "#777" }}>전체</span></div>
            <div style={{ padding: 12, borderRadius: 12, background: "#eefaf3", color: "#0b7a5c" }}><b>{summary.correct}</b><br/><span style={{ fontSize: 12 }}>정답</span></div>
            <div style={{ padding: 12, borderRadius: 12, background: "#fdf0ef", color: "#E24B4A" }}><b>{summary.wrong}</b><br/><span style={{ fontSize: 12 }}>오답</span></div>
          </div>
          <div style={{ fontSize: 14, color: pass ? "#0b7a5c" : "#c0392b", fontWeight: 800, marginBottom: 10 }}>정답률 {summary.accuracy}% · 기준 90%</div>
          {!pass && summary.wrongLabels.length > 0 && (
            <div style={{ marginTop: 12, marginBottom: 16, textAlign: "left" }}>
              <div style={{ fontSize: 13, color: "#777", marginBottom: 6 }}>이번에 틀린 단어</div>{/* [96차수] 제목이 "별표된 어려운 단어"였는데 실제 목록은 이번에 틀린 단어라 문구를 맞춤 */}
              {summary.wrongLabels.map(w => <span key={w} style={{ display: "inline-block", margin: "0 6px 6px 0", padding: "4px 10px", borderRadius: 8, background: "#fdf0ef", color: "#b3564c", fontSize: 13 }}>{w}</span>)}
            </div>
          )}
          {sendStatus && <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>{sendStatus}</div>}
          <button onClick={() => startTest(active)} style={{ minHeight: TAP, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#182848", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 8 }}>다시 풀기</button>
          <button onClick={backToList} style={{ minHeight: TAP, width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid #e5e7ec", background: "#fff", color: "#33373d", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>월별 목록으로</button>
        </div>
      </div>
    );
  }

  const words = active?.words || [];
  const current = words[idx];
  const correctAnswers = current?.correctAnswers || [];
  // [08-04] 정답이 "[명] 1. 주소 2. 연설 [동] …"처럼 한 덩어리로 저장돼 있어도
  // 낱개 뜻("주소")으로 쪼개서 비교한다. 예전 기록도 이 자리에서 함께 살아난다.
  const acceptAnswers = buildVocabAcceptList(correctAnswers);
  const answerDisplay = buildVocabAnswerDisplay(correctAnswers);
  const currentAnswer = answers[idx] || {};

  const check = () => {
    if (!current) return;
    const ans = norm(input);
    const ok = acceptAnswers.some((c) => norm(c) === ans);
    setJudged(ok ? "correct" : "wrong");
    setRevealed(true);
    setAnswers(prev => {
      const next = [...prev];
      next[idx] = { word: current?.word || "", wordKey: current?.wordKey || "", input, correct: ok };
      return next;
    });
  };

  const next = () => {
    const finalAnswers = [...answers];
    if (!finalAnswers[idx] && current) {
      finalAnswers[idx] = { word: current.word || "", wordKey: current.wordKey || "", input, correct: judged === "correct" };
    }
    if (idx + 1 >= words.length) {
      const finalSummary = buildFinalSummary(finalAnswers);
      setAnswers(finalAnswers);
      setSummary(finalSummary);
      setMode("done");
      sendResult(finalSummary);
      return;
    }
    // [95차수 09-05] 다음 단어를 바로 그리고 입력칸에 커서를 둔다 — 예전엔 단어마다 입력칸을 다시 눌러야 자판이 떴다
    flushSync(() => {
      setAnswers(finalAnswers);
      setIdx(idx + 1);
      setInput("");
      setRevealed(false);
      setJudged(null);
    });
    focusInput();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        {/* [3차 ③] 아직 아무것도 안 풀었으면 그냥 나가고, 하나라도 풀었으면 확인 카드를 띄운다 */}
        <button onClick={() => { if (idx === 0 && !revealed) backToList(); else setAskLeave(true); }} style={{ minHeight: TAP, padding: "4px 10px 4px 0", border: "none", background: "transparent", color: "#777", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← 목록</button>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#777", fontWeight: 700 }}>{idx + 1} / {words.length}</div>
      </div>
      {askLeave && (
        <div style={{ background: "#fff", border: "1.5px solid #fecaca", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#c0392b", marginBottom: 4 }}>지금 나가면 푼 게 사라져요</div>
          <div style={{ fontSize: 13, color: "#777", marginBottom: 12 }}>{idx + 1}번째까지 풀었어요. 그래도 나갈까요?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setAskLeave(false)} style={{ minHeight: TAP, flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "#182848", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>계속 풀기</button>
            <button onClick={() => { setAskLeave(false); backToList(); }} style={{ minHeight: TAP, flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", color: "#c0392b", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>나가기</button>
          </div>
        </div>
      )}
      {!current ? (
        <div style={{ padding: 24, textAlign: "center", color: "#999", background: "#fff", borderRadius: 14 }}>단어가 없습니다.</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #eceef2", borderRadius: 14, padding: 20 }}>
          <div style={{ height: 6, background: "#e9ebf0", borderRadius: 3, overflow: "hidden", marginBottom: 28 }}>
            <div style={{ height: "100%", width: `${((idx + 1) / Math.max(words.length, 1)) * 100}%`, background: "#2A6FDB", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, textAlign: "center", color: "#23252B", marginBottom: 22 }}>{current.word}</div>
          <div style={{ fontSize: 13, color: "#777", marginBottom: 7 }}>이 단어의 뜻을 한국어로 적어주세요.</div>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // [95차수 09-05] 엔터 한 번 = 정답 확인, 한 번 더 = 다음 단어. 한글 조합 중(isComposing)의 엔터는 무시한다.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (e.nativeEvent && e.nativeEvent.isComposing) return;
              if (!revealed) { if (input.trim()) check(); }
              else next();
            }}
            // [95차수 09-05] 정답을 보여주는 동안에도 잠그지 않고 읽기 전용으로 — 잠그면(disabled) 커서·자판이 사라져 엔터가 안 먹는다
            readOnly={revealed}
            placeholder="정답을 입력하세요"
            style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1.5px solid #d4d7de", fontSize: 16, boxSizing: "border-box" }}
          />
          {!revealed ? (
            <button onClick={check} disabled={!input.trim()} style={{ minHeight: TAP, width: "100%", marginTop: 14, padding: "13px 0", borderRadius: 10, border: "none", background: input.trim() ? "#182848" : "#ccc", color: "#fff", fontWeight: 800, fontSize: 15, cursor: input.trim() ? "pointer" : "default" }}>정답 확인</button>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ padding: 13, borderRadius: 12, background: judged === "correct" ? "#eefaf3" : "#fdf0ef", border: judged === "correct" ? "1px solid #cdeeda" : "1px solid #f5cbc8", marginBottom: 12 }}>
                <div style={{ fontWeight: 900, color: judged === "correct" ? "#0b7a5c" : "#c0392b", marginBottom: 7 }}>{judged === "correct" ? "정답입니다!" : "오답이에요!"}</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.7 }}>내 답: {currentAnswer.input?.trim() || input.trim() || "(빈칸)"}</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.7 }}>정답: <b>{answerDisplay}</b></div>
              </div>
              <button onClick={next} style={{ minHeight: TAP, width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#182848", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{idx + 1 >= words.length ? "결과 보기" : "다음 단어"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
