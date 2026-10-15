import { useEffect, useRef } from "react";
import { YT_STATE, clearVideoPos, dispatchVideoPlayerEvent, getVideoResumeSec, loadYouTubeIframeApi, saveVideoPos } from "../../core/videoWatch.jsx";
import { extractPlaylistId, extractYoutubeId } from "../../domain/videoMatch.jsx";

export function TrackedYoutubePlayer({ video }) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const lastPlayerTimeRef = useRef(0);
  const lastWallTimeRef = useRef(Date.now());
  const destroyedRef = useRef(false);
  const lastPosSaveAtRef = useRef(0);   // [95차수] 이어보기 위치를 마지막으로 적어 둔 시각(5초마다 한 번만 적는다)

  const clearTickTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTickTimer = () => {
    if (timerRef.current) return;
    lastWallTimeRef.current = Date.now();
    try { lastPlayerTimeRef.current = Number(playerRef.current?.getCurrentTime?.() || 0); }
    catch (e) { lastPlayerTimeRef.current = 0; }

    timerRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || destroyedRef.current) return;

      let state = -999;
      let currentSec = 0;
      let durationSec = 0;
      try {
        state = Number(player.getPlayerState?.());
        currentSec = Number(player.getCurrentTime?.() || 0);
        durationSec = Math.round(Number(player.getDuration?.() || 0));
      } catch (e) {
        return;
      }

      const now = Date.now();
      const wallDelta = Math.max(0, (now - lastWallTimeRef.current) / 1000);
      const rawDelta = Math.max(0, currentSec - lastPlayerTimeRef.current);

      // 정상 재생은 currentTime 증가분으로 기록한다.
      // 단, 학생이 재생바를 앞으로 끌어당긴 경우 rawDelta가 과도하게 커질 수 있으므로 wallDelta 기준으로 보정한다.
      let deltaSec = 0;
      if (state === YT_STATE.PLAYING) {
        if (rawDelta <= wallDelta + 3) deltaSec = rawDelta;
        else deltaSec = Math.min(wallDelta, 3);
      }

      lastWallTimeRef.current = now;
      lastPlayerTimeRef.current = currentSec;

      // [95차수 09-05] 이어보기 — 재생 중이면 5초에 한 번 지금 위치를 폰에 적어 둔다
      if (state === YT_STATE.PLAYING && now - lastPosSaveAtRef.current >= 5000) {
        lastPosSaveAtRef.current = now;
        saveVideoPos(video?.id, currentSec, durationSec || video?.durSec);
      }

      if (deltaSec > 0.2) {
        dispatchVideoPlayerEvent("mapl:yt-tick", {
          videoId: String(video?.id || ""),
          deltaSec,
          currentSec,
          durationSec,
          state,
        });
      }
    }, 1000);
  };

  useEffect(() => {
    destroyedRef.current = false;
    const videoId = video?.type === "playlist" ? "" : extractYoutubeId(video?.url || "");
    const playlistId = video?.type === "playlist" ? extractPlaylistId(video?.playlistUrl || video?.url || "") : "";

    if (!mountRef.current || (!videoId && !playlistId)) return undefined;

    loadYouTubeIframeApi().then((YT) => {
      if (destroyedRef.current || !mountRef.current) return;
      const playerVars = {
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
      };
      if (playlistId) {
        playerVars.listType = "playlist";
        playerVars.list = playlistId;
      } else {
        // [95차수 09-05] 이어보기 — 이 폰에 적어 둔 마지막 위치가 있으면 거기서부터 튼다(재생목록형은 제외)
        const resumeSec = getVideoResumeSec(video?.id);
        if (resumeSec > 0) playerVars.start = resumeSec;
      }

      playerRef.current = new YT.Player(mountRef.current, {
        width: "100%",
        height: "100%",
        videoId: videoId || undefined,
        playerVars,
        events: {
          onReady: (event) => {
            let durationSec = 0;
            try { durationSec = Math.round(Number(event.target.getDuration?.() || 0)); }
            catch (e) { durationSec = 0; }
            dispatchVideoPlayerEvent("mapl:yt-ready", {
              videoId: String(video?.id || ""),
              durationSec,
              currentSec: 0,
            });
          },
          onStateChange: (event) => {
            const state = Number(event.data);
            let durationSec = 0;
            let currentSec = 0;
            try {
              durationSec = Math.round(Number(event.target.getDuration?.() || 0));
              currentSec = Number(event.target.getCurrentTime?.() || 0);
            } catch (e) { /* ignore */ }

            dispatchVideoPlayerEvent("mapl:yt-state", {
              videoId: String(video?.id || ""),
              state,
              durationSec,
              currentSec,
            });

            if (state === YT_STATE.PLAYING) {
              lastPlayerTimeRef.current = currentSec;
              lastWallTimeRef.current = Date.now();
              startTickTimer();
            } else {
              clearTickTimer();
              lastPlayerTimeRef.current = currentSec;
              lastWallTimeRef.current = Date.now();
              // [95차수 09-05] 이어보기 — 멈추면 그 자리를 적어 두고, 끝까지 봤으면 기록을 지운다(다음엔 처음부터)
              if (state === YT_STATE.ENDED) clearVideoPos(video?.id);
              else if (state === YT_STATE.PAUSED) saveVideoPos(video?.id, currentSec, durationSec || video?.durSec);
            }
          },
          onError: (event) => {
            dispatchVideoPlayerEvent("mapl:yt-error", {
              videoId: String(video?.id || ""),
              errorCode: event?.data,
            });
          },
        },
      });
    }).catch((e) => {
      dispatchVideoPlayerEvent("mapl:yt-error", {
        videoId: String(video?.id || ""),
        message: e?.message || "YouTube 플레이어 로드 실패",
      });
    });

    return () => {
      destroyedRef.current = true;
      clearTickTimer();
      // [94차수 09-05] 영상 칸이 화면에서 사라질 때(탭 이동·날짜 바꾸기·다른 강의 열기) "멈춤" 신호를 한 번 보낸다.
      //   예전엔 이 신호가 없어서 앱이 계속 "재생 중"인 줄 알았고, 그 뒤에 폰을 껐다 켠 시간이
      //   통째로 그 강의의 "이탈"로 기록됐다(원장앱 영상 통계가 부풀었음). 신호를 받은 쪽(handleState)은
      //   재생 중 표시를 끄고, 아직 안 보낸 시청 시간이 있으면 그 자리에서 저장한다.
      if (playerRef.current) {
        let currentSec = 0, durationSec = 0;
        try {
          currentSec = Number(playerRef.current.getCurrentTime?.() || 0);
          durationSec = Math.round(Number(playerRef.current.getDuration?.() || 0));
        } catch (e) { /* ignore */ }
        // [95차수 09-05] 이어보기 — 영상 칸이 사라지는 순간의 위치도 적어 둔다(탭을 바꿨다 돌아오면 여기서부터)
        if (!playlistId) saveVideoPos(video?.id, currentSec, durationSec || video?.durSec);
        dispatchVideoPlayerEvent("mapl:yt-state", {
          videoId: String(video?.id || ""),
          state: YT_STATE.PAUSED,
          durationSec,
          currentSec,
          unmounted: true,
        });
      }
      try { playerRef.current?.destroy?.(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
  }, [video?.id, video?.url, video?.playlistUrl, video?.type]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
