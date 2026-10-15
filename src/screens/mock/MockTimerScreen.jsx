import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useRef, useState } from "react";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { fmtMockClock, loadMockSpeed, mockClampSpeed, mockExamDurationMin, mockExamRemainingMs, mockRoundTitle, mockSpeedKey } from "../../domain/mock.jsx";

// ─── 듣기 + 시험 시계 화면 (mode: timed70=듣기 포함 / timed50=듣기 없이) ───
export function MockTimerScreen({ studentId, round, mode, exam, onExamChange, onBack }) {
  const withAudio = mode === "timed70";
  const durMs = mockExamDurationMin(mode) * 60 * 1000;
  const isMine = exam && exam.roundId === round.id && exam.mode === mode;
  const running = !!(isMine && exam.phase === "running");
  const done = !!(isMine && exam.phase === "done");

  const [now, setNow] = useState(Date.now());
  const [speed, setSpeed] = useState(() => loadMockSpeed(studentId));
  const [playing, setPlaying] = useState(false);
  const [posSec, setPosSec] = useState(0);
  const [durSec, setDurSec] = useState(0);
  const [audioErr, setAudioErr] = useState("");
  const audioRef = useRef(null);

  // 시계는 0.5초마다 다시 계산 — 값을 저장하지 않고 시작 시각에서 계산만 한다
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const remainMs = running ? mockExamRemainingMs(exam.startedAt, exam.mode, now) : (done ? 0 : durMs);

  // 시간이 다 되면 자동으로 "끝" 상태로 넘긴다 (앱을 껐다 켠 사이 끝난 경우도 여기서 잡힘)
  useEffect(() => {
    if (running && remainMs <= 0) {
      try { if (audioRef.current) audioRef.current.pause(); } catch (e) { /* 무시 */ }
      onExamChange({ ...exam, phase: "done", endedAt: (Number(exam.startedAt) || 0) + durMs });
    }
  }, [running, remainMs <= 0]);

  // 속도는 오디오에 즉시 반영 + 폰에 기억
  useEffect(() => {
    if (audioRef.current) { try { audioRef.current.playbackRate = speed; } catch (e) { /* 무시 */ } }
    try { localStorage.setItem(mockSpeedKey(studentId), String(speed)); } catch (e) { /* 무시 */ }
  }, [speed]);

  const startExam = () => {
    onExamChange({
      v: 1, roundId: round.id, mode, noListening: mode === "timed50",
      phase: "running", startedAt: Date.now(),
      snapshot: { id: round.id, year: round.year, month: round.month, grade: round.grade, note: round.note || "", host: round.host || "", hasAudio: !!round.hasAudio, audioPath: round.audioPath || "" },
    });
  };

  const finishEarly = () => {
    if (!running) return;
    if (!window.confirm("정말 시험을 끝낼까요?\n끝내면 시계가 멈추고 답 입력이 열려요.")) return;
    try { if (audioRef.current) audioRef.current.pause(); } catch (e) { /* 무시 */ }
    onExamChange({ ...exam, phase: "done", endedAt: Date.now() });
  };

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    setAudioErr("");
    if (a.paused) {
      try {
        a.playbackRate = speed;
        await a.play();
        if (!running && !done) startExam(); // 첫 재생 = 70분 시작 (원장 확정)
      } catch (e) {
        setAudioErr("재생을 시작하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.");
      }
    } else {
      a.pause(); // 재생을 멈춰도 시험 시계는 계속 흐른다 (실전과 같게)
    }
  };

  const seekBy = (d) => {
    const a = audioRef.current;
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + d));
  };

  const fmtPos = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 18 };
  const lowTime = running && remainMs <= 5 * 60 * 1000;

  return (
    <div>
      <button onClick={onBack} style={{ minHeight: TAP, border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 10px 2px 0", marginBottom: 2, fontFamily: "inherit" }}>← 회차 메뉴</button>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{mockRoundTitle(round)}{round.note ? ` · ${round.note}` : ""}</div>
        <div style={{ fontSize: 12.5, color: "#999", marginTop: 3 }}>{withAudio ? "듣기 시험 (70분)" : "듣기 없이 풀기 (50분 · 듣기 제외)"}</div>

        <div style={{ fontSize: 13, color: "#999", marginTop: 18 }}>남은 시간</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: 1, fontVariantNumeric: "tabular-nums", color: done ? "#00b894" : (lowTime ? "#ff4757" : "#2A2A28"), lineHeight: 1.15 }}>
          {fmtMockClock(remainMs)}
        </div>
        {!running && !done && (
          <div style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
            {withAudio ? "▶︎ 재생을 누르면 시험이 시작돼요" : "아래 버튼을 누르면 시험이 시작돼요"}
          </div>
        )}
        {done && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#00b894" }}>시험 끝났습니다! 🎉</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 6, lineHeight: 1.6 }}>
              수고했어요. 이제 답 입력이 열렸어요.<br />회차 메뉴에서 [답 입력]을 눌러 주세요.
            </div>
            <button onClick={onBack} style={{ minHeight: TAP, marginTop: 14, padding: "11px 26px", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>회차 메뉴로</button>
          </div>
        )}

        {withAudio && !done && (
          <div style={{ marginTop: 20, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <audio
              ref={audioRef}
              src={`${WORKER_ORIGIN}${round.audioPath || `/files/mock-audio/${round.id}.mp3`}`}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setPosSec(e.target.currentTime || 0)}
              onLoadedMetadata={(e) => { setDurSec(e.target.duration || 0); try { e.target.playbackRate = speed; } catch (err) { /* 무시 */ } }}
              onError={() => setAudioErr("듣기 파일을 불러오지 못했어요. 인터넷을 확인해 주세요.")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
              <button onClick={() => seekBy(-10)} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 999, width: 46, height: 46, fontSize: 12, fontWeight: 700, color: "#555", cursor: "pointer" }}>-10초</button>
              <button onClick={togglePlay} style={{ border: "none", background: "#1C66A5", color: "#fff", borderRadius: "50%", width: 62, height: 62, fontSize: 24, cursor: "pointer" }}>{playing ? "⏸" : "▶︎"}</button>
              <button onClick={() => seekBy(10)} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 999, width: 46, height: 46, fontSize: 12, fontWeight: 700, color: "#555", cursor: "pointer" }}>+10초</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <input
                type="range" min={0} max={Math.max(1, Math.floor(durSec))} step={1}
                value={Math.min(Math.floor(posSec), Math.max(1, Math.floor(durSec)))}
                onChange={(e) => { const a = audioRef.current; if (a && isFinite(a.duration)) a.currentTime = Number(e.target.value) || 0; }}
                style={{ width: "100%", height: TAP, margin: 0, display: "block" }}
              />
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{fmtPos(posSec)} / {durSec ? fmtPos(durSec) : "--:--"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 13, color: "#999" }}>속도</span>
              <button onClick={() => setSpeed(s => mockClampSpeed(s - 0.1))} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 10, width: TAP, height: TAP, fontSize: 18, cursor: "pointer", color: "#555" }}>−</button>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 44, fontVariantNumeric: "tabular-nums" }}>{speed.toFixed(1)}배</span>
              <button onClick={() => setSpeed(s => mockClampSpeed(s + 0.1))} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 10, width: TAP, height: TAP, fontSize: 18, cursor: "pointer", color: "#555" }}>+</button>
            </div>
            {audioErr && <div style={{ fontSize: 12.5, color: "#ff4757", marginTop: 10 }}>{audioErr}</div>}
          </div>
        )}

        {!withAudio && !running && !done && (
          <button onClick={startExam} style={{ minHeight: TAP, marginTop: 18, padding: "13px 30px", borderRadius: 12, border: "none", background: "#1C66A5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>⏱ 50분 시작</button>
        )}

        {running && (
          <div style={{ marginTop: 18, borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 10 }}>시험이 끝날 때까지 답 입력은 잠겨 있어요</div>
            <button onClick={finishEarly} style={{ minHeight: TAP, border: "1.5px solid #ff4757", background: "#fff", color: "#ff4757", borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>시험 끝내기</button>
          </div>
        )}
      </div>
    </div>
  );
}
