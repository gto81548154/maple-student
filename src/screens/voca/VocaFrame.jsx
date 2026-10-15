import { useEffect, useRef, useState } from "react";

// ─── [08-04] 마플보카 임베드 공용 프레임: 스크롤을 학생앱 하나로 통일 ───
// voca.html이 문서 높이(maplVocaHeight)를 계속 보내오면 iframe 높이를 그 값으로 맞춰
// 내부 스크롤을 없앤다. 반대로 여기서는 "지금 보이는 영역"(maplVis)을 계속 알려줘
// 마플보카의 모달·토스트가 화면 안에 뜨게 하고, 화면 전환(maplVocaScroll) 때는 맨 위로 스크롤한다.
// 옛 voca.html(높이를 안 보내는 판)과 섞이면 아래가 잘리므로 두 파일은 반드시 한 커밋으로 배포.
export function VocaFrame({ title, src, topOffset = 60, openLast = false, onOpenLastDone, openTask = null, onOpenTaskDone, hwTask = null, onHwTaskDone, onPicked, onHwState }) {
  const ref = useRef(null);
  const [h, setH] = useState(560);
  // [97차수 09-05] 마플보카가 "숙제 TEST 시험 중/아님"(maplVocaHwState)을 알려주면 부모에게 전달 — 위 탭으로 나갈 때 확인창용.
  //   프레임이 사라질 때(탭 이동·닫힘)는 반드시 "아님"으로 되돌린다(마플보카가 알려줄 기회가 없으므로).
  const onHwStateRef = useRef(onHwState);
  onHwStateRef.current = onHwState;
  // [0812] 홈 카드 "단어장"으로 들어온 경우: voca가 살아있다는 첫 신호(높이)가 오면
  // "마지막 책 열어줘"를 딱 한 번 보낸다. 탭을 직접 누른 경우(openLast=false)는 예전처럼 책장부터.
  const onPickedRef = useRef(onPicked);
  // [81차수 08-31] 매 렌더마다 갱신 — 이 한 줄이 없으면 [내 단어장]으로 먼저 연 뒤
  //   탭 안에서 [단어 선별]로 바꿨을 때 저장해도 홈 카드가 안 새로 받아졌다.
  onPickedRef.current = onPicked;
  const openLastArmedRef = useRef(false);
  const openLastDoneRef = useRef(onOpenLastDone);
  openLastDoneRef.current = onOpenLastDone;
  useEffect(() => { if (openLast) openLastArmedRef.current = true; }, [openLast]);
  // [0813] 홈 "수업 단어 공부" 카드: {book, lecs}를 담아 "이 책을 이 단원 체크한 채 열어줘"를 딱 한 번 보낸다
  const openTaskRef = useRef(null);
  const openTaskDoneRef = useRef(onOpenTaskDone);
  openTaskDoneRef.current = onOpenTaskDone;
  useEffect(() => { if (openTask) openTaskRef.current = openTask; }, [openTask]);
  // [숙제 5차수 0818] 홈 "수업 단어 공부" 카드: {book, lecs, date, deadline}를 담아
  // "숙제 TEST를 바로 시작해줘"를 딱 한 번 보낸다. 마플보카가 객관식 클리어 모드로 연다.
  const hwTaskRef = useRef(null);
  const hwTaskDoneRef = useRef(onHwTaskDone);
  hwTaskDoneRef.current = onHwTaskDone;
  useEffect(() => { if (hwTask) hwTaskRef.current = hwTask; }, [hwTask]);
  useEffect(() => {
    let raf = 0;
    const sendVis = () => {
      raf = 0;
      const el = ref.current;
      if (!el || !el.contentWindow) return;
      const r = el.getBoundingClientRect();
      const top = Math.max(0, -r.top);
      const vh = Math.max(0, Math.min(window.innerHeight, r.bottom) - Math.max(r.top, 0));
      try { el.contentWindow.postMessage({ type: "maplVis", top: Math.round(top), h: Math.round(vh) }, "*"); } catch (e) {}
    };
    const queueVis = () => { if (!raf) raf = requestAnimationFrame(sendVis); };
    const onMsg = (e) => {
      const el = ref.current;
      if (!el || e.source !== el.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "maplVocaHeight" && Number.isFinite(d.h)) {
        setH(Math.max(360, Math.ceil(d.h))); queueVis();
        if (hwTaskRef.current) {                                       // [숙제 5차수] 숙제 신호가 최우선
          const req = hwTaskRef.current; hwTaskRef.current = null;      // 두 번 보내지 않기
          try { el.contentWindow.postMessage({ type: "maplVocaHwTask", book: req.book, lecs: req.lecs, ns: req.ns, lessons: req.lessons, date: req.date, deadline: req.deadline }, "*"); } catch (e) {}
          if (hwTaskDoneRef.current) hwTaskDoneRef.current();
        } else if (openTaskRef.current) {
          const req = openTaskRef.current; openTaskRef.current = null;   // 두 번 보내지 않기
          try { el.contentWindow.postMessage({ type: "maplVocaOpenTask", book: req.book, lecs: req.lecs }, "*"); } catch (e) {}
          if (openTaskDoneRef.current) openTaskDoneRef.current();
        } else if (openLastArmedRef.current) {
          openLastArmedRef.current = false;   // 두 번 보내지 않기 (높이 신호는 계속 오므로)
          try { el.contentWindow.postMessage({ type: "maplVocaOpenLast" }, "*"); } catch (e) {}
          if (openLastDoneRef.current) openLastDoneRef.current();
        }
      }
      // [선별 78차수] 선생님이 유닛 하나를 저장할 때마다 마플보카가 알려준다 → 선생님 홈 카드를 새로 받아온다
      if (d.type === "maplVocaPicked" && onPickedRef.current) onPickedRef.current();
      // [97차수] 숙제 TEST 시험 중/아님
      if (d.type === "maplVocaHwState" && onHwStateRef.current) onHwStateRef.current(!!d.busy);
      if (d.type === "maplVocaScroll") {
        const r = el.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top + (d.y || 0) - topOffset), behavior: "auto" });
        queueVis();
      }
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("scroll", queueVis, { passive: true });
    window.addEventListener("resize", queueVis);
    const tick = setInterval(queueVis, 700);       // 레이아웃 변동 대비 보험
    queueVis();
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("scroll", queueVis);
      window.removeEventListener("resize", queueVis);
      clearInterval(tick);
      if (raf) cancelAnimationFrame(raf);
      if (onHwStateRef.current) onHwStateRef.current(false);   // [97차수] 프레임이 사라지면 "시험 중 아님"
    };
  }, [topOffset]);
  return (
    <iframe ref={ref} title={title} src={src} scrolling="no"
      style={{ width: "100%", height: h, border: "none", display: "block", background: "#F5F6FA", overflow: "hidden" }} />
  );
}
