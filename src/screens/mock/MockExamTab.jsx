import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useState } from "react";
import { getSelfAccessToken } from "../../core/bundle.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { fetchWithTimeout } from "../../core/net.jsx";
import { MOCK_NOTE_COLORS, fmtMockAttemptDate, fmtMockClock, loadMockExamState, mockExamRemainingMs, mockRoundTitle, saveMockExamState } from "../../domain/mock.jsx";
import { MockAnswerScreen } from "./MockAnswerScreen.jsx";
import { MockResultScreen } from "./MockResultScreen.jsx";
import { MockTimerScreen } from "./MockTimerScreen.jsx";

export function MockExamTab({ studentId, onBusy }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rounds, setRounds] = useState([]);
  const [notice, setNotice] = useState("");
  const [sel, setSel] = useState(null);            // 고른 회차 — null이면 목록
  const [view, setView] = useState("menu");        // sel이 있을 때: "menu" | "exam70" | "exam50" | "answer" | "result"
  // [101차수] 시험 진행·답 입력·제출 화면이면 "바쁨"을 위(App)에 알린다 — 앱 업데이트 단추가 이때는 새로고침을 안 하게.
  //   (답은 찍을 때마다 폰에 임시 저장되지만, 제출 중이거나 시간 재는 중에 화면이 바뀌면 곤란하다)
  useEffect(() => {
    const busy = !!sel && (view === "exam70" || view === "exam50" || view === "answer");
    if (typeof onBusy === "function") onBusy(busy, !!sel && (view === "exam70" || view === "exam50"));   // [135차수 ac] 둘째 값 = 시간이 가는 시험 중인지
    return () => { if (typeof onBusy === "function") onBusy(false, false); };
  }, [sel, view]);
  const [result, setResult] = useState(null);      // 방금 제출한 결과 (결과 화면용)
  const [exam, setExamState] = useState(() => loadMockExamState(studentId)); // 진행/완료된 시험 (폰 저장과 동기화)

  const setExam = (st) => { setExamState(st); saveMockExamState(studentId, st); };

  const load = async () => {
    setLoading(true); setError("");
    try {
      if (!WORKER_ORIGIN) throw new Error("서버 주소가 설정되지 않았어요");
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/mock/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, t: getSelfAccessToken() }),
      }, 20000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error(data.error || `서버 오류 (${resp.status})`);
      const list = Array.isArray(data.rounds) ? data.rounds : [];
      setRounds(list);
      setNotice(String(data.notice || ""));
      setSel(prev => {
        if (!prev) return prev;
        const fresh = list.find(r => r.id === prev.id);
        return fresh || prev; // 새 정보가 오면 갈아끼우고, 목록에서 빠졌어도 시험 중이면 유지
      });
    } catch (e) {
      setError(e?.message || "회차를 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [studentId]);

  // 앱을 껐다 켰을 때: 시험이 돌고 있으면 곧장 그 시계 화면으로 복귀 (폰 저장의 스냅샷으로 즉시 그림)
  useEffect(() => {
    const st = loadMockExamState(studentId);
    if (st && st.phase === "running" && st.snapshot) {
      setSel(prev => prev || st.snapshot);
      setView(st.mode === "timed50" ? "exam50" : "exam70");
    }
  }, [studentId]);

  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 16 };
  const badge = (text, bg, fg) => (
    <span style={{ fontSize: 11.5, fontWeight: 700, background: bg, color: fg, padding: "3px 9px", borderRadius: 999 }}>{text}</span>
  );
  const nowMs = Date.now();
  const runningExam = exam && exam.phase === "running" && mockExamRemainingMs(exam.startedAt, exam.mode, nowMs) > 0 ? exam : null;
  const doneExam = exam && exam.phase === "done" ? exam : null;

  if (loading && !sel) return <div style={{ ...card, textAlign: "center", color: "#999", padding: 36 }}>회차를 불러오는 중…</div>;

  if (error && !sel) return (
    <div style={{ ...card, textAlign: "center", padding: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>회차를 불러오지 못했어요</div>
      <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>{error}</div>
      <button onClick={load} style={{ minHeight: TAP, padding: "10px 22px", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>다시 시도</button>
    </div>
  );

  // ── 답 입력 화면 ──
  if (sel && view === "answer") {
    return (
      <MockAnswerScreen
        studentId={studentId}
        round={sel}
        exam={exam}
        onBack={() => setView("menu")}
        onSubmitted={(res, noL) => {
          setExam(null);            // 끝난 시험 기록 청소 (제출 완료)
          setResult({ ...res, noListening: res.noListening != null ? res.noListening : noL });
          setView("result");
          load();                   // 지난 기록 배지 갱신
        }}
      />
    );
  }

  // ── 결과 화면 ──
  if (sel && view === "result" && result) {
    return <MockResultScreen round={sel} result={result} onDone={() => { setResult(null); setView("menu"); }} />;
  }

  // ── 시계 화면 ──
  if (sel && (view === "exam70" || view === "exam50")) {
    return (
      <MockTimerScreen
        studentId={studentId}
        round={sel}
        mode={view === "exam50" ? "timed50" : "timed70"}
        exam={exam}
        onExamChange={setExam}
        onBack={() => setView("menu")}
      />
    );
  }

  // ── 회차 메뉴 화면 ──
  if (sel) {
    const r = sel;
    const otherRunning = runningExam && runningExam.roundId !== r.id;      // 다른 회차 시험이 도는 중
    const mineRunning = runningExam && runningExam.roundId === r.id ? runningExam : null;
    const mineDone = doneExam && doneExam.roundId === r.id ? doneExam : null;
    const remainTxt = runningExam ? fmtMockClock(mockExamRemainingMs(runningExam.startedAt, runningExam.mode, nowMs)) : "";

    const menuBtn = (enabled) => ({
      width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
      padding: "15px 16px", marginBottom: 10, borderRadius: 12, cursor: enabled ? "pointer" : "default",
      border: enabled ? "1.5px solid #d8dfe8" : "1px solid #eee",
      background: enabled ? "#fff" : "#fafafa", opacity: enabled ? 1 : 0.6,
    });

    // 이미 끝난 시험 기록이 남아 있는데(답 입력 전) 새로 시작하려는 경우 확인
    const guardRestart = (go) => {
      if (mineDone) {
        if (!window.confirm("끝낸 시험의 답을 아직 입력하지 않았어요.\n새로 시작하면 시계가 처음부터 다시 갑니다. 새로 시작할까요?")) return;
        setExam(null);
      }
      go();
    };

    const attempts = Array.isArray(r.myAttempts) ? r.myAttempts : [];
    return (
      <div>
        <button onClick={() => { setSel(null); setView("menu"); }} style={{ minHeight: TAP, border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 10px 2px 0", marginBottom: 2, fontFamily: "inherit" }}>← 회차 목록</button>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{mockRoundTitle(r)}</div>
            {r.note && MOCK_NOTE_COLORS[r.note] && badge(r.note, MOCK_NOTE_COLORS[r.note].bg, MOCK_NOTE_COLORS[r.note].fg)}
          </div>
          <div style={{ fontSize: 13, color: "#999", marginTop: 4, marginBottom: 16 }}>
            {r.host ? `${r.host} · ` : ""}45문항 · 100점 (듣기 37 + 독해 63)
          </div>

          {otherRunning && (
            <div style={{ background: "#fff8f0", border: "1px solid #ffd9ad", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "#b3641b", lineHeight: 1.6 }}>
              지금 <b>{runningExam.snapshot ? mockRoundTitle(runningExam.snapshot) : "다른 회차"}</b> 시험이 진행 중이에요 (남은 {remainTxt})<br />
              <button onClick={() => { setSel(runningExam.snapshot || r); setView(runningExam.mode === "timed50" ? "exam50" : "exam70"); }} style={{ minHeight: TAP, marginTop: 6, border: "none", background: "#e67e22", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>이어서 하기</button>
            </div>
          )}
          {mineDone && (
            <div style={{ background: "#e8f8f5", border: "1px solid #b7ecdf", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "#0b7a5c", lineHeight: 1.6 }}>
              시험이 끝났어요{mineDone.noListening ? " (듣기 제외)" : ""}. 이제 [답 입력]에서 답을 옮겨 찍으면 돼요.
            </div>
          )}

          <button style={menuBtn(r.hasAudio && !otherRunning)} onClick={() => {
            if (!r.hasAudio || otherRunning) return;
            if (mineRunning && mineRunning.mode === "timed50") { alert("듣기 없이 50분 시험이 진행 중이에요.\n먼저 [시험 끝내기]를 해야 듣기를 시작할 수 있어요."); return; }
            guardRestart(() => setView("exam70"));
          }}>
            <span style={{ fontSize: 24 }}>🎧</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>{mineRunning && mineRunning.mode === "timed70" ? "듣기로 돌아가기" : "듣기"}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {!r.hasAudio ? "듣기 파일이 아직 없어요"
                  : mineRunning && mineRunning.mode === "timed70" ? `시험 진행 중 · 남은 ${remainTxt}`
                  : "재생하면 70분 시험이 시작돼요"}
              </div>
            </span>
          </button>

          <button style={menuBtn(!otherRunning)} onClick={() => {
            if (otherRunning) return;
            if (mineRunning && mineRunning.mode === "timed70") { alert("듣기 70분 시험이 진행 중이에요.\n먼저 [시험 끝내기]를 해야 해요."); return; }
            guardRestart(() => setView("exam50"));
          }}>
            <span style={{ fontSize: 24 }}>⏱</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>{mineRunning && mineRunning.mode === "timed50" ? "시계로 돌아가기" : "듣기 없이 풀기 (50분)"}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {mineRunning && mineRunning.mode === "timed50" ? `시험 진행 중 · 남은 ${remainTxt}` : "독해만 풀 때 · 듣기 37점은 만점으로 쳐요"}
              </div>
            </span>
          </button>

          <button style={menuBtn(!otherRunning && !mineRunning)} onClick={() => {
            if (otherRunning) return;
            if (mineRunning) { alert(`시험이 진행 중이에요!\n시험이 끝나면 답 입력이 열려요. (남은 ${remainTxt})`); return; }
            setView("answer");
          }}>
            <span style={{ fontSize: 24 }}>✍️</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>답 입력</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {mineRunning ? `시험이 끝나면 열려요 · 남은 ${remainTxt}`
                  : mineDone ? `방금 끝낸 시험${mineDone.noListening ? " (듣기 제외)" : ""} 답을 옮겨 찍어요`
                  : "다 풀고 나서 손가락으로 옮겨 찍어요 (시계 없이도 돼요)"}
              </div>
            </span>
          </button>

          {/* [96차수 09-05 · 원장 결정] OMR 카드 사진 단추는 준비될 때까지 숨긴다 — 눌러도 아무 일이 없어 고장으로 오해했다.
              되살리려면 아래 false && 를 지우면 된다. */}
          {false && (
          <button style={menuBtn(false)}>
            <span style={{ fontSize: 24 }}>📷</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>OMR 카드 사진</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>준비 중이에요</div>
            </span>
          </button>
          )}

          {attempts.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#2A2A28", marginBottom: 8 }}>지난 기록</div>
              {attempts.slice().reverse().map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", padding: "4px 0" }}>
                  <span style={{ color: "#999", minWidth: 34 }}>{fmtMockAttemptDate(a.at)}</span>
                  <span style={{ fontWeight: 800 }}>{a.score}점</span>
                  {a.band ? <span style={{ color: "#1C66A5", fontWeight: 700 }}>{a.band}등급</span> : null}
                  {a.noListening && badge("듣기 제외", "#fff4e6", "#e67e22")}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 회차 목록 화면 ──
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>✏️ 모의고사</div>
        <button onClick={load} style={{ minHeight: TAP, border: "1px solid #e5e5e5", background: "#fff", color: "#666", fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}>새로고침</button>
      </div>
      {runningExam && (
        <button onClick={() => { setSel(runningExam.snapshot); setView(runningExam.mode === "timed50" ? "exam50" : "exam70"); }} style={{ minHeight: TAP, ...card, width: "100%", textAlign: "left", display: "block", marginBottom: 10, cursor: "pointer", padding: 14, borderColor: "#ffd9ad", background: "#fff8f0" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#b3641b" }}>⏱ 시험 진행 중 — {runningExam.snapshot ? mockRoundTitle(runningExam.snapshot) : ""}</div>
          <div style={{ fontSize: 12.5, color: "#b3641b", marginTop: 3 }}>남은 {fmtMockClock(mockExamRemainingMs(runningExam.startedAt, runningExam.mode, nowMs))} · 누르면 이어서 해요</div>
        </button>
      )}
      {rounds.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#999", padding: 32, fontSize: 14, lineHeight: 1.7 }}>
          {notice || <>아직 열린 회차가 없어요.<br />선생님이 회차를 열면 여기에 나타나요.</>}
        </div>
      ) : rounds.map((r) => {
        const attempts = Array.isArray(r.myAttempts) ? r.myAttempts : [];
        const last = attempts.length ? attempts[attempts.length - 1] : null;
        return (
          <button key={r.id} onClick={() => { setSel(r); setView("menu"); }} style={{ minHeight: TAP, ...card, width: "100%", textAlign: "left", display: "block", marginBottom: 10, cursor: "pointer", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15.5, fontWeight: 800, color: "#2A2A28" }}>{mockRoundTitle(r)}</span>
              {r.note && MOCK_NOTE_COLORS[r.note] && badge(r.note, MOCK_NOTE_COLORS[r.note].bg, MOCK_NOTE_COLORS[r.note].fg)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
              {r.host && <span style={{ fontSize: 12, color: "#999", marginRight: 2 }}>{r.host}</span>}
              {r.hasAudio ? badge("🎧 듣기 있음", "#e8f8f5", "#00926f") : badge("듣기 없음", "#f4f4f4", "#999")}
              {last && badge(`지난 기록 ${last.score}점${attempts.length > 1 ? ` · ${attempts.length}회` : ""}`, "#eef1ff", "#1C66A5")}
            </div>
          </button>
        );
      })}
      <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
        문제지는 학원에서 종이로 받아요 · 제출하면 점수가 바로 나와요
      </div>
    </div>
  );
}
