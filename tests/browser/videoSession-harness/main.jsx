// [175차수] useVideoSession을 화면 없이 돌려 보는 틀 — window.T로 조종한다(재생 초 넣기·열기·닫기·시청 기록 읽기).
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVideoSession } from "../../../src/state/useVideoSession.jsx";
const VIDEO = { id: "v1", title: "테스트 강의", url: "https://youtu.be/x", durSec: 600 };
function App() {
  const r = (v) => useRef(v);
  const refs = { activeSecRef: r(0), awayCountRef: r(0), awaySecRef: r(0), awayStartRef: r(null), currentSessionIdRef: r(null), flushingRef: r(false), lastActiveAtRef: r(null),
    lastSavedAwayCountRef: r(0), lastSavedAwaySecRef: r(0), lastSavedFocusSecRef: r(0), lastSavedPlaySecRef: r(0), longestAwayRef: r(0), videoSaveChunkSeqRef: r(0), videoSaveInFlightRef: r(false),
    withdrawnRef: r(false), ytDurationSecRef: r(600), ytFocusSecRef: r(0), ytPlaySecRef: r(0), ytPlayerStateRef: r(null) };
  const [viewingVideo, setViewingVideo] = useState(null);
  const [viewStartTime, setViewStartTime] = useState(null);
  const [videoWatch, setVideoWatch] = useState({});
  const [status, setLastVideoSaveStatus] = useState("");
  const [pending, setPendingVideoCount] = useState(0);
  const { toggleVideo } = useVideoSession({ ...refs, setLastVideoSaveStatus, setPendingVideoCount, setVideoWatch, setViewStartTime, setViewingVideo, studentId: "777", viewStartTime, viewingVideo, onVocabResultsSent: () => {} });
  window.T = { refs, toggle: () => toggleVideo(VIDEO), watch: () => (videoWatch["777"] || {}).v1 || null, open: !!viewingVideo, status, pending };
  return <pre>{JSON.stringify({ open: !!viewingVideo, status, pending, watch: (videoWatch["777"] || {}).v1 || null }, null, 1)}</pre>;
}
createRoot(document.getElementById("root")).render(<App />);
