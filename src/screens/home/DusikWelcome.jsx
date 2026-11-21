import { useEffect, useRef, useState } from "react";
import art from "./dusik.webp";
import reactions from "./dusik-reactions.webp";
import "./DusikWelcome.css";

const moments = ["wave", "tilt", "paws", "hop"];

export function DusikWelcome({ studentId }) {
  const storageKey = `maple.dusik.dismissed.${studentId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "1"; }
    catch { return false; }
  });
  const pet = useRef(null);
  const [frame, setFrame] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [acting, setActing] = useState(true);
  const moment = acting ? moments[Math.max(0, tapCount - 1) % moments.length] : "rest";
  const reactionRow = moments.indexOf(moment) - 1;

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
      <div className="dusik-copy">
        <strong>안녕, 난 두식이야</strong>
        <span>오늘도 만나서 반가워</span>
      </div>
      <button className="dusik-pet" type="button" ref={pet}
        aria-label="두식이와 인사하기" title="두식이와 인사하기"
        onClick={() => { setTapCount(n => n + 1); setActing(true); }}>
        <span key={tapCount} className="dusik-sprite" data-moment={moment} aria-hidden="true"
          onAnimationEnd={() => setActing(false)}
          style={{
            "--dusik-rest": `url(${art})`,
            backgroundImage: `url(${reactionRow >= 0 ? reactions : art})`,
            backgroundPositionX: `${frame * 5}%`,
            backgroundPositionY: reactionRow >= 0 ? `${reactionRow * 50}%` : "0%",
          }} />
      </button>
      <button className="dusik-close" type="button" aria-label="두식이 인사 닫기"
        onClick={dismiss}>×</button>
    </section>
  );
}
