import { useEffect, useRef, useState } from "react";
import "./DusikWelcome.css";

const reactionRows = ["tilt", "paws", "hop"];
const moments = ["wave", ...reactionRows, "cheer"];

function homeworkMessage(homework) {
  if (homework.remaining > 0) {
    const first = homework.first.split(/\s*(?:->|→)\s*/)[0];
    return [`오늘 숙제 ${homework.remaining}개 남았어!`, `‘${first}’부터 해 볼까?`];
  }
  if (homework.retry) return ["다시 볼 숙제가 있어", "아래 숙제 카드에서 재시 항목을 확인해 봐."];
  if (homework.assigned) return ["오늘 숙제 다 했다!", "오늘도 고생했어!"];
  return ["안녕, 난 두식이야", "오늘도 만나서 반가워"];
}

export function DusikWelcome({ studentId, today, homework }) {
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
  const [headline, detail] = homeworkMessage(homework);
  const allDone = homework.assigned && !homework.retry && homework.remaining === 0;
  const lastCheer = useRef(null);
  const speech = useRef(null);

  useEffect(() => {
    if (dismissed || !allDone || lastCheer.current === today) return;
    lastCheer.current = today;
    const key = `maple.dusik.cheered.${studentId}`;
    try {
      if (sessionStorage.getItem(key) === today) return;
      sessionStorage.setItem(key, today);
    } catch { /* The in-memory date still prevents repeats. */ }
    setMoment("cheer");
  }, [dismissed, allDone, studentId, today]);

  useEffect(() => () => {
    if (speech.current) window.speechSynthesis?.cancel();
  }, [dismissed]);

  function greet() {
    setMoment(moments[tapCount % moments.length]);
    setTapCount(n => n + 1);
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    if (speech.current) window.speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(`${headline} ${detail}`);
    line.lang = "ko-KR";
    line.onend = line.onerror = () => { if (speech.current === line) speech.current = null; };
    speech.current = line;
    window.speechSynthesis.speak(line);
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
        <strong>{headline}</strong>
        <span>{detail}</span>
      </div>
      <button className="dusik-pet" type="button" ref={pet}
        aria-label="두식이 말풍선 듣기" title="두식이 말풍선 듣기" onClick={greet}>
        <span key={tapCount} className="dusik-sprite" data-moment={moment} aria-hidden="true"
          onAnimationEnd={() => setMoment("rest")}
          style={{
            backgroundPositionX: `${frame * 5}%`,
            backgroundPositionY: reactionRow >= 0 ? `${reactionRow * 50}%` : "0%",
          }} />
      </button>
      <button className="dusik-close" type="button" aria-label="두식이 인사 닫기"
        onClick={dismiss}>×</button>
    </section>
  );
}
