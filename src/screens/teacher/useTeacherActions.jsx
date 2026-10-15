import { useEffect, useRef } from "react";
import { teacherLinkDead, teacherUrl } from "../../core/auth.jsx";
import { VOCA_APP_URL, WORKER_ORIGIN } from "../../core/config.jsx";
import { academyHour24 } from "../../domain/attendance.jsx";
import { teacherWorkOn } from "../../domain/teacher.jsx";

// [122차수] 선생님 홈의 동작(할 일 체크·근무표 고치기·단어 숙제 TEST 시작·선별 알리기·학생 화면 열기·단어장 주소) — TeacherHome.jsx에서 그대로 옮김.
export function useTeacherActions(D) {
  const { auth, busyItem, home, reloadHome, schedBusy, session, setBusyItem, setErr, setHome, setSchedBusy, setSchedMsg, setVocaHwTask, teacher, today } = D;
  // 내 할일 체크 — 워커에 보내고 화면도 그 자리에서 바꾼다(응답을 기다리는 동안 잠깐 잠금).
  const toggleTodo = async (sectionKey, item) => {
    if (!session || busyItem) return;
    const next = !item.done;
    setBusyItem(item.id);
    try {
      const r = await fetch(teacherUrl("/teacher/stafftodo-check"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey: today, section: sectionKey, itemId: item.id, done: next }),
      });
      if (r.status === 403) { teacherLinkDead(); return; }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.success) throw new Error((j && j.error) || "저장 실패");
      setHome(prev => {
        if (!prev) return prev;
        const sess = prev.stafftodo.sessions[today];
        const sections = { ...sess.sections };
        sections[sectionKey] = (sections[sectionKey] || []).map(x => x.id === item.id ? { ...x, done: next } : x);
        return { ...prev, stafftodo: { ...prev.stafftodo, sessions: { ...prev.stafftodo.sessions, [today]: { ...sess, sections } } } };
      });
    } catch (e) {
      setErr("체크를 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
      setTimeout(() => setErr(""), 3000);
    } finally { setBusyItem(""); }
  };
  // [근무표 수정 15차수] 원장이 고친 근무표를 워커에 저장하고 화면도 그 자리에서 바꾼다.
  //   한 번에 통째로 보낸다(그 사람의 요일 근무표 + 추가 근무 날짜 전부) — 워커가 다시 검사해서 저장한다.
  const saveStaffSchedule = async (st, change) => {
    if (!st || schedBusy) return;
    const workDays = { ...(st.workDays || {}) };
    let extras = [...(st.extraWorkDates || [])];
    if (change.toggleDay) {
      if (workDays[change.toggleDay] !== undefined) delete workDays[change.toggleDay];
      else workDays[change.toggleDay] = "5:30";
    }
    if (change.setDayTime) workDays[change.setDayTime.day] = change.setDayTime.time;
    if (change.addExtra) extras = [...extras.filter(x => x && x.date !== change.addExtra.date), { id: change.addExtra.date, ...change.addExtra }];
    if (change.removeExtra) extras = extras.filter(x => x && x.date !== change.removeExtra);

    setSchedBusy(true); setSchedMsg(null);
    try {
      const r = await fetch(teacherUrl("/teacher/staff-schedule"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: String(st.id), workDays, extraWorkDates: extras }),
      });
      if (r.status === 403) { setSchedMsg({ ok: false, text: "원장님만 근무표를 고칠 수 있습니다." }); return; }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.success) throw new Error((j && j.error) || "저장 실패");
      setHome(prev => prev ? {
        ...prev,
        staff: (prev.staff || []).map(x => String(x.id) === String(st.id) ? { ...x, workDays: j.workDays, extraWorkDates: j.extraWorkDates } : x),
        // 원장 본인 근무표를 고쳤으면 이 화면의 캘린더도 같이 바뀌어야 한다
        teacher: String(st.id) === "admin" ? { ...prev.teacher, workDays: j.workDays, extraWorkDates: j.extraWorkDates } : prev.teacher,
      } : prev);
      setSchedMsg({ ok: true, text: `${st.name} 근무표를 저장했습니다.` });
      setTimeout(() => setSchedMsg(null), 2500);
    } catch (e) {
      setSchedMsg({ ok: false, text: "저장하지 못했습니다. 잠시 뒤 다시 해주세요." });
    } finally { setSchedBusy(false); }
  };
  // [14차수] 숙제 TEST 시작 — 학생 startVocaHwTest와 같은 모양의 신호를 보낸다.
  //   마감(deadline)은 그날 출근 시각. 출근 시각이 없으면 안 보낸다(늦음 판정을 안 한다).
  const startTeacherHwTest = () => {
    if (!home || !home.hw) return false;
    let deadline = "";
    try {
      const w = teacherWorkOn(teacher, today);
      if (w && w.time) {
        const [hh, mm] = String(w.time).split(":");
        const dl = new Date(today + "T00:00:00");
        dl.setHours(academyHour24(hh), parseInt(mm, 10) || 0, 0, 0);
        deadline = dl.toISOString();
      }
    } catch (e) { deadline = ""; }
    setVocaHwTask({ book: home.hw.bookId, lecs: home.hw.range, date: today, deadline });
    return true;
  };
  /* [선별 78차수 · 원장 확정] 오늘 칸을 전부 10개씩 골랐으면 완료 기록을 자동으로 올린다.
   * 선생님이 따로 [완료] 를 누를 필요가 없다 — "자동으로 선별할 수 있게" 라는 원장 지시 그대로.
   * 마감(늦음 판정)은 시험과 같게 그날 출근 시각을 보낸다. 이미 오늘 기록이 있으면 안 올린다. */
  const pickSentRef = useRef("");
  useEffect(() => {
    const hw = home && home.hw;
    if (!hw || hw.mode !== "pick" || !hw.pickDone || hw.done) return;
    if (!WORKER_ORIGIN || !home.vocaId) return;
    const stamp = `${today}|${hw.bookId}|${(hw.range || []).join(",")}`;
    if (pickSentRef.current === stamp) return;      // 한 번만 올린다
    pickSentRef.current = stamp;
    let dead = false;
    (async () => {
      // [82차수 · 원장 확정 08-31] 선별 완료 마감 = 그날 자정(다음날 0시).
      //   예전엔 시험처럼 출근 시각이라 출근하고 나서 고르면 전부 "늦게 완료"로 찍혔다.
      //   (이 효과는 선별(pick)일 때만 돈다 — 시험 마감은 예전 그대로 출근 시각)
      let deadline = "";
      try {
        const dl = new Date(today + "T00:00:00");
        dl.setDate(dl.getDate() + 1);
        deadline = dl.toISOString();
      } catch (e) { deadline = ""; }
      try {
        const r = await fetch(`${WORKER_ORIGIN}/voca/hw-clear?id=${encodeURIComponent(home.vocaId)}&t=${encodeURIComponent(auth.tk)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: today, book: hw.bookId, lecs: hw.range,
            // [81차수 08-31] 단어 수 = 실제로 저장된 개수 합 (10개 미만 유닛은 그 개수만큼)
            n: (hw.range || []).reduce((a, u) => a + ((hw.picked || {})[String(u)] || 0), 0), w: 0, r: 0, k: "pick", deadline }),
        });
        if (!dead && r.ok) reloadHome();
        else if (!dead) pickSentRef.current = "";    // 실패하면 다음 기회에 다시
      } catch (e) { if (!dead) pickSentRef.current = ""; }
    })();
    return () => { dead = true; };
  }, [home, today, teacher, auth.tk, reloadHome]);
  // [10차수 원장 지시] 학생 화면은 새 창에서 연다 — 선생님 홈을 그대로 두고 학생만 확인하고 닫는다.
  const openStudent = (s) => {
    const sp = new URLSearchParams();
    sp.set("tid", auth.tid); sp.set("tk", auth.tk);
    sp.set("id", String(s.id));
    const url = window.location.pathname + "?" + sp.toString();
    const w = window.open(url, "_blank", "noopener");
    if (!w) window.location.href = url;   // 팝업이 막힌 폰에서는 예전처럼 이 창에서 연다
  };
  // 마플보카 — 본인 진도.
  // [10차수 원장 지시] 선생님에게는 mk=1을 붙이지 않는다 → 원장 전용 책(보카바이블)이 안 뜬다.
  // [11차수 원장 지시] 원장 본인이 링크로 들어온 경우에는 붙인다 → 보카바이블까지 책장에 진열된다.
  //   (mk 값은 그냥 "1"이라 열쇠가 아니다. 진짜 열쇠는 주소에 실리지 않는다.)
  const vocaSrc = (() => {
    const p = new URLSearchParams();
    p.set("id", home?.vocaId || `__teacher__${auth.tid}`);
    p.set("t", auth.tk);
    p.set("n", home?.isOwner ? "원장" : `${teacher.name || "선생님"} 선생님`);
    if (WORKER_ORIGIN) p.set("api", WORKER_ORIGIN);
    if (home?.isOwner) p.set("mk", "1");
    return `${VOCA_APP_URL}?${p.toString()}`;
  })();
  // [교사 선별 11차수] 같은 마플보카를 "선별 전용"으로 연다.
  //   pk=1  = 선별 화면을 쓸 수 있다(원장 mk=1과 별개 — 선생님도 켜진다)
  //   pkid  = 선별본 이름표. 선생님은 t_{계정id}, 원장은 없음(정본).
  //   저장 위치는 워커가 열쇠로 다시 판별하므로 주소를 손대도 남의 선별본은 못 덮는다.
  const vocaPickSrc = (() => {
    const extra = new URLSearchParams();
    extra.set("pick", "1");
    extra.set("pk", "1");
    if (home?.pickPrefix) extra.set("pkid", home.pickPrefix);
    // [선별 78차수] 오늘 골라야 하는 칸 — 마플보카가 이 칸들을 맨 위에 따로 모아 보여준다
    if (home?.hw?.mode === "pick" && Array.isArray(home?.hw?.range) && home.hw.range.length) {
      extra.set("plec", home.hw.range.join(","));
      extra.set("pbook", String(home.hw.bookId || ""));
    }
    return `${vocaSrc}&${extra.toString()}`;
  })();
  return { openStudent, saveStaffSchedule, startTeacherHwTest, toggleTodo, vocaPickSrc, vocaSrc };
}
