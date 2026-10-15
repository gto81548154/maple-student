import { useEffect } from "react";
import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { clampNum } from "../core/net.jsx";
import { MIN_AWAY_SEC, VIDEO_PROGRESS_AUTOSAVE_SEC, VIDEO_PROGRESS_SAVE_MIN_SEC, YT_STATE, applyVideoWatchLocal, getPendingVideoWatch, makeVideoSessionId, postVideoWatchToWorker, queuePendingVideoWatch, setPendingVideoWatch } from "../core/videoWatch.jsx";
import { getTodayStr } from "../domain/time.jsx";
import { flushPendingVocabTests } from "../domain/vocabTest.jsx";

// [120차수] 강의 열기·닫기·시청 기록 재기와 보내기(자동 저장·나갈 때 저장·대기열 다시 보내기) — App.jsx에서 그대로 옮김.
export function useVideoSession(D) {
  const { activeSecRef, awayCountRef, awaySecRef, awayStartRef, currentSessionIdRef, flushingRef, lastActiveAtRef, lastSavedAwayCountRef, lastSavedAwaySecRef, lastSavedFocusSecRef, lastSavedPlaySecRef, longestAwayRef, setLastVideoSaveStatus, setPendingVideoCount, setVideoWatch, setViewStartTime, setViewingVideo, studentId, videoSaveChunkSeqRef, videoSaveInFlightRef, viewStartTime, viewingVideo, withdrawnRef, ytDurationSecRef, ytFocusSecRef, ytPlaySecRef, ytPlayerStateRef, onVocabResultsSent } = D;
  const finishAwayMeasurement = () => {
    if (!awayStartRef.current) return;
    const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
    if (awayDur >= MIN_AWAY_SEC) {
      awaySecRef.current += awayDur;
      awayCountRef.current += 1;
      if (awayDur > longestAwayRef.current) longestAwayRef.current = awayDur;
    }
    awayStartRef.current = null;
    try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
  };
  const startAwayMeasurementIfPlaying = () => {
    if (ytPlayerStateRef.current !== YT_STATE.PLAYING) return;
    if (awayStartRef.current) return;
    awayStartRef.current = Date.now();
    try {
      localStorage.setItem("pending_away", JSON.stringify({
        studentId,
        videoId: viewingVideo?.id,
        title: viewingVideo?.title,
        awayStartedAt: awayStartRef.current,
      }));
    } catch (e) { /* ignore */ }
  };
  // 인라인 확장 토글: 같은 카드 클릭 → 닫기 / 다른 카드 클릭 → 이전 닫고 새로 열기
  const toggleVideo = async (video) => {
    const sameVideo = viewingVideo?.id === video.id;
    if (viewingVideo) {
      await closeVideo(); // 이전 영상 실제 재생시간 저장하면서 닫기
    }
    if (!sameVideo) {
      // 실제 재생시간/이탈 추적 ref 초기화
      awayStartRef.current = null;
      activeSecRef.current = 0;
      awaySecRef.current = 0;
      awayCountRef.current = 0;
      longestAwayRef.current = 0;
      lastActiveAtRef.current = null;
      ytPlaySecRef.current = 0;
      ytFocusSecRef.current = 0;
      ytDurationSecRef.current = Number(video?.durSec || 0) || 0;
      ytPlayerStateRef.current = null;
      lastSavedPlaySecRef.current = 0;
      lastSavedFocusSecRef.current = 0;
      lastSavedAwaySecRef.current = 0;
      lastSavedAwayCountRef.current = 0;
      videoSaveChunkSeqRef.current = 0;
      videoSaveInFlightRef.current = false;
      currentSessionIdRef.current = makeVideoSessionId(studentId, video.id);
      setViewingVideo(video);
      setViewStartTime(Date.now());
      setLastVideoSaveStatus("재생 버튼을 누르면 실제 재생시간만 기록됩니다");
    }
  };
  const saveCurrentVideoProgress = async ({ reason = "manual", minDeltaSec = 1, partialSave = true } = {}) => {
    if (!viewingVideo || !viewStartTime) return false;
    if (videoSaveInFlightRef.current) return false;

    const totalPlaySec = Math.round(ytPlaySecRef.current);
    const totalFocusSec = Math.round(ytFocusSecRef.current);
    const totalAwaySec = Math.round(awaySecRef.current);
    const totalAwayCount = Math.round(awayCountRef.current);
    const longestAway = Math.round(longestAwayRef.current);
    const deltaPlaySec = Math.max(0, totalPlaySec - lastSavedPlaySecRef.current);
    const deltaFocusSec = Math.max(0, totalFocusSec - lastSavedFocusSecRef.current);
    const deltaAwaySec = Math.max(0, totalAwaySec - lastSavedAwaySecRef.current);
    const deltaAwayCount = Math.max(0, totalAwayCount - lastSavedAwayCountRef.current);

    if (deltaPlaySec < minDeltaSec && deltaAwaySec <= 0) return false;

    const rootSessionId = currentSessionIdRef.current || makeVideoSessionId(studentId, viewingVideo.id);
    currentSessionIdRef.current = rootSessionId;
    const chunkSeq = videoSaveChunkSeqRef.current + 1;
    const timestamp = new Date().toISOString();
    const payload = {
      eventType: "session",
      sessionId: `${rootSessionId}_${reason}_${chunkSeq}`,
      rootSessionId,
      studentId: String(studentId),
      videoId: String(viewingVideo.id),
      title: viewingVideo.title || "",
      subject: viewingVideo.subject || "",
      url: viewingVideo.url || viewingVideo.playlistUrl || "",
      videoType: viewingVideo.type || "video",
      seconds: clampNum(deltaPlaySec),
      activeSec: clampNum(deltaFocusSec),
      awaySec: clampNum(deltaAwaySec, 0, 86400),
      awayCount: clampNum(deltaAwayCount, 0, 10000),
      longestAwaySec: clampNum(longestAway, 0, 86400),
      durSec: clampNum(ytDurationSecRef.current || viewingVideo.durSec || 720, 1, 86400),
      date: getTodayStr(),
      timestamp,
      source: `student_app_youtube_iframe_api_${reason}`,
      openSec: clampNum(Math.round((Date.now() - viewStartTime) / 1000), 0, 86400),
      partialSave,
    };

    videoSaveInFlightRef.current = true;
    try {
      await postVideoWatchToWorker(payload);
      if (reason === "autosave") setLastVideoSaveStatus("시청 중 자동 저장됨");
      else if (reason === "pause") setLastVideoSaveStatus("일시정지 시점까지 저장 완료");
      else if (reason === "ended") setLastVideoSaveStatus("영상 종료 시점까지 저장 완료");
      else if (reason === "hidden") setLastVideoSaveStatus("앱을 나가기 전 시청 기록 저장 완료");
      else setLastVideoSaveStatus("실제 재생시간 기준으로 영상 기록 저장 완료");
    } catch (e) {
      console.error("video-watch Worker 저장 실패, 로컬 대기열에 보관:", e);
      queuePendingVideoWatch(payload);
      setPendingVideoCount(getPendingVideoWatch().length);
      setLastVideoSaveStatus("저장 대기 중");
    } finally {
      // [95차수 09-05] 이 저장이 아직 "지금 보는 영상"의 것일 때만 문지기를 푼다 — 그새 영상을 닫았거나 다른 영상을 열었으면
      //   그쪽 문지기(새 영상의 것)를 건드리면 안 된다.
      if (currentSessionIdRef.current === rootSessionId) videoSaveInFlightRef.current = false;
    }

    setVideoWatch(prev => applyVideoWatchLocal(prev || {}, payload));
    // [95차수 09-05] 그새 영상을 닫았거나 다른 영상을 열었으면(세션이 바뀜) 기준값을 건드리지 않는다.
    //   예전엔 닫을 때 저장이 끝날 때까지 기다려서 이런 일이 없었지만, 이제 저장을 뒤에서 하므로 여기서 막아야
    //   옛 영상의 합계가 새 영상의 기준값에 들어가 새 영상의 첫 부분이 안 잡히는 일이 없다.
    if (currentSessionIdRef.current !== rootSessionId) return true;
    videoSaveChunkSeqRef.current = chunkSeq;
    lastSavedPlaySecRef.current = totalPlaySec;
    lastSavedFocusSecRef.current = totalFocusSec;
    lastSavedAwaySecRef.current = totalAwaySec;
    lastSavedAwayCountRef.current = totalAwayCount;
    return true;
  };
  // YouTube 플레이어 이벤트 수신: 실제 PLAYING 시간만 누적
  useEffect(() => {
    const isCurrentVideo = (detail) => viewingVideo && String(detail?.videoId || "") === String(viewingVideo.id);

    const handleReady = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      if (detail.durationSec) ytDurationSecRef.current = detail.durationSec;
    };

    const handleState = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      ytPlayerStateRef.current = Number(detail.state);
      if (detail.durationSec) ytDurationSecRef.current = detail.durationSec;

      if (ytPlayerStateRef.current === YT_STATE.PLAYING) {
        if (document.hidden) startAwayMeasurementIfPlaying();
        else finishAwayMeasurement();
      } else {
        finishAwayMeasurement();
        if (ytPlayerStateRef.current === YT_STATE.PAUSED) {
          saveCurrentVideoProgress({ reason: "pause", minDeltaSec: VIDEO_PROGRESS_SAVE_MIN_SEC, partialSave: true });
        }
        if (ytPlayerStateRef.current === YT_STATE.ENDED) {
          saveCurrentVideoProgress({ reason: "ended", minDeltaSec: 1, partialSave: false });
        }
      }
    };

    const handleTick = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      const deltaSec = Math.max(0, Math.min(3600, Number(detail.deltaSec) || 0));
      if (deltaSec <= 0) return;
      ytPlaySecRef.current += deltaSec;
      if (!document.hidden) ytFocusSecRef.current += deltaSec;
      if (detail.durationSec) ytDurationSecRef.current = detail.durationSec;

      const unsavedPlaySec = Math.round(ytPlaySecRef.current - lastSavedPlaySecRef.current);
      if (!document.hidden && unsavedPlaySec >= VIDEO_PROGRESS_AUTOSAVE_SEC) {
        saveCurrentVideoProgress({ reason: "autosave", minDeltaSec: VIDEO_PROGRESS_AUTOSAVE_SEC, partialSave: true });
      }
    };

    const handleError = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      setLastVideoSaveStatus("유튜브 플레이어를 불러오지 못했습니다. 영상 링크를 확인해 주세요.");
    };

    window.addEventListener("mapl:yt-ready", handleReady);
    window.addEventListener("mapl:yt-state", handleState);
    window.addEventListener("mapl:yt-tick", handleTick);
    window.addEventListener("mapl:yt-error", handleError);
    return () => {
      window.removeEventListener("mapl:yt-ready", handleReady);
      window.removeEventListener("mapl:yt-state", handleState);
      window.removeEventListener("mapl:yt-tick", handleTick);
      window.removeEventListener("mapl:yt-error", handleError);
    };
  }, [viewingVideo, studentId]);
  const closeVideo = async () => {
    if (viewingVideo && viewStartTime) {
      finishAwayMeasurement();
      // [95차수 09-05] 저장은 뒤에서 하고 영상은 바로 닫는다 — 예전엔 저장이 끝날 때까지 기다려서 인터넷이 느리면
      //   다음 영상이 한참 안 열렸다. 저장 재료(재생 시간 등)는 부르는 순간 바로 읽어 두므로 아래에서 기준값을
      //   0으로 되돌려도 안전하고, 저장이 끝난 뒤의 기준값 갱신은 세션이 바뀌면 건너뛴다(saveCurrentVideoProgress).
      const totalPlaySec = Math.round(ytPlaySecRef.current);
      saveCurrentVideoProgress({ reason: "close", minDeltaSec: 1, partialSave: false })
        .then((saved) => {
          if (saved) return;
          if (totalPlaySec > 0) setLastVideoSaveStatus("이미 자동 저장된 시청 기록입니다");
          else setLastVideoSaveStatus("재생한 시간이 없어 시청 기록을 저장하지 않았습니다");
        })
        .catch(() => {});
      try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
    }

    // ref 초기화
    awayStartRef.current = null;
    activeSecRef.current = 0;
    awaySecRef.current = 0;
    awayCountRef.current = 0;
    longestAwayRef.current = 0;
    lastActiveAtRef.current = null;
    ytPlaySecRef.current = 0;
    ytFocusSecRef.current = 0;
    ytDurationSecRef.current = 0;
    ytPlayerStateRef.current = null;
    lastSavedPlaySecRef.current = 0;
    lastSavedFocusSecRef.current = 0;
    lastSavedAwaySecRef.current = 0;
    lastSavedAwayCountRef.current = 0;
    videoSaveChunkSeqRef.current = 0;
    videoSaveInFlightRef.current = false;
    currentSessionIdRef.current = null;
    setViewingVideo(null);
    setViewStartTime(null);
  };
  // ─── 이탈 추적: 영상이 실제 재생 중일 때 다른 앱/탭으로 나간 시간만 측정 ───
  // (visibilitychange 이벤트는 iOS/Android/PC 모두 지원하는 표준 API)
  useEffect(() => {
    if (!viewingVideo) return;

    const handleVisibility = () => {
      if (document.hidden) {
        saveCurrentVideoProgress({ reason: "hidden", minDeltaSec: VIDEO_PROGRESS_SAVE_MIN_SEC, partialSave: true });
        startAwayMeasurementIfPlaying();
      } else {
        finishAwayMeasurement();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [viewingVideo, studentId]);
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (viewingVideo && viewStartTime) {
        let finalAway = awaySecRef.current;
        let finalAwayCount = awayCountRef.current;
        let finalLongestAway = longestAwayRef.current;
        if (awayStartRef.current) {
          const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
          if (awayDur >= MIN_AWAY_SEC) {
            finalAway += awayDur;
            finalAwayCount += 1;
            if (awayDur > finalLongestAway) finalLongestAway = awayDur;
          }
        }

        const actualWatchSec = Math.round(ytPlaySecRef.current);
        const focusSec = Math.round(ytFocusSecRef.current);
        const unsavedWatchSec = Math.max(0, actualWatchSec - lastSavedPlaySecRef.current);
        const unsavedFocusSec = Math.max(0, focusSec - lastSavedFocusSecRef.current);
        const unsavedAwaySec = Math.max(0, finalAway - lastSavedAwaySecRef.current);
        const unsavedAwayCount = Math.max(0, finalAwayCount - lastSavedAwayCountRef.current);
        if (unsavedWatchSec <= 0 && unsavedAwaySec <= 0) return;

        const rootSessionId = currentSessionIdRef.current || makeVideoSessionId(studentId, viewingVideo.id);
        const payload = {
          eventType: "session",
          sessionId: `${rootSessionId}_beforeunload_${videoSaveChunkSeqRef.current + 1}`,
          rootSessionId,
          studentId: String(studentId),
          videoId: String(viewingVideo.id),
          title: viewingVideo.title || "",
          subject: viewingVideo.subject || "",
          url: viewingVideo.url || viewingVideo.playlistUrl || "",
          videoType: viewingVideo.type || "video",
          seconds: clampNum(unsavedWatchSec),
          activeSec: clampNum(unsavedFocusSec),
          awaySec: clampNum(unsavedAwaySec, 0, 86400),
          awayCount: clampNum(unsavedAwayCount, 0, 10000),
          longestAwaySec: clampNum(finalLongestAway, 0, 86400),
          durSec: clampNum(ytDurationSecRef.current || viewingVideo.durSec || 720, 1, 86400),
          date: getTodayStr(),
          timestamp: new Date().toISOString(),
          source: "student_app_youtube_iframe_api_beforeunload",
          openSec: clampNum(Math.round((Date.now() - viewStartTime) / 1000), 0, 86400),
          partialSave: true,
        };

        // beforeunload에서는 async fetch를 기다릴 수 없으므로 로컬 대기열에 저장 후 다음 접속 때 Worker로 전송
        queuePendingVideoWatch(payload);
        try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [viewingVideo, viewStartTime, studentId]);
  useEffect(() => {
    const flush = async () => {
      // [마스터] 부팅 직후 도는 재전송. 원장 폰에 남아 있던 대기 기록이
      // 마스터 홈이 뜨기도 전에 학생 기록으로 나가는 것을 막는다.
      if (IS_STAFF_VIEW) return;
      // [08-07] 차단된 링크에서는 남은 기록을 더 보내지 않는다(서버를 계속 두드리지 않게).
      if (withdrawnRef.current) return;
      // [3차 ④] 문지기. 인터넷 복귀와 화면 복귀가 거의 동시에 오면 flush가 두 번 겹칠 수 있고,
      // 그러면 같은 기록이 두 번 저장된다. 이미 돌고 있으면 그냥 돌아간다.
      // finally에서 반드시 풀어줘야 한다. 안 그러면 한 번 돌고 영영 안 돈다.
      if (flushingRef.current) return;
      flushingRef.current = true;
      try {
        // 1) pending_away 고아 데이터 복구: 앱이 이탈 상태에서 강제 종료된 경우, 다음 접속 때 이탈 기록만 Worker로 보냄
        try {
          const orphanAway = JSON.parse(localStorage.getItem("pending_away") || "null");
          if (orphanAway && orphanAway.awayStartedAt && orphanAway.studentId && orphanAway.videoId) {
            const awayDur = Math.round((Date.now() - orphanAway.awayStartedAt) / 1000);
            const MAX_REALISTIC_AWAY = 86400; // 24h
            if (awayDur >= MIN_AWAY_SEC && awayDur < MAX_REALISTIC_AWAY) {
              queuePendingVideoWatch({
                eventType: "away",
                sessionId: makeVideoSessionId(orphanAway.studentId, orphanAway.videoId) + "_away",
                studentId: String(orphanAway.studentId),
                videoId: String(orphanAway.videoId),
                title: orphanAway.title || "",
                seconds: 0,
                activeSec: 0,
                awaySec: awayDur,
                awayCount: 1,
                longestAwaySec: awayDur,
                date: getTodayStr(),
                timestamp: new Date().toISOString(),
                source: "student_app_orphan_away",
              });
            }
          }
          localStorage.removeItem("pending_away");
        } catch (e) { /* ignore */ }

        // 2) 구버전 pending_vtime → 새 Worker 대기열로 이관
        try {
          const legacyPending = JSON.parse(localStorage.getItem("pending_vtime") || "[]");
          legacyPending.forEach(item => {
            queuePendingVideoWatch({
              eventType: "session",
              sessionId: item.sessionId || makeVideoSessionId(item.studentId, item.videoId),
              studentId: String(item.studentId),
              videoId: String(item.videoId),
              title: item.title || "",
              seconds: clampNum(item.seconds || 0),
              activeSec: clampNum(item.activeSec || 0),
              awaySec: clampNum(item.awaySec || 0, 0, 86400),
              awayCount: clampNum(item.awayCount || 0, 0, 10000),
              longestAwaySec: clampNum(item.longestAwaySec || 0, 0, 86400),
              durSec: item.durSec || 720,
              date: item.date || getTodayStr(),
              timestamp: item.timestamp || new Date().toISOString(),
              source: "legacy_pending_vtime",
            });
          });
          if (legacyPending.length > 0) localStorage.removeItem("pending_vtime");
        } catch (e) { /* ignore */ }

        // 3) 오답 단어 TEST 결과 대기열도 함께 재전송. [135차수 j] 하나라도 보냈으면 자료를 다시 받아 오답 화면에 바로 보이게(전에는 다음 새로고침까지 안 보였음)
        const sentVocab = await flushPendingVocabTests();
        if (sentVocab > 0 && typeof onVocabResultsSent === "function") { try { onVocabResultsSent(); } catch (e) { /* ignore */ } }

        // 4) 새 영상 대기열을 Worker로 순차 전송. 실패한 항목만 다시 보관.
        const pending = getPendingVideoWatch();
        setPendingVideoCount(pending.length);
        if (pending.length === 0) return;
        const failed = [];
        for (const item of pending) {
          try {
            await postVideoWatchToWorker(item);
            setVideoWatch(prev => applyVideoWatchLocal(prev || {}, item));
          } catch (e) {
            failed.push(item);
          }
        }
        setPendingVideoWatch(failed.slice(-100));
        setPendingVideoCount(failed.length);
        setLastVideoSaveStatus(failed.length > 0 ? `저장 대기 ${failed.length}개` : "대기 기록 전송 완료");
      } catch (e) { /* ignore */ }
      finally { flushingRef.current = false; }
    };

    // [3차 ④] 예전에는 앱을 켤 때 딱 한 번만 다시 보냈다.
    // 인터넷이 돌아왔을 때와 화면을 다시 켰을 때도 다시 보내게 한다.
    // 화면에 적힌 "인터넷 연결 후 자동 재전송됩니다"가 이제 사실이 된다.
    flush();
    const onOnline = () => { flush(); };
    const onVisFlush = () => { if (!document.hidden) flush(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisFlush);
    const pendingTimer = setInterval(() => setPendingVideoCount(getPendingVideoWatch().length), 5000);
    return () => {
      clearInterval(pendingTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisFlush);
    };
  }, []);
  return { toggleVideo };
}
