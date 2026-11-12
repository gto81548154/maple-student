import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { attTag, computeAttNotice, computeAttWeek, fmtAttDayParen } from "../domain/attendance.jsx";
import { fmtPhonicsDueShort, pendingPhonicsTasks } from "../domain/phonics.jsx";
import { buildStudentExamDdays, nearestExamOf } from "../domain/dday.jsx";
import { fmtTime } from "../domain/time.jsx";

// [121차수] 더보기 목록에 쓸 값 계산(시험 D-Day·설문·오답 수·등원 안내) — App.jsx에서 그대로 옮김. 훅이 아니라 보통 함수.
export function computeMoreView(D) {
  const { curriculum, customHolidays, exams, hasVocabWrong, makeups, pinnedMessages, progressTree, student, surveyResponses, surveys, todayStrForTab, vocabWarn, vocabWrongWords } = D;
  const examDdays = buildStudentExamDdays(student, exams, 2);
  // ─── [103차수 09-08] 더보기·홈 요약에 쓰는 파생값 — 전부 이미 받은 자료에서 계산(서버 추가 요청 없음) ───
  // 진행 중 설문(기간 안) — 공지·설문 화면과 더보기 숫자가 같은 목록을 쓴다 (워커도 거르지만 캐시 번들 대비 이중 안전장치)
  const activeSurveys = surveys.filter((sv) => sv && !(sv.startDate && todayStrForTab < sv.startDate) && !(sv.endDate && todayStrForTab > sv.endDate));
  // "응답할 설문" = 아직 내 응답이 없는 것. 공지는 읽음 기록이 없으므로 개수만 세고 "안 읽음"이라고 하지 않는다(계획서 6절)
  const unansweredSurveys = activeSurveys.filter((sv) => { const r = surveyResponses[sv.id]; return !(r && (Array.isArray(r.choices) ? r.choices.length > 0 : r.choice != null)); });
  const noticeSubParts = [];
  if (pinnedMessages.length) noticeSubParts.push(`공지 ${pinnedMessages.length}개`);
  if (unansweredSurveys.length) noticeSubParts.push(`응답할 설문 ${unansweredSurveys.length}개`);
  else if (activeSurveys.length) noticeSubParts.push(`설문 ${activeSurveys.length}개 응답 완료`);
  const noticeSub = noticeSubParts.length ? noticeSubParts.join(" · ") : "새 공지가 없어요";
  const nearestExam = nearestExamOf(examDdays);
  const wrongCount = Object.values(vocabWrongWords || {}).reduce((n, m) =>
    n + Object.values(m?.words || {}).filter(w => (w.status || "active") === "active" && Array.isArray(w.correctAnswers) && w.correctAnswers.length > 0).length, 0);
  // [152차수] 더보기 "파닉스" 줄 설명 — 안 끝난 숙제(덜 보낸 것)가 있으면 "안 끝난 숙제 2개 · 11/7까지", 없으면 안내 글
  const phonicsPending = IS_STAFF_VIEW ? [] : pendingPhonicsTasks(D.phonicsTasks, todayStrForTab);
  const phonicsSub = phonicsPending.length
    ? `안 끝난 숙제 ${phonicsPending.length}개${phonicsPending[0].due ? ` · ${fmtPhonicsDueShort(phonicsPending[0].due)}` : ""}`
    : (D.phonicsState === "ok" && (D.phonicsTasks || []).length) ? "숙제 다 보냈어요 · 자유 녹음" : "단어 녹음 숙제 · 자유 녹음";
  const attNoticeAll = computeAttNotice(student, makeups, customHolidays, D.attStatus);
  // [109차수 09-08] 홈 위 칸 "이번 주 7일" 줄(오늘부터) + 더보기·홈 바로가기 "수업 일정" 줄이 같이 쓰는 한 줄 설명
  const attWeek = computeAttWeek(student, makeups, customHolidays, 7, D.attStatus);
  const calSub = attNoticeAll.today
    ? `오늘 ${fmtTime(attNoticeAll.today.time)} 등원${attTag(attNoticeAll.today)}`
    : attNoticeAll.next ? `다음 수업 ${fmtAttDayParen(attNoticeAll.next.dateObj)} ${fmtTime(attNoticeAll.next.time)}${attTag(attNoticeAll.next)}` : "등원·보충 일정";
  const moreGroups = [
    { title: "안내", items: [
      { key: "notices", icon: "📣", title: "공지·설문", sub: noticeSub, subTone: unansweredSurveys.length ? "warn" : undefined },
      { key: "examInfo", icon: "📋", title: "시험 정보", sub: nearestExam ? `${nearestExam.name} ${nearestExam.ddayLabel} · 시험 범위` : "다가오는 시험 없음" },
      // [146차수] 성적 장학금·친구 소개 기프티콘 신청(원장 결정 11-04)
      { key: "reward", icon: "🎁", title: "장학금·친구 소개", sub: "기프티콘 신청하기" },
    ] },
    { title: "학습", items: [
      { key: "cal", icon: "📅", title: "수업 일정", sub: calSub },
      // 오답 복습은 예전 "오답" 탭과 같은 조건(틀린 단어가 있을 때만)으로 나온다
      ...(hasVocabWrong ? [{ key: "vocabWrong", icon: "📝", title: "오답 복습",
          sub: vocabWarn.overdue > 0 ? `단어 시험 틀린 단어 ${vocabWarn.overdue}개 · 기한 지남` : vocabWarn.dueThisWeek > 0 ? `틀린 단어 ${vocabWarn.dueThisWeek}개 · ${vocabWarn.sundayLabel}까지 (${vocabWarn.ddayLabel || `D-${vocabWarn.dday}`})` : `남은 단어 ${wrongCount}개`,
          subTone: vocabWarn.overdue > 0 ? "warn" : undefined }] : []),
      // [145차수 → 152차수] "녹음 제출"은 "🎤 파닉스" 안(맨 아래 자유 녹음 칸)으로 합쳤다. 설명 = 안 끝난 파닉스 숙제 수(있으면 빨강)
      { key: "phonics", icon: "🎤", title: "파닉스", sub: phonicsSub, subTone: phonicsPending.length ? "warn" : undefined },
      // [0812 대시보드] 모의고사는 중학생에게도 보여준다(원장 결정). 회차가 없으면 빈 안내만 뜬다.
      { key: "mock", icon: "✏️", title: "모의고사", sub: "응시·점수 기록" },
      // [149차수] "학습 진도" → "마플 로드맵"(1~7단계 지도 + 교재별 진행 상황). 커리큘럼이나 진도 맵 중 하나라도 있으면 보인다
      ...(((progressTree?.lanes || []).length || (curriculum?.lanes || []).length) ? [{ key: "progress", icon: "🗺️", title: "마플 로드맵", sub: D.roadmapSub || "내가 어디까지 왔는지" }] : []),
    ] },
    { title: "앱", items: [{ key: "settings", icon: "⚙️", title: "앱 설정", sub: "알림 · 홈 화면 추가 · 업데이트" }] },
    // [168차수] 만들어 두기만 하고 아직 안 쓰는 기능을 모아 두는 칸(원장 결정 11-12). 여기서 눌러야만 열리고, 앱을 켤 때 저절로 뜨지 않는다.
    // [169차수] 이 칸은 원장님(마스터)·선생님 화면에서만 보인다. 학생 폰에는 안 나온다.
    ...(IS_STAFF_VIEW ? [{ title: "안 쓰는 기능", items: [{ key: "labPopup", icon: "🧪", title: "새 팝업 (준비 중)", sub: "공지 · 시험 일정 · 단어 리그" }] }] : []),
  ];
  return { activeSurveys, attNoticeAll, attWeek, calSub, examDdays, moreGroups, nearestExam, unansweredSurveys, wrongCount };
}
