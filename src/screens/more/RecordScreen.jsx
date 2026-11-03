import { useEffect, useRef, useState } from "react";
import { IS_STAFF_VIEW } from "../../core/auth.jsx";
import { getSelfAccessToken } from "../../core/bundle.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { fetchWithTimeout } from "../../core/net.jsx";
import { DK, getTodayStr } from "../../domain/time.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";

// ═══ [145차수] 더보기 → 녹음 제출 ═══
//   학생이 폰에서 소리를 녹음해 학원에 보낸다(선생님은 원장앱 PDF 수업실에서 듣는다 — 원장앱 299차수).
//   "무엇을 읽을지"는 아직 안 정했으므로 기능만: "읽은 내용" 한 줄(선택) + 녹음(최대 90초) + [제출].
//   워커 길: POST /student/recording { studentId, t, label, dur, mime, dataBase64 } → { success, id, key, at }
//            GET  /student/recordings?studentId=&t=  → { success, items:[{ id, date, label, key, dur, mime, at, heard, memo }] }
//            다시 듣기 GET /files/<key>?sid=&t=  (워커가 본인 확인 뒤 내준다) — <audio src>에 바로 넣는다.
//   워커가 아직 안 올라갔을 수 있으니 404·연결 실패는 "지금은 제출할 수 없어요"로 조용히 처리한다(앱이 멈추지 않게).
const MAX_SEC = 90;                    // 녹음 최대 길이(초) — 원장 확정
const MAX_BYTES = 2 * 1024 * 1024;     // 파일 최대 2MB — 원장 확정
const LABEL_MAX = 80;
// 형식 고르기 — 되는 첫 것. 아이폰 사파리는 webm이 안 되고 audio/mp4가 된다.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
const pickMime = () => {
  try {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  } catch (e) { return ""; }
};
const canRecord = () => !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" && typeof MediaRecorder !== "undefined" && pickMime());
// 워커에 보내는 형식 이름은 세 가지 중 하나("audio/webm;codecs=opus" → "audio/webm")
const baseMime = (m) => String(m || "").split(";")[0].trim().toLowerCase();
const fmtSec = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
const fmtClock = (iso) => { const d = new Date(iso); if (isNaN(d.getTime())) return ""; return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dateOf = (it) => {
  if (it && typeof it.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(it.date)) return it.date.slice(0, 10);
  const d = new Date(it && it.at); if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDateHead = (ds, todayStr) => {
  if (!ds) return "날짜 모름";
  const d = new Date(ds + "T00:00:00"); if (isNaN(d.getTime())) return ds;
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DK[d.getDay()]})`;
  return ds === todayStr ? `오늘 · ${base}` : base;
};
// 파일 → base64 (data:…;base64, 앞부분은 떼고 보낸다)
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error("read"));
  fr.onload = () => { const s = String(fr.result || ""); const i = s.indexOf(","); resolve(i >= 0 ? s.slice(i + 1) : s); };
  fr.readAsDataURL(blob);
});
const CARD = { background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: "16px 16px" };
const BTN = { minHeight: TAP, border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const BTN_PRIMARY = { ...BTN, background: UI.navy, color: "#fff" };
const BTN_SOFT = { ...BTN, background: UI.blueBg, color: UI.blue };
const BTN_GHOST = { ...BTN, background: "#F0F2F6", color: UI.sub };

export function RecordScreen({ studentId, onBusy }) {
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");       // idle 대기 / recording 녹음 중 / done 녹음 끝(들어보기·제출 가능) / sending 보내는 중
  const [elapsed, setElapsed] = useState(0);         // 녹음 중 지난 초
  const [clip, setClip] = useState(null);            // { blob, url, dur, mime }
  const [notice, setNotice] = useState("");          // 빨간 안내(권한·실패)
  const [flash, setFlash] = useState("");            // "제출했어요 ✓" 2초
  const [previewOn, setPreviewOn] = useState(false); // 들어보기 재생 중
  const [previewPos, setPreviewPos] = useState(0);
  const [items, setItems] = useState([]);
  const [listState, setListState] = useState("loading"); // loading / ok / fail
  const [playingId, setPlayingId] = useState(null);
  const [playPos, setPlayPos] = useState(0);
  const [supported] = useState(() => canRecord());
  const recRef = useRef(null);        // MediaRecorder
  const streamRef = useRef(null);     // 마이크 스트림 — 끝나면 꼭 track.stop()
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startAtRef = useRef(0);
  const discardRef = useRef(false);   // 화면을 나가서 멈춘 녹음은 버린다(제출 안 됨)
  const previewRef = useRef(null);    // 들어보기 <audio>
  const listAudioRef = useRef(null);  // 목록 재생 <audio> (한 번에 하나)
  const aliveRef = useRef(true);
  const todayStr = getTodayStr();
  const busy = phase === "recording" || phase === "sending";
  useEffect(() => { if (typeof onBusy === "function") onBusy(phase === "recording"); }, [phase]);
  const stopTracks = () => { try { (streamRef.current?.getTracks() || []).forEach((t) => t.stop()); } catch (e) {} streamRef.current = null; };
  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const stopRecorder = () => { try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch (e) {} };
  // ─── 목록 받기 — 화면에 들어올 때 한 번, 제출 뒤 다시 ───
  const loadList = async () => {
    if (!WORKER_ORIGIN) { setListState("fail"); return; }
    try {
      const url = `${WORKER_ORIGIN}/student/recordings?studentId=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}`;
      const resp = await fetchWithTimeout(url, { method: "GET" }, 15000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error("list");
      if (!aliveRef.current) return;
      setItems(Array.isArray(data.items) ? data.items.filter((x) => x && x.id) : []);
      setListState("ok");
    } catch (e) { if (aliveRef.current) setListState("fail"); }
  };
  useEffect(() => {
    aliveRef.current = true;
    loadList();
    // 녹음 중에 화면이 가려지면(다른 앱·탭으로 가면) 멈추고 버린다
    const onVis = () => { if (document.hidden && recRef.current && recRef.current.state === "recording") { discardRef.current = true; stopRecorder(); setNotice("화면을 나가서 녹음을 멈췄어요. 다시 녹음해 주세요."); } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      discardRef.current = true; stopRecorder(); clearTimer(); stopTracks();
      try { previewRef.current && previewRef.current.pause(); } catch (e) {}
      try { listAudioRef.current && listAudioRef.current.pause(); } catch (e) {}
      if (typeof onBusy === "function") onBusy(false);
    };
  }, [studentId]);
  // 녹음 파일 주소(objectURL)는 바뀌거나 화면을 나갈 때 거둔다
  useEffect(() => () => { if (clip && clip.url) { try { URL.revokeObjectURL(clip.url); } catch (e) {} } }, [clip]);
  // ─── 녹음 시작 ───
  const startRecording = async () => {
    if (busy) return;
    setNotice(""); setFlash("");
    if (!supported) { setNotice("이 폰에서는 녹음이 안 돼요"); return; }
    stopPreview(); stopListPlay();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { setNotice("마이크 사용을 허용해 주세요"); return; }
    if (!aliveRef.current) { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} return; }
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }); }
    catch (e1) {
      try { rec = new MediaRecorder(stream, { mimeType: mime }); }
      catch (e2) { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} setNotice("이 폰에서는 녹음이 안 돼요"); return; }
    }
    streamRef.current = stream; recRef.current = rec; chunksRef.current = []; discardRef.current = false;
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onerror = () => { discardRef.current = true; setNotice("녹음 중 문제가 생겼어요. 다시 녹음해 주세요."); stopRecorder(); };
    rec.onstop = () => {
      clearTimer(); stopTracks();
      const secs = Math.max(1, Math.min(MAX_SEC, Math.round((Date.now() - startAtRef.current) / 1000)));
      const parts = chunksRef.current; chunksRef.current = []; recRef.current = null;
      if (discardRef.current || !aliveRef.current) { if (aliveRef.current) { setClip(null); setPhase("idle"); setElapsed(0); } return; }
      const type = baseMime(rec.mimeType || mime) || baseMime(mime);
      const blob = new Blob(parts, { type: type || "application/octet-stream" });
      if (!blob.size) { setClip(null); setPhase("idle"); setElapsed(0); setNotice("녹음된 소리가 없어요. 다시 녹음해 주세요."); return; }
      setClip({ blob, url: URL.createObjectURL(blob), dur: secs, mime: type });
      setPhase("done"); setElapsed(secs);
    };
    setClip(null); setPhase("recording"); setElapsed(0); setPreviewPos(0);
    startAtRef.current = Date.now();
    try { rec.start(1000); } catch (e) { stopTracks(); recRef.current = null; setPhase("idle"); setNotice("이 폰에서는 녹음이 안 돼요"); return; }
    // 1초마다 시간 표시. 90초가 되면 자동 정지
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startAtRef.current) / 1000);
      setElapsed(Math.min(MAX_SEC, s));
      if (s >= MAX_SEC) { clearTimer(); stopRecorder(); }
    }, 250);
  };
  const stopRecording = () => { clearTimer(); stopRecorder(); };
  const resetClip = () => { stopPreview(); setClip(null); setPhase("idle"); setElapsed(0); setNotice(""); };
  // ─── 들어보기 ───
  const stopPreview = () => { try { if (previewRef.current) { previewRef.current.pause(); previewRef.current.currentTime = 0; } } catch (e) {} setPreviewOn(false); setPreviewPos(0); };
  const togglePreview = () => {
    const a = previewRef.current; if (!a || !clip) return;
    if (previewOn) { stopPreview(); return; }
    stopListPlay();
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => setPreviewOn(false)); setPreviewOn(true); } catch (e) { setPreviewOn(false); }
  };
  // ─── 제출 ───
  const submit = async () => {
    if (!clip || busy) return;
    setNotice(""); setFlash("");
    if (IS_STAFF_VIEW) { setNotice("보기 전용 화면에서는 제출할 수 없어요"); return; }
    if (clip.blob.size > MAX_BYTES) { setNotice("녹음이 너무 길어요. 다시 짧게 녹음해 주세요."); return; }
    if (!WORKER_ORIGIN) { setNotice("지금은 제출할 수 없어요. 잠시 뒤 다시 해 주세요."); return; }
    stopPreview();
    setPhase("sending");
    try {
      const dataBase64 = await blobToBase64(clip.blob);
      const body = { studentId, t: getSelfAccessToken(), label: label.trim().slice(0, LABEL_MAX), dur: clip.dur, mime: clip.mime, dataBase64 };
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/student/recording`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }, 30000);
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 413) throw new Error("녹음이 너무 길어요. 다시 짧게 녹음해 주세요.");
      if (resp.status === 401 || resp.status === 403) throw new Error("앱을 새로고침한 뒤 다시 해 주세요");
      if (!resp.ok || !data.success) throw new Error("지금은 제출할 수 없어요. 잠시 뒤 다시 해 주세요.");
      if (!aliveRef.current) return;
      const at = data.at || new Date().toISOString();
      const mine = { id: data.id || `local_${Date.now()}`, date: dateOf({ at }), label: body.label, key: data.key || "", dur: clip.dur, mime: clip.mime, at, heard: false, memo: "" };
      setItems((prev) => [mine, ...prev.filter((x) => x.id !== mine.id)]);
      setListState("ok");
      setLabel(""); setClip(null); setPhase("idle"); setElapsed(0);
      setFlash("제출했어요 ✓");
      setTimeout(() => { if (aliveRef.current) setFlash(""); }, 2000);
      loadList();
    } catch (e) {
      if (!aliveRef.current) return;
      const m = String(e?.message || "");
      setNotice(m.startsWith("녹음이") || m.startsWith("앱을") ? m : "지금은 제출할 수 없어요. 잠시 뒤 다시 해 주세요.");
      setPhase("done");
    }
  };
  // ─── 목록 재생(한 번에 하나만) ───
  const stopListPlay = () => { try { if (listAudioRef.current) { listAudioRef.current.pause(); listAudioRef.current.removeAttribute("src"); listAudioRef.current.load(); } } catch (e) {} setPlayingId(null); setPlayPos(0); };
  const toggleListPlay = (it) => {
    if (playingId === it.id) { stopListPlay(); return; }
    stopPreview(); stopListPlay();
    const a = listAudioRef.current; if (!a || !it.key || !WORKER_ORIGIN) return;
    try {
      a.src = `${WORKER_ORIGIN}/files/${it.key}?sid=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}`;
      setPlayingId(it.id); setPlayPos(0);
      const p = a.play(); if (p && p.catch) p.catch(() => { setPlayingId(null); setNotice("녹음을 불러오지 못했어요. 잠시 뒤 다시 해 주세요."); });
    } catch (e) { setPlayingId(null); }
  };
  // ─── 날짜별 묶기(최신 먼저) ───
  const groups = [];
  items.forEach((it) => { const ds = dateOf(it); let g = groups.find((x) => x.date === ds); if (!g) { g = { date: ds, items: [] }; groups.push(g); } g.items.push(it); });
  const progressBar = (ratio, color) => (
    <div style={{ height: 6, borderRadius: 3, background: "#E9ECF2", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, ratio * 100))}%`, background: color, transition: "width .25s linear" }} />
    </div>
  );
  const recordBox = () => {
    if (!supported) return <div style={{ textAlign: "center", padding: "26px 8px", color: UI.sub, fontSize: 14, lineHeight: 1.6 }}>🎤 이 폰에서는 녹음이 안 돼요<br /><span style={{ fontSize: 12.5, color: UI.dim }}>다른 폰이나 크롬·사파리 최신 판으로 열어 주세요</span></div>;
    if (phase === "recording") return (
      <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: UI.text }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: "#E53935", display: "inline-block", animation: "mapleRecBlink 1s step-start infinite" }} />
          녹음 중
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: UI.text, margin: "10px 0 14px", fontVariantNumeric: "tabular-nums" }}>{fmtSec(elapsed)} <span style={{ fontSize: 16, color: UI.dim, fontWeight: 700 }}>/ {fmtSec(MAX_SEC)}</span></div>
        {progressBar(elapsed / MAX_SEC, "#E53935")}
        <button type="button" onClick={stopRecording} style={{ ...BTN, width: "100%", marginTop: 16, height: 56, borderRadius: 28, background: "#E53935", color: "#fff", fontSize: 16 }}>■ 정지</button>
        <div style={{ fontSize: 12, color: UI.dim, marginTop: 10 }}>{fmtSec(MAX_SEC)}이 되면 저절로 멈춰요</div>
      </div>
    );
    if ((phase === "done" || phase === "sending") && clip) return (
      <div style={{ padding: "6px 0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: UI.text }}>녹음 완료</span>
          <span style={{ fontSize: 13, color: UI.sub, fontVariantNumeric: "tabular-nums" }}>{fmtSec(previewOn ? previewPos : clip.dur)} / {fmtSec(clip.dur)}</span>
        </div>
        {progressBar(previewOn ? previewPos / Math.max(1, clip.dur) : 1, previewOn ? UI.blue : "#C9D2E3")}
        <audio ref={previewRef} src={clip.url} preload="auto" style={{ display: "none" }}
          onTimeUpdate={(e) => setPreviewPos(e.currentTarget.currentTime || 0)}
          onEnded={() => { setPreviewOn(false); setPreviewPos(0); }} />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={togglePreview} disabled={phase === "sending"} style={{ ...BTN_SOFT, flex: 1, opacity: phase === "sending" ? 0.6 : 1 }}>{previewOn ? "■ 멈춤" : "▶ 들어보기"}</button>
          <button type="button" onClick={resetClip} disabled={phase === "sending"} style={{ ...BTN_GHOST, flex: 1, opacity: phase === "sending" ? 0.6 : 1 }}>↺ 다시 녹음</button>
        </div>
        <button type="button" onClick={submit} disabled={phase === "sending"} style={{ ...BTN_PRIMARY, width: "100%", marginTop: 8, height: 52, borderRadius: 14, fontSize: 16, opacity: phase === "sending" ? 0.6 : 1 }}>{phase === "sending" ? "보내는 중…" : "제출"}</button>
      </div>
    );
    return (
      <div style={{ textAlign: "center", padding: "8px 0 2px" }}>
        <button type="button" onClick={startRecording}
          style={{ ...BTN, width: "100%", height: 64, borderRadius: 32, background: UI.navy, color: "#fff", fontSize: 17, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7, background: "#FF5252", display: "inline-block" }} />녹음 시작
        </button>
        <div style={{ fontSize: 12, color: UI.dim, marginTop: 10 }}>한 번에 {fmtSec(MAX_SEC)}까지 녹음할 수 있어요</div>
      </div>
    );
  };
  return (
    <div>
      <style>{`@keyframes mapleRecBlink { 50% { opacity: 0.25; } }`}</style>
      {/* 위: 읽은 내용(선택) */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, marginBottom: 6 }}>읽은 내용 <span style={{ fontWeight: 600, color: UI.dim }}>(안 적어도 돼요)</span></div>
        <input type="text" value={label} maxLength={LABEL_MAX} disabled={busy} placeholder="예: 단어 10개 / 본문 3번 문장"
          onChange={(e) => setLabel(e.target.value.slice(0, LABEL_MAX))}
          style={{ width: "100%", boxSizing: "border-box", minHeight: TAP, border: `1px solid ${UI.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 15, color: UI.text, background: busy ? "#F7F8FB" : "#fff", fontFamily: "inherit", outline: "none" }} />
        <div style={{ fontSize: 11, color: UI.dim, marginTop: 6, textAlign: "right" }}>{label.length}/{LABEL_MAX}</div>
      </div>
      {/* 가운데: 녹음 */}
      <div style={{ ...CARD, marginTop: 10 }}>
        {recordBox()}
        {notice && (
          <div style={{ marginTop: 12, background: UI.warnBg, color: UI.warnFg, borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1 }}>{notice}</span>
            {phase === "idle" && supported && <button type="button" onClick={startRecording} style={{ ...BTN, minHeight: 36, padding: "6px 12px", fontSize: 12.5, background: "#fff", color: UI.warnFg, border: `1px solid ${UI.warnFg}`, flexShrink: 0 }}>다시 시도</button>}
          </div>
        )}
        {flash && <div role="status" style={{ marginTop: 12, background: UI.okBg, color: UI.okFg, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 800, textAlign: "center" }}>{flash}</div>}
        <div style={{ fontSize: 11.5, color: UI.dim, marginTop: 12, textAlign: "center" }}>보낸 녹음은 30일 동안 보관돼요</div>
      </div>
      {/* 아래: 내가 보낸 녹음 */}
      <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, margin: "18px 2px 8px" }}>내가 보낸 녹음 <span style={{ fontWeight: 600, color: UI.dim }}>· 최근 30일</span></div>
      <audio ref={listAudioRef} preload="none" style={{ display: "none" }}
        onTimeUpdate={(e) => setPlayPos(e.currentTarget.currentTime || 0)}
        onEnded={stopListPlay} onError={() => { if (playingId) { setPlayingId(null); setPlayPos(0); } }} />
      {listState === "loading" && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>불러오는 중…</div>}
      {listState === "fail" && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>녹음 목록을 아직 불러올 수 없어요<br /><span style={{ fontSize: 12.5 }}>잠시 뒤 다시 열어 주세요</span></div>}
      {listState === "ok" && items.length === 0 && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>아직 보낸 녹음이 없어요<br /><span style={{ fontSize: 12.5 }}>위에서 녹음해서 보내 보세요</span></div>}
      {listState === "ok" && groups.map((g) => (
        <div key={g.date || "none"} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: UI.text, margin: "0 2px 6px" }}>{fmtDateHead(g.date, todayStr)}</div>
          <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, overflow: "hidden" }}>
            {g.items.map((it, i) => {
              const on = playingId === it.id;
              return (
                <div key={it.id} style={{ padding: "12px 14px", borderTop: i ? `1px solid ${UI.line}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button type="button" onClick={() => toggleListPlay(it)} disabled={!it.key} aria-label={on ? "멈춤" : "재생"}
                      style={{ width: TAP, height: TAP, borderRadius: TAP / 2, border: "none", background: on ? UI.navy : UI.blueBg, color: on ? "#fff" : UI.blue, fontSize: 15, fontWeight: 800, cursor: it.key ? "pointer" : "default", flexShrink: 0, opacity: it.key ? 1 : 0.5, fontFamily: "inherit" }}>{on ? "■" : "▶"}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, color: UI.sub, fontVariantNumeric: "tabular-nums" }}>{fmtClock(it.at)}</span>
                        <span style={{ fontSize: 12.5, color: UI.dim, fontVariantNumeric: "tabular-nums" }}>· {fmtSec(it.dur)}</span>
                        {it.heard && <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.okFg }}>선생님 확인 ✓</span>}
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: it.label ? UI.text : UI.dim, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label || "읽은 내용 없음"}</div>
                      {it.memo && <div style={{ fontSize: 12.5, color: UI.sub, marginTop: 3, lineHeight: 1.5, wordBreak: "break-word" }}>💬 {it.memo}</div>}
                    </div>
                  </div>
                  {on && <div style={{ marginTop: 10 }}>{progressBar(playPos / Math.max(1, Number(it.dur) || 1), UI.blue)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
