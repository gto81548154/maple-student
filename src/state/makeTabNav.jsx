import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { buildVideoPickerV2 } from "../domain/videoMatch.jsx";
import { TAB_BAR_H } from "../theme/tokens.jsx";

// [121차수] 탭 이동(goTab)과 강의 고르기 값(최근 본 강의·오늘 숙제 강의) — App.jsx에서 그대로 옮김. 훅이 아니라 보통 함수.
export function makeTabNav(D) {
  const { confirmLeaveTab, headerRef, setSelectedVideoBook, setTab, setVideosFeaturedId, setVocaExtraBook, setVocaOpenLast, setVocaOpenTask, startVocaHwTest, stepGroups, studentId, studentVideos, tab, taskVoca, toggleVideo, videoWatch, viewingVideo, vocaHwBusyRef, vocaHwRec } = D;
  // ─── [103차수 09-08] 화면 이동은 전부 이 한 함수로 (계획서 5절) ───
  //   위 탭·홈 바로가기·더보기 목록·"‹ 더보기"·[복습하기]가 모두 goTab을 부른다. 그래서
  //   ① 오답 TEST·단어 숙제 TEST 도중의 나가기 확인창(confirmLeaveTab)이 어디서 이동하든 똑같이 걸리고
  //   ② 확인을 취소하면 iframe 신호(숙제 TEST 시작·마지막 책 열기)·고른 강의·화면 상태를 하나도 바꾸지 않는다(확인 뒤에만 실행)
  //   ③ 이미 있는 화면을 또 누르면 아무것도 안 한다 — 단어 탭 재클릭이 "숙제 TEST 시작" 신호를 또 보내던 일(96차수 수정)이 다시 생기지 않는다
  //   더보기 하위 화면(일정·오답·모의·진도·공지·시험·설정)은 tab 값은 따로 두고 위 탭에서는 "더보기"가 켜진 것으로 보인다(topTabOf).
  const MORE_SUB_KEYS = ["cal", "vocabWrong", "mock", "progress", "notices", "examInfo", "settings"];
  const topTabOf = (key) => (MORE_SUB_KEYS.includes(key) ? "more" : key);
  // 탭을 바꿀 때 본문 시작점(붙박이 탭 줄 바로 아래)까지만 올린다. 그보다 위에 있으면 그대로 둔다(머리글이 보이는 중이면 안 움직임).
  const scrollToContentTop = () => {
    try {
      const h = headerRef.current;
      const y = h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom + window.scrollY)) : 0;
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: "auto" });
    } catch (e) {}
  };
  // 고른 강의 카드가 화면에 그려진 다음 그 위치로 내려간다. 위 탭 줄이 붙박이라 TAB_BAR_H만큼 여유를 둔다(숫자는 TAB_BAR_H 한 곳).
  // 혹시 실패해도 화면이 안 움직일 뿐, 오류는 나지 않는다. 두 번 시도(늦게 그려지는 폰 대비).
  const scrollToVideoCard = (vid) => {
    const go = () => {
      try {
        const el = document.getElementById("video-card-" + vid);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (TAB_BAR_H + 22), behavior: "smooth" });
      } catch (e) {}
    };
    setTimeout(go, 150); setTimeout(go, 600);
  };
  const goTab = (nextKey, opts = {}) => {
    if (nextKey === tab) {                                  // 같은 화면 — 아무것도 안 한다(iframe 신호도 안 보낸다)
      // [135차수 o] 예외: 단어 탭에 이미 있는데(검색의 [단어장 열기]로 책을 연 상태 등) 빨간 "단어" 탭을 또 누르면 숙제 TEST를 시작한다.
      //   이미 숙제 TEST를 푸는 중이면 예전처럼 아무것도 안 한다(96차수 — 시작 신호를 또 보내지 않음).
      if (nextKey === "voca" && !opts.vocaTask && taskVoca && !vocaHwRec && !IS_STAFF_VIEW && !(vocaHwBusyRef && vocaHwBusyRef.current)) { setVocaOpenTask(null); startVocaHwTest(); }
      return true;
    }
    if (!confirmLeaveTab(nextKey)) return false;            // 나가기 취소 — 아래 아무것도 실행하지 않는다
    if (nextKey === "voca") {
      // [0825 5차수] 단어 숙제가 남아 있으면 숙제 TEST부터, 통과했거나 숙제가 없으면 책장(마지막 책)
      // [94차수 09-05] 선생님 화면(보기 전용)은 도장을 못 읽으므로 늘 책장으로만 — 숙제 TEST를 열지 않는다. [135차수] 마스터 화면도 같음
      // [125차수] 홈 단어 검색의 [단어장 열기] — 그 책을 그 단원에 체크한 채로 연다(숙제 TEST·마지막 책 열기 대신).
      if (opts.vocaTask && opts.vocaTask.book) { setVocaExtraBook(String(opts.vocaTask.book)); setVocaOpenTask(opts.vocaTask); }
      else {
        setVocaOpenTask(null);   // 검색으로 열려다 만 신호가 남아 있으면 지운다(단어 탭을 그냥 누른 것이 우선)
        if (taskVoca && !vocaHwRec && !IS_STAFF_VIEW) startVocaHwTest();   // [135차수 h] 마스터(원장)가 학생 화면을 볼 때도 숙제 TEST를 띄우지 않는다
        else setVocaOpenLast(true);
      }
    }
    if (nextKey === "videos") {
      if (opts.videoBook !== undefined) setSelectedVideoBook(opts.videoBook);
      // [108차수] 대표 강의는 들어가는 순간의 시작 강의(홈에서 고른 영상 → 없으면 오늘 숙제 강의 → 최근 본 강의)로 고정
      setVideosFeaturedId(opts.playVideo ? opts.playVideo.id : (picker.main ? picker.main.video.id : null));
      if (opts.playVideo) {
        if (viewingVideo?.id !== opts.playVideo.id) toggleVideo(opts.playVideo);   // 이미 열려 있으면 다시 누르지 않는다(닫힘 방지)
        scrollToVideoCard(opts.playVideo.id);
      }
    }
    setTab(nextKey);
    scrollToContentTop();
    return true;
  };
  // [106차수 09-08] 홈 "강의" 줄과 강의 탭 대표 카드가 같은 강의를 가리키게 — 여기서 한 번만 계산한다.
  //   마지막에 보던 강의 = 시청 기록(lastAt)이 가장 최근인 영상. 시작 강의 = 이 날짜 숙제 "수강" 중 가장 앞 번호, 없으면 보던 강의(buildVideoPickerV2 그대로).
  const watchBySid = videoWatch[String(studentId)] || videoWatch[Number(studentId)] || {};
  let lastVideo = null;
 let lastVideoAt = 0;
  studentVideos.forEach(v => {
    const rec = watchBySid[v.id];
    const t = rec && rec.lastAt ? new Date(rec.lastAt).getTime() : 0;
    if (t > lastVideoAt) { lastVideoAt = t; lastVideo = v; }
  });
  const allTaskItems = stepGroups.flatMap(s => s.items);
  const picker = buildVideoPickerV2(lastVideo, allTaskItems, studentVideos);
  return { allTaskItems, goTab, picker, scrollToVideoCard, topTabOf, watchBySid };
}
