import { useEffect, useRef, useState } from "react";

// ═══ [152차수] 녹음 부품(훅) — 145차수 녹음 제출 화면의 녹음 로직을 그대로 떼어낸 것 ═══
//   녹음 제출(자유 녹음 · 최대 90초)과 파닉스 숙제(단어 하나 · 최대 20초)가 같이 쓴다. 동작은 145차수와 같다:
//   마이크 권한 안내 · 아이폰 사파리는 audio/mp4 · 최대 시간이 되면 자동 정지 · 화면을 나가거나 가려지면 멈추고 버림 · 들어보기(한 번에 하나).
//   돌려주는 것: { supported, phase, elapsed, clip, notice, setNotice, previewOn, previewPos, previewRef, start, stop, reset, togglePreview, stopPreview, setPhase, setClip, discardAndStop }
//   phase: idle 대기 / recording 녹음 중 / done 녹음 끝(들어보기·보내기 가능) / sending 보내는 중(부르는 쪽이 정한다)
// 형식 고르기 — 되는 첫 것. 아이폰 사파리는 webm이 안 되고 audio/mp4가 된다.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
const pickMime = () => {
  try {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  } catch (e) { return ""; }
};
export const canRecord = () => !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" && typeof MediaRecorder !== "undefined" && pickMime());
// 워커에 보내는 형식 이름은 세 가지 중 하나("audio/webm;codecs=opus" → "audio/webm")
const baseMime = (m) => String(m || "").split(";")[0].trim().toLowerCase();
export const MAX_BYTES = 2 * 1024 * 1024;     // 녹음 파일 최대 2MB — 원장 확정(145차수). 두 화면이 같이 쓴다
export const fmtSec = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
// 파일 → base64 (data:…;base64, 앞부분은 떼고 보낸다)
export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error("read"));
  fr.onload = () => { const s = String(fr.result || ""); const i = s.indexOf(","); resolve(i >= 0 ? s.slice(i + 1) : s); };
  fr.readAsDataURL(blob);
});

export function useRecorder({ maxSec, onBusy }) {
  const [phase, setPhase] = useState("idle");
  const [elapsed, setElapsed] = useState(0);         // 녹음 중 지난 초
  const [clip, setClip] = useState(null);            // { blob, url, dur, mime }
  const [notice, setNotice] = useState("");          // 빨간 안내(권한·실패)
  const [previewOn, setPreviewOn] = useState(false); // 들어보기 재생 중
  const [previewPos, setPreviewPos] = useState(0);
  const [supported] = useState(() => canRecord());
  const recRef = useRef(null);        // MediaRecorder
  const streamRef = useRef(null);     // 마이크 스트림 — 끝나면 꼭 track.stop()
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startAtRef = useRef(0);
  const discardRef = useRef(false);   // 화면을 나가서 멈춘 녹음은 버린다(제출 안 됨)
  const previewRef = useRef(null);    // 들어보기 <audio>
  const aliveRef = useRef(true);
  const startingRef = useRef(false);  // start()가 마이크를 여는 동안 true — 빠르게 두 번 눌러도 마이크를 두 번 열지 않는다
  const onBusyRef = useRef(onBusy); onBusyRef.current = onBusy;
  const busy = phase === "recording" || phase === "sending";
  useEffect(() => { if (typeof onBusyRef.current === "function") onBusyRef.current(phase === "recording"); }, [phase]);
  const stopTracks = () => { try { (streamRef.current?.getTracks() || []).forEach((t) => t.stop()); } catch (e) {} streamRef.current = null; };
  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const stopRecorder = () => { try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); } catch (e) {} };
  useEffect(() => {
    aliveRef.current = true;
    // 녹음 중에 화면이 가려지면(다른 앱·탭으로 가면) 멈추고 버린다
    const onVis = () => { if (document.hidden && recRef.current && recRef.current.state === "recording") { discardRef.current = true; stopRecorder(); setNotice("화면을 나가서 녹음을 멈췄어요. 다시 녹음해 주세요."); } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      discardRef.current = true; stopRecorder(); clearTimer(); stopTracks();
      try { previewRef.current && previewRef.current.pause(); } catch (e) {}
      if (typeof onBusyRef.current === "function") onBusyRef.current(false);
    };
  }, []);
  // 녹음 파일 주소(objectURL)는 바뀌거나 화면을 나갈 때 거둔다
  useEffect(() => () => { if (clip && clip.url) { try { URL.revokeObjectURL(clip.url); } catch (e) {} } }, [clip]);
  // ─── 들어보기 ───
  const stopPreview = () => { try { if (previewRef.current) { previewRef.current.pause(); previewRef.current.currentTime = 0; } } catch (e) {} setPreviewOn(false); setPreviewPos(0); };
  const togglePreview = (beforePlay) => {
    const a = previewRef.current; if (!a || !clip) return;
    if (previewOn) { stopPreview(); return; }
    if (typeof beforePlay === "function") beforePlay();
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => setPreviewOn(false)); setPreviewOn(true); } catch (e) { setPreviewOn(false); }
  };
  // ─── 녹음 시작 ───
  const start = async (beforeStart) => {
    if (busy || startingRef.current || (recRef.current && recRef.current.state === "recording")) return false;
    startingRef.current = true;
    setNotice("");
    if (!supported) { startingRef.current = false; setNotice("이 폰에서는 녹음이 안 돼요"); return false; }
    stopPreview();
    if (typeof beforeStart === "function") beforeStart();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { startingRef.current = false; setNotice("마이크 사용을 허용해 주세요"); return false; }
    startingRef.current = false;
    if (!aliveRef.current) { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} return false; }
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }); }
    catch (e1) {
      try { rec = new MediaRecorder(stream, { mimeType: mime }); }
      catch (e2) { try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {} setNotice("이 폰에서는 녹음이 안 돼요"); return false; }
    }
    streamRef.current = stream; recRef.current = rec; chunksRef.current = []; discardRef.current = false;
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onerror = () => { discardRef.current = true; setNotice("녹음 중 문제가 생겼어요. 다시 녹음해 주세요."); stopRecorder(); };
    rec.onstop = () => {
      clearTimer(); stopTracks();
      const secs = Math.max(1, Math.min(maxSec, Math.round((Date.now() - startAtRef.current) / 1000)));
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
    try { rec.start(1000); } catch (e) { stopTracks(); recRef.current = null; setPhase("idle"); setNotice("이 폰에서는 녹음이 안 돼요"); return false; }
    // 자주 시간 표시. 최대 시간이 되면 자동 정지
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startAtRef.current) / 1000);
      setElapsed(Math.min(maxSec, s));
      if (s >= maxSec) { clearTimer(); stopRecorder(); }
    }, 250);
    return true;
  };
  const stop = () => { clearTimer(); stopRecorder(); };
  // 녹음 중이면 버리고 멈춘다(다른 단어로 옮길 때 등)
  const discardAndStop = () => { if (recRef.current && recRef.current.state === "recording") { discardRef.current = true; } clearTimer(); stopRecorder(); stopPreview(); setClip(null); setPhase("idle"); setElapsed(0); };
  const reset = () => { stopPreview(); setClip(null); setPhase("idle"); setElapsed(0); setNotice(""); };
  return { supported, phase, elapsed, clip, notice, setNotice, previewOn, previewPos, setPreviewPos, setPreviewOn, previewRef, start, stop, reset, togglePreview, stopPreview, setPhase, setClip, setElapsed, discardAndStop, aliveRef, busy };
}
