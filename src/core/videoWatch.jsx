import { VIDEO_WATCH_API_KEY, VIDEO_WATCH_API_URL } from "./config.jsx";
import { IS_MASTER_MODE, IS_STAFF_VIEW, IS_TEACHER_MODE, teacherUrl } from "./auth.jsx";
import { getSelfAccessToken } from "./bundle.jsx";
import { clampNum, fetchTextWithTimeout } from "./net.jsx";

// ─── 이탈 추적 임계값 (이 시간보다 짧은 이탈은 무시 — 카톡 알림 슬쩍 보고 돌아오는 경우) ───
export const MIN_AWAY_SEC = 5;
// 영상 시청 기록 자동 저장 기준: 카드를 닫지 않아도 UNIT별 기록이 남도록 보정
export const VIDEO_PROGRESS_SAVE_MIN_SEC = 5;
// [110차수 09-09] 15 → 30초. 서버는 저장 1건마다 DB를 고쳐 쓰므로 저장 횟수를 절반으로(총 시청 시간은 조각을 더한 값이라 그대로,
//   멈춤·화면 숨김·닫기 때는 예전처럼 즉시 저장). 09-08~09 밤 멈춤의 큰 원인이 강의 시청 중 15초마다 몰린 저장이었다.
export const VIDEO_PROGRESS_AUTOSAVE_SEC = 30;
// ─── YouTube IFrame Player API 기반 실제 재생시간 측정 ───
// 핵심: 영상 화면을 열어둔 시간이 아니라, 플레이어가 PLAYING 상태였던 시간만 누적한다.
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};
let _youtubeIframeApiPromise = null;
export const loadYouTubeIframeApi = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("window 객체가 없습니다"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (_youtubeIframeApiPromise) return _youtubeIframeApiPromise;

  _youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === "function") prevReady();
      if (window.YT && window.YT.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API 로드 실패"));
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => reject(new Error("YouTube IFrame API 스크립트를 불러오지 못했습니다"));
      document.head.appendChild(tag);
    }

    // 스크립트가 이미 있었는데 ready 콜백이 지나간 경우를 위한 보정
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(timer);
        resolve(window.YT);
      } else if (Date.now() - startedAt > 10000) {
        clearInterval(timer);
        reject(new Error("YouTube IFrame API 로드 시간 초과"));
      }
    }, 100);
  });

  return _youtubeIframeApiPromise;
};
export const dispatchVideoPlayerEvent = (name, detail) => {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (e) { /* ignore */ }
};
// ─── [95차수 09-05] 강의 이어보기 — 영상마다 마지막 위치를 이 폰에 기억해 두고, 다시 열면 거기서부터 튼다 ───
//   탭을 바꿨다 돌아오거나 앱을 껐다 켜도 이어진다(원장 결정: 폰 저장). 끝까지 본 영상은 기록을 지워 다음엔 처음부터.
//   처음 5초 안·끝 10초 안은 기억하지 않는다(사실상 처음/끝이라 이어볼 의미가 없다). 최근 200개만 남긴다.
//   재생목록(playlist)형은 어느 영상인지 알 수 없어 이어보기를 안 한다.
const VIDEO_POS_KEY = "mapl_video_pos_v1";
const readVideoPosMap = () => {
  try { const m = JSON.parse(localStorage.getItem(VIDEO_POS_KEY) || "{}"); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; }
  catch (e) { return {}; }
};
export const getVideoResumeSec = (videoId) => {
  const rec = readVideoPosMap()[String(videoId || "")];
  const sec = rec ? Number(rec.sec) : 0;
  return Number.isFinite(sec) && sec > 5 ? Math.floor(sec) : 0;
};
export const saveVideoPos = (videoId, sec, durSec) => {
  const id = String(videoId || "");
  if (!id) return;
  try {
    const m = readVideoPosMap();
    const s = Math.floor(Number(sec) || 0);
    const d = Math.floor(Number(durSec) || 0);
    if (s <= 5 || (d > 0 && s >= d - 10)) delete m[id];   // 처음·끝 근처 = 기록 안 함(끝났으면 지움)
    else m[id] = { sec: s, at: Date.now() };
    const keys = Object.keys(m);
    if (keys.length > 200) {
      keys.sort((a, b) => (Number(m[a]?.at) || 0) - (Number(m[b]?.at) || 0)).slice(0, keys.length - 200).forEach(k => { delete m[k]; });
    }
    localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(m));
  } catch (e) { /* ignore */ }
};
export const clearVideoPos = (videoId) => {
  try { const m = readVideoPosMap(); delete m[String(videoId || "")]; localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
};
export const makeVideoSessionId = (studentId, videoId) =>
  `${studentId}_${videoId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const getPendingVideoWatch = () => {
  try { return JSON.parse(localStorage.getItem("pending_video_watch") || "[]"); }
  catch (e) { return []; }
};
export const setPendingVideoWatch = (items) => {
  try { localStorage.setItem("pending_video_watch", JSON.stringify(items || [])); }
  catch (e) { /* ignore */ }
};
export const queuePendingVideoWatch = (payload) => {
  // [마스터] 대기열에 넣으면 나중에 원장 폰에서 재전송돼 결국 그 학생 기록으로 들어간다. 넣지 않는다.
  if (IS_STAFF_VIEW) return;   // [교사] 선생님이 본 것이 나중에 학생 기록으로 나가면 안 된다
  const pending = getPendingVideoWatch();
  const sid = payload?.sessionId || `${payload?.studentId || ""}_${payload?.videoId || ""}_${payload?.timestamp || Date.now()}`;
  if (!pending.some(x => (x.sessionId || "") === sid)) {
    pending.push({ ...payload, sessionId: sid });
    setPendingVideoWatch(pending.slice(-100)); // 기기 저장소 보호용: 최근 100개만 보관
  }
};
export const postVideoWatchToWorker = async (payload) => {
  // [마스터] 원장 검수 기록이 학생 시청 통계에 섞이면 안 되므로 전송하지 않는다.
  // 호출부가 실패로 보고 대기열에 넣지 않도록 성공 형태로 반환한다.
  if (IS_MASTER_MODE) return { success: true, master: true, skipped: true };
  // [교사] 선생님이 학생 화면에서 강의를 본 경우 — 학생 통계가 아니라 교사 전용 칸(teacher_vwatch3)으로 보낸다.
  if (IS_TEACHER_MODE) {
    const r = await fetch(teacherUrl("/teacher/video-watch"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`teacher video-watch 저장 실패: ${r.status}`);
    return r.json().catch(() => ({ success: true }));
  }
  if (!VIDEO_WATCH_API_URL) throw new Error("VITE_VIDEO_WATCH_API_URL이 설정되지 않았습니다");
  const headers = { "Content-Type": "application/json" };
  if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
  // [95차수 09-05] 15초 안에 답이 없으면 실패로 보고 대기열에 넣는다(인터넷이 느릴 때 저장이 영영 매달려 있지 않게). 대기열은 나중에 자동 재전송.
  // [110차수 09-09] 본문까지 15초 안(fetchTextWithTimeout). 실패하면 예전처럼 대기열로 — 같은 세션은 서버가 두 번 안 쌓는다.
  const { resp, text } = await fetchTextWithTimeout(VIDEO_WATCH_API_URL, {
    method: "POST",
    headers,
    // [08-08] 본인 확인 값(t)을 보낼 때 붙인다. 대기열에 쌓여 있던 옛 기록도 보내는 순간 붙는다.
    body: JSON.stringify({ ...payload, t: getSelfAccessToken() }),
  }, 15000, "video-watch");
  if (!resp.ok) {
    throw new Error(text || `video-watch 저장 실패: ${resp.status}`);
  }
  try { return JSON.parse(text); } catch (e) { return { success: true }; }
};
const mergeVideoWatchEntry = (prev = {}, payload = {}) => {
  const sec = clampNum(payload.seconds ?? payload.watchSec ?? 0);
  const activeSec = clampNum(payload.activeSec ?? 0);
  const awaySec = clampNum(payload.awaySec ?? 0, 0, 86400);
  const awayCount = clampNum(payload.awayCount ?? 0, 0, 10000);
  const longestAwaySec = clampNum(payload.longestAwaySec ?? 0, 0, 86400);
  const durSec = clampNum(payload.durSec || prev.durSec || 720, 1, 86400);
  const watchSec = (prev.watchSec || 0) + sec;
  // 자동 저장/중간 저장 조각은 같은 시청 세션의 일부이므로 세션 수를 계속 늘리지 않는다.
  const sessionsToAdd = payload.eventType === "session" && !payload.partialSave ? 1 : 0;
  return {
    ...prev,
    title: payload.title || prev.title,
    subject: payload.subject || prev.subject,
    watchSec,
    durSec,
    pct: Math.min(100, Math.round((watchSec / durSec) * 100)),
    lastAt: payload.timestamp || new Date().toISOString(),
    sessions: (prev.sessions || 0) + sessionsToAdd,
    activeSec: (prev.activeSec || 0) + activeSec,
    awaySec: (prev.awaySec || 0) + awaySec,
    awayCount: (prev.awayCount || 0) + awayCount,
    longestAwaySec: Math.max(prev.longestAwaySec || 0, longestAwaySec),
  };
};
export const applyVideoWatchLocal = (allWatch = {}, payload = {}) => {
  const sid = String(payload.studentId || "");
  const vid = String(payload.videoId || "");
  if (!sid || !vid) return allWatch || {};
  const next = { ...(allWatch || {}) };
  next[sid] = { ...(next[sid] || {}) };
  next[sid][vid] = mergeVideoWatchEntry(next[sid][vid] || {}, payload);
  return next;
};
export const mergeVideoWatchSnapshots = (remote = {}, local = {}) => {
  const merged = { ...(remote || {}) };
  Object.entries(local || {}).forEach(([sid, byVideo]) => {
    merged[sid] = { ...(merged[sid] || {}) };
    Object.entries(byVideo || {}).forEach(([vid, localEntry]) => {
      const remoteEntry = merged[sid][vid];
      const remoteTime = remoteEntry?.lastAt ? new Date(remoteEntry.lastAt).getTime() : 0;
      const localTime = localEntry?.lastAt ? new Date(localEntry.lastAt).getTime() : 0;
      if (!remoteEntry || localTime > remoteTime || (localEntry.watchSec || 0) > (remoteEntry.watchSec || 0)) {
        merged[sid][vid] = localEntry;
      }
    });
  });
  return merged;
};
