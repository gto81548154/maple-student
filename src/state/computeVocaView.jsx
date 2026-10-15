import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { HOLIDAYS } from "../data/holidays.jsx";
import { academyHour24, attEntryForDay } from "../domain/attendance.jsx";
import { fmtDateShort, isToday } from "../domain/time.jsx";
import { buildVocaAliasIndex, findTaskVocaRange } from "../domain/voca.jsx";
import { computeVocabReviewWarning } from "../domain/vocabTest.jsx";

// [121차수] 강의 목록·오답 경고·앱 단어 숙제 값 계산과 [단어 숙제 TEST 시작] — App.jsx에서 그대로 옮김. 훅이 아니라 보통 함수.
export function computeVocaView(D) {
  const { activeDate, customHolidays, makeups, progressTree, setVocaHwTask, stepGroups, student, studentId, videos, vocabWrongWords } = D;
  const studentVideos = videos.filter(v => !v.studentId || String(v.studentId) === String(studentId));
  const hasVocabWrong = Object.values(vocabWrongWords || {}).some(m =>
    Object.values(m?.words || {}).some(w => (w.status || "active") === "active" && Array.isArray(w.correctAnswers) && w.correctAnswers.length > 0)
  );
  // 주간 오답 복습 경고 (지난주 틀린 단어 이번 주 마감 / 기한 초과)
  const vocabWarn = computeVocabReviewWarning(vocabWrongWords);
  // [0813] 오늘 숙제에 적힌 단어장 범위 — 홈 "수업 단어 공부" 카드와 단어장 탭 books 목록에 쓴다
  // [0814] 원장앱 교재명·별칭 표(진도 맵에서 뽑음)를 같이 넘긴다 — 새 훅 없이 그때그때 계산(교재 수십 개라 가볍다)
  const vocaAliasIndex = buildVocaAliasIndex(progressTree);
  const taskVoca = findTaskVocaRange(stepGroups.flatMap(s => s.items), vocaAliasIndex);
  // [108차수 · 검토 4번] 단어 숙제 통과 문구 — 보고 있는 숙제 날짜(activeDate)가 오늘이 아니면 그 날짜를 적는다. 홈 단어 줄·단어 탭 안내가 같이 쓴다.
  const vocaPassLabel = isToday(activeDate) ? "오늘 단어 숙제 통과" : `${fmtDateShort(activeDate)} 단어 숙제 통과`;
  // [0825 5차수] 숙제 TEST 바로 시작 — 예전 홈 2번 카드 안에 있던 코드를 밖으로 꺼내 단어 탭과 같이 쓴다.
  // date = 이 숙제의 수업 날짜(activeDate) — 전날 미리 해도 그 수업 칸에 도장이 찍힌다.
  // deadline = 그 수업 날짜의 등원 시각. 등원 정보가 없으면 빈 값(서버는 그 경우 늦음 판정 안 함).
  const startVocaHwTest = () => {
    if (!taskVoca) return false;
    // [94차수 09-05] 선생님이 학생 화면을 열어본 경우(보기 전용)에는 학생 숙제 TEST를 시작하지 않는다.
    //   학생 열쇠(t)가 없어 도장도 못 읽고 결과도 저장되지 않으므로, 열어봐야 헛일이다.
    if (IS_STAFF_VIEW) return false;   // [135차수 h] 마스터(원장)도 같음 — 끝까지 풀면 학생 기록으로 남을 수 있어서
    let deadline = "";
    try {
      const allHol = { ...HOLIDAYS, ...(customHolidays || {}) };
      const mks = (makeups || []).filter(m => String(m.studentId) === String(student.id));
      const dObj = new Date(activeDate + "T00:00:00");
      const ent = attEntryForDay(student, mks, allHol, dObj);
      if (ent && ent.time) {
        const [hh, mm] = String(ent.time).split(":");
        const dl = new Date(dObj);
        dl.setHours(academyHour24(hh), parseInt(mm, 10) || 0, 0, 0);   // [0819 늦음판정 보정] "4:00" = 오후 4시
        deadline = dl.toISOString();
      }
    } catch (e) { deadline = ""; }
    setVocaHwTask(taskVoca.ns
      ? { ns: true, lessons: taskVoca.lessons, date: activeDate, deadline }   // [내신 4차수]
      : { book: taskVoca.book, lecs: taskVoca.lecs, date: activeDate, deadline });
    return true;
  };
  return { hasVocabWrong, startVocaHwTest, studentVideos, taskVoca, vocaPassLabel, vocabWarn };
}
