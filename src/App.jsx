import { useEffect, useRef, useState } from "react";
import { IS_MASTER_MODE, IS_STAFF_VIEW, IS_TEACHER_MODE, MASTER_MK, TEACHER_AUTH } from "./core/auth.jsx";
import { STUDENT_SYNC_API_URL, VOCA_TAB_ENABLED } from "./core/config.jsx";
import { goBackRoute, readHistIdx, readInitialRoute } from "./core/route.jsx";
import { useBackNav } from "./state/useBackNav.jsx";
import { StudentLinkRecover } from "./screens/StudentLinkRecover.jsx";
import { StudentCalendarTab } from "./screens/calendar/StudentCalendarTab.jsx";
import { MasterHome } from "./screens/master/MasterHome.jsx";
import { MockExamTab } from "./screens/mock/MockExamTab.jsx";
import { AppSettingsScreen, ExamInfoScreen, NoticesScreen } from "./screens/more/MoreScreens.jsx";
import { BookPassCelebration } from "./screens/progress/BookPassCelebration.jsx";
import { StudentProgressTree } from "./screens/progress/StudentProgressTree.jsx";
import { TeacherHome } from "./screens/teacher/TeacherHome.jsx";
import { TeacherLinkDeadScreen } from "./screens/teacher/TeacherLinkDeadScreen.jsx";
import { VocabWrongTab } from "./screens/vocab/VocabWrongTab.jsx";
import { MAX_W, TAP, UI } from "./theme/tokens.jsx";
import { KakaoOpenBanner } from "./ui/KakaoOpenBanner.jsx";
import { AttQrModal } from "./ui/Qr.jsx";
import { MoreMenu, MoreSubFrame, StudentHeader, StudentTabBar } from "./ui/StudentChrome.jsx";
import { renderHomeTab } from "./screens/home/HomeTab.jsx";
import { renderTasksTab } from "./screens/tasks/TasksTab.jsx";
import { renderVocaTab } from "./screens/voca/VocaTab.jsx";
import { renderVideosTab } from "./screens/videos/VideosTab.jsx";
import { useAppBoot } from "./state/useAppBoot.jsx";
import { useBundleState } from "./state/useBundleState.jsx";
import { useVocaHw } from "./state/useVocaHw.jsx";
import { useVideoState } from "./state/useVideoState.jsx";
import { useAppUpdate } from "./state/useAppUpdate.jsx";
import { usePassQueue } from "./state/usePassQueue.jsx";
import { usePushSync } from "./state/usePushSync.jsx";
import { useBundleLoader } from "./state/useBundleLoader.jsx";
import { useVideoSession } from "./state/useVideoSession.jsx";
import { computeTodoView } from "./state/computeTodoView.jsx";
import { computeVocaView } from "./state/computeVocaView.jsx";
import { computeMoreView } from "./state/computeMoreView.jsx";
import { makeTabNav } from "./state/makeTabNav.jsx";

import { renderLoadingScreen } from "./screens/status/LoadingScreen.jsx";
import { renderWithdrawnScreen } from "./screens/status/WithdrawnScreen.jsx";
import { renderLoadErrorScreen } from "./screens/status/LoadErrorScreen.jsx";

// [133차수] 주소(#해시)에 쓰는 학생 화면 이름 — 위 탭 5개 + 더보기 안 화면 7개. 모르는 이름은 홈으로.
const STUDENT_ROUTE_IDS = ["home", "tasks", "voca", "videos", "more", "cal", "vocabWrong", "mock", "progress", "notices", "examInfo", "settings"];

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get("id");
  // [4차] 출석 QR에 들어가는 열쇠값. 없으면 QR을 만들어도 데스크에서 인식이 안 되므로
  //       아예 버튼을 안 띄우고 안내 문구로 바꾼다.
  const attToken = params.get("t") || "";
  useAppBoot();
  const { bundleVocaHw, setBundleVocaHw, attLog, attStatus, checklistData, customHolidays, displayedBundleRef, error, examRanges, exams, lastLoadedAt, loadErrorCode, loading, loadingSlow, makeups, masterWithdrawn, offlineNotice, progressTree, records, refreshing, setAttLog, setAttStatus, setChecklistData, setCustomHolidays, setError, setExamRanges, setExams, setLastLoadedAt, setLoadErrorCode, setLoading, setMakeups, setMasterWithdrawn, setOfflineNotice, setProgressTree, setRecords, setRefreshing, setStudent, setSurveyResponses, setSurveys, setSyncSource, setTodos, setVideoStatsUnavailable, setVideos, setVocabWrongWords, setWithdrawnName, student, surveyResponses, surveys, syncSource, todos, videoStatsUnavailable, videos, vocabWrongWords, withdrawnName } = useBundleState();
  // [0812 대시보드] 첫 화면 = 홈 카드판. [133차수] 주소(#탭)에 화면이 적혀 있으면 그 화면(새로고침해도 보던 탭 그대로). 단어 탭이 꺼져 있으면 홈으로.
  //   학생 id 가 없는 화면(선생님 홈·마스터 홈·링크 찾기)은 여기 주소를 쓰지 않는다(선생님 홈은 제 주소를 따로 씀 — 134차수).
  const routeOn = !!studentId;
  const [tab, setTabInternal] = useState(() => { if (!routeOn) return "home"; const t = readInitialRoute(STUDENT_ROUTE_IDS, "home"); return (t === "voca" && !VOCA_TAB_ENABLED) ? "home" : t; });
  const tabRef = useRef(tab); tabRef.current = tab;
  const [vocaOpenLast, setVocaOpenLast] = useState(false); // [0812] 홈 단어장 카드로 들어왔는지 — 단어장 탭이 열릴 때 한 번 소비
  // [104차수 09-08] 옛 홈 "강의 고르기" 창(videoPicker·pickerMore — 0813-2에 이미 은퇴해 false && 로 잠들어 있던 것)은 새 홈과 함께 지웠다.
  const [vocaOpenTask, setVocaOpenTask] = useState(null); // 마플보카에 보낼 {book, lecs}("이 책을 이 단원 체크한 채 열어줘"). 보내면 비운다. [125차수] 홈 단어 검색의 [단어장 열기]가 쓴다
  const [vocaExtraBook, setVocaExtraBook] = useState(""); // [125차수] 단어 검색으로 연 책 — 내 책장에 없는 책이어도 이번에 켜 있는 동안 책장에 같이 보인다
  const [vocaHwTask, setVocaHwTask] = useState(null);     // [숙제 5차수 0818] 홈 카드 → 마플보카 숙제 TEST {book, lecs, date, deadline}. 보내면 비운다
  const [showAttQr, setShowAttQr] = useState(false);
  const showAttQrRef = useRef(false); showAttQrRef.current = showAttQr;
  const [selectedDate, setSelectedDate] = useState(null);
  const { vocaHwRec } = useVocaHw({ bundleVocaHw, selectedDate, studentId, tab, todos });
  const { activeSecRef, awayCountRef, awaySecRef, awayStartRef, currentSessionIdRef, lastActiveAtRef, lastSavedAwayCountRef, lastSavedAwaySecRef, lastSavedFocusSecRef, lastSavedPlaySecRef, lastVideoSaveStatus, longestAwayRef, pendingVideoCount, selectedVideoBook, setLastVideoSaveStatus, setPendingVideoCount, setSelectedVideoBook, setVideoWatch, setVideosFeaturedId, setViewStartTime, setViewingVideo, videoSaveChunkSeqRef, videoSaveInFlightRef, videoWatch, videosFeaturedId, viewStartTime, viewingVideo, ytDurationSecRef, ytFocusSecRef, ytPlaySecRef, ytPlayerStateRef } = useVideoState();
  const mockBusyRef = useRef(false); // [101차수] 모의고사 시험·답 입력·제출 중(MockExamTab이 알려준다)
  const mockTimedRef = useRef(false); // [135차수 ac] 시간이 가는 모의고사(50·70분) 시험 화면인지 — 탭을 떠나거나 뒤로가기할 때 한 번 묻는다
  // [08-07] 한 번 차단된 링크인지. true가 되면 30초 자동 새로고침이 서버를 그만 두드린다.
  //         학생이 [다시 확인]을 누를 때(manual)만 다시 물어본다.
  const withdrawnRef = useRef(false);
  // [3차] 영상 시청 중인지 여부를 항상 최신으로 들고 있는 ref.
  // 새로고침 useEffect는 studentId가 바뀔 때만 다시 만들어지기 때문에,
  // 그 안에서 viewingVideo state를 그냥 읽으면 옛날 값이 잡힌다. 그래서 ref로 읽는다.
  const viewingVideoRef = useRef(null);
  // [3차] 대기열 재전송(flush)이 겹쳐 도는 것을 막는 문지기. 겹치면 같은 기록이 두 번 저장된다.
  const flushingRef = useRef(false);
  // [95차수 09-05] 오답 TEST를 하나라도 푼 상태인지(VocabWrongTab이 알려준다) — 위 탭 줄로 나갈 때 확인창을 띄운다
  const vocabTestBusyRef = useRef(false);
  // [97차수 09-05] 마플보카 단어 숙제 TEST가 진행 중인지(마플보카가 maplVocaHwState로 알려준다) — 위 탭 줄로 나갈 때 확인창
  const vocaHwBusyRef = useRef(false);
  const { applyAppUpdate, swUpdate } = useAppUpdate({ mockBusyRef, viewingVideoRef, vocaHwBusyRef, vocabTestBusyRef });
  // [95·97차수] 탭을 떠나기 전 확인 — 같은 탭이면 그냥 통과. 탭 줄과 오답 경고 띠의 [복습하기]가 함께 쓴다.
  const confirmLeaveTab = (nextKey) => {
    if (nextKey === tab) return true;
    if (tab === "vocabWrong" && vocabTestBusyRef.current) return window.confirm("지금 나가면 푼 게 사라져요.\n그래도 나갈까요?");
    if (tab === "voca" && vocaHwBusyRef.current) return window.confirm("단어 숙제 TEST를 풀던 중이에요.\n지금 나가면 처음부터 다시 풀어요. 그래도 나갈까요?");
    if (tab === "mock" && mockTimedRef.current) return window.confirm("모의고사 시험이 진행 중이에요.\n나가도 시간은 계속 갑니다(돌아오면 이어서 풀 수 있어요). 나갈까요?");   // [135차수 ac]
    return true;
  };
  // [103차수] 남색 머리글 요소 — 탭을 바꿀 때 "본문 시작점(탭 줄 바로 아래)"까지만 올려 보내는 기준. 훅이라 early return보다 위에 있어야 한다.
  const headerRef = useRef(null);
  // [133차수] 폰 뒤로가기 = 앱 안 이전 화면. 탭을 옮길 때마다 주소를 한 칸 쌓고(setTab), 뒤로가기(popstate)가 오면 그 칸의 화면으로 간다.
  //   오답 TEST·단어 숙제 TEST 도중이면 confirmLeaveTab 이 묻고, 거절하면 원래 칸으로 되돌린다. 강의·출석 QR 창은 열 때 칸을 하나 더 쌓아 두므로 그 칸 위에서의 뒤로가기는 그것만 닫는다(sameRouteRef).
  const confirmLeaveRef = useRef(null); confirmLeaveRef.current = confirmLeaveTab;
  const applyRouteRef = useRef(null);
  const sameRouteRef = useRef(null);
  const cameFromRef = useRef(null);   // 지금 화면에 "어느 화면에서 왔는지"(‹ 더보기 가 뒤로가기로 돌아갈지 정할 때)
  const { go: pushTabRoute, stay: stayTabRoute } = useBackNav({ enabled: routeOn, ids: STUDENT_ROUTE_IDS, currentRef: tabRef, canLeaveRef: confirmLeaveRef, applyRef: applyRouteRef, sameRef: sameRouteRef });
  const scrollToContentTop = () => {
    try {
      const h = headerRef.current;
      const y = h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom + window.scrollY)) : 0;
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: "auto" });
    } catch (e) {}
  };
  applyRouteRef.current = (target) => { cameFromRef.current = null; setTabInternal(target); scrollToContentTop(); };
  // 뒤로가기·새로고침으로 강의 탭에 오면 goTab 을 안 거치므로 대표 강의가 비어 있다 → 그때의 시작 강의(picker)로 채운다
  const pickerRef = useRef(null);
  useEffect(() => { if (tab === "videos" && videosFeaturedId == null && pickerRef.current && pickerRef.current.main) setVideosFeaturedId(pickerRef.current.main.video.id); }, [tab]);
  const setTab = (k) => { cameFromRef.current = tabRef.current; pushTabRoute(k); setTabInternal(k); };
  const { passQueue, setPassQueue } = usePassQueue({ progressTree, student, todos });
  usePushSync({ student });

  // viewingVideo state가 바뀔 때마다 ref를 최신으로 맞춰준다.
  useEffect(() => { viewingVideoRef.current = viewingVideo; }, [viewingVideo]);
  // [133차수] 강의를 열면 주소를 한 칸 더 쌓아 둔다({ v: 강의 id }). 그러면 폰 뒤로가기 한 번 = 강의 닫기(시청 기록은 toggleVideo 가 평소처럼 저장).
  //   학생이 직접 닫으면(같은 단추 다시 누름) 그 칸을 거둬들여(history.back) 뒤로가기가 두 번 필요하지 않게 한다. 보던 강의를 다른 강의로 바꾸면 칸은 그대로 두고 id만 바꿔 쓴다.
  // [134차수] 출석 QR 창도 같은 식 — 열면 칸 하나({ qr: 1 }), 뒤로가기 = 창 닫기, 직접 닫으면 칸을 거둔다.
  const prevQrRef = useRef(false);
  useEffect(() => {
    const prev = prevQrRef.current; prevQrRef.current = showAttQr;
    if (showAttQr && !prev) pushTabRoute(tabRef.current, { qr: 1 });
    else if (!showAttQr && prev) { try { const st = window.history.state; if (st && st.qr && readHistIdx() > 0) goBackRoute(); } catch (e) {} }
  }, [showAttQr]);
  //   (toggleVideo 는 바꿔 볼 때 "닫기 → 열기"를 연달아 하므로, 닫힘 쪽 거둬들이기는 잠깐(120ms) 기다렸다가 그 사이 새 강의가 안 열렸을 때만 한다.)
  const prevVideoRef = useRef(null);
  const videoCloseTimerRef = useRef(null);
  useEffect(() => {
    const prev = prevVideoRef.current; prevVideoRef.current = viewingVideo;
    if (videoCloseTimerRef.current) { clearTimeout(videoCloseTimerRef.current); videoCloseTimerRef.current = null; }
    if (viewingVideo) {
      const vid = String(viewingVideo.id);
      let st = null; try { st = window.history.state; } catch (e) {}
      if (st && st.v) { if (st.v !== vid) stayTabRoute(tabRef.current, { v: vid }); }   // 아직 강의 칸 위(바꿔 보기) → id 만 바꿔 쓴다
      else pushTabRoute(tabRef.current, { v: vid });
    } else if (prev) {
      videoCloseTimerRef.current = setTimeout(() => {
        videoCloseTimerRef.current = null;
        if (viewingVideoRef.current) return;
        try { const st = window.history.state; if (st && st.v === String(prev.id) && readHistIdx() > 0) goBackRoute(); } catch (e) {}
      }, 120);
    }
  }, [viewingVideo]);
  const loadDataRef = useRef(null);
  const { loadData } = useBundleLoader({ setBundleVocaHw, displayedBundleRef, setAttLog, setAttStatus, setChecklistData, setCustomHolidays, setError, setExamRanges, setExams, setLastLoadedAt, setLoadErrorCode, setLoading, setMakeups, setMasterWithdrawn, setOfflineNotice, setProgressTree, setRecords, setRefreshing, setStudent, setSurveyResponses, setSurveys, setSyncSource, setTodos, setVideoStatsUnavailable, setVideoWatch, setVideos, setVocabWrongWords, setWithdrawnName, studentId, viewingVideoRef, withdrawnRef });
  loadDataRef.current = loadData;
  const { toggleVideo } = useVideoSession({ activeSecRef, awayCountRef, awaySecRef, awayStartRef, currentSessionIdRef, flushingRef, lastActiveAtRef, lastSavedAwayCountRef, lastSavedAwaySecRef, lastSavedFocusSecRef, lastSavedPlaySecRef, longestAwayRef, setLastVideoSaveStatus, setPendingVideoCount, setVideoWatch, setViewStartTime, setViewingVideo, studentId, videoSaveChunkSeqRef, videoSaveInFlightRef, viewStartTime, viewingVideo, withdrawnRef, ytDurationSecRef, ytFocusSecRef, ytPlaySecRef, ytPlayerStateRef , onVocabResultsSent: () => loadDataRef.current && loadDataRef.current({ manual: true }) });   // [135차수 j] manual 이어야 자동 받기가 도는 중에도 뒤이어 한 번 더 받는다

  // [133차수] 같은 화면 칸으로 뒤로 왔는데 강의(또는 출석 QR 창)가 열려 있으면 그것만 닫는다(기록 저장은 toggleVideo 가 함).
  sameRouteRef.current = (st) => {
    if (!(st && st.qr) && showAttQrRef.current) setShowAttQr(false);
    if (!(st && st.v) && viewingVideoRef.current) toggleVideo(viewingVideoRef.current);
  };
  // [133차수] "‹ 더보기" — 더보기 목록에서 들어온 화면이면 폰 뒤로가기와 똑같이(기록 한 칸 뒤로), 홈 바로가기로 바로 들어온 화면이면 더보기 목록을 새로 연다.
  const backToMore = () => { if (cameFromRef.current === "more" && readHistIdx() > 0) goBackRoute(); else goTabRef.current("more"); };
  const goTabRef = useRef(null);

  // [마스터] 열쇠는 있고 학생 id는 없음 → 원장 전용 홈. 학생 데이터 로딩은 이미 건너뛴 상태.
  if (IS_MASTER_MODE && !studentId) {
    return <MasterHome mk={MASTER_MK} />;
  }

  // [교사] 죽은 링크 안내 (teacherLinkDead가 이 주소로 보낸다)
  if (params.has("teacher_dead")) {
    return <TeacherLinkDeadScreen />;
  }
  // [교사] 선생님 열쇠는 있고 학생 id는 없음 → 선생님 홈.
  if (IS_TEACHER_MODE && !studentId) {
    return <TeacherHome auth={TEACHER_AUTH} />;
  }

  if (loading) {
    return (
      renderLoadingScreen({ loadingSlow })
    );
  }

  if (!studentId) {
    return <StudentLinkRecover apiBase={STUDENT_SYNC_API_URL} />;
  }

  // [08-07] 그만둔(삭제·정지) 학생 — 잘못된 링크가 아니라 "지금은 멈춰 있다"고 알리고 재등록을 안내한다.
  if (error === "withdrawn") {
    return (
      renderWithdrawnScreen({ loadData, refreshing, withdrawnName })
    );
  }

  if (error === "load_error") {
    return (
      renderLoadErrorScreen({ loadErrorCode })
    );
  }

  if (!student) return null;
  const { activeDate, allDates, doneTasks, getFailReason, isCheckedView, isFailed, pct, pinnedMessages, stepGroups, todayStrForTab, todoRevealHeld, totalTasks } = computeTodoView({ checklistData, records, selectedDate, studentId, todos, vocaHwRec });
  const { hasVocabWrong, startVocaHwTest, studentVideos, taskVoca, vocaPassLabel, vocabWarn } = computeVocaView({ activeDate, customHolidays, makeups, progressTree, setVocaHwTask, stepGroups, student, studentId, videos, vocabWrongWords });
  const { activeSurveys, attNoticeAll, attWeek, calSub, examDdays, moreGroups, nearestExam, unansweredSurveys, wrongCount } = computeMoreView({attStatus, customHolidays, exams, hasVocabWrong, makeups, pinnedMessages, progressTree, student, surveyResponses, surveys, todayStrForTab, vocabWarn, vocabWrongWords });
  const { allTaskItems, goTab, picker, scrollToVideoCard, topTabOf, watchBySid } = makeTabNav({ confirmLeaveTab, headerRef, setSelectedVideoBook, setTab, setVideosFeaturedId, setVocaExtraBook, setVocaOpenLast, setVocaOpenTask, startVocaHwTest, stepGroups, studentId, studentVideos, tab, taskVoca, toggleVideo, videoWatch, viewingVideo, vocaHwBusyRef, vocaHwRec });
  goTabRef.current = goTab; pickerRef.current = picker;
  // 위 탭 5개 — 순서·자리 고정(강의가 없는 학생도 강의 탭은 있고 안에서 "등록된 강의가 없어요"). 단어 탭은 VOCA_TAB_ENABLED를 따른다.
  // [0825 8차수] 단어 숙제가 남아 있는 동안 "단어" 탭은 빨간 칸 — 누르면 바로 숙제 TEST. [94차수] 선생님 화면은 빨간 칸 없음
  const topTabs = [
    { key: "home", label: "홈" },
    { key: "tasks", label: "숙제" },
    ...(VOCA_TAB_ENABLED ? [{ key: "voca", label: "단어", alert: !!(taskVoca && !vocaHwRec && !IS_STAFF_VIEW) }] : []),
    { key: "videos", label: "강의" },
    { key: "more", label: "더보기" },
  ];

  const F = "'Pretendard Variable', -apple-system, sans-serif";

  // [119차수] 탭별 그리기 함수(screens/…)에 넘겨줄 값 묶음. 그리기 함수는 여기서 필요한 것만 꺼내 쓴다.
  const C = { activeDate, activeSurveys, allDates, allTaskItems, attNoticeAll, attWeek, calSub, doneTasks, examDdays, examRanges, getFailReason, goTab, hasVocabWrong, isCheckedView, isFailed, lastVideoSaveStatus, nearestExam, pct, pendingVideoCount, picker, pinnedMessages, progressTree, scrollToVideoCard, selectedVideoBook, setSelectedDate, setSelectedVideoBook, setVocaHwTask, setVocaOpenLast, setVocaOpenTask, stepGroups, student, studentId, studentVideos, taskVoca, todayStrForTab, todoRevealHeld, toggleVideo, totalTasks, unansweredSurveys, videos, videosFeaturedId, viewingVideo, vocaExtraBook, vocaHwBusyRef, vocaHwRec, vocaHwTask, vocaOpenLast, vocaOpenTask, vocaPassLabel, vocabWarn, watchBySid, wrongCount };
  return (
    <div style={{ minHeight: "100vh", background: UI.bg, fontFamily: F, color: UI.text }}>
      {/* [103차수] 카카오톡 안에서 열었을 때만 "브라우저로 열기" 띠. 홈 화면 추가·알림 안내는 더보기 → 앱 설정으로 이사(원장 결정 09-08) */}
      <KakaoOpenBanner />
      {/* [마스터] 지금 남의 화면을 보고 있다는 표시 + 홈 복귀. 학생에게는 절대 안 뜬다(열쇠 없음). */}
      {IS_MASTER_MODE && (
        <div style={{ background: "#16213e", borderBottom: "1px solid #c9a227", padding: "9px 24px" }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f0c419", flexShrink: 0 }}>👑 마스터</span>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {student.name}</span>
            <button onClick={() => { window.location.href = window.location.pathname + "?master=1"; }}
              style={{ minHeight: TAP, marginLeft: "auto", flexShrink: 0, padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(240,196,25,0.5)", background: "rgba(240,196,25,0.14)", color: "#f0c419", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>마스터 홈</button>
          </div>
        </div>
      )}
      {/* [교사] 선생님이 학생 화면을 열어본 상태 — 보기 전용이고, 여기서 한 것은 학생 기록에 남지 않는다. */}
      {IS_TEACHER_MODE && (
        <div style={{ background: "#182848", borderBottom: "1px solid #1C66A5", padding: "9px 24px" }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#7fc4ff", flexShrink: 0 }}>보기 전용</span>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {student.name}</span>
            <button onClick={() => { const sp = new URLSearchParams(); sp.set("tid", TEACHER_AUTH.tid); sp.set("tk", TEACHER_AUTH.tk); window.location.href = window.location.pathname + "?" + sp.toString(); }}
              style={{ minHeight: TAP, marginLeft: "auto", flexShrink: 0, padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(127,196,255,0.5)", background: "rgba(127,196,255,0.14)", color: "#7fc4ff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>선생님 홈</button>
          </div>
        </div>
      )}
      {/* [08-07] 원장은 그만둔 학생 화면도 볼 수 있게 통과시키되, 지금 보는 게 그만둔 학생임을 알린다. */}
      {masterWithdrawn && (
        <div style={{ background: "#fff5f5", borderBottom: "1px solid #f7c9cd", padding: "9px 24px" }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", fontSize: 12.5, fontWeight: 700, color: "#b03a2e" }}>
            ⏸ 그만둔 학생입니다 — 학생 본인에게는 이 화면이 열리지 않습니다
          </div>
        </div>
      )}
      {/* [103차수] 작은 머리글 — 아바타·시험 D-Day·시험 범위·고정 공지는 더보기(시험 정보 / 공지·설문)로 이사(계획서 4절) */}
      <StudentHeader innerRef={headerRef} student={student} attToken={attToken} onQr={() => setShowAttQr(true)}
        refreshing={refreshing} onRefresh={() => loadData({ manual: true })} lastLoadedAt={lastLoadedAt} syncSource={syncSource} />

      {showAttQr && student && attToken && (
        <AttQrModal
          value={`maple-att:${student.id}:${attToken}`}
          studentName={student.name}
          onClose={() => setShowAttQr(false)}
        />
      )}

      {videoStatsUnavailable && <div role="status" style={{ padding: "10px 24px", background: "#eef6ff", color: "#24567d", fontSize: 12 }}>
        시청 기록을 확인하지 못했어요. 표시된 시청 시간은 최신이 아닐 수 있어요. 숙제와 강의는 계속 이용할 수 있어요.
      </div>}
      {offlineNotice && (
        <div style={{ padding: "10px 24px", background: "#fff7e6", borderBottom: "1px solid #ffe0a3", color: "#8a5a00", fontSize: 12, fontWeight: 700 }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1 }}>⚠️ {offlineNotice}</span>
            {/* [98차수] 옛 화면 띠에서 바로 다시 받기 — 위쪽 ↻ 단추를 못 찾는 학생용 */}
            <button type="button" onClick={() => loadData({ manual: true })} disabled={refreshing}
              style={{ minHeight: TAP, flexShrink: 0, border: "none", background: "#b3641b", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: refreshing ? 0.6 : 1 }}>
              {refreshing ? "받는 중…" : "다시 받기"}
            </button>
          </div>
        </div>
      )}
      {/* [98차수→101차수] 앱 새 판 안내 — 학생이 [업데이트]를 눌러야 바뀐다. 시험·영상 중이면 안내만 하고 안 바꾼다. 자동 새로고침 없음 */}
      {!!swUpdate.state && (
        <div style={{ padding: "10px 24px", background: swUpdate.state === "failed" ? "#fff4e5" : "#e8f4ff", borderBottom: "1px solid " + (swUpdate.state === "failed" ? "#f5d3a6" : "#b9dcff"), color: swUpdate.state === "failed" ? "#8a4b00" : "#1c4f8a", fontSize: 12, fontWeight: 700 }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1 }}>
              {swUpdate.msg
                ? swUpdate.msg
                : swUpdate.state === "found" ? "🆕 새 버전이 있어요. 하던 일을 마친 뒤 업데이트해 주세요."
                : swUpdate.state === "applying" ? "업데이트 준비 중…"
                : swUpdate.state === "swapped" ? "🆕 새 버전으로 바뀌었어요. 하던 일을 마친 뒤 [업데이트]를 누르면 최신 화면이 됩니다."
                : "업데이트를 적용하지 못했어요. 하던 일을 마친 뒤 앱과 같은 사이트의 다른 창을 모두 닫고 다시 열어 주세요."}
            </span>
            {swUpdate.state !== "failed" && (
              <button type="button" onClick={applyAppUpdate} disabled={swUpdate.state === "applying"}
                style={{ minHeight: TAP, flexShrink: 0, border: "none", background: "#1c4f8a", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: swUpdate.state === "applying" ? "default" : "pointer", opacity: swUpdate.state === "applying" ? 0.6 : 1 }}>
                {swUpdate.state === "applying" ? "준비 중…" : "업데이트"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* [103차수] 주간 오답 복습 경고 띠(모든 탭 위)는 없앴다 — 같은 경고가 홈 오답 줄과 더보기 → 오답 복습에 한 번만 나온다(계획서 6절) */}

      {/* [PASS] 교재 완주 축하 오버레이 — 새 완주가 있을 때만 */}
      {passQueue.length > 0 && <BookPassCelebration books={passQueue} onClose={() => setPassQueue([])} />}

      {/* [103차수] 진행 중 설문 카드는 탭 줄 위에서 더보기 → 공지·설문으로 이사. 홈에는 요약 줄(응답할 설문 n개)만 둔다 */}
      {/* [103차수] 위 탭 5개 — 홈·숙제·단어·강의·더보기. 더보기 하위 화면에서는 "더보기"가 켜져 보인다(topTabOf). 이동은 goTab 하나로 */}
      <StudentTabBar tabs={topTabs} activeKey={topTabOf(tab)} onPick={(k) => goTab(k)} />

      <div style={{ padding: "16px 16px 100px" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {/* ═══ [104차수 09-08 디자인 개편] 홈 — 시안 images/01-home.png, 계획서 6절 ═══
            순서: 등원+D-Day 칸(109차수: 아래에 7일 줄) → "오늘 할 일" 제목+날짜 → 오늘 숙제 카드(1단계 항목 전부) → 이어서 할 공부(단어/강의/오답) → 공지·시험 정보·수업 일정·학습 진도 바로가기.
            데이터는 전부 이미 계산된 것 재사용(stepGroups·taskVoca·vocaHwRec·buildVideoPickerV2·vocabWarn·pinnedMessages·examDdays). 서버 추가 요청 없음.
            학생이 눌러서 완료하는 체크박스는 없다 — 상태(확인 전/확인 완료/재시)만 보여준다. 모든 이동은 goTab. */}
        {tab === "home" && renderHomeTab(C)}
        {/* ═══ [105차수 09-08 디자인 개편] 숙제 탭 — 시안 images/02-homework.png, 계획서 7절 ═══
            순서: 날짜 알약(공개된 날짜만) → 제목+날짜 → 선생님 확인 현황(원본 진행률 그대로) → 5단계 카드(항목 있으면 펼침, 없으면 "오늘 없음" 한 줄) → 밤 10시 안내.
            단계 순서·이름·조교/강사 배지·항목 키·원문·상태 판정(isCheckedView·isFailed·getFailReason)은 전부 원본. 학생 수동 완료 없음. */}
        {tab === "tasks" && renderTasksTab(C)}
        {/* [103차수] 더보기 — 목록 + 하위 화면(기존 화면을 MoreSubFrame 안에 그대로 넣는다). "‹ 더보기"도 goTab이라 나가기 확인창이 똑같이 걸린다 */}
        {tab === "more" && <MoreMenu groups={moreGroups} onPick={(k) => goTab(k)} />}
        {tab === "notices" && (
          <MoreSubFrame title="공지·설문" onBack={backToMore}>
            <NoticesScreen pinnedMessages={pinnedMessages} surveys={activeSurveys} surveyResponses={surveyResponses} student={student}
              onSurveySubmitted={(svId, resp) => setSurveyResponses((prev) => ({ ...prev, [svId]: resp }))} />
          </MoreSubFrame>
        )}
        {tab === "examInfo" && (
          <MoreSubFrame title="시험 정보" onBack={backToMore}>
            <ExamInfoScreen student={student} items={examDdays} examRanges={examRanges} />
          </MoreSubFrame>
        )}
        {tab === "settings" && (
          <MoreSubFrame title="앱 설정" onBack={backToMore}>
            <AppSettingsScreen student={student} swUpdate={swUpdate} onApplyUpdate={applyAppUpdate} />
          </MoreSubFrame>
        )}
        {tab === "cal" && (
          <MoreSubFrame title="수업 일정" onBack={backToMore}>
            <StudentCalendarTab student={student} makeups={makeups} customHolidays={customHolidays} exams={exams} attLog={attLog} attStatus={attStatus} />
          </MoreSubFrame>
        )}

        {tab === "mock" && (
          <MoreSubFrame title="모의고사" onBack={backToMore}>
            <MockExamTab studentId={studentId} onBusy={(b, timed) => { mockBusyRef.current = !!b; mockTimedRef.current = !!timed; }} />
          </MoreSubFrame>
        )}

        {VOCA_TAB_ENABLED && tab === "voca" && renderVocaTab(C)}

        {tab === "videos" && studentVideos.length === 0 && (
          /* [103차수] 강의 탭은 자리를 고정한다(학생마다 메뉴가 흔들리지 않게). 강의가 없으면 안에서만 빈 안내 */
          <div style={{ textAlign: "center", padding: "60px 20px", color: UI.dim }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: UI.sub }}>등록된 강의가 없어요</div>
            <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>선생님이 강의를 등록하면 여기에 보여요</div>
          </div>
        )}
        {/* ═══ [106차수 09-08 디자인 개편] 강의 탭 — 시안 images/04-lectures.png, 계획서 9절 ═══
            위: 대표 강의 카드(오늘 숙제 강의 → 없으면 최근 본 강의). "오늘 숙제" 배지는 실제 매칭일 때만.
            아래: 교재별 강의(교재 알약 + 목록, 교재가 2개 이상일 때만 알약·"전체"). 재생목록은 실제 있을 때만 목록에 있다.
            플레이어는 한 번에 하나만 — 지금 보는 영상이 대표 강의면 위 카드 안에, 아니면 그 목록 줄 안에 그린다(같은 영상을 두 곳에 안 만든다).
            재생·시청 기록은 원본 toggleVideo·TrackedYoutubePlayer 그대로: 카드/줄을 열어도 기록되지 않고, 플레이어의 ▶를 눌러야 기록된다. */}
        {tab === "videos" && studentVideos.length > 0 && renderVideosTab(C)}
        {tab === "vocabWrong" && (
          <MoreSubFrame title="오답 복습" onBack={backToMore}>
            <VocabWrongTab vocabWrongWords={vocabWrongWords} studentId={studentId}
              onProgress={(busy) => { vocabTestBusyRef.current = !!busy; }} />
          </MoreSubFrame>
        )}
        {tab === "progress" && (
          <MoreSubFrame title="학습 진도" onBack={backToMore}>
            <StudentProgressTree student={student} todos={todos} progressTree={progressTree} />
          </MoreSubFrame>
        )}
        </div>
      </div>
    </div>
  );
}
