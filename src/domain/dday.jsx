import { fmtDateShort, getTodayStr } from "./time.jsx";

// ─── 학생앱 시험 D-Day: 스케줄러(exam3) 연동 ───
// 중학생: 내신만 / 고등학생: 내신 + 모의고사
const normalizeDdayText = (v = "") => String(v || "").replace(/\s+/g, "").trim();
const compactSchoolTextForDday = (v = "") => normalizeDdayText(v)
  .replace(/중학교/g, "중")
  .replace(/고등학교/g, "고")
  .replace(/고교/g, "고");
const isBadSchoolTokenForDday = (v = "") => {
  const t = normalizeDdayText(v);
  if (!t || t === "중" || t === "고") return true;
  // 시험명에 들어가는 일반 단어가 학교명처럼 잡히는 경우 방지
  return /(모의고|기말고|중간고|정기고|고사)$/.test(t);
};
const extractSchoolTokenForDday = (v = "") => {
  const text = compactSchoolTextForDday(v);
  const matches = [...text.matchAll(/([가-힣A-Za-z0-9]+?(?:중|고))/g)]
    .map(m => m[1])
    .map(t => t.replace(/[123](?:학년|학기|학)?$/g, ""))
    .filter(t => !isBadSchoolTokenForDday(t));
  return matches[0] || "";
};
// student.name은 검사 대상에서 제외한다.
// (예: "이중수"의 '중', "고석원"의 '고'가 학교 종류로 오인식되는 문제 방지)
const getStudentLevelForDday = (student = {}) => {
  const schoolText = String(student.school || "");
  const gradeText = String(student.grade || "");

  // 1) school에 명확한 키워드("중학교"/"고등학교")가 있으면 우선
  if (/중학교|중학생/.test(schoolText)) return "middle";
  if (/고등학교|고등학생/.test(schoolText)) return "high";

  // 2) grade에 "중1", "고2" 같은 패턴이 있으면 사용
  if (/중\s*[123]/.test(gradeText)) return "middle";
  if (/고\s*[123]/.test(gradeText)) return "high";

  // 3) school 텍스트의 단일 글자 fallback
  if (/중/.test(schoolText) && !/고/.test(schoolText)) return "middle";
  if (/고/.test(schoolText)) return "high";

  return "high"; // 학교 구분이 애매하면 기존과 같이 고등 기준
};
// student.name은 검사 대상에서 제외 (이름의 숫자가 학년으로 잡히는 것 방지).
// 학년 컨텍스트("중1", "1학년", grade 단독값)가 명확한 패턴만 인정한다.
export const getStudentGradeForDday = (student = {}) => {
  const gradeText = String(student.grade || "");
  const schoolText = String(student.school || "");

  // 1) grade 필드에서 명확한 패턴 우선
  let m = gradeText.match(/(?:중|고)\s*([123])/);
  if (m) return m[1];
  m = gradeText.match(/([123])\s*학년/);
  if (m) return m[1];
  m = gradeText.match(/^\s*([123])\s*$/);
  if (m) return m[1];

  // 2) school 필드에서 같은 패턴 fallback
  m = schoolText.match(/(?:중|고)\s*([123])/);
  if (m) return m[1];
  m = schoolText.match(/([123])\s*학년/);
  if (m) return m[1];

  return "";
};
// student.name 자체는 학교명 추출 후보에서 제외한다.
// (예: "이중수" → "이중"이 학교로 잘못 추출되는 문제 방지)
// 단, "박상우-남한고1" 형태로 하이픈 뒤에 학교명이 붙은 경우는 추출한다.
export const getStudentSchoolForDday = (student = {}) => {
  const fromHyphenSuffix = String(student.name || "").split("-").slice(1).join("-");
  const candidates = [
    student.schoolName,
    student.school,
    fromHyphenSuffix, // 하이픈이 없으면 빈 문자열이라 자동 skip
  ];
  for (const c of candidates) {
    const token = extractSchoolTokenForDday(c || "");
    if (token && !isBadSchoolTokenForDday(token)) return token;
  }
  return "";
};
export const getExamStartEndForDday = (exam = {}) => {
  const start = exam.date || exam.startDate || exam.start || "";
  const end = exam.endDate || exam.end || start;
  return { start, end: end || start };
};
// 학년별 영어시험일(engDates[학년]) — 원장앱 D-day 칩과 동일하게 "영어학원이니까 영어일 우선" 규칙의 근거값.
export const getEngExamDateForDday = (exam = {}, student = {}) => {
  const grade = getStudentGradeForDday(student);
  return (grade && (
    exam.engDates?.[grade] ||
    exam.englishDates?.[grade] ||
    exam.gradeDates?.[grade] ||
    exam.byGrade?.[grade]
  )) || "";
};
export const getExamTargetDateForDday = (exam = {}, student = {}) => {
  const { start } = getExamStartEndForDday(exam);
  return getEngExamDateForDday(exam, student) || start;
};
const dateDiffDaysForDday = (targetDate) => {
  if (!targetDate) return null;
  const today = new Date(getTodayStr() + "T00:00:00");
  const target = new Date(String(targetDate).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};
export const formatDdayLabel = (diff) => {
  if (diff === null || diff === undefined) return "";
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
};
const examMatchesStudentSchoolForDday = (exam = {}, student = {}) => {
  const stuSchool = getStudentSchoolForDday(student);
  if (!stuSchool) return false;
  const examSchool = extractSchoolTokenForDday(`${exam.school || ""} ${exam.schoolName || ""} ${exam.name || ""}`);
  if (!examSchool) return false;
  // 양방향 includes는 "남한고" ↔ "남한산고" 같은 부분 일치 오매칭의 원인이라 제거.
  // 학교 토큰은 extractSchoolTokenForDday에서 학년 접미사가 제거된 정규형이므로
  // 정확 일치만 허용한다.
  return examSchool === stuSchool;
};
const MOCK_DDAY_ALLOWED_MONTHS_BY_GRADE = {
  // 학생앱 D-DAY 정책: 고등학생 모의고사는 3·6·9·10월만 표시한다.
  // 7월 등 학년/학교에서 실제 응시하지 않는 모의고사가 학생앱에 뜨는 것을 방지한다.
  "1": [3, 6, 9, 10],
  "2": [3, 6, 9, 10],
  "3": [3, 6, 9, 10],
};
const getMockExamMonthForDday = (exam = {}) => {
  const direct = exam.month ?? exam.mockMonth ?? exam.examMonth;
  const directNum = Number(String(direct || "").replace(/[^0-9]/g, ""));
  if (directNum >= 1 && directNum <= 12) return directNum;

  const text = `${exam.name || ""} ${exam.title || ""} ${exam.memo || ""} ${exam.label || ""}`;
  // "3월 모의고사", "9월 모의" 같이 "월"이 명시된 표기만 인식한다.
  // "3모의" 같은 약식은 모호하므로 월 fallback(시험 시작일 기준)으로 처리되도록 둔다.
  const monthFromText = text.match(/(?:^|[^0-9])(1[0-2]|[1-9])\s*월/);
  if (monthFromText) return Number(monthFromText[1]);

  const { start } = getExamStartEndForDday(exam);
  if (start) {
    const d = new Date(String(start).slice(0, 10) + "T00:00:00");
    if (!Number.isNaN(d.getTime())) return d.getMonth() + 1;
  }
  return null;
};
const getMockExamGradeTargetsForDday = (exam = {}) => {
  const out = new Set();
  const pushGrade = (v) => {
    const text = String(v ?? "").trim();
    if (!text) return;
    if (/^[123]$/.test(text)) out.add(text);
    [...text.matchAll(/고\s*([123])\s*(?:학년|학)?/g)].forEach(m => out.add(m[1]));
    [...text.matchAll(/([123])\s*(?:학년|학)/g)].forEach(m => out.add(m[1]));
  };

  [exam.grade, exam.targetGrade, exam.targetGrades, exam.grades, exam.name, exam.title, exam.memo, exam.label]
    .forEach(v => Array.isArray(v) ? v.forEach(pushGrade) : pushGrade(v));

  return [...out];
};
const mockExamMatchesGradeForDday = (exam = {}, student = {}) => {
  const grade = getStudentGradeForDday(student);
  if (!grade) return true;
  const targets = getMockExamGradeTargetsForDday(exam);
  if (targets.length === 0) return true;
  return targets.includes(grade);
};
const mockExamMatchesMonthPolicyForDday = (exam = {}, student = {}) => {
  const grade = getStudentGradeForDday(student);
  const allowed = MOCK_DDAY_ALLOWED_MONTHS_BY_GRADE[grade] || [3, 6, 9, 10];
  const month = getMockExamMonthForDday(exam);
  if (!month) return true;
  return allowed.includes(month);
};
export const isExamVisibleForStudentDday = (exam = {}, student = {}) => {
  const type = String(exam.type || "").trim();
  const level = getStudentLevelForDday(student);
  if (type === "모의고사") {
    return level === "high" &&
      mockExamMatchesGradeForDday(exam, student) &&
      mockExamMatchesMonthPolicyForDday(exam, student);
  }
  if (type === "내신") return examMatchesStudentSchoolForDday(exam, student);
  return false;
};
const sortExamDdayItems = (a, b) => {
  const ad = Math.max(a.diff, 0);
  const bd = Math.max(b.diff, 0);
  return ad - bd || String(a.targetDate).localeCompare(String(b.targetDate));
};
export const buildStudentExamDdays = (student, exams = [], limit = 2) => {
  if (!student || !Array.isArray(exams)) return [];
  const today = getTodayStr();
  const items = exams
    .filter(exam => exam && !exam.deletedAt && isExamVisibleForStudentDday(exam, student))
    .map(exam => {
      const { start, end } = getExamStartEndForDday(exam);
      const engDate = getEngExamDateForDday(exam, student);
      const targetDate = getExamTargetDateForDday(exam, student);
      const diff = dateDiffDaysForDday(targetDate);
      if (diff === null) return null;
      const ended = end && String(end).slice(0, 10) < today;
      if (ended) return null;
      const ongoing = start && end && String(start).slice(0, 10) <= today && today <= String(end).slice(0, 10);
      const type = String(exam.type || "");
      // 영어일이 있으면 D-day는 영어일 기준(diff가 이미 영어일 기준). 영어일이 지났는데 시험기간이 남았으면 "영어 끝".
      const engDone = !!engDate && String(engDate).slice(0, 10) < today;
      const dateLabel = start && end && start !== end ? `${fmtDateShort(start)} ~ ${fmtDateShort(end)}` : fmtDateShort(targetDate);
      return {
        id: exam.id || `${exam.name || type}_${targetDate}`,
        name: exam.name || (type === "모의고사" ? "모의고사" : "내신 시험"),
        type,
        targetDate,
        start,
        end,
        diff,
        ongoing,
        school: String(exam.school || ""),
        kind: String(exam.kind || ""),
        semester: (Number(exam.semester) === 1 || Number(exam.semester) === 2) ? Number(exam.semester) : null,
        isEngTarget: !!engDate,
        ddayLabel: engDone ? "영어 끝" : (ongoing && diff < 0 ? "진행 중" : formatDdayLabel(diff)),
        dateLabel,
      };
    })
    .filter(Boolean);

  const nextSchoolExam = items.filter(x => x.type === "내신").sort(sortExamDdayItems)[0] || null;
  const nextMockExam = items.filter(x => x.type === "모의고사").sort(sortExamDdayItems)[0] || null;

  // 학생 화면은 복잡하지 않게 내신 1개 + 모의고사 1개만 보여준다.
  return [nextSchoolExam, nextMockExam].filter(Boolean).slice(0, limit);
};
// [103차수] 가장 가까운 시험 하나(시험 기간 중이면 그게 0순위) — 더보기·홈 요약 줄이 쓴다. 아래 StudentExamDdaySection의 규칙과 같다.
export const nearestExamOf = (list) => {
  const l = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!l.length) return null;
  const rank = (x) => (typeof x.diff === "number" ? Math.max(x.diff, 0) : 99999);
  return l.reduce((a, b) => (rank(b) < rank(a) ? b : a));
};
