import { useEffect, useRef, useState } from "react";
import "./DusikWelcome.css";

const reactionRows = ["tilt", "paws", "hop"];
const moments = ["wave", ...reactionRows, "cheer"];

export function DusikWelcome({ studentId, noticeCount, unansweredCount, onOpen }) {
  const storageKey = `maple.dusik.dismissed.${studentId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "1"; }
    catch { return false; }
  });
  const pet = useRef(null);
  const [frame, setFrame] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [moment, setMoment] = useState("wave");
  const reactionRow = reactionRows.indexOf(moment);
  function greet() {
    setMoment(moments[tapCount % moments.length]);
    setTapCount(n => n + 1);
  }

  useEffect(() => {
    if (dismissed) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rest = () => setFrame(0);
    function look(event) {
      if (motion.matches || event.pointerType !== "mouse" || !pet.current) return;
      const box = pet.current.getBoundingClientRect();
      const x = event.clientX - box.left - box.width / 2;
      const y = event.clientY - box.top - box.height * 0.5;
      const sector = Math.round(Math.atan2(x, -y) * 8 / Math.PI);
      setFrame(Math.hypot(x, y) < box.width * 0.15 ? 0 : 1 + (sector + 16) % 16);
    }
    window.addEventListener("pointermove", look, { passive: true });
    document.documentElement.addEventListener("pointerleave", rest);
    window.addEventListener("blur", rest);
    return () => {
      window.removeEventListener("pointermove", look);
      document.documentElement.removeEventListener("pointerleave", rest);
      window.removeEventListener("blur", rest);
    };
  }, [dismissed]);

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, "1"); }
    catch { /* The card can still be dismissed when storage is unavailable. */ }
  }

  if (dismissed) return null;

  return (
    <section className="dusik-welcome" aria-label="두식이의 인사">
      <div className="dusik-copy" role="status" aria-live="polite" aria-atomic="true">
        <strong>{unansweredCount ? `응답할 설문이 ${unansweredCount}개 있어!` : "학원 소식 보러 갈까?"}</strong>
        <span>{noticeCount ? `선생님이 올린 공지가 ${noticeCount}개 있어.` : "성적장학금 신청 방법도 볼 수 있어."}</span>
      </div>
      <button className="dusik-pet" type="button" ref={pet}
        aria-label="두식이와 인사하기" title="두식이와 인사하기" onClick={greet}>
        <span key={tapCount} className="dusik-sprite" data-moment={moment} aria-hidden="true"
          onAnimationEnd={() => setMoment("rest")}
          style={{
            backgroundPositionX: `${frame * 5}%`,
            backgroundPositionY: reactionRow >= 0 ? `${reactionRow * 50}%` : "0%",
          }} />
      </button>
      <div className="dusik-links" role="group" aria-label="학원 소식 바로가기">
        <button type="button" onClick={() => onOpen("notices")}>공지사항</button>
        <button type="button" onClick={() => onOpen("surveys")}>설문조사</button>
        <button type="button" onClick={() => onOpen("reward")}>성적장학금</button>
        <button type="button" onClick={() => onOpen("referral")}>친구소개</button>
      </div>
      <button className="dusik-close" type="button" aria-label="두식이 인사 닫기"
        onClick={dismiss}>×</button>
    </section>
  );
}
