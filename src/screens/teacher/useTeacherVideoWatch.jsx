import { useEffect, useRef } from "react";
import { teacherUrl } from "../../core/auth.jsx";

// [122차수] 선생님이 강의를 열어 본 시간 재기와 보내기 — TeacherHome.jsx에서 그대로 옮김.
export function useTeacherVideoWatch(D) {
  const { setPlaying } = D;
  const openedAtRef = useRef(0);
  const openedVideoRef = useRef(null);
  const sendTeacherWatch = (video, seconds) => {
    const sec = Math.max(0, Math.round(Number(seconds) || 0));
    if (!video || sec < 5) return;   // 잘못 눌러 바로 닫은 것은 기록하지 않는다
    try {
      fetch(teacherUrl("/teacher/video-watch"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: String(video.id || ""), title: video.title || "", subject: video.subject || "",
          url: video.url || video.playlistUrl || "", videoType: video.type || "video",
          seconds: sec, openSec: sec, durSec: 720,
          durationSource: "teacher_open_timer", source: "teacher_app",
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  };
  const openVideo = (video) => {
    const prev = openedVideoRef.current;
    if (prev) sendTeacherWatch(prev, (Date.now() - openedAtRef.current) / 1000);
    if (!video || (prev && String(prev.id) === String(video.id))) {
      openedVideoRef.current = null; openedAtRef.current = 0; setPlaying(null); return;
    }
    openedVideoRef.current = video; openedAtRef.current = Date.now(); setPlaying(video.id);
  };
  useEffect(() => () => {
    const prev = openedVideoRef.current;
    if (prev) sendTeacherWatch(prev, (Date.now() - openedAtRef.current) / 1000);
  }, []);
  return { openVideo };
}
