import { useEffect, useMemo, useRef, useState } from "react";
import { computeTeacherDayRoster } from "../../domain/teacher.jsx";
import { fmtDateKR, getTodayStr } from "../../domain/time.jsx";
import { useOwnerToeic } from "../toeic/useOwnerToeic.jsx";
import { MAX_W, TAP } from "../../theme/tokens.jsx";
import { useTeacherVideoWatch } from "./useTeacherVideoWatch.jsx";
import { useTeacherData } from "./useTeacherData.jsx";
import { useTeacherActions } from "./useTeacherActions.jsx";
import { renderTeacherBrief } from "./TeacherBrief.jsx";
import { renderTeacherHomeTab } from "./TeacherHomeTab.jsx";
import { renderTeacherCalTab } from "./TeacherCalTab.jsx";
import { renderTeacherStudentsTab } from "./TeacherStudentsTab.jsx";
import { renderTeacherVideosTab } from "./TeacherVideosTab.jsx";
import { renderStaffScheduleModal } from "./StaffScheduleModal.jsx";
import { renderTeacherVocaTab } from "./TeacherVocaTab.jsx";
import { renderTeacherToeicTab } from "./TeacherToeicTab.jsx";
import { NsUpload } from "./NsUpload.jsx";
import { readInitialRoute, replaceRoute } from "../../core/route.jsx";
import { useScreenRoute } from "../../state/useBackNav.jsx";

// [134차수] 선생님 홈 주소(#해시) 이름 — 탭 6개 + 홈 안 화면(오늘 수업 요약 brief · 내신 단어 올리기 ns) + 강의 탭의 책(book) + 근무 고치기 창(sched)
const TEACHER_ROUTE_IDS = ["home", "brief", "ns", "cal", "sched", "voca", "videos", "book", "students", "toeic"];
const TEACHER_ROUTE_PARENT = { brief: "home", ns: "home", book: "videos", sched: "cal" };
const teacherBaseTab = (id) => (id === "brief" || id === "ns") ? "home" : id === "book" ? "videos" : id === "sched" ? "cal" : id;

export function TeacherHome({ auth }) {
  // [134차수] 처음 열 때 주소에 화면이 있으면 그 화면(새로고침해도 보던 탭 그대로). 세부(어느 책·어느 날)는 브라우저가 기억해 둔 칸 값에서 살린다.
  const [initialRoute] = useState(() => { let st = {}; try { st = window.history.state || {}; } catch (e) {} return { id: readInitialRoute(TEACHER_ROUTE_IDS, "home"), st }; });
  const [tab, setTab] = useState(() => teacherBaseTab(initialRoute.id));
  const [home, setHome] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dateStr, setDateStr] = useState(getTodayStr());
  const [openBook, setOpenBook] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [busyItem, setBusyItem] = useState("");
  const [vocaTask, setVocaTask] = useState(null);   // 숙제단어 → 마플보카로 보낼 {book, lecs} (그냥 펼쳐 보기)
  // [요약 16차수 원장 확정 C안] 홈의 "3. 오늘 수업"을 누르면 학생 명단이 아니라 요약 화면이 뜬다.
  //   값이 날짜 문자열이면 그 날 요약을 보고 있는 것, ""이면 홈 대시보드.
  const [briefDay, setBriefDay] = useState(() => initialRoute.id === "brief" ? (initialRoute.st.d || getTodayStr()) : "");
  // [127차수] 홈의 "5. 내신 단어 올리기"를 누르면 올리기 화면이 홈 자리에 뜬다(‹ 홈 또는 위 탭으로 돌아감)
  const [nsOpen, setNsOpen] = useState(() => initialRoute.id === "ns");
  const [nsRefresh, setNsRefresh] = useState(0);   // [135차수 s] 머리글 ↻를 누른 횟수 — 내신 단어 올리기 화면의 "최근 올린 것"도 같이 새로 받게
  // [14차수 원장 지시] 학생 "앱 단어"와 같은 숙제 TEST — 범위에서 10개가 자동으로 뽑혀 객관식으로 나온다.
  //   원장 선별본이 있으면 그 단어가, 없으면 그 유닛에서 10개가 나간다(학생과 완전히 같은 규칙).
  const [vocaHwTask, setVocaHwTask] = useState(null);
  // [근무표 수정 15차수 · 원장 전용] 캘린더에서 날짜를 길게 누르면 열리는 근무 고치기 창
  const [schedEdit, setSchedEdit] = useState(() => (initialRoute.id === "sched" && initialRoute.st.sd) ? { date: initialRoute.st.sd, openId: "" } : null);   // { date, openId } — [134차수] 새로고침으로 #sched 면 그 날 창 그대로
  const [schedBusy, setSchedBusy] = useState(false);
  const [schedMsg, setSchedMsg] = useState(null);
  // [10차수] 캘린더 탭 — 보고 있는 달과 고른 날
  const [calYm, setCalYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [calSel, setCalSel] = useState(getTodayStr());
  // [11차수] 단어장 탭 안 전환 — "내 단어장"(외우기) / "단어 선별"(숙제로 낼 어려운 단어 고르기)
  const [vocaMode, setVocaMode] = useState("study");
  // [115차수 토익] 원장 전용 토익 — 기록 훅은 늘 부르고(훅 순서 고정), 받아오는 건 원장일 때만
  const [toeicPick, setToeicPick] = useState("");
  const [toeicMode, setToeicMode] = useState("tests");   // [116차수] "tests" 회차 · "p5" 파트5 5문제
  const [isOwnerView, setIsOwnerView] = useState(false);
  const toeic = useOwnerToeic(isOwnerView);

  // [교사] 강의 열람 기록 — 교사 전용 칸(teacher_vwatch3)에만 쌓인다. 학생 시청 통계와는 키부터 다르다.
  //   ※ 지금 재는 것은 "카드를 열어둔 시간"이다(유튜브 재생 상태를 읽지 않음).
  //     학생 화면 쪽 재생 측정기와 값의 뜻이 다르므로, 다음 차수에서 화면에 보일 때 그렇게 적어야 한다.
  const schedPressRef = useRef(null);   // [15차수] 캘린더 길게 누르기 타이머
  const { openVideo } = useTeacherVideoWatch({ setPlaying });
  const { loadAll, refreshing, reloadHome } = useTeacherData({ setDateStr, setErr, setHome, setLoading, setRoster });

  const F = "'Pretendard Variable', -apple-system, sans-serif";
  useEffect(() => { setIsOwnerView(!!(home && home.isOwner)); }, [home]);
  const teacher = home?.teacher || {};
  const today = home?.today || getTodayStr();
  const session = home?.stafftodo?.sessions?.[today] || null;
  const areas = Array.isArray(home?.areas) ? home.areas : [];
  const roll = useMemo(
    () => computeTeacherDayRoster(roster?.students || [], roster?.makeups || [], dateStr),
    [roster, dateStr]
  );
  const isWorkday = !!(home && home.stafftodo && home.stafftodo.sessions && home.stafftodo.sessions[today]);
  const { openStudent, saveStaffSchedule, startTeacherHwTest, toggleTodo, vocaPickSrc, vocaSrc } = useTeacherActions({ auth, busyItem, home, reloadHome, schedBusy, session, setBusyItem, setErr, setHome, setSchedBusy, setSchedMsg, setVocaHwTask, teacher, today });

  const card = { width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", marginBottom: 8, borderRadius: 12, border: "1px solid #eceef4", background: "#fff", cursor: "pointer", fontFamily: "inherit" };
  const busyBox = <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</div>;
  // [10차수] 홈 카드 — 학생앱 홈과 같은 모양·같은 글자 크기로 맞춘다.
  const cardBox = { background: "#fff", border: "1px solid #e8eaef", borderRadius: 14, padding: "13px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", display: "block", width: "100%" };
  const cardMain = { fontSize: 14.5, fontWeight: 800, color: "#1a1a2e", marginTop: 6, lineHeight: 1.35 };
  const cardSub = { fontSize: 11.5, color: "#9aa0ab", marginTop: 4, fontWeight: 600 };

  const todoRow = (sectionKey, item) => (
    <button key={item.id} onClick={() => toggleTodo(sectionKey, item)} disabled={!!busyItem}
      style={{ minHeight: TAP, width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 13px", marginBottom: 7, borderRadius: 11,
        border: `1px solid ${item.done ? "#cfe9df" : "#eceef4"}`, background: item.done ? "#f2fbf7" : "#fff",
        cursor: busyItem ? "wait" : "pointer", fontFamily: "inherit", opacity: busyItem === item.id ? 0.55 : 1 }}>
      <span style={{ flexShrink: 0, width: 21, height: 21, borderRadius: 6, marginTop: 1, border: `1.5px solid ${item.done ? "#00b894" : "#cfd4de"}`, background: item.done ? "#00b894" : "#fff", color: "#fff", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.done ? "✓" : ""}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.5, color: item.done ? "#8b9aa5" : "#2A2A28", textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
    </button>
  );

  // [122차수] 탭별 그리기 함수(screens/…)에 넘겨줄 값 묶음. 그리기 함수는 여기서 필요한 것만 꺼내 쓴다.
  // [134차수] 폰 뒤로가기·#주소 — 지금 화면 이름은 상태에서 계산한다. 뒤로가기가 오면 상태를 그 화면에 맞춘다.
  const screenId = tab === "home" ? (nsOpen ? "ns" : briefDay ? "brief" : "home") : (tab === "videos" && openBook) ? "book" : (tab === "cal" && schedEdit) ? "sched" : tab;
  const routeExtra = screenId === "brief" ? { d: briefDay } : screenId === "book" ? { b: String(openBook.bookId) } : screenId === "sched" ? { sd: schedEdit.date } : {};
  // 새로고침으로 #book 에 열렸을 때: 교재 목록이 온 뒤에 그 책을 다시 편다(없어진 책이면 주소를 강의 탭으로 고쳐 쓴다).
  const bookRestoredRef = useRef(false);
  useEffect(() => {
    if (initialRoute.id !== "book" || bookRestoredRef.current || !areas.length) return;
    bookRestoredRef.current = true;
    const b = areas.flatMap((a) => a.books || []).find((x) => String(x.bookId) === String(initialRoute.st.b));
    if (b && tab === "videos" && !openBook) setOpenBook(b); else if (((window.history.state || {}).pg) === "book") replaceRoute("videos");
  }, [areas]);
  // 토익 탭은 원장만 — 조교가 #toeic 주소로 들어오면 홈으로(주소를 먼저 고쳐 써야 한 칸이 더 안 쌓인다)
  useEffect(() => { if (home && !home.isOwner && tab === "toeic") { replaceRoute("home"); setTab("home"); } }, [home]);
  useScreenRoute({
    ids: TEACHER_ROUTE_IDS, parent: TEACHER_ROUTE_PARENT, screenId, extra: routeExtra,
    apply: (target, st) => {
      setTab(teacherBaseTab(target));
      setNsOpen(target === "ns");
      setBriefDay(target === "brief" ? (st.d || getTodayStr()) : "");
      if (target === "book") { const b = areas.flatMap((a) => a.books || []).find((x) => String(x.bookId) === String(st.b)); setOpenBook(b || null); if (!b) openVideo(null); }
      else { setOpenBook(null); openVideo(null); }
      setSchedEdit(target === "sched" && st.sd ? { date: st.sd, openId: "" } : null);
    },
  });
  const C = { areas, briefDay, busyBox, calSel, calYm, card, cardBox, cardMain, cardSub, dateStr, home, isWorkday, loading, openBook, openStudent, openVideo, playing, reloadHome, roll, roster, saveStaffSchedule, schedBusy, schedEdit, schedMsg, schedPressRef, session, setBriefDay, setCalSel, setCalYm, setDateStr, setOpenBook, setSchedEdit, setTab, setToeicMode, setToeicPick, setVocaHwTask, setVocaMode, setVocaTask, startTeacherHwTest, teacher, today, todoRow, toeic, toeicMode, toeicPick, vocaHwTask, vocaMode, vocaPickSrc, vocaSrc, vocaTask, setNsOpen };
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", fontFamily: F }}>
      <div style={{ background: "linear-gradient(135deg, #182848 0%, #1C66A5 100%)", padding: "18px 24px 20px", color: "#fff" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{home?.isOwner ? "원장" : (teacher.name ? `${teacher.name} 선생님` : "선생님")}</span>
            {teacher.role && <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.18)" }}>{teacher.role}</span>}
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{home?.isOwner ? "원장 전용" : "선생님 전용"}</span>
            {/* [96차수 09-05] 다시 받아오기 단추 — 학생 화면의 ↻와 같은 모양 */}
            <button onClick={() => { loadAll({ manual: true }); setNsRefresh((k) => k + 1); }} disabled={refreshing} title="다시 받아오기" aria-label="다시 받아오기"
              style={{ flexShrink: 0, width: TAP, height: TAP, borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)", background: refreshing ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", opacity: refreshing ? 0.65 : 1 }}>
              {refreshing ? "…" : "↻"}
            </button>
          </div>
          {/* [12차수 원장 지시] 사람 수는 화면에 띄우지 않는다 */}
          {/* [16차수 원장 지시] 개수도 안 띄운다 — "강의 204개" 같은 숫자를 선생님 화면에서 전부 뺐다 */}
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
            {fmtDateKR(today)}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        <style>{`.mplTabScroll::-webkit-scrollbar{display:none}`}</style>
        <div className="mplTabScroll" style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {[
            { key: "home", label: "홈" },
            { key: "cal", label: "캘린더" },
            { key: "voca", label: "단어장" },
            { key: "videos", label: "강의" },
            { key: "students", label: "학생" },
            ...(home?.isOwner ? [{ key: "toeic", label: "토익" }] : []),   // [115차수] 원장만
          ].map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setBriefDay(""); setNsOpen(false); }} style={{minHeight: TAP, 
              flex: "1 0 auto", whiteSpace: "nowrap", padding: "14px 12px", border: "none", cursor: "pointer", background: "transparent",
              fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "#182848" : "#9aa0ab",
              borderBottom: tab === t.key ? "2.5px solid #182848" : "2.5px solid transparent",
              fontFamily: "inherit",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: 16 }}>
        {err && <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 12, fontWeight: 700 }}>⚠️ {err}</div>}

        {/* ── 홈 (대시보드) ── */}
        {/* ── [오늘 수업 요약 16차수 · 원장 확정 C안] 홈의 3번 카드에서 들어온다 ──
            위: 오늘 챙길 것(오늘 메모 → 📌 고정 → 시험 → 보강) · 아래: 오는 순서(같은 시간끼리)
            사람 수(명)는 원장 지시대로 어디에도 안 띄운다. 이름을 누르면 그 학생 화면이 새 창으로 열린다. */}
        {tab === "home" && !loading && briefDay && !nsOpen && renderTeacherBrief(C)}

        {tab === "home" && !briefDay && !nsOpen && (loading ? busyBox : renderTeacherHomeTab(C))}

        {/* ── [127차수] 내신 단어 올리기 — 홈의 5번 칸에서 들어온다 ── */}
        {tab === "home" && nsOpen && <NsUpload onBack={() => setNsOpen(false)} refreshKey={nsRefresh} />}

        {/* ── 캘린더 (내 근무 달력) ── */}
        {tab === "cal" && (loading ? busyBox : renderTeacherCalTab(C))}

        {/* ── 그날 수업하는 학생 ── */}
        {tab === "students" && (loading ? busyBox : (
          renderTeacherStudentsTab(C)
        ))}

        {/* ── 강의 (커리큘럼 전체) ── */}
        {tab === "videos" && (renderTeacherVideosTab(C))}

        {/* ── [근무표 수정 14차수 · 원장 전용] 캘린더에서 고른 날의 근무를 고친다 ──
            원장만 열 수 있다. 선생님 화면에서는 길게 눌러도 아무 일이 없다(원장 지시).
            날짜를 길게 누르거나(폰) 우클릭하면(PC) 이 창이 뜬다. */}
        {schedEdit && (
          renderStaffScheduleModal(C)
        )}

        {/* ── 단어장 (본인 진도) + 단어 선별 ── */}
        {tab === "voca" && (
          renderTeacherVocaTab(C)
        )}

        {/* ── [115차수] 토익 (원장 전용) ── */}
        {tab === "toeic" && home?.isOwner && (
          renderTeacherToeicTab(C)
        )}
      </div>
    </div>
  );
}
