import { useEffect, useRef, useState } from "react";
import { IS_STAFF_VIEW } from "../../core/auth.jsx";
import { getSelfAccessToken } from "../../core/bundle.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { fetchWithTimeout } from "../../core/net.jsx";
import { PHONICS_WORD_MAX_SEC, applyPhonicsSent, canSendPhonics, fmtPhonicsDue, fmtPhonicsDueShort, isPhonicsDone, isPhonicsOverdue, phonicsRemaining } from "../../domain/phonics.jsx";
import { getTodayStr, shiftYmd } from "../../domain/time.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";
import { RecordScreen } from "../more/RecordScreen.jsx";
import { blobToBase64, fmtSec, useRecorder } from "../more/useRecorder.jsx";

// ═══ [152차수] 더보기 → 🎤 파닉스 — 원장이 낸 파닉스 숙제(단어 몇 개)를 단어마다 녹음해서 보낸다(원장 11-05 요청) ═══
//   ① 목록: 숙제 카드(마감 가까운 것 먼저) "11/7(목)까지 · 워드마스터 Basic DAY 3 · 단어 5개 · 녹음 3/5" + 원장 메모. 다 보냈으면 초록 ✓, 마감 지났는데 덜 보냈으면 빨간 "마감 지남".
//   ② 숙제 안: 단어 한 줄씩 `address · 주소; 연설` + [🎙 녹음] 또는 (보낸 뒤) ▶ 0:04 · [다시 녹음]. 한 단어 최대 20초. 끝나면 ▶ 미리 듣기 → [보내기].
//      보내기: POST /student/recording { studentId, t, taskId, wordNo, label:<단어>, dur, mime, dataBase64 } → { success, id, key, at, task:{ done, total } }
//      [다시 녹음]은 보낸 것을 덮어쓴다(워커가 옛것 삭제). 보낸 녹음은 ▶로 다시 들을 수 있다(/files/<key>?sid=&t=).
//      선생님이 들으면 "선생님 확인 ✓", 메모가 있으면 그 아래 한 줄. 다 보내면 카드 위에 "다 보냈어요 🎉".
//   ③ 맨 아래 "자유 녹음" 칸 = 145차수 녹음 제출 화면 그대로(메뉴를 이 안으로 합쳤다).
//   목록 자료는 App(usePhonicsTasks)이 들고 있다 — 홈 단추와 같은 목록. 여기서 보내면 그 자료를 바로 고치고(task.done/total) 뒤이어 한 번 더 받는다.
const MAX_BYTES = 2 * 1024 * 1024;     // 파일 최대 2MB — 145차수와 같음
const CARD = { background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: "14px 16px" };
const BTN = { minHeight: TAP, border: "none", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
const BTN_PRIMARY = { ...BTN, background: UI.navy, color: "#fff" };
const BTN_SOFT = { ...BTN, background: UI.blueBg, color: UI.blue };
const BTN_GHOST = { ...BTN, background: "#F0F2F6", color: UI.sub };
const secHead = { fontSize: 13, fontWeight: 800, color: UI.sub, margin: "18px 2px 8px" };
const progressBar = (ratio, color) => (
  <div style={{ height: 6, borderRadius: 3, background: "#E9ECF2", overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, ratio * 100))}%`, background: color, transition: "width .25s linear" }} />
  </div>
);

// 숙제 카드 한 장(목록용)
function TaskCard({ task, todayStr, onOpen }) {
  const done = isPhonicsDone(task);
  const overdue = isPhonicsOverdue(task, todayStr);
  const dueText = fmtPhonicsDue(task.due);
  const badge = done
    ? { bg: UI.okBg, fg: UI.okFg, t: "✓ 다 보냈어요" }
    : overdue ? { bg: UI.warnBg, fg: UI.warnFg, t: "마감 지남" } : null;
  return (
    <button type="button" onClick={onOpen}
      style={{ ...CARD, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, borderColor: !done && overdue ? "#F3C9C4" : UI.line }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 14, background: done ? UI.okBg : overdue ? UI.warnBg : UI.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{done ? "✅" : "🎤"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: !done && overdue ? UI.warnFg : UI.sub }}>{dueText || "마감 없음"}</span>
        <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: UI.text, marginTop: 2, lineHeight: 1.35, wordBreak: "keep-all" }}>{task.title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: done ? UI.okFg : UI.sub, fontWeight: done ? 700 : 500, marginTop: 3 }}>단어 {task.total}개 · 녹음 {task.done}/{task.total}</span>
        {task.memo && <span style={{ display: "block", fontSize: 12.5, color: UI.sub, marginTop: 4, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {task.memo}</span>}
      </span>
      {badge
        ? <span style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 10, background: badge.bg, color: badge.fg, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{badge.t}</span>
        : <span aria-hidden="true" style={{ color: UI.dim, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>}
    </button>
  );
}

// 숙제 안(단어 한 줄씩)
function TaskDetail({ studentId, task, todayStr, onBack, onTasksChange, onReload, onBusy }) {
  const R = useRecorder({ maxSec: PHONICS_WORD_MAX_SEC, onBusy });
  const { supported, phase, elapsed, clip, notice, setNotice, previewOn, previewPos, setPreviewPos, setPreviewOn, previewRef, setPhase, aliveRef, busy } = R;
  const [activeNo, setActiveNo] = useState(null);     // 지금 녹음하거나 녹음을 마친 단어 번호(한 번에 하나)
  const [flashNo, setFlashNo] = useState(null);       // "보냈어요 ✓" 잠깐 보여 줄 단어
  const [playingNo, setPlayingNo] = useState(null);   // 보낸 녹음을 듣는 중인 단어
  const [playPos, setPlayPos] = useState(0);
  const playRef = useRef(null);
  const done = isPhonicsDone(task);
  const overdue = isPhonicsOverdue(task, todayStr);
  const canSend = canSendPhonics(task, todayStr);
  const remaining = phonicsRemaining(task);
  useEffect(() => () => { try { playRef.current && playRef.current.pause(); } catch (e) {} }, []);
  const stopPlay = () => { try { if (playRef.current) { playRef.current.pause(); playRef.current.removeAttribute("src"); playRef.current.load(); } } catch (e) {} setPlayingNo(null); setPlayPos(0); };
  const togglePlay = (w) => {
    if (playingNo === w.no) { stopPlay(); return; }
    R.stopPreview(); stopPlay();
    const a = playRef.current; if (!a || !w.rec || !w.rec.key || !WORKER_ORIGIN) return;
    try {
      a.src = `${WORKER_ORIGIN}/files/${w.rec.key}?sid=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}`;
      setPlayingNo(w.no); setPlayPos(0);
      const p = a.play(); if (p && p.catch) p.catch(() => { setPlayingNo(null); setNotice("녹음을 불러오지 못했어요. 잠시 뒤 다시 해 주세요."); });
    } catch (e) { setPlayingNo(null); }
  };
  // [🎙 녹음] / [다시 녹음] — 다른 단어의 녹음(아직 안 보낸 것)은 버리고 이 단어를 녹음한다
  const startWord = async (w) => {
    if (busy) return;
    if (!canSend) { setNotice("마감이 지나서 이제 보낼 수 없어요"); return; }
    if (IS_STAFF_VIEW) { setNotice("보기 전용 화면에서는 녹음할 수 없어요"); return; }
    setFlashNo(null);
    setActiveNo(w.no);
    const ok = await R.start(() => stopPlay());
    if (!ok && aliveRef.current) { /* 권한 거절 등 — 안내만 남기고 줄은 그대로 */ }
  };
  const cancelWord = () => { R.reset(); setActiveNo(null); };
  const togglePreview = () => R.togglePreview(() => stopPlay());
  // [보내기]
  const send = async (w) => {
    if (!clip || busy) return;
    setNotice("");
    if (IS_STAFF_VIEW) { setNotice("보기 전용 화면에서는 보낼 수 없어요"); return; }
    if (!canSend) { setNotice("마감이 지나서 이제 보낼 수 없어요"); return; }
    if (clip.blob.size > MAX_BYTES) { setNotice("녹음이 너무 길어요. 다시 짧게 녹음해 주세요."); return; }
    if (!WORKER_ORIGIN) { setNotice("지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요."); return; }
    R.stopPreview();
    setPhase("sending");
    try {
      const dataBase64 = await blobToBase64(clip.blob);
      const body = { studentId, t: getSelfAccessToken(), taskId: task.id, wordNo: w.no, label: String(w.word || "").slice(0, 80), dur: clip.dur, mime: clip.mime, dataBase64 };
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/student/recording`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }, 30000);
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 413) throw new Error("녹음이 너무 길어요. 다시 짧게 녹음해 주세요.");
      if (resp.status === 401 || resp.status === 403) throw new Error("앱을 새로고침한 뒤 다시 해 주세요");
      if (resp.status === 410) throw new Error("마감이 지나서 이제 보낼 수 없어요");
      if (!resp.ok || !data.success) throw new Error(String(data && data.error || "").includes("마감") ? "마감이 지나서 이제 보낼 수 없어요" : "지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요.");
      if (!aliveRef.current) return;
      const rec = { id: String(data.id || `local_${Date.now()}`), key: String(data.key || ""), dur: clip.dur, at: data.at || new Date().toISOString(), mime: clip.mime, heard: false, memo: "" };
      onTasksChange((prev) => applyPhonicsSent(prev, task.id, w.no, rec, data.task));
      R.reset(); setActiveNo(null);
      setFlashNo(w.no);
      setTimeout(() => { if (aliveRef.current) setFlashNo((cur) => (cur === w.no ? null : cur)); }, 2000);
      onReload();   // 숫자·선생님 확인을 서버 기준으로 한 번 더 맞춘다
    } catch (e) {
      if (!aliveRef.current) return;
      const m = String(e?.message || "");
      setNotice(m.startsWith("녹음이") || m.startsWith("앱을") || m.startsWith("마감") ? m : "지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요.");
      setPhase("done");
    }
  };
  // 위 띠
  const topBand = done
    ? { bg: UI.okBg, fg: UI.okFg, t: "다 보냈어요 🎉", s: `단어 ${task.total}개 모두 보냈어요${task.due ? ` · ${fmtPhonicsDue(task.due)}` : ""}` }
    : !canSend
      ? { bg: UI.warnBg, fg: UI.warnFg, t: "마감이 지났어요", s: "이제는 보낼 수 없어요" }
      : overdue
        ? { bg: UI.warnBg, fg: UI.warnFg, t: `마감 지남 · ${remaining}개 남음`, s: `${fmtPhonicsDueShort(shiftYmd(task.due, 7))}는 보낼 수 있어요 · 녹음 ${task.done}/${task.total}` }
        : { bg: UI.blueBg, fg: UI.navy, t: `${remaining}개 남음`, s: `${task.due ? fmtPhonicsDue(task.due) + " · " : ""}녹음 ${task.done}/${task.total}` };
  // 단어 줄 오른쪽 + 아래(녹음 중/녹음 끝 영역)
  const wordRow = (w, i) => {
    const active = activeNo === w.no;
    const playing = playingNo === w.no;
    const sentFlash = flashNo === w.no;
    const right = active && (phase === "recording" || ((phase === "done" || phase === "sending") && clip))
      ? null
      : w.rec
        ? (
          <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => togglePlay(w)} disabled={!w.rec.key} aria-label={playing ? "멈춤" : "들어보기"}
              style={{ ...BTN_SOFT, padding: "8px 12px", background: playing ? UI.navy : UI.blueBg, color: playing ? "#fff" : UI.blue, opacity: w.rec.key ? 1 : 0.5, fontVariantNumeric: "tabular-nums" }}>{playing ? "■" : "▶"} {fmtSec(w.rec.dur)}</button>
            <button type="button" onClick={() => startWord(w)} disabled={busy || !canSend} style={{ ...BTN_GHOST, padding: "8px 12px", opacity: (busy || !canSend) ? 0.5 : 1 }}>다시 녹음</button>
          </span>
        )
        : <button type="button" onClick={() => startWord(w)} disabled={busy || !canSend || !supported} style={{ ...BTN_PRIMARY, flexShrink: 0, opacity: (busy || !canSend || !supported) ? 0.5 : 1 }}>🎙 녹음</button>;
    return (
      <div key={w.no} style={{ padding: "12px 14px", borderTop: i ? `1px solid ${UI.line}` : "none", background: active ? "#FAFBFF" : "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 22, fontSize: 12.5, fontWeight: 800, color: UI.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{w.no}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 17, fontWeight: 800, color: UI.text, letterSpacing: -0.2, wordBreak: "break-word" }}>{w.word || "(단어 없음)"}</span>
            {w.meaning && <span style={{ display: "block", fontSize: 13, color: UI.sub, marginTop: 2, lineHeight: 1.45, wordBreak: "keep-all" }}>{w.meaning}</span>}
          </span>
          {right}
        </div>
        {/* 보낸 뒤 표시: 선생님 확인 ✓ · 메모 (145차수 녹음 제출 목록과 같은 모양) */}
        {w.rec && !active && (
          <div style={{ marginLeft: 32, marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {sentFlash && <span role="status" style={{ fontSize: 12, fontWeight: 800, color: UI.okFg }}>보냈어요 ✓</span>}
              {!sentFlash && <span style={{ fontSize: 12, color: UI.dim }}>보냄</span>}
              {w.rec.heard && <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.okFg }}>선생님 확인 ✓</span>}
            </div>
            {w.rec.memo && <div style={{ fontSize: 12.5, color: UI.sub, marginTop: 3, lineHeight: 1.5, wordBreak: "break-word" }}>💬 {w.rec.memo}</div>}
            {playing && <div style={{ marginTop: 8 }}>{progressBar(playPos / Math.max(1, Number(w.rec.dur) || 1), UI.blue)}</div>}
          </div>
        )}
        {/* 이 단어를 녹음 중 */}
        {active && phase === "recording" && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 800, color: UI.text }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: "#E53935", display: "inline-block", animation: "mapleRecBlink 1s step-start infinite" }} />
              녹음 중 <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSec(elapsed)}</span> <span style={{ fontSize: 12.5, color: UI.dim, fontWeight: 700 }}>/ {fmtSec(PHONICS_WORD_MAX_SEC)}</span>
            </div>
            <div style={{ marginTop: 8 }}>{progressBar(elapsed / PHONICS_WORD_MAX_SEC, "#E53935")}</div>
            <button type="button" onClick={() => R.stop()} style={{ ...BTN, width: "100%", marginTop: 10, height: 48, borderRadius: 24, background: "#E53935", color: "#fff", fontSize: 15 }}>■ 정지</button>
            <div style={{ fontSize: 11.5, color: UI.dim, marginTop: 6 }}>{fmtSec(PHONICS_WORD_MAX_SEC)}이 되면 저절로 멈춰요</div>
          </div>
        )}
        {/* 이 단어 녹음 끝 — 미리 듣기 · 보내기 */}
        {active && (phase === "done" || phase === "sending") && clip && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: UI.text }}>녹음 완료</span>
              <span style={{ fontSize: 12.5, color: UI.sub, fontVariantNumeric: "tabular-nums" }}>{fmtSec(previewOn ? previewPos : clip.dur)} / {fmtSec(clip.dur)}</span>
            </div>
            {progressBar(previewOn ? previewPos / Math.max(1, clip.dur) : 1, previewOn ? UI.blue : "#C9D2E3")}
            <audio ref={previewRef} src={clip.url} preload="auto" style={{ display: "none" }}
              onTimeUpdate={(e) => setPreviewPos(e.currentTarget.currentTime || 0)}
              onEnded={() => { setPreviewOn(false); setPreviewPos(0); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={togglePreview} disabled={phase === "sending"} style={{ ...BTN_SOFT, flex: 1, opacity: phase === "sending" ? 0.6 : 1 }}>{previewOn ? "■ 멈춤" : "▶ 미리 듣기"}</button>
              <button type="button" onClick={() => startWord(w)} disabled={phase === "sending"} style={{ ...BTN_GHOST, flex: 1, opacity: phase === "sending" ? 0.6 : 1 }}>↺ 다시</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={cancelWord} disabled={phase === "sending"} style={{ ...BTN_GHOST, flexShrink: 0, opacity: phase === "sending" ? 0.6 : 1 }}>취소</button>
              <button type="button" onClick={() => send(w)} disabled={phase === "sending"} style={{ ...BTN_PRIMARY, flex: 1, height: 48, borderRadius: 14, fontSize: 15, opacity: phase === "sending" ? 0.6 : 1 }}>{phase === "sending" ? "보내는 중…" : w.rec ? "보내기(덮어쓰기)" : "보내기"}</button>
            </div>
          </div>
        )}
      </div>
    );
  };
  return (
    <div>
      <style>{`@keyframes mapleRecBlink { 50% { opacity: 0.25; } }`}</style>
      <button type="button" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: "2px 6px 6px 2px", minHeight: TAP, fontSize: 14, fontWeight: 700, color: UI.blue, cursor: "pointer", fontFamily: "inherit" }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>‹</span> 숙제 목록
      </button>
      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 12px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: UI.text, lineHeight: 1.35, wordBreak: "keep-all" }}>{task.title}</div>
          <div style={{ fontSize: 12.5, color: UI.sub, marginTop: 3 }}>단어 {task.total}개{task.due ? ` · ${fmtPhonicsDue(task.due)}` : ""}</div>
          {task.memo && <div style={{ marginTop: 8, fontSize: 13, color: UI.text, background: "#FFF8E6", border: "1px solid #F6E3A8", borderRadius: 10, padding: "8px 10px", lineHeight: 1.5, wordBreak: "break-word" }}>💬 선생님 메모 · {task.memo}</div>}
        </div>
        <div style={{ background: topBand.bg, color: topBand.fg, padding: "10px 16px" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>{topBand.t}</div>
          <div style={{ fontSize: 12.5, marginTop: 2, opacity: 0.9 }}>{topBand.s}</div>
          {!done && <div style={{ marginTop: 8 }}>{progressBar(task.total ? task.done / task.total : 0, topBand.fg)}</div>}
        </div>
      </div>
      {!supported && <div style={{ ...CARD, marginTop: 10, textAlign: "center", color: UI.sub, fontSize: 14, lineHeight: 1.6 }}>🎤 이 폰에서는 녹음이 안 돼요<br /><span style={{ fontSize: 12.5, color: UI.dim }}>다른 폰이나 크롬·사파리 최신 판으로 열어 주세요</span></div>}
      {notice && (
        <div style={{ marginTop: 10, background: UI.warnBg, color: UI.warnFg, borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>{notice}</div>
      )}
      <audio ref={playRef} preload="none" style={{ display: "none" }}
        onTimeUpdate={(e) => setPlayPos(e.currentTarget.currentTime || 0)}
        onEnded={stopPlay} onError={() => { if (playingNo != null) { setPlayingNo(null); setPlayPos(0); } }} />
      <div style={secHead}>단어 <span style={{ fontWeight: 600, color: UI.dim }}>· 한 단어 {fmtSec(PHONICS_WORD_MAX_SEC)}까지</span></div>
      <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, overflow: "hidden" }}>
        {task.words.length === 0 && <div style={{ padding: "22px 14px", textAlign: "center", color: UI.dim, fontSize: 13.5 }}>이 숙제에는 단어가 없어요</div>}
        {task.words.map(wordRow)}
      </div>
    </div>
  );
}

export function PhonicsScreen({ studentId, tasks, tasksState, onReload, onTasksChange, openTaskId, onOpenTask, onBusy }) {
  const todayStr = getTodayStr();
  // 화면에 들어오면 목록을 새로 받는다(홈에서 받아 둔 것이 있어도 — 선생님 확인·메모가 바뀌었을 수 있다)
  useEffect(() => { onReload(); }, [studentId]);
  const list = Array.isArray(tasks) ? tasks : [];
  if (openTaskId) {
    const task = list.find((t) => String(t.id) === String(openTaskId));
    if (task) return <TaskDetail key={task.id} studentId={studentId} task={task} todayStr={todayStr} onBack={() => onOpenTask(null)} onTasksChange={onTasksChange} onReload={onReload} onBusy={onBusy} />;
    return (
      <div>
        <button type="button" onClick={() => onOpenTask(null)} style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: "2px 6px 6px 2px", minHeight: TAP, fontSize: 14, fontWeight: 700, color: UI.blue, cursor: "pointer", fontFamily: "inherit" }}>
          <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>‹</span> 숙제 목록
        </button>
        <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>{tasksState === "loading" ? "불러오는 중…" : <>이 숙제는 이제 없어요<br /><span style={{ fontSize: 12.5 }}>마감 뒤 7일이 지난 숙제는 안 보여요</span></>}</div>
      </div>
    );
  }
  const pendingCount = list.filter((t) => !isPhonicsDone(t) && canSendPhonics(t, todayStr)).length;
  return (
    <div>
      <div style={{ fontSize: 13, color: UI.sub, margin: "-4px 2px 10px", lineHeight: 1.5 }}>선생님이 낸 단어를 하나씩 녹음해서 보내요. 보낸 녹음은 선생님이 듣고 확인해 줘요.</div>
      <div style={{ ...secHead, marginTop: 0, display: "flex", alignItems: "baseline", gap: 6 }}>파닉스 숙제 {tasksState === "ok" && pendingCount > 0 && <span style={{ fontWeight: 700, color: UI.warnFg }}>· 안 끝난 숙제 {pendingCount}개</span>}</div>
      {tasksState === "loading" && list.length === 0 && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>불러오는 중…</div>}
      {tasksState === "fail" && list.length === 0 && (
        <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>숙제 목록을 아직 불러올 수 없어요<br /><span style={{ fontSize: 12.5 }}>잠시 뒤 다시 열어 주세요</span>
          <div><button type="button" onClick={onReload} style={{ ...BTN_SOFT, marginTop: 10, minHeight: 40, padding: "8px 14px", fontSize: 13 }}>다시 받기</button></div>
        </div>
      )}
      {tasksState === "ok" && list.length === 0 && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>지금 파닉스 숙제가 없어요<br /><span style={{ fontSize: 12.5 }}>선생님이 숙제를 내면 여기에 보여요</span></div>}
      {list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((t) => <TaskCard key={t.id} task={t} todayStr={todayStr} onOpen={() => onOpenTask(t.id)} />)}
        </div>
      )}
      {/* 맨 아래: 자유 녹음 = 145차수 녹음 제출 화면 그대로 */}
      <div style={{ ...secHead, marginTop: 26, fontSize: 15, color: UI.text }}>자유 녹음</div>
      <div style={{ fontSize: 12.5, color: UI.sub, margin: "-4px 2px 10px", lineHeight: 1.5 }}>숙제가 아닌 것(본문·문장 등)을 읽어서 보낼 때 써요.</div>
      <RecordScreen studentId={studentId} onBusy={onBusy} />
    </div>
  );
}
