import { useEffect, useRef } from "react";
import { IS_STAFF_VIEW, IS_TEACHER_MODE } from "../core/auth.jsx";
import { FRESH_GRACE_MS, WITHDRAWN_STRIKE_LIMIT, addWithdrawnStrike, bundlePollDelayMs, clearWithdrawnStrikes, getStudentBundleStorageKey, isPlainObject, loadStudentBundle, makeLoadErrorCode, normalizeExamRanges, restoreStudentBundleFromLocal, saveStudentBundleToLocal } from "../core/bundle.jsx";
import { mergeVideoWatchSnapshots } from "../core/videoWatch.jsx";
import { applyServerAppSettings } from "../data/holidays.jsx";

// [120차수] 서버 자료 불러오기(첫 불러오기·자동 새로고침·[다시 받기]·실패 시 폰 저장본) — App.jsx에서 그대로 옮김.
export function useBundleLoader(D) {
  const { setBundleVocaHw, displayedBundleRef, setAttLog, setAttStatus, setChecklistData, setCustomHolidays, setError, setExamRanges, setExams, setLastLoadedAt, setLoadErrorCode, setLoading, setMakeups, setMasterWithdrawn, setOfflineNotice, setProgressTree, setRecords, setRefreshing, setStudent, setSurveyResponses, setSurveys, setSyncSource, setTodos, setVideoStatsUnavailable, setVideoWatch, setVideos, setVocabWrongWords, setWithdrawnName, studentId, viewingVideoRef, withdrawnRef } = D;
  // [100차수] 요청 진행 상태 — 예전엔 true/false 하나라서, 자동 받기 중에 [다시 받기]를 누르면 아무 표시 없이 그냥 끝났다.
  //   이제: 무엇이 도는지("auto"/"manual") + 수동 1건 예약 + 수동 성공 후 60초 유예창 + 학생 바뀜 감지(epoch)를 따로 기억한다.
  //   규칙: 아무것도 없을 때 → 그대로 실행 / 자동 중 + 수동 → 즉시 "받는 중…" 켜고 자동이 끝나면 fresh=1 수동 1회
  //         수동 중(또는 예약됨) + 수동 → 같은 일로 합침 / 수동 중 + 자동 → 건너뜀 / 자동 중 + 자동 → 건너뜀
  const loadInFlightRef = useRef(null);      // null | "auto" | "manual"
  const manualQueuedRef = useRef(false);     // 자동이 끝나면 수동(fresh=1) 1회 실행 예약
  const freshUntilRef = useRef(0);           // 이 시각까지는 자동 요청에도 fresh=1
  const loadEpochRef = useRef(0);            // 학생이 바뀌거나 화면이 닫히면 +1 → 옛 요청 결과는 버린다
  const pollFailRef = useRef(0);             // [110차수] 연속 실패 횟수 — 자동 새로고침 간격을 늘리는 데 쓴다(성공하면 0)
  // [99차수] 예전의 keepPrevIfUnexpectedEmpty("새 값이 비면 옛 값 유지")는 없앴다.
  //   반쪽 답은 이미 loadStudentBundleFromWorker에서 걸러지므로, 여기까지 온 빈 값은 "진짜 지워진 것"이다.
  //   (시청 기록 videoWatch만은 아직 서버에 못 보낸 폰 기록이 있을 수 있어 예전처럼 합친다.)
  const applyBundle = (bundle) => {
    if (!bundle?.student) return;
    // [137차수] 서버가 준 앱 설정(공휴일)을 화면을 그리기 전에 먼저 표에 반영한다. 옛 워커·폰 저장본이면 칸이 없어 아무 일도 없다.
    applyServerAppSettings(bundle.settings);
    // [137차수] 묶음에 실려 온 단어숙제 도장. 서버가 준 묶음일 때만 믿고, 그 밖(옛 워커·서버가 못 읽음·폰 저장본)은 false → 예전처럼 따로 물어본다.
    //   폰 저장본으로 잠깐 넘어간 경우에는 방금까지 서버에서 받아 둔 도장을 그대로 둔다(초록 체크가 깜빡 사라지지 않게).
    setBundleVocaHw(prev => bundle.source === "worker"
      ? (isPlainObject(bundle.vocaHw) ? bundle.vocaHw : false)
      : (isPlainObject(prev) ? prev : false));
    displayedBundleRef.current = { studentId: String(studentId), bundle };
    setVideoStatsUnavailable(bundle.videoStatsUnavailable === true);
    setStudent(bundle.student);
    // [08-07] 마스터(·[08-27] 선생님)가 그만둔 학생 화면을 열었을 때만 켜진다. 학생 화면에서는 항상 꺼져 있다.
    setMasterWithdrawn(!!bundle.withdrawnFlag && IS_STAFF_VIEW);
    setProgressTree(bundle.progressTree || null);
    setTodos(isPlainObject(bundle.todos) ? bundle.todos : {});
    setChecklistData(isPlainObject(bundle.checklistData) ? bundle.checklistData : {});
    setRecords(isPlainObject(bundle.records) ? bundle.records : {});
    setVideos(Array.isArray(bundle.videos) ? bundle.videos : []);
    setVideoWatch(prev => mergeVideoWatchSnapshots(bundle.videoWatch || {}, prev || {}));
    setMakeups(bundle.makeups || []);
    setCustomHolidays(bundle.customHolidays || {});
    setExams(Array.isArray(bundle.exams || bundle.exam3) ? (bundle.exams || bundle.exam3) : []);
    setAttLog(bundle.attLog || {});
    setAttStatus(bundle.att || {});
    setSurveys(Array.isArray(bundle.surveys) ? bundle.surveys : []);
    setSurveyResponses(bundle.surveyResponses || {});
    setExamRanges(normalizeExamRanges(bundle.examRanges ?? bundle.examr3)); // [99차수] 구버전 백업(칸 없음)도 null로 무사히 열린다
    setVocabWrongWords(isPlainObject(bundle.vocabWrongWords) ? bundle.vocabWrongWords : {});
    setSyncSource(bundle.source || "");
    // [98차수] 폰에 저장해 둔 옛 화면을 쓸 때는 학생이 알아듣게 — 언제 것인지 + 새 숙제·강의가 안 보일 수 있다는 것.
    setOfflineNotice(bundle.source === "local-backup"
      ? `지금 화면은 ${bundle.savedAt ? new Date(bundle.savedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "예전"}에 저장해 둔 옛날 것이에요. 새 숙제·강의가 안 보일 수 있어요. 인터넷을 확인하고 [다시 받기]를 눌러 주세요.`
      : "");
    setLastLoadedAt(new Date());
  };
  const loadData = async ({ manual = false } = {}) => {
    if (!studentId) { setLoading(false); return; }
    // [08-07] 이미 차단된 링크면 자동 새로고침은 서버를 두드리지 않는다.
    //         학생이 [다시 확인]을 눌렀을 때만(manual) 다시 물어본다.
    if (withdrawnRef.current && !manual) return;
    if (loadInFlightRef.current) {
      // [100차수] 자동이 도는 중에 학생이 눌렀다 → 표시를 바로 켜고, 자동이 끝난 뒤 fresh=1 수동을 1번 예약.
      //   이미 수동이 돌거나 예약돼 있으면 같은 일로 합친다(추가 예약 없음). 자동끼리는 건너뛴다.
      if (manual && loadInFlightRef.current === "auto" && !manualQueuedRef.current) {
        manualQueuedRef.current = true;
        setRefreshing(true);
      }
      return;
    }
    await runLoad(manual ? "manual" : "auto");
  };
  const runLoad = async (kind) => {
    const manual = kind === "manual";
    const epoch = loadEpochRef.current;
    const alive = () => epoch === loadEpochRef.current; // 학생 바뀜·화면 닫힘 뒤에는 결과를 화면에 쓰지 않는다
    loadInFlightRef.current = kind;
    if (manual) setRefreshing(true);
    // 수동이거나, 수동 성공 후 60초 유예창 안이면 fresh=1
    const forceFresh = manual || Date.now() < freshUntilRef.current;
    try {
      let bundle = await loadStudentBundle(studentId, { forceFresh });
      if (!alive()) return;
      if (!bundle || !bundle.student) {
        // [123차수] 여기는 실제로 올 수 없는 자리다(학생이 없으면 loadStudentBundle이 먼저 오류를 던진다). 혹시 오더라도
        //   화면이 비지 않게 "연결 오류" 화면으로 보낸다. 예전의 "학생 못 찾음" 전용 화면은 한 번도 뜬 적이 없어 지웠다.
        setLoadErrorCode("E-학생없음");
        setError("load_error");
        return;
      }
      if (bundle.videoStatsUnavailable) {
        const previous = displayedBundleRef.current?.studentId === String(studentId)
          ? displayedBundleRef.current.bundle : restoreStudentBundleFromLocal(studentId);
        bundle = { ...bundle, videoWatch: previous?.videoWatch || {} };
      }
      applyBundle(bundle);
      saveStudentBundleToLocal(studentId, bundle);
      // [100차수] 수동 우회가 "진짜로" DB를 다시 읽었을 때만 유예창을 연다(옛 워커가 fresh를 무시했으면 열지 않는다).
      //   자동 요청 성공으로는 창을 늘리지 않는다.
      if (manual && bundle.syncMeta && bundle.syncMeta.forceFreshApplied === true) {
        freshUntilRef.current = Date.now() + FRESH_GRACE_MS;
      }
      withdrawnRef.current = false; // 다시 등록되면 여기로 들어와 잠금이 풀린다
      clearWithdrawnStrikes(studentId); // [08-10] 정상 응답이 오면 3진 아웃 카운트를 0으로 되돌린다
      setError(null);
      setLoadErrorCode(""); // [08-10]
      pollFailRef.current = 0;   // [110차수] 성공 → 자동 새로고침 간격 90초로 복귀
    } catch (e) {
      console.error("Load error:", e);
      if (!alive()) return;
      // [08-07→08-10] 그만둔(삭제·정지) 학생 차단 — 단, 한 번에 판정하지 않는다.
      // 서버가 잠깐 잘못 답하는 순간(빈 명단·순간 403/404)에 멀쩡한 학생의 백업을 지우면 되돌릴 수 없기 때문.
      // 10분 안에 같은 답이 3번 연속 왔을 때만 차단 + 백업 삭제를 실행한다.
      if (e && e.code === "withdrawn") {
        // [137차수] 서버가 "정지 학생"이라고 분명히 말한 답(e.definite)은 세 번 기다리지 않는다.
        const strikes = e.definite ? WITHDRAWN_STRIKE_LIMIT : addWithdrawnStrike(studentId);
        if (strikes >= WITHDRAWN_STRIKE_LIMIT) {
          // [137차수] 서버가 분명히 "정지"라고 해서 바로 안내하는 경우에는 폰 저장본을 지우지 않는다 — 원장앱에서 정지를 잘못 눌렀다가 바로 푼 경우에도 잃는 것이 없게.
          if (!e.definite) { try { localStorage.removeItem(getStudentBundleStorageKey(studentId)); } catch (err) { /* ignore */ } }
          displayedBundleRef.current = null;
          withdrawnRef.current = true;
          setWithdrawnName(String(e.studentName || ""));
          setError("withdrawn");
          return;
        }
        // 아직 판정 전(1·2번째): 차단하지 않고 아래로 내려가 폰 백업으로 화면을 지킨다.
        // 백업이 없으면 연결 오류 화면이 뜨고, 30초 자동 새로고침이 3번째 확인을 대신해 준다.
      }
      // [08-07] 차단 화면에서 [다시 확인]을 눌렀는데 인터넷이 안 되는 경우.
      //         "연결 오류" 화면으로 넘기지 말고 차단 화면을 그대로 둔다.
      if (withdrawnRef.current) return;
      setLoadErrorCode(makeLoadErrorCode(e)); // [08-10] 어떤 이유로 실패했는지 짧은 코드로 기억해 둔다
      pollFailRef.current += 1;   // [110차수] 연속 실패 → 다음 자동 새로고침을 150초·240초로 늦춘다(서버가 바쁠 때 더 두드리지 않게)
      // 이미 연 자료를 옛 저장본으로 되돌리거나, 저장 공간 문제 때문에 오류 화면으로 바꾸지 않는다.
      // 명시적 인증 거절은 기존 차단 절차로만 처리한다.
      if (e?.code !== "withdrawn" && !IS_TEACHER_MODE && displayedBundleRef.current?.studentId === String(studentId)) {
        setOfflineNotice("연결이 잠시 늦어지고 있어요. 현재 자료로 계속 공부할 수 있어요. 새 숙제와 강의는 연결되면 갱신됩니다.");
        setError(null);
        return;
      }
      const localBundle = restoreStudentBundleFromLocal(studentId);
      if (localBundle) {
        applyBundle(localBundle);
        setError(null);
      } else {
        setBundleVocaHw(false);   // [137차수] 서버 답이 없으니 도장은 예전 방식으로(따로 물어봄)
        setError("load_error");
      }
    } finally {
      // [102차수] 옛 요청(학생 바뀜·화면 닫힘 뒤에 늦게 끝난 것)은 지금 도는 요청의 진행 표시·수동 예약을 건드리지 않는다.
      //   정리(cleanup)가 이미 ref를 초기화했고, 그 뒤 시작한 새 요청이 같은 ref를 쓰고 있을 수 있기 때문.
      //   (101차수까지는 alive 검사 앞에서 진행 표시를 지우고, 옛 요청이 새 예약까지 지웠다) (1차 검토 지적 2번)
      if (alive()) {
        loadInFlightRef.current = null;
        setLoading(false);
        if (manualQueuedRef.current) {
          // [100차수] 자동이 도는 동안 눌린 [다시 받기] — 자동이 성공했든 실패했든 이제 fresh=1로 1번 실제 실행.
          //   "받는 중…" 표시는 여기서 끄지 않는다(예약된 수동이 끝날 때 끈다).
          manualQueuedRef.current = false;
          runLoad("manual");
        } else if (manual) {
          setRefreshing(false); // 성공·실패·예외 어느 쪽이든 단추는 반드시 풀린다
        }
      }
    }
  };
  // [3차 ①] 자동 새로고침 방식
  //  - 화면을 보고 있을 때: 60초마다 ([다이어트 4차 2026-08-17] 30초→60초, 워커 부담 절반)
  //  - 화면을 껐거나 다른 앱으로 갔을 때: 아예 멈춤 (데이터·배터리 절약)
  //  - 화면을 다시 켠 순간: 즉시 한 번 불러오기
  //  - 단, 강의 영상을 보는 중이면 즉시 불러오기는 건너뛴다.
  //    (영상 보다가 잠깐 나갔다 온 경우 화면을 다시 그리면 영상이 튈 수 있어서)
  //    이때도 60초 타이머는 다시 돌기 때문에 최대 60초 안에 최신이 된다.
  useEffect(() => {
    // 학생 id가 없는 경우(링크 복구 첫 화면)에도 loadData를 한 번은 불러야 한다.
    // loadData 안에서 로딩 표시를 꺼주기 때문에, 여기서 그냥 return 하면 화면이 계속 "불러오는 중"에 멈춘다.
    if (!studentId) { loadData(); return; }

    // 응답 완료 후 다음 조회를 예약한다. 첫 접속 실패는 15/30/60초로 재시도한다.
    let timer = null, stopped = false, lastWakeAt = 0;
    const stop = () => { if (timer) clearTimeout(timer); timer = null; };
    const schedule = () => {
      stop();
      if (stopped || document.hidden) return;
      const failCount = pollFailRef.current;
      const delay = !displayedBundleRef.current && failCount > 0
        ? [15000, 30000, 60000][Math.min(failCount - 1, 2)] + Math.floor(Math.random() * 10000)
        : bundlePollDelayMs(failCount);
      timer = setTimeout(refresh, delay);
    };
    const refresh = async () => {
      if (stopped) return;
      stop();
      try { await loadData(); } catch (e) { /* runLoad에서 화면 처리 */ }
      schedule();
    };
    const wake = () => {
      if (stopped || document.hidden) return;
      // 온라인/화면복귀 이벤트가 겹쳐도 요청을 한 번만 보낸다.
      if (Date.now() - lastWakeAt < 2000) { schedule(); return; }
      lastWakeAt = Date.now();
      if (!viewingVideoRef.current) refresh(); else schedule();
    };
    const onVisRefresh = () => { if (document.hidden) stop(); else wake(); };
    refresh();
    document.addEventListener("visibilitychange", onVisRefresh);
    window.addEventListener("online", wake);
    return () => {
      stopped = true; stop();
      document.removeEventListener("visibilitychange", onVisRefresh);
      window.removeEventListener("online", wake);
      loadEpochRef.current += 1;
      setBundleVocaHw(undefined);   // [137차수] 학생이 바뀌면 앞 학생의 도장을 비운다
      loadInFlightRef.current = null;
      manualQueuedRef.current = false;
      freshUntilRef.current = 0;
      displayedBundleRef.current = null;
      setRefreshing(false);
    };
  }, [studentId]);
  return { loadData };
}
