import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useState } from "react";
import { getSelfAccessToken } from "../../core/bundle.jsx";
import { IS_STAFF_VIEW } from "../../core/auth.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { fetchWithTimeout } from "../../core/net.jsx";
import { MOCK_CIRCLED, loadMockDraft, mockAllMissing, mockCountByChoice, mockDurationSecFromExam, mockPageMissing, mockPagesFor, mockRoundTitle, saveMockDraft } from "../../domain/mock.jsx";

// ─── 답 입력 화면: 한 쪽씩 넘기며 손가락으로 찍기 ───
export function MockAnswerScreen({ studentId, round, exam, onBack, onSubmitted }) {
  const mineDone = exam && exam.phase === "done" && exam.roundId === round.id ? exam : null;
  // 모드: 끝난 시험 기록이 있으면 그 기록대로(물어보지 않음), 없으면 학생이 고른다
  const [noListening, setNoListening] = useState(mineDone ? !!mineDone.noListening : null);
  const [answers, setAnswers] = useState(() => {
    const d = mineDone ? loadMockDraft(studentId, round.id, !!mineDone.noListening) : null;
    return d ? d.answers.slice(0, 45) : Array(45).fill(null);
  });
  const [pageIdx, setPageIdx] = useState(0);
  const [summary, setSummary] = useState(false); // 마지막 쪽 다음의 번호별 개수 화면
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState("");

  const pages = noListening === null ? [] : mockPagesFor(noListening);

  // 모드가 정해지면 임시 저장 복원 + 이후 찍을 때마다 저장
  useEffect(() => {
    if (noListening === null) return;
    const d = loadMockDraft(studentId, round.id, noListening);
    if (d) { setAnswers(d.answers.slice(0, 45)); setPageIdx(Math.max(0, Math.min(pages.length - 1, Number(d.page) || 0))); }
  }, [noListening]);
  useEffect(() => {
    if (noListening === null) return;
    saveMockDraft(studentId, { v: 1, roundId: round.id, noListening, answers, page: pageIdx });
  }, [answers, pageIdx, noListening]);

  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 16 };

  // ── 모드 고르기 (자유 입력일 때만) ──
  if (noListening === null) {
    return (
      <div>
        <button onClick={onBack} style={{ minHeight: TAP, border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 10px 2px 0", marginBottom: 2, fontFamily: "inherit" }}>← 회차 메뉴</button>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{mockRoundTitle(round)} 답 입력</div>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>어디까지 풀었는지 골라 주세요</div>
          <button onClick={() => setNoListening(false)} style={{ minHeight: TAP, width: "100%", textAlign: "left", padding: "15px 16px", marginBottom: 10, borderRadius: 12, border: "1.5px solid #d8dfe8", background: "#fff", cursor: "pointer" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>듣기까지 다 풀었어요</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>1~45번 · 45문항 입력</div>
          </button>
          <button onClick={() => setNoListening(true)} style={{ minHeight: TAP, width: "100%", textAlign: "left", padding: "15px 16px", borderRadius: 12, border: "1.5px solid #d8dfe8", background: "#fff", cursor: "pointer" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>듣기는 안 풀었어요</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>18~45번 · 28문항 입력 · 듣기 37점은 만점 처리 (듣기 제외 표시)</div>
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (busy) return;
    if (IS_STAFF_VIEW) { setSendErr("선생님·원장 화면에서는 제출되지 않습니다(학생 기록에 남지 않게)."); return; }   // [135차수] 보기 전용
    if (!window.confirm("원장님께 제출하면 정답이 보이고 다시 못 고칩니다.\n제출할까요?")) return;
    setBusy(true); setSendErr("");
    try {
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/mock/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId, t: getSelfAccessToken(),
          roundId: round.id,
          answers,
          noListening,
          mode: mineDone ? mineDone.mode : "free",
          durationSec: mockDurationSecFromExam(mineDone),
        }),
      }, 20000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success || !data.result) throw new Error(data.error || `서버 오류 (${resp.status})`);
      saveMockDraft(studentId, null); // 임시 저장 지우기
      onSubmitted(data.result, noListening);
    } catch (e) {
      setSendErr((e?.message || "제출하지 못했어요") + " — 답은 그대로 있으니 다시 눌러 주세요");
    } finally {
      setBusy(false);
    }
  };

  // ── 번호별 개수(검산) + 제출 화면 ──
  if (summary) {
    const counts = mockCountByChoice(answers, noListening);
    const total = noListening ? 28 : 45;
    const maxCnt = Math.max(1, ...Object.values(counts));
    const missAll = mockAllMissing(answers, noListening);
    return (
      <div>
        <button onClick={() => setSummary(false)} style={{ minHeight: TAP, border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 10px 2px 0", marginBottom: 2, fontFamily: "inherit" }}>← 답 다시 보기</button>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>번호별로 몇 개 찍었나</div>
          <div style={{ fontSize: 12.5, color: "#999", marginTop: 3, marginBottom: 14 }}>한 번호에 몰려 있으면 밀려 찍은 것일 수 있어요</div>
          {[1, 2, 3, 4, 5].map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 15, width: 22 }}>{MOCK_CIRCLED[k]}</span>
              <div style={{ flex: 1, background: "#f0f2f5", borderRadius: 4, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${(counts[k] / maxCnt) * 100}%`, height: "100%", background: "#1C66A5", borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 13, color: "#555", width: 34, textAlign: "right" }}>{counts[k]}개</span>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: "#999", marginTop: 4 }}>모두 {total - missAll.length} / {total}문항</div>
          {sendErr && <div style={{ fontSize: 13, color: "#ff4757", marginTop: 12, lineHeight: 1.6 }}>{sendErr}</div>}
          <button onClick={submit} disabled={busy || missAll.length > 0} style={{ minHeight: TAP, width: "100%", marginTop: 14, padding: "14px 0", borderRadius: 12, border: "none", background: (busy || missAll.length > 0) ? "#c8cdd6" : "#1C66A5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: (busy || missAll.length > 0) ? "default" : "pointer" }}>
            {busy ? "원장님께 보내는 중…" : "원장님께 제출"}
          </button>
          <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", marginTop: 8 }}>원장님께 제출하면 다시 못 고칩니다</div>
        </div>
      </div>
    );
  }

  // ── 한 쪽씩 찍기 ──
  const page = pages[pageIdx];
  const miss = mockPageMissing(answers, page);
  const lastPage = pageIdx === pages.length - 1;
  const nums = [];
  for (let n = page[0]; n <= page[1]; n++) nums.push(n);

  return (
    <div>
      <button onClick={onBack} style={{ minHeight: TAP, border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 10px 2px 0", marginBottom: 2, fontFamily: "inherit" }}>← 회차 메뉴</button>
      <div style={card}>
        {/* [135차수 y] 쪽 점(8px)을 손가락 크기(32×44) 투명 단추 안에 넣었다 — 점 모양은 그대로. 앞 쪽으로만 돌아갈 수 있는 것도 그대로 */}
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 0, marginBottom: 4 }}>
          {pages.map((p, i) => (
            <button key={i} type="button" onClick={() => { if (i < pageIdx) setPageIdx(i); }} disabled={i >= pageIdx} aria-label={`${i + 1}쪽${i === pageIdx ? " (지금)" : i < pageIdx ? "으로 돌아가기" : ""}`}
              style={{ width: 32, height: TAP, border: "none", background: "transparent", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: i < pageIdx ? "pointer" : "default", fontFamily: "inherit" }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: i === pageIdx ? "#1C66A5" : (mockPageMissing(answers, p).length === 0 ? "#9fc3e0" : "#e3e6ec"), display: "block" }} />
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{pageIdx + 1}쪽 · {page[0]}~{page[1]}번</div>
        <div style={{ textAlign: "center", fontSize: 12, color: "#bbb", marginBottom: 12 }}>{mockRoundTitle(round)}{noListening ? " · 듣기 제외" : ""}</div>

        {nums.map(n => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <span style={{ fontSize: 14, fontWeight: 700, width: 24, textAlign: "right", color: "#555" }}>{n}</span>
            {[1, 2, 3, 4, 5].map(v => {
              const on = Number(answers[n - 1]) === v;
              return (
                <button key={v} onClick={() => setAnswers(arr => { const a = [...arr]; a[n - 1] = v; return a; })}
                  style={{ flex: 1, height: TAP, borderRadius: 22, border: on ? "none" : "1px solid #dfe3ea", background: on ? "#1C66A5" : "#fff", color: on ? "#fff" : "#8a90a0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  {MOCK_CIRCLED[v]}
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {pageIdx > 0 && (
            <button onClick={() => setPageIdx(i => i - 1)} style={{ minHeight: TAP, flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid #dfe3ea", background: "#fff", color: "#555", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← 앞 쪽</button>
          )}
          <button
            onClick={() => { if (miss.length) return; lastPage ? setSummary(true) : setPageIdx(i => i + 1); }}
            disabled={miss.length > 0}
            style={{ minHeight: TAP, flex: 2, padding: "13px 0", borderRadius: 12, border: "none", background: miss.length ? "#c8cdd6" : "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 800, cursor: miss.length ? "default" : "pointer" }}>
            {miss.length ? `${miss.join(" · ")}번이 비었어요` : (lastPage ? "다 찍었어요 → 확인하기" : "다음 쪽 →")}
          </button>
        </div>
      </div>
    </div>
  );
}
