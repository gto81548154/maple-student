import { useState, useEffect, useRef } from "react";
// ─── 학생앱 동기화 API ───
// Worker API(Turso 원본 DB) 단일 경로
// .env 예시: VITE_STUDENT_SYNC_API_URL=https://mapl-sync-worker.yourname.workers.dev/student-bundle
const STUDENT_SYNC_API_URL =
  import.meta.env.VITE_STUDENT_SYNC_API_URL ||
  import.meta.env.VITE_STUDENT_BUNDLE_API_URL ||
  "";

if (!STUDENT_SYNC_API_URL) {
  console.error("[CONFIG ERROR] VITE_STUDENT_SYNC_API_URL이 설정되지 않았습니다. 학생앱은 maple-sync /student-bundle Worker URL이 필요합니다.");
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`학생 동기화 API 응답 지연: ${Math.round(timeoutMs / 1000)}초 초과`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

const resolveStudentSyncUrl = (studentId) => {
  if (!STUDENT_SYNC_API_URL) return "";
  const u = new URL(STUDENT_SYNC_API_URL, window.location.origin);
  u.searchParams.set("id", String(studentId));
  u.searchParams.set("studentId", String(studentId));
  const accessToken = new URLSearchParams(window.location.search).get("t") || "";
  if (accessToken) u.searchParams.set("t", accessToken);
  u.searchParams.set("ts", String(Date.now()));
  return u.toString();
};

const unwrapBundlePayload = (raw) => raw?.data || raw?.bundle || raw?.result || raw || {};

const getStudentFromPayload = (payload, studentId) => {
  if (payload.student && String(payload.student.id) === String(studentId) && !payload.student.deletedAt) return payload.student;
  const students = payload.students || payload.stu3 || [];
  return (students || []).find(s => String(s.id) === String(studentId) && !s.deletedAt) || null;
};

// Worker가 전체 원본(todo4/chk3)을 보내도, 학생 1명만 필터링해서 쓰고,
// Worker가 이미 학생 1명 데이터만 보내도 기존 화면 구조({date:{sid:row}})로 맞춘다.
const normalizeByDateForStudent = (source = {}, studentId) => {
  const sid = String(studentId);
  const out = {};
  Object.entries(source || {}).forEach(([dateKey, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const direct = value[sid] ?? value[Number(studentId)];
    if (direct !== undefined) {
      out[dateKey] = { [sid]: direct };
      return;
    }
    // 이미 학생 1명 row만 들어온 형태: {"2026-05-04": {homework, academy, steps5}}
    if (value.homework !== undefined || value.academy !== undefined || value.steps5 !== undefined) {
      out[dateKey] = { [sid]: value };
      return;
    }
    // 이미 학생 1명 체크 row만 들어온 형태: {"2026-05-04": {ac_x:true, hw_x:"fail:..."}}
    if (Object.keys(value).some(k => /^(?:hw|ac)_/.test(k))) {
      out[dateKey] = { [sid]: value };
    }
  });
  return out;
};

const normalizeRecordsForStudent = (source = {}, studentId) => {
  const sid = String(studentId);
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const direct = source[sid] ?? source[Number(studentId)];
  if (direct !== undefined) return { [sid]: direct };
  // Worker가 해당 학생 record object만 보내는 경우
  return Object.keys(source).length ? { [sid]: source } : {};
};

const normalizeVideoWatchForStudent = (source = {}, studentId) => {
  const sid = String(studentId);
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const direct = source[sid] ?? source[Number(studentId)];
  if (direct !== undefined) return { [sid]: direct };
  // Worker가 해당 학생 videoWatch object만 보내는 경우
  return Object.keys(source).length ? { [sid]: source } : {};
};

// 오답 단어 TEST: Worker가 이미 학생 1명치 { "YYYY-MM": { words } }를 보내면 그대로 사용한다.
// 혹시 전체 { studentId: {...} } 형태로 오면 해당 학생만 추출해 타학생 노출을 막는다.
const normalizeVocabWrongWordsForStudent = (source = {}, studentId) => {
  const sid = String(studentId);
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const direct = source[sid] ?? source[Number(studentId)];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;

  const keys = Object.keys(source);
  const looksLikeMonths = keys.length > 0 && keys.every(k => /^\d{4}-\d{2}$/.test(k));
  if (looksLikeMonths) return source;

  return {};
};

const loadStudentBundleFromWorker = async (studentId) => {
  const url = resolveStudentSyncUrl(studentId);
  if (!url) throw new Error("STUDENT_SYNC_API_URL 미설정");
  const resp = await fetchWithTimeout(url, { method: "GET", cache: "no-store" }, 10000);
  if (!resp.ok) throw new Error(`학생 동기화 API 오류: ${resp.status}`);
  const raw = await resp.json();
  const payload = unwrapBundlePayload(raw);
  const student = getStudentFromPayload(payload, studentId);
  if (!student) throw new Error("학생 정보를 찾을 수 없습니다");

  const todoSource = payload.todos || payload.todo4 || {};
  const chkSource = payload.checklistData || payload.chk3 || payload.checklist || {};
  const recSource = payload.records || payload.rec3 || {};
  const vwSource = payload.videoWatch || payload.video_watch || {};
  const examSource = payload.exams || payload.exam3 || [];
  const vocabWrongSource = payload.vocabWrongWords || payload.vocab_wrong_words || {};

  return {
    source: "worker",
    student,
    todos: normalizeByDateForStudent(todoSource, studentId),
    checklistData: normalizeByDateForStudent(chkSource, studentId),
    records: normalizeRecordsForStudent(recSource, studentId),
    videos: payload.videos || payload.student_videos || [],
    videoWatch: normalizeVideoWatchForStudent(vwSource, studentId),
    makeups: payload.makeups || payload.mkp3 || [],
    customHolidays: payload.customHolidays || payload.holi3 || {},
    exams: Array.isArray(examSource) ? examSource : [],
    vocabWrongWords: normalizeVocabWrongWordsForStudent(vocabWrongSource, studentId),
  };
};

const loadStudentBundle = async (studentId) => {
  return await loadStudentBundleFromWorker(studentId);
};

const getStudentBundleStorageKey = (studentId) => `maple_student_bundle_${studentId}`;

const restoreStudentBundleFromLocal = (studentId) => {
  try {
    const raw = localStorage.getItem(getStudentBundleStorageKey(studentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.bundle || !parsed.bundle.student) return null;
    // 오래된 백업을 그대로 보여주면 혼란이 크므로 24시간 이내 자료만 사용한다.
    if (Date.now() - (parsed.savedAt || 0) > 24 * 60 * 60 * 1000) return null;
    return { ...parsed.bundle, source: "local-backup" };
  } catch (e) {
    return null;
  }
};

const saveStudentBundleToLocal = (studentId, bundle = {}) => {
  try {
    if (!studentId || !bundle?.student) return;
    const snapshot = {
      savedAt: Date.now(),
      bundle: {
        student: bundle.student,
        todos: bundle.todos || {},
        checklistData: bundle.checklistData || {},
        records: bundle.records || {},
        videos: bundle.videos || [],
        videoWatch: bundle.videoWatch || {},
        makeups: bundle.makeups || [],
        customHolidays: bundle.customHolidays || {},
        exams: Array.isArray(bundle.exams || bundle.exam3) ? (bundle.exams || bundle.exam3) : [],
        vocabWrongWords: bundle.vocabWrongWords || {},
      },
    };
    localStorage.setItem(getStudentBundleStorageKey(studentId), JSON.stringify(snapshot));
  } catch (e) {
    console.warn("localStorage 백업 실패:", e?.message || e);
  }
};

// ─── Helpers ───
const DK = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };
const fmtDateKR = (ds) => { const d = new Date(ds + "T00:00:00"); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DK[d.getDay()]}요일`; };
const fmtDateShort = (ds) => { if(!ds) return ""; const d = new Date(ds + "T00:00:00"); if(isNaN(d.getTime())) return ""; return `${d.getMonth() + 1}/${d.getDate()}(${DK[d.getDay()]})`; };
const isToday = (ds) => { const t = new Date(); return ds === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const getTodayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

// ─── 등원일 계산용 (admin 앱과 동일한 데이터 구조) ───
const DAYS_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// 한국 공휴일 2025-2027 (admin 앱과 동일)
// ⚠️ 동시 수정 필수: 이 상수는 원장앱.jsx와 학생앱.jsx에 복제되어 있다.
//    한쪽만 수정하면 등원일 표시가 두 앱에서 달라진다. 반드시 두 파일을 함께 수정할 것.
const HOLIDAYS = {
  "2025-01-01":"신정","2025-01-28":"설날","2025-01-29":"설날","2025-01-30":"설날",
  "2025-03-01":"삼일절","2025-05-01":"근로자의 날","2025-05-05":"어린이날","2025-05-06":"대체공휴일","2025-06-06":"현충일",
  "2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석","2025-10-06":"추석","2025-10-07":"추석","2025-10-08":"대체공휴일",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2026-01-01":"신정","2026-02-16":"설날","2026-02-17":"설날","2026-02-18":"설날",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-01":"근로자의 날","2026-05-05":"어린이날","2026-05-24":"석가탄신일",
  "2026-06-06":"현충일","2026-08-15":"광복절","2026-09-24":"추석","2026-09-25":"추석","2026-09-26":"추석",
  "2026-10-03":"개천절","2026-10-09":"한글날","2026-12-25":"크리스마스",
  "2027-01-01":"신정","2027-02-06":"설날","2027-02-07":"설날","2027-02-08":"설날","2027-02-09":"대체공휴일",
  "2027-03-01":"삼일절","2027-05-01":"근로자의 날","2027-05-05":"어린이날","2027-05-13":"석가탄신일","2027-06-06":"현충일",
  "2027-08-15":"광복절","2027-08-16":"대체공휴일","2027-10-03":"개천절","2027-10-09":"한글날",
  "2027-10-14":"추석","2027-10-15":"추석","2027-10-16":"추석","2027-12-25":"크리스마스",
};

// 학생의 임시 시간표(tempSchedules) 처리 - admin과 동일
const getEffectiveSchedule = (student, dateStr) => {
  const ts = (student.tempSchedules || []).find(t => t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate);
  if (ts) return { schedule: { ...(student.schedule || {}), ...(ts.schedule || {}) } };
  return { schedule: student.schedule || {} };
};

// 시간 표기: "5:00" → "5시", "5:30" → "5시 30분"
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":");
  const hour = parseInt(h, 10);
  const min = parseInt(m, 10) || 0;
  if (isNaN(hour)) return "";
  if (min === 0) return `${hour}시`;
  return `${hour}시 ${min}분`;
};

// 날짜 → "4월 27일 월"
const fmtAttDay = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DK[d.getDay()]}`;

// YYYY-MM-DD
const fmtYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─── 다가올 등원일 계산 ───
// 오늘 ~ 이번 주 일요일까지. 비어있으면 다음 주(월~일)로 자동 전환.
// 공휴일/customHolidays/isHidden makeup 제외, 보충/시간변경 포함.
const computeUpcomingAttendance = (student, makeups, customHolidays) => {
  if (!student) return [];
  const allHol = { ...HOLIDAYS, ...(customHolidays || {}) };
  const sid = student.id;
  const mks = (makeups || []).filter(m => String(m.studentId) === String(sid));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=일, 1=월, ..., 6=토
  // 오늘부터 이번 주 일요일까지 일수 (월~일 주)
  const daysToSun = dow === 0 ? 1 : 8 - dow;

  const collect = (startOffset, days) => {
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + startOffset + i);
      const ds = fmtYMD(d);

      // 공휴일 제외
      if (allHol[ds]) continue;

      const dayKey = DAYS_EN[d.getDay() === 0 ? 6 : d.getDay() - 1];

      // 그 날의 등원 취소 여부 (isHidden)
      const hidden = mks.some(m => m.date === ds && m.isHidden);

      // 그 날의 표시 가능한 makeup (보충 또는 시간변경)
      const visibleMk = mks.find(m => m.date === ds && !m.isHidden);

      if (visibleMk) {
        const isMakeup = visibleMk.isOverride !== true; // 순수 보충만 라벨
        out.push({ date: ds, dateObj: new Date(d), time: visibleMk.time, isMakeup });
      } else if (!hidden) {
        const eff = getEffectiveSchedule(student, ds);
        const t = eff.schedule[dayKey];
        if (t) out.push({ date: ds, dateObj: new Date(d), time: t, isMakeup: false });
      }
    }
    return out;
  };

  let result = collect(0, daysToSun);
  if (result.length === 0) result = collect(daysToSun, 7); // 다음 주 월~일
  return result;
};


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

const normalizeSchoolForDday = (v = "") => extractSchoolTokenForDday(v);

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
const getStudentGradeForDday = (student = {}) => {
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
const getStudentSchoolForDday = (student = {}) => {
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

const getExamStartEndForDday = (exam = {}) => {
  const start = exam.date || exam.startDate || exam.start || "";
  const end = exam.endDate || exam.end || start;
  return { start, end: end || start };
};

const getExamTargetDateForDday = (exam = {}, student = {}) => {
  const grade = getStudentGradeForDday(student);
  const gradeDate = grade && (
    exam.engDates?.[grade] ||
    exam.englishDates?.[grade] ||
    exam.gradeDates?.[grade] ||
    exam.byGrade?.[grade]
  );
  const { start } = getExamStartEndForDday(exam);
  return gradeDate || start;
};

const dateDiffDaysForDday = (targetDate) => {
  if (!targetDate) return null;
  const today = new Date(getTodayStr() + "T00:00:00");
  const target = new Date(String(targetDate).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const formatDdayLabel = (diff) => {
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

const isExamVisibleForStudentDday = (exam = {}, student = {}) => {
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

const buildStudentExamDdays = (student, exams = [], limit = 2) => {
  if (!student || !Array.isArray(exams)) return [];
  const today = getTodayStr();
  const items = exams
    .filter(exam => exam && !exam.deletedAt && isExamVisibleForStudentDday(exam, student))
    .map(exam => {
      const { start, end } = getExamStartEndForDday(exam);
      const targetDate = getExamTargetDateForDday(exam, student);
      const diff = dateDiffDaysForDday(targetDate);
      if (diff === null) return null;
      const ended = end && String(end).slice(0, 10) < today;
      if (ended) return null;
      const ongoing = start && end && String(start).slice(0, 10) <= today && today <= String(end).slice(0, 10);
      const type = String(exam.type || "");
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
        ddayLabel: ongoing && diff < 0 ? "진행 중" : formatDdayLabel(diff),
        dateLabel,
      };
    })
    .filter(Boolean);

  const nextSchoolExam = items.filter(x => x.type === "내신").sort(sortExamDdayItems)[0] || null;
  const nextMockExam = items.filter(x => x.type === "모의고사").sort(sortExamDdayItems)[0] || null;

  // 학생 화면은 복잡하지 않게 내신 1개 + 모의고사 1개만 보여준다.
  return [nextSchoolExam, nextMockExam].filter(Boolean).slice(0, limit);
};

function StudentExamDdaySection({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{
      background: "rgba(255,255,255,0.035)",
      borderRadius: 12,
      padding: "12px 14px",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2 }}>
          다가오는 시험
        </div>
        <div style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>
          내신 1 · 모의 1
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(item => {
          const isMock = item.type === "모의고사";
          const accent = isMock ? "#a78bfa" : "#34d399";
          const ddayColor = item.ongoing ? "#fde68a" : accent;
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              borderLeft: `2px solid ${accent}`,
              padding: "8px 0 8px 11px",
              minWidth: 0,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: accent,
                flexShrink: 0, letterSpacing: 0.3,
              }}>
                {item.type}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#fff",
                flex: 1, minWidth: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                letterSpacing: -0.2,
              }}>
                {item.name}
              </span>
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,0.5)",
                flexShrink: 0,
              }}>
                {item.dateLabel}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 800, color: ddayColor,
                flexShrink: 0, minWidth: 48, textAlign: "right",
                letterSpacing: -0.3,
              }}>
                {item.ddayLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── stripLabels (원장님 앱과 동일) ───
const stripLabels = (v) => v.split('\n').filter(l => !/^\s*\[(숙제|학원|학원과제)\]\s*$/.test(l)).join('\n');

// ─── 줄 맨 앞의 'ㅁ' 글자 제거 (학생 표시용 — 왼쪽에 이미 체크박스 있어서 중복) ───
const stripBox = (s) => s.replace(/^\s*ㅁ\s*/, '');

// ─── 5단계 정의 (학생용 라벨/색상/배지) ───
const STEP_DEFS = [
  { key: 'step1', label: '숙제',        color: '#e84393', bg: '#fdf2f8', badges: ['조교', '강사'] },
  { key: 'step2', label: '단어 TEST',   color: '#7c3aed', bg: '#f3e8ff', badges: ['조교'] },
  { key: 'step3', label: '오늘 수업',   color: '#1C66A5', bg: '#eef1ff', badges: ['조교', '강사'], notice: '→ 수업 준비되면 조교T 한테 말씀드리기' },
  { key: 'step4', label: '마무리 TEST', color: '#00b894', bg: '#e8f8f5', badges: ['조교'] },
  { key: 'step5', label: '받을 자료',   color: '#e67e22', bg: '#fff4e6', badges: ['강사'] },
];

// 배지 스타일 (조교: 그린, 강사: 블루)
const BADGE_STYLES = {
  '조교': { bg: '#d1fae5', fg: '#065f46' },
  '강사': { bg: '#dbeafe', fg: '#1e40af' },
};


// ─── 학생 앱 가운데 정렬 폭 (PC 대응) ───
const MAX_W = 600;

// ─── 마플영어 브랜드 컬러 (로고에서 추출) ───
const BRAND = {
  blue: "#1C66A5",      // 메인 브랜드 블루
  blueDark: "#155284",  // 진한 블루 (눌림/강조)
  blueTint: "#E7F0F8",  // 옅은 블루 배경 (선택/배지)
  ink: "#2A2A28",       // 로고 "영어" 차콜 (본문 텍스트)
};

// ─── 주간 오답 복습 규칙 ───
// "그 주(월~일)에 틀린 단어는 → 다음 주 일요일까지 끝낸다"
// 데이터 변경 없이 firstWrongAt + status(active)만으로 계산한다.
const startOfWeekMon = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();                 // 0(일)~6(토)
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); // 그 주 월요일로
  return x;
};

const computeVocabReviewWarning = (vocabWrongWords = {}) => {
  const now = new Date();
  const thisWeekStart = startOfWeekMon(now);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7); // 이번 주 일요일 자정(=다음 월요일 00:00, 미포함)

  let overdue = 0;       // 기한 지남
  let dueThisWeek = 0;   // 이번 주 안에 끝내야 함

  Object.values(vocabWrongWords || {}).forEach((month) => {
    Object.values(month?.words || {}).forEach((w) => {
      if ((w.status || "active") !== "active") return;
      if (!Array.isArray(w.correctAnswers) || w.correctAnswers.length === 0) return;
      const wrongAt = w.firstWrongAt || w.lastWrongAt;
      if (!wrongAt) return;
      const d = new Date(wrongAt);
      if (Number.isNaN(d.getTime())) return;
      // 마감(미포함) = 틀린 주의 월요일 + 14일 = 다음 주 일요일 끝
      const deadline = startOfWeekMon(d);
      deadline.setDate(deadline.getDate() + 14);
      if (deadline <= now) overdue += 1;
      else if (deadline <= thisWeekEnd) dueThisWeek += 1;
    });
  });

  const sunday = new Date(thisWeekEnd);
  sunday.setDate(sunday.getDate() - 1); // 이번 주 일요일
  const dday = Math.max(0, Math.ceil((thisWeekEnd - now) / 86400000));

  return {
    overdue,
    dueThisWeek,
    hasWarning: overdue > 0 || dueThisWeek > 0,
    sundayLabel: `${sunday.getMonth() + 1}/${sunday.getDate()}(일)`,
    dday,
  };
};

// ─── 이탈 추적 임계값 (이 시간보다 짧은 이탈은 무시 — 카톡 알림 슬쩍 보고 돌아오는 경우) ───
const MIN_AWAY_SEC = 5;
// 영상 시청 기록 자동 저장 기준: 카드를 닫지 않아도 UNIT별 기록이 남도록 보정
const VIDEO_PROGRESS_SAVE_MIN_SEC = 5;
const VIDEO_PROGRESS_AUTOSAVE_SEC = 15;


// ─── 영상 시청 기록 저장 API (Turso 원본 DB로 저장) ───
// .env 예시: VITE_VIDEO_WATCH_API_URL=https://mapl-sync-worker.yourname.workers.dev/video-watch
const VIDEO_WATCH_API_URL =
  import.meta.env.VITE_VIDEO_WATCH_API_URL ||
  import.meta.env.VITE_MAPL_SYNC_URL ||
  "";
const VIDEO_WATCH_API_KEY =
  import.meta.env.VITE_VIDEO_WATCH_API_KEY ||
  import.meta.env.VITE_MAPL_SYNC_API_KEY ||
  "";

// ─── 오답 단어 TEST 결과 저장 API ───
// 학생앱은 AI 채점을 하지 않고, 완료 기록(통과/재시험/정답률)만 Worker로 보낸다.
const VOCAB_TEST_RESULT_API_URL = (() => {
  const explicit = import.meta.env.VITE_VOCAB_TEST_RESULT_API_URL || "";
  if (explicit) return explicit;
  const base = import.meta.env.VITE_MAPL_SYNC_URL || "";
  if (!base) return "";
  return String(base).replace(/\/+$/, "") + "/vocab-test-result";
})();
const VOCAB_TEST_PENDING_KEY = "maple_pending_vocab_test_v1";
const VOCAB_PASS_MAX_WRONG_RATE = 0.10; // 오답률 10% 이하 통과 (= 정답률 90% 이상)

function judgeVocabTest(totalCount, wrongCount) {
  const total = Number(totalCount) || 0;
  const wrong = Number(wrongCount) || 0;
  if (total <= 0) return { accuracy: 100, result: "pass" };
  const accuracy = Math.round(((total - wrong) / total) * 100);
  const wrongRate = wrong / total;
  return { accuracy, result: wrongRate <= VOCAB_PASS_MAX_WRONG_RATE ? "pass" : "retest" };
}

const getPendingVocabTests = () => {
  try { return JSON.parse(localStorage.getItem(VOCAB_TEST_PENDING_KEY) || "[]"); }
  catch (e) { return []; }
};
const setPendingVocabTests = (items) => {
  try { localStorage.setItem(VOCAB_TEST_PENDING_KEY, JSON.stringify(items || [])); }
  catch (e) { /* ignore */ }
};
const makeVocabAttemptId = (studentId, monthKey) =>
  `${studentId}_${monthKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const queuePendingVocabTest = (payload) => {
  const pending = getPendingVocabTests();
  const attemptId = payload?.attemptId || `${payload?.studentId || ""}_${payload?.monthKey || ""}_${payload?.completedAt || Date.now()}`;
  if (!pending.some(x => (x.attemptId || "") === attemptId)) {
    pending.push({ ...payload, attemptId });
    setPendingVocabTests(pending.slice(-100));
  }
};

const postVocabTestResult = async (payload, { queueOnFail = true } = {}) => {
  if (!VOCAB_TEST_RESULT_API_URL) {
    if (queueOnFail) queuePendingVocabTest(payload);
    return false;
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
    const resp = await fetch(VOCAB_TEST_RESULT_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`vocab-test-result 저장 실패: ${resp.status}`);
    return true;
  } catch (e) {
    if (queueOnFail) queuePendingVocabTest(payload);
    return false;
  }
};

const flushPendingVocabTests = async () => {
  const pending = getPendingVocabTests();
  if (!pending.length || !VOCAB_TEST_RESULT_API_URL) return;
  const failed = [];
  for (const item of pending) {
    const ok = await postVocabTestResult({ ...item, _retry: true }, { queueOnFail: false });
    if (!ok) failed.push(item);
  }
  setPendingVocabTests(failed.slice(-100));
};

const clampNum = (v, min = 0, max = 21600) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
};


// ─── YouTube IFrame Player API 기반 실제 재생시간 측정 ───
// 핵심: 영상 화면을 열어둔 시간이 아니라, 플레이어가 PLAYING 상태였던 시간만 누적한다.
const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

let _youtubeIframeApiPromise = null;
const loadYouTubeIframeApi = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("window 객체가 없습니다"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (_youtubeIframeApiPromise) return _youtubeIframeApiPromise;

  _youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === "function") prevReady();
      if (window.YT && window.YT.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API 로드 실패"));
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => reject(new Error("YouTube IFrame API 스크립트를 불러오지 못했습니다"));
      document.head.appendChild(tag);
    }

    // 스크립트가 이미 있었는데 ready 콜백이 지나간 경우를 위한 보정
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(timer);
        resolve(window.YT);
      } else if (Date.now() - startedAt > 10000) {
        clearInterval(timer);
        reject(new Error("YouTube IFrame API 로드 시간 초과"));
      }
    }, 100);
  });

  return _youtubeIframeApiPromise;
};

const dispatchVideoPlayerEvent = (name, detail) => {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (e) { /* ignore */ }
};

// ─── 출석 QR 모달: 데스크에서 스캔할 개인 QR(maple-att:{id}:{token}) ───
function AttQrModal({ value, studentName, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (!window.QRCode) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
          s.onload = res; s.onerror = () => rej(new Error("qr load fail"));
          document.head.appendChild(s);
        });
      }
      if (cancelled || !ref.current || !window.QRCode) return;
      ref.current.innerHTML = "";
      new window.QRCode(ref.current, { text: value, width: 240, height: 240, correctLevel: window.QRCode.CorrectLevel.M });
    };
    render().catch(() => {});
    return () => { cancelled = true; };
  }, [value]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: "26px 26px 22px", width: "100%", maxWidth: 320, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C66A5", marginBottom: 2 }}>출석 QR</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#2A2A28", marginBottom: 16 }}>{studentName}</div>
        <div style={{ display: "flex", justifyContent: "center", padding: 10, background: "#fff", borderRadius: 14, border: "1px solid #eef0f3" }}>
          <div ref={ref} />
        </div>
        <div style={{ fontSize: 12, color: "#8b909a", marginTop: 14, lineHeight: 1.5 }}>데스크 선생님께 이 화면을 보여주세요</div>
        <button onClick={onClose} style={{ marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>닫기</button>
      </div>
    </div>
  );
}

function TrackedYoutubePlayer({ video }) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const lastPlayerTimeRef = useRef(0);
  const lastWallTimeRef = useRef(Date.now());
  const destroyedRef = useRef(false);

  const clearTickTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTickTimer = () => {
    if (timerRef.current) return;
    lastWallTimeRef.current = Date.now();
    try { lastPlayerTimeRef.current = Number(playerRef.current?.getCurrentTime?.() || 0); }
    catch (e) { lastPlayerTimeRef.current = 0; }

    timerRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || destroyedRef.current) return;

      let state = -999;
      let currentSec = 0;
      let durationSec = 0;
      try {
        state = Number(player.getPlayerState?.());
        currentSec = Number(player.getCurrentTime?.() || 0);
        durationSec = Math.round(Number(player.getDuration?.() || 0));
      } catch (e) {
        return;
      }

      const now = Date.now();
      const wallDelta = Math.max(0, (now - lastWallTimeRef.current) / 1000);
      const rawDelta = Math.max(0, currentSec - lastPlayerTimeRef.current);

      // 정상 재생은 currentTime 증가분으로 기록한다.
      // 단, 학생이 재생바를 앞으로 끌어당긴 경우 rawDelta가 과도하게 커질 수 있으므로 wallDelta 기준으로 보정한다.
      let deltaSec = 0;
      if (state === YT_STATE.PLAYING) {
        if (rawDelta <= wallDelta + 3) deltaSec = rawDelta;
        else deltaSec = Math.min(wallDelta, 3);
      }

      lastWallTimeRef.current = now;
      lastPlayerTimeRef.current = currentSec;

      if (deltaSec > 0.2) {
        dispatchVideoPlayerEvent("mapl:yt-tick", {
          videoId: String(video?.id || ""),
          deltaSec,
          currentSec,
          durationSec,
          state,
        });
      }
    }, 1000);
  };

  useEffect(() => {
    destroyedRef.current = false;
    const videoId = video?.type === "playlist" ? "" : extractYoutubeId(video?.url || "");
    const playlistId = video?.type === "playlist" ? extractPlaylistId(video?.playlistUrl || video?.url || "") : "";

    if (!mountRef.current || (!videoId && !playlistId)) return undefined;

    loadYouTubeIframeApi().then((YT) => {
      if (destroyedRef.current || !mountRef.current) return;
      const playerVars = {
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
      };
      if (playlistId) {
        playerVars.listType = "playlist";
        playerVars.list = playlistId;
      }

      playerRef.current = new YT.Player(mountRef.current, {
        width: "100%",
        height: "100%",
        videoId: videoId || undefined,
        playerVars,
        events: {
          onReady: (event) => {
            let durationSec = 0;
            try { durationSec = Math.round(Number(event.target.getDuration?.() || 0)); }
            catch (e) { durationSec = 0; }
            dispatchVideoPlayerEvent("mapl:yt-ready", {
              videoId: String(video?.id || ""),
              durationSec,
              currentSec: 0,
            });
          },
          onStateChange: (event) => {
            const state = Number(event.data);
            let durationSec = 0;
            let currentSec = 0;
            try {
              durationSec = Math.round(Number(event.target.getDuration?.() || 0));
              currentSec = Number(event.target.getCurrentTime?.() || 0);
            } catch (e) { /* ignore */ }

            dispatchVideoPlayerEvent("mapl:yt-state", {
              videoId: String(video?.id || ""),
              state,
              durationSec,
              currentSec,
            });

            if (state === YT_STATE.PLAYING) {
              lastPlayerTimeRef.current = currentSec;
              lastWallTimeRef.current = Date.now();
              startTickTimer();
            } else {
              clearTickTimer();
              lastPlayerTimeRef.current = currentSec;
              lastWallTimeRef.current = Date.now();
            }
          },
          onError: (event) => {
            dispatchVideoPlayerEvent("mapl:yt-error", {
              videoId: String(video?.id || ""),
              errorCode: event?.data,
            });
          },
        },
      });
    }).catch((e) => {
      dispatchVideoPlayerEvent("mapl:yt-error", {
        videoId: String(video?.id || ""),
        message: e?.message || "YouTube 플레이어 로드 실패",
      });
    });

    return () => {
      destroyedRef.current = true;
      clearTickTimer();
      try { playerRef.current?.destroy?.(); } catch (e) { /* ignore */ }
      playerRef.current = null;
    };
  }, [video?.id, video?.url, video?.playlistUrl, video?.type]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

const makeVideoSessionId = (studentId, videoId) =>
  `${studentId}_${videoId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const getPendingVideoWatch = () => {
  try { return JSON.parse(localStorage.getItem("pending_video_watch") || "[]"); }
  catch (e) { return []; }
};

const setPendingVideoWatch = (items) => {
  try { localStorage.setItem("pending_video_watch", JSON.stringify(items || [])); }
  catch (e) { /* ignore */ }
};

const queuePendingVideoWatch = (payload) => {
  const pending = getPendingVideoWatch();
  const sid = payload?.sessionId || `${payload?.studentId || ""}_${payload?.videoId || ""}_${payload?.timestamp || Date.now()}`;
  if (!pending.some(x => (x.sessionId || "") === sid)) {
    pending.push({ ...payload, sessionId: sid });
    setPendingVideoWatch(pending.slice(-100)); // 기기 저장소 보호용: 최근 100개만 보관
  }
};

const postVideoWatchToWorker = async (payload) => {
  if (!VIDEO_WATCH_API_URL) throw new Error("VITE_VIDEO_WATCH_API_URL이 설정되지 않았습니다");
  const headers = { "Content-Type": "application/json" };
  if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
  const resp = await fetch(VIDEO_WATCH_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(msg || `video-watch 저장 실패: ${resp.status}`);
  }
  return resp.json().catch(() => ({ success: true }));
};

const mergeVideoWatchEntry = (prev = {}, payload = {}) => {
  const sec = clampNum(payload.seconds ?? payload.watchSec ?? 0);
  const activeSec = clampNum(payload.activeSec ?? 0);
  const awaySec = clampNum(payload.awaySec ?? 0, 0, 86400);
  const awayCount = clampNum(payload.awayCount ?? 0, 0, 10000);
  const longestAwaySec = clampNum(payload.longestAwaySec ?? 0, 0, 86400);
  const durSec = clampNum(payload.durSec || prev.durSec || 720, 1, 86400);
  const watchSec = (prev.watchSec || 0) + sec;
  // 자동 저장/중간 저장 조각은 같은 시청 세션의 일부이므로 세션 수를 계속 늘리지 않는다.
  const sessionsToAdd = payload.eventType === "session" && !payload.partialSave ? 1 : 0;
  return {
    ...prev,
    title: payload.title || prev.title,
    subject: payload.subject || prev.subject,
    watchSec,
    durSec,
    pct: Math.min(100, Math.round((watchSec / durSec) * 100)),
    lastAt: payload.timestamp || new Date().toISOString(),
    sessions: (prev.sessions || 0) + sessionsToAdd,
    activeSec: (prev.activeSec || 0) + activeSec,
    awaySec: (prev.awaySec || 0) + awaySec,
    awayCount: (prev.awayCount || 0) + awayCount,
    longestAwaySec: Math.max(prev.longestAwaySec || 0, longestAwaySec),
  };
};

const applyVideoWatchLocal = (allWatch = {}, payload = {}) => {
  const sid = String(payload.studentId || "");
  const vid = String(payload.videoId || "");
  if (!sid || !vid) return allWatch || {};
  const next = { ...(allWatch || {}) };
  next[sid] = { ...(next[sid] || {}) };
  next[sid][vid] = mergeVideoWatchEntry(next[sid][vid] || {}, payload);
  return next;
};

const mergeVideoWatchSnapshots = (remote = {}, local = {}) => {
  const merged = { ...(remote || {}) };
  Object.entries(local || {}).forEach(([sid, byVideo]) => {
    merged[sid] = { ...(merged[sid] || {}) };
    Object.entries(byVideo || {}).forEach(([vid, localEntry]) => {
      const remoteEntry = merged[sid][vid];
      const remoteTime = remoteEntry?.lastAt ? new Date(remoteEntry.lastAt).getTime() : 0;
      const localTime = localEntry?.lastAt ? new Date(localEntry.lastAt).getTime() : 0;
      if (!remoteEntry || localTime > remoteTime || (localEntry.watchSec || 0) > (remoteEntry.watchSec || 0)) {
        merged[sid][vid] = localEntry;
      }
    });
  });
  return merged;
};

// ─── todo → 단계별 그룹 ───
// 원장앱과 동일한 내용 기반 item.key를 만든다.
// 단, 예전 학생앱 체크값(hw_0/ac_0)도 fallback으로 읽을 수 있게 legacyKey를 같이 보관한다.
const TODO_SECTION_RE = /^\s*\[(숙제|학원|학원과제)\]\s*$/;
const TODO_LESSON_PREFIX_RE = /^수업\s*-\s*/i;
const EMPTY_STEPS5 = { step1: "", step2: "", step3: "", step4: "", step5: "" };

const cleanTodoText = (v = "") => String(v).replace(/^[\s□☐●·\-]*/, "").trim();
const makeItemKey = (type, text, seen) => {
  const slug = String(text || "").replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 20) || "item";
  let key = `${type}_${slug}`;
  let n = 1;
  while (seen.has(key)) { n++; key = `${type}_${slug}${n}`; }
  seen.add(key);
  return key;
};

const parseTodoLine = (line) => {
  const normalized = cleanTodoText(line);
  if (!normalized) return null;
  const parts = normalized.split(/\s*(?:->|→)\s*/).map(cleanTodoText).filter(Boolean);
  if (parts.length === 0) return null;

  let homework = "", academy = "", lesson = "";
  const last = parts[parts.length - 1] || "";
  const hasLesson = TODO_LESSON_PREFIX_RE.test(last);

  if (parts.length === 1) {
    academy = parts[0];
  } else if (parts.length === 2 && hasLesson) {
    homework = parts[0];
    academy = parts[0];
    lesson = last.replace(TODO_LESSON_PREFIX_RE, "").trim();
  } else if (parts.length === 2 && !hasLesson) {
    homework = parts[0];
    academy = parts[1];
  } else if (parts.length >= 3 && hasLesson) {
    homework = parts[0];
    academy = parts.slice(1, -1).join(" / ");
    lesson = last.replace(TODO_LESSON_PREFIX_RE, "").trim();
  } else {
    homework = parts[0];
    academy = parts.slice(1).join(" / ");
  }

  return { raw: normalized, homework, academy, lesson };
};

const normalizeVocabTestLine = (line) => {
  const original = String(line ?? "");
  if (!original.trim()) return original;
  const prefixMatch = original.match(/^(\s*(?:[□☐●·\-]\s*)?)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";
  const core = original.slice(prefix.length).trim();
  if (!core) return original;
  const m = core.match(/^(.+?)\s+((?:\d+\s*(?:[,，]|\s)\s*)*\d+)\s*(?:TEST|test|Test|테스트)?\s*$/i);
  if (!m) return original;
  const book = (m[1] || "").trim();
  const nums = (m[2] || "").match(/\d+/g) || [];
  if (!book || nums.length === 0) return original;
  return `${prefix}${book} ${nums.join(", ")} TEST`;
};
const normalizeVocabTestText = (text) => String(text || "").split("\n").map(normalizeVocabTestLine).join("\n");
const normalizeSteps5 = (steps5) => {
  const s = { ...EMPTY_STEPS5, ...(steps5 || {}) };
  return { ...s, step2: normalizeVocabTestText(s.step2) };
};

const splitTodoLines = (txt) => String(txt || "")
  .split("\n")
  .map(cleanTodoText)
  .filter(l => l && !TODO_SECTION_RE.test(l));

const buildTodoFlow = (homework = "", academy = "") => {
  const seen = new Set();
  const homeworkItems = [];
  const academyItems = [];

  splitTodoLines(homework).forEach(line => {
    const parsed = parseTodoLine(line);
    if (!parsed) return;
    if (parsed.homework) {
      homeworkItems.push({ key: makeItemKey("hw", parsed.homework, seen), text: parsed.homework });
      if (parsed.academy) academyItems.push({ key: makeItemKey("ac", parsed.academy, seen), text: parsed.academy, lesson: parsed.lesson || "" });
      else if (parsed.lesson) academyItems.push({ key: makeItemKey("ac", `수업${parsed.lesson}`, seen), text: `수업-${parsed.lesson}`, lesson: "", isDirectLesson: true });
    } else {
      homeworkItems.push({ key: makeItemKey("hw", line, seen), text: line });
    }
  });

  splitTodoLines(academy).forEach(line => {
    const cleaned = cleanTodoText(line);
    if (!cleaned) return;
    const arrowParts = cleaned.split(/\s*(?:->|→)\s*/);
    const last = arrowParts[arrowParts.length - 1] || "";
    const hasLesson = arrowParts.length >= 2 && TODO_LESSON_PREFIX_RE.test(last);
    if (hasLesson) {
      const lesson = last.replace(TODO_LESSON_PREFIX_RE, "").trim();
      const text = arrowParts.slice(0, -1).join(" / ").trim();
      academyItems.push({ key: makeItemKey("ac", text, seen), text, lesson });
    } else if (TODO_LESSON_PREFIX_RE.test(cleaned)) {
      const lesson = cleaned.replace(TODO_LESSON_PREFIX_RE, "").trim();
      academyItems.push({ key: makeItemKey("ac", `수업${lesson}`, seen), text: `수업-${lesson}`, lesson: "", isDirectLesson: true });
    } else {
      academyItems.push({ key: makeItemKey("ac", cleaned, seen), text: cleaned, lesson: "" });
    }
  });

  academyItems.sort((a, b) => { const ad = /배포/.test(a.text); const bd = /배포/.test(b.text); return ad === bd ? 0 : ad ? 1 : -1; });
  return { homeworkItems, academyItems };
};

const buildSteps5FromLegacy = (homework, academy) => {
  const flow = buildTodoFlow(homework || "", academy || "");
  const result = { ...EMPTY_STEPS5 };
  result.step1 = (flow.homeworkItems || []).map(it => it.text).join("\n");
  const buckets = { step2: [], step3: [], step4: [], step5: [] };
  (flow.academyItems || []).forEach(item => {
    const t = item.text || "";
    let key;
    if (/배포/.test(t)) key = "step5";
    else if (/빈칸|픽스노트/.test(t)) key = "step4";
    else if (/단어|어휘/.test(t)) key = "step2";
    else key = "step3";
    const line = item.lesson ? `${t} → 수업-${item.lesson}` : t;
    buckets[key].push(line);
  });
  result.step2 = buckets.step2.join("\n");
  result.step3 = buckets.step3.join("\n");
  result.step4 = buckets.step4.join("\n");
  result.step5 = buckets.step5.join("\n");
  return result;
};


const buildStepGroups = (todo) => {
  if (!todo) return [];
  const steps5 = normalizeSteps5(todo.steps5 || buildSteps5FromLegacy(todo.homework || "", todo.academy || ""));
  const seen = new Set();
  let hwIdx = 0;
  let acIdx = 0;

  return STEP_DEFS.map(def => {
    const type = def.key === "step1" ? "hw" : "ac";
    // 원장앱 체크 저장 키와 맞추기 위해 각 step 안에서 0부터 다시 센다.
    // 예: step1_0, step3_1
    let stableIndex = 0;
    const items = String(steps5[def.key] || "")
      .split("\n")
      .map(line => {
        const raw = cleanTodoText(line);
        if (!raw) return null;
        const parsed = parseTodoLine(raw) || { raw };
        let keyText;
        let lesson = parsed.lesson || "";
        if (lesson) {
          keyText = type === "hw"
            ? (parsed.homework || parsed.academy || parsed.raw || raw)
            : (parsed.academy || parsed.homework || parsed.raw || raw);
        } else {
          keyText = parsed.raw || raw;
        }
        keyText = cleanTodoText(keyText);
        if (!keyText) return null;
        const idx = type === "hw" ? hwIdx++ : acIdx++;
        const stableKey = `${def.key}_${stableIndex}`;
        stableIndex += 1;
        const itemKey = makeItemKey(type, keyText, seen);
        const legacyKey = `${type}_${idx}`;
        return {
          key: itemKey,
          legacyKey,
          stableKey,
          text: lesson ? `${stripBox(keyText)} → 수업-${lesson}` : stripBox(keyText),
          type,
          idx,
          lesson,
          _sourceStep: def.key,
        };
      })
      .filter(Boolean);
    return { ...def, items };
  });
};

// ─── Main App ───
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [student, setStudent] = useState(null);
  const [todos, setTodos] = useState({});
  const [checklistData, setChecklistData] = useState({});
  const [records, setRecords] = useState({});
  const [videos, setVideos] = useState([]);
  const [makeups, setMakeups] = useState([]);
  const [customHolidays, setCustomHolidays] = useState({});
  const [exams, setExams] = useState([]);
  const [vocabWrongWords, setVocabWrongWords] = useState({});
  const [tab, setTab] = useState("tasks");
  const [showAttQr, setShowAttQr] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingVideo, setViewingVideo] = useState(null);
  const [viewStartTime, setViewStartTime] = useState(null);
  const [videoWatch, setVideoWatch] = useState({});
  const [selectedVideoBook, setSelectedVideoBook] = useState(null); // 영상 탭 책별 sub-tab 선택값 (null이면 첫 책 자동)
  const [pendingVideoCount, setPendingVideoCount] = useState(() => getPendingVideoWatch().length); // 저장 실패/대기 기록 개수
  const [lastVideoSaveStatus, setLastVideoSaveStatus] = useState(""); // 최근 영상 기록 저장 상태 표시
  const [refreshing, setRefreshing] = useState(false); // 수동 새로고침 상태
  const [syncSource, setSyncSource] = useState(""); // worker
  const [lastLoadedAt, setLastLoadedAt] = useState(null); // 마지막 동기화 시각
  const [offlineNotice, setOfflineNotice] = useState(""); // Worker 실패 시 로컬 백업 표시 안내
  const loadInFlightRef = useRef(false); // 30초 polling 중복 호출 방지

  // 이탈 추적용 ref (state로 안 쓰는 이유: 매 visibilitychange마다 리렌더 안 시키기 위함)
  const awayStartRef = useRef(null);   // 영상 재생 중 이탈 시작 시각(Date.now() 또는 null)
  const activeSecRef = useRef(0);      // 실제 재생 + 화면 활성 상태였던 시간
  const awaySecRef = useRef(0);        // 실제 재생 중 이탈 시간(5초+ 만)
  const awayCountRef = useRef(0);      // 실제 재생 중 이탈 횟수(5초+ 만)
  const longestAwayRef = useRef(0);    // 가장 길었던 이탈(초)
  const lastActiveAtRef = useRef(null); // 구버전 호환용: 새 방식에서는 직접 누적하지 않음
  const currentSessionIdRef = useRef(null); // 현재 열려 있는 영상 세션 ID(중복 저장 방지용)
  const ytPlaySecRef = useRef(0);      // YouTube PLAYING 상태에서만 누적한 실제 재생시간
  const ytFocusSecRef = useRef(0);     // PLAYING + 학생앱 화면이 보이는 시간
  const ytDurationSecRef = useRef(0);  // YouTube 플레이어가 알려준 실제 영상 길이
  const ytPlayerStateRef = useRef(null); // 마지막 YouTube 플레이어 상태값
  const lastSavedPlaySecRef = useRef(0);   // Worker/대기열에 이미 반영한 실제 재생시간
  const lastSavedFocusSecRef = useRef(0);  // Worker/대기열에 이미 반영한 화면 활성 재생시간
  const lastSavedAwaySecRef = useRef(0);   // Worker/대기열에 이미 반영한 이탈 시간
  const lastSavedAwayCountRef = useRef(0); // Worker/대기열에 이미 반영한 이탈 횟수
  const videoSaveChunkSeqRef = useRef(0);  // 자동 저장 조각 ID 충돌 방지
  const videoSaveInFlightRef = useRef(false); // 자동 저장 중복 호출 방지

  const keepPrevIfUnexpectedEmpty = (prev, next, label) => {
    const prevCount = Array.isArray(prev) ? prev.length : Object.keys(prev || {}).length;
    const nextCount = Array.isArray(next) ? next.length : Object.keys(next || {}).length;
    if (prevCount > 0 && nextCount === 0) {
      console.warn(`[guard] ${label} 빈 응답 무시 (prev 보존)`);
      return prev;
    }
    return next;
  };

  const applyBundle = (bundle) => {
    if (!bundle?.student) return;
    setStudent(bundle.student);
    setTodos(prev => keepPrevIfUnexpectedEmpty(prev, bundle.todos || {}, "todos"));
    setChecklistData(prev => keepPrevIfUnexpectedEmpty(prev, bundle.checklistData || {}, "checklistData"));
    setRecords(prev => keepPrevIfUnexpectedEmpty(prev, bundle.records || {}, "records"));
    setVideos(prev => keepPrevIfUnexpectedEmpty(prev, bundle.videos || [], "videos"));
    setVideoWatch(prev => mergeVideoWatchSnapshots(bundle.videoWatch || {}, prev || {}));
    setMakeups(bundle.makeups || []);
    setCustomHolidays(bundle.customHolidays || {});
    setExams(Array.isArray(bundle.exams || bundle.exam3) ? (bundle.exams || bundle.exam3) : []);
    setVocabWrongWords(prev => keepPrevIfUnexpectedEmpty(prev, bundle.vocabWrongWords || {}, "vocabWrongWords"));
    setSyncSource(bundle.source || "");
    setOfflineNotice(bundle.source === "local-backup" ? "동기화 서버 연결 실패로 최근 백업 데이터를 표시 중입니다." : "");
    setLastLoadedAt(new Date());
  };

  const loadData = async ({ manual = false } = {}) => {
    if (!studentId) { setLoading(false); return; }
    if (loadInFlightRef.current) {
      if (manual) setRefreshing(false);
      return;
    }
    loadInFlightRef.current = true;
    if (manual) setRefreshing(true);
    try {
      const bundle = await loadStudentBundle(studentId);
      if (!bundle || !bundle.student) {
        setError("not_found");
        return;
      }
      applyBundle(bundle);
      saveStudentBundleToLocal(studentId, bundle);
      setError(null);
    } catch (e) {
      console.error("Load error:", e);
      const localBundle = restoreStudentBundleFromLocal(studentId);
      if (localBundle) {
        applyBundle(localBundle);
        setError(null);
      } else {
        setError("load_error");
      }
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 30000);
    return () => clearInterval(interval);
  }, [studentId]);

  const finishAwayMeasurement = () => {
    if (!awayStartRef.current) return;
    const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
    if (awayDur >= MIN_AWAY_SEC) {
      awaySecRef.current += awayDur;
      awayCountRef.current += 1;
      if (awayDur > longestAwayRef.current) longestAwayRef.current = awayDur;
    }
    awayStartRef.current = null;
    try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
  };

  const startAwayMeasurementIfPlaying = () => {
    if (ytPlayerStateRef.current !== YT_STATE.PLAYING) return;
    if (awayStartRef.current) return;
    awayStartRef.current = Date.now();
    try {
      localStorage.setItem("pending_away", JSON.stringify({
        studentId,
        videoId: viewingVideo?.id,
        title: viewingVideo?.title,
        awayStartedAt: awayStartRef.current,
      }));
    } catch (e) { /* ignore */ }
  };

  // 인라인 확장 토글: 같은 카드 클릭 → 닫기 / 다른 카드 클릭 → 이전 닫고 새로 열기
  const toggleVideo = async (video) => {
    const sameVideo = viewingVideo?.id === video.id;
    if (viewingVideo) {
      await closeVideo(); // 이전 영상 실제 재생시간 저장하면서 닫기
    }
    if (!sameVideo) {
      // 실제 재생시간/이탈 추적 ref 초기화
      awayStartRef.current = null;
      activeSecRef.current = 0;
      awaySecRef.current = 0;
      awayCountRef.current = 0;
      longestAwayRef.current = 0;
      lastActiveAtRef.current = null;
      ytPlaySecRef.current = 0;
      ytFocusSecRef.current = 0;
      ytDurationSecRef.current = Number(video?.durSec || 0) || 0;
      ytPlayerStateRef.current = null;
      lastSavedPlaySecRef.current = 0;
      lastSavedFocusSecRef.current = 0;
      lastSavedAwaySecRef.current = 0;
      lastSavedAwayCountRef.current = 0;
      videoSaveChunkSeqRef.current = 0;
      videoSaveInFlightRef.current = false;
      currentSessionIdRef.current = makeVideoSessionId(studentId, video.id);
      setViewingVideo(video);
      setViewStartTime(Date.now());
      setLastVideoSaveStatus("재생 버튼을 누르면 실제 재생시간만 기록됩니다");
    }
  };

  const saveCurrentVideoProgress = async ({ reason = "manual", minDeltaSec = 1, partialSave = true } = {}) => {
    if (!viewingVideo || !viewStartTime) return false;
    if (videoSaveInFlightRef.current) return false;

    const totalPlaySec = Math.round(ytPlaySecRef.current);
    const totalFocusSec = Math.round(ytFocusSecRef.current);
    const totalAwaySec = Math.round(awaySecRef.current);
    const totalAwayCount = Math.round(awayCountRef.current);
    const longestAway = Math.round(longestAwayRef.current);
    const deltaPlaySec = Math.max(0, totalPlaySec - lastSavedPlaySecRef.current);
    const deltaFocusSec = Math.max(0, totalFocusSec - lastSavedFocusSecRef.current);
    const deltaAwaySec = Math.max(0, totalAwaySec - lastSavedAwaySecRef.current);
    const deltaAwayCount = Math.max(0, totalAwayCount - lastSavedAwayCountRef.current);

    if (deltaPlaySec < minDeltaSec && deltaAwaySec <= 0) return false;

    const rootSessionId = currentSessionIdRef.current || makeVideoSessionId(studentId, viewingVideo.id);
    currentSessionIdRef.current = rootSessionId;
    const chunkSeq = videoSaveChunkSeqRef.current + 1;
    const timestamp = new Date().toISOString();
    const payload = {
      eventType: "session",
      sessionId: `${rootSessionId}_${reason}_${chunkSeq}`,
      rootSessionId,
      studentId: String(studentId),
      videoId: String(viewingVideo.id),
      title: viewingVideo.title || "",
      subject: viewingVideo.subject || "",
      url: viewingVideo.url || viewingVideo.playlistUrl || "",
      videoType: viewingVideo.type || "video",
      seconds: clampNum(deltaPlaySec),
      activeSec: clampNum(deltaFocusSec),
      awaySec: clampNum(deltaAwaySec, 0, 86400),
      awayCount: clampNum(deltaAwayCount, 0, 10000),
      longestAwaySec: clampNum(longestAway, 0, 86400),
      durSec: clampNum(ytDurationSecRef.current || viewingVideo.durSec || 720, 1, 86400),
      date: getTodayStr(),
      timestamp,
      source: `student_app_youtube_iframe_api_${reason}`,
      openSec: clampNum(Math.round((Date.now() - viewStartTime) / 1000), 0, 86400),
      partialSave,
    };

    videoSaveInFlightRef.current = true;
    try {
      await postVideoWatchToWorker(payload);
      if (reason === "autosave") setLastVideoSaveStatus("시청 중 자동 저장됨");
      else if (reason === "pause") setLastVideoSaveStatus("일시정지 시점까지 저장 완료");
      else if (reason === "ended") setLastVideoSaveStatus("영상 종료 시점까지 저장 완료");
      else if (reason === "hidden") setLastVideoSaveStatus("앱을 나가기 전 시청 기록 저장 완료");
      else setLastVideoSaveStatus("실제 재생시간 기준으로 영상 기록 저장 완료");
    } catch (e) {
      console.error("video-watch Worker 저장 실패, 로컬 대기열에 보관:", e);
      queuePendingVideoWatch(payload);
      setPendingVideoCount(getPendingVideoWatch().length);
      setLastVideoSaveStatus("저장 대기 중");
    } finally {
      videoSaveInFlightRef.current = false;
    }

    videoSaveChunkSeqRef.current = chunkSeq;
    lastSavedPlaySecRef.current = totalPlaySec;
    lastSavedFocusSecRef.current = totalFocusSec;
    lastSavedAwaySecRef.current = totalAwaySec;
    lastSavedAwayCountRef.current = totalAwayCount;
    setVideoWatch(prev => applyVideoWatchLocal(prev || {}, payload));
    return true;
  };

  // YouTube 플레이어 이벤트 수신: 실제 PLAYING 시간만 누적
  useEffect(() => {
    const isCurrentVideo = (detail) => viewingVideo && String(detail?.videoId || "") === String(viewingVideo.id);

    const handleReady = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      if (detail.durationSec) ytDurationSecRef.current = detail.durationSec;
    };

    const handleState = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      ytPlayerStateRef.current = Number(detail.state);
      if (detail.durationSec) ytDurationSecRef.current = detail.durationSec;

      if (ytPlayerStateRef.current === YT_STATE.PLAYING) {
        if (document.hidden) startAwayMeasurementIfPlaying();
        else finishAwayMeasurement();
      } else {
        finishAwayMeasurement();
        if (ytPlayerStateRef.current === YT_STATE.PAUSED) {
          saveCurrentVideoProgress({ reason: "pause", minDeltaSec: VIDEO_PROGRESS_SAVE_MIN_SEC, partialSave: true });
        }
        if (ytPlayerStateRef.current === YT_STATE.ENDED) {
          saveCurrentVideoProgress({ reason: "ended", minDeltaSec: 1, partialSave: false });
        }
      }
    };

    const handleTick = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      const deltaSec = Math.max(0, Math.min(3600, Number(detail.deltaSec) || 0));
      if (deltaSec <= 0) return;
      ytPlaySecRef.current += deltaSec;
      if (!document.hidden) ytFocusSecRef.current += deltaSec;
      if (detail.durationSec) ytDurationSecRef.current = detail.durationSec;

      const unsavedPlaySec = Math.round(ytPlaySecRef.current - lastSavedPlaySecRef.current);
      if (!document.hidden && unsavedPlaySec >= VIDEO_PROGRESS_AUTOSAVE_SEC) {
        saveCurrentVideoProgress({ reason: "autosave", minDeltaSec: VIDEO_PROGRESS_AUTOSAVE_SEC, partialSave: true });
      }
    };

    const handleError = (event) => {
      const detail = event.detail || {};
      if (!isCurrentVideo(detail)) return;
      setLastVideoSaveStatus("유튜브 플레이어를 불러오지 못했습니다. 영상 링크를 확인해 주세요.");
    };

    window.addEventListener("mapl:yt-ready", handleReady);
    window.addEventListener("mapl:yt-state", handleState);
    window.addEventListener("mapl:yt-tick", handleTick);
    window.addEventListener("mapl:yt-error", handleError);
    return () => {
      window.removeEventListener("mapl:yt-ready", handleReady);
      window.removeEventListener("mapl:yt-state", handleState);
      window.removeEventListener("mapl:yt-tick", handleTick);
      window.removeEventListener("mapl:yt-error", handleError);
    };
  }, [viewingVideo, studentId]);

  const closeVideo = async () => {
    if (viewingVideo && viewStartTime) {
      finishAwayMeasurement();
      const saved = await saveCurrentVideoProgress({ reason: "close", minDeltaSec: 1, partialSave: false });
      if (!saved) {
        const totalPlaySec = Math.round(ytPlaySecRef.current);
        if (totalPlaySec > 0) setLastVideoSaveStatus("이미 자동 저장된 시청 기록입니다");
        else setLastVideoSaveStatus("재생한 시간이 없어 시청 기록을 저장하지 않았습니다");
      }
      try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
    }

    // ref 초기화
    awayStartRef.current = null;
    activeSecRef.current = 0;
    awaySecRef.current = 0;
    awayCountRef.current = 0;
    longestAwayRef.current = 0;
    lastActiveAtRef.current = null;
    ytPlaySecRef.current = 0;
    ytFocusSecRef.current = 0;
    ytDurationSecRef.current = 0;
    ytPlayerStateRef.current = null;
    lastSavedPlaySecRef.current = 0;
    lastSavedFocusSecRef.current = 0;
    lastSavedAwaySecRef.current = 0;
    lastSavedAwayCountRef.current = 0;
    videoSaveChunkSeqRef.current = 0;
    videoSaveInFlightRef.current = false;
    currentSessionIdRef.current = null;
    setViewingVideo(null);
    setViewStartTime(null);
  };

  // ─── 이탈 추적: 영상이 실제 재생 중일 때 다른 앱/탭으로 나간 시간만 측정 ───
  // (visibilitychange 이벤트는 iOS/Android/PC 모두 지원하는 표준 API)
  useEffect(() => {
    if (!viewingVideo) return;

    const handleVisibility = () => {
      if (document.hidden) {
        saveCurrentVideoProgress({ reason: "hidden", minDeltaSec: VIDEO_PROGRESS_SAVE_MIN_SEC, partialSave: true });
        startAwayMeasurementIfPlaying();
      } else {
        finishAwayMeasurement();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [viewingVideo, studentId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (viewingVideo && viewStartTime) {
        let finalAway = awaySecRef.current;
        let finalAwayCount = awayCountRef.current;
        let finalLongestAway = longestAwayRef.current;
        if (awayStartRef.current) {
          const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
          if (awayDur >= MIN_AWAY_SEC) {
            finalAway += awayDur;
            finalAwayCount += 1;
            if (awayDur > finalLongestAway) finalLongestAway = awayDur;
          }
        }

        const actualWatchSec = Math.round(ytPlaySecRef.current);
        const focusSec = Math.round(ytFocusSecRef.current);
        const unsavedWatchSec = Math.max(0, actualWatchSec - lastSavedPlaySecRef.current);
        const unsavedFocusSec = Math.max(0, focusSec - lastSavedFocusSecRef.current);
        const unsavedAwaySec = Math.max(0, finalAway - lastSavedAwaySecRef.current);
        const unsavedAwayCount = Math.max(0, finalAwayCount - lastSavedAwayCountRef.current);
        if (unsavedWatchSec <= 0 && unsavedAwaySec <= 0) return;

        const rootSessionId = currentSessionIdRef.current || makeVideoSessionId(studentId, viewingVideo.id);
        const payload = {
          eventType: "session",
          sessionId: `${rootSessionId}_beforeunload_${videoSaveChunkSeqRef.current + 1}`,
          rootSessionId,
          studentId: String(studentId),
          videoId: String(viewingVideo.id),
          title: viewingVideo.title || "",
          subject: viewingVideo.subject || "",
          url: viewingVideo.url || viewingVideo.playlistUrl || "",
          videoType: viewingVideo.type || "video",
          seconds: clampNum(unsavedWatchSec),
          activeSec: clampNum(unsavedFocusSec),
          awaySec: clampNum(unsavedAwaySec, 0, 86400),
          awayCount: clampNum(unsavedAwayCount, 0, 10000),
          longestAwaySec: clampNum(finalLongestAway, 0, 86400),
          durSec: clampNum(ytDurationSecRef.current || viewingVideo.durSec || 720, 1, 86400),
          date: getTodayStr(),
          timestamp: new Date().toISOString(),
          source: "student_app_youtube_iframe_api_beforeunload",
          openSec: clampNum(Math.round((Date.now() - viewStartTime) / 1000), 0, 86400),
          partialSave: true,
        };

        // beforeunload에서는 async fetch를 기다릴 수 없으므로 로컬 대기열에 저장 후 다음 접속 때 Worker로 전송
        queuePendingVideoWatch(payload);
        try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [viewingVideo, viewStartTime, studentId]);

  useEffect(() => {
    const flush = async () => {
      try {
        // 1) pending_away 고아 데이터 복구: 앱이 이탈 상태에서 강제 종료된 경우, 다음 접속 때 이탈 기록만 Worker로 보냄
        try {
          const orphanAway = JSON.parse(localStorage.getItem("pending_away") || "null");
          if (orphanAway && orphanAway.awayStartedAt && orphanAway.studentId && orphanAway.videoId) {
            const awayDur = Math.round((Date.now() - orphanAway.awayStartedAt) / 1000);
            const MAX_REALISTIC_AWAY = 86400; // 24h
            if (awayDur >= MIN_AWAY_SEC && awayDur < MAX_REALISTIC_AWAY) {
              queuePendingVideoWatch({
                eventType: "away",
                sessionId: makeVideoSessionId(orphanAway.studentId, orphanAway.videoId) + "_away",
                studentId: String(orphanAway.studentId),
                videoId: String(orphanAway.videoId),
                title: orphanAway.title || "",
                seconds: 0,
                activeSec: 0,
                awaySec: awayDur,
                awayCount: 1,
                longestAwaySec: awayDur,
                date: getTodayStr(),
                timestamp: new Date().toISOString(),
                source: "student_app_orphan_away",
              });
            }
          }
          localStorage.removeItem("pending_away");
        } catch (e) { /* ignore */ }

        // 2) 구버전 pending_vtime → 새 Worker 대기열로 이관
        try {
          const legacyPending = JSON.parse(localStorage.getItem("pending_vtime") || "[]");
          legacyPending.forEach(item => {
            queuePendingVideoWatch({
              eventType: "session",
              sessionId: item.sessionId || makeVideoSessionId(item.studentId, item.videoId),
              studentId: String(item.studentId),
              videoId: String(item.videoId),
              title: item.title || "",
              seconds: clampNum(item.seconds || 0),
              activeSec: clampNum(item.activeSec || 0),
              awaySec: clampNum(item.awaySec || 0, 0, 86400),
              awayCount: clampNum(item.awayCount || 0, 0, 10000),
              longestAwaySec: clampNum(item.longestAwaySec || 0, 0, 86400),
              durSec: item.durSec || 720,
              date: item.date || getTodayStr(),
              timestamp: item.timestamp || new Date().toISOString(),
              source: "legacy_pending_vtime",
            });
          });
          if (legacyPending.length > 0) localStorage.removeItem("pending_vtime");
        } catch (e) { /* ignore */ }

        // 3) 오답 단어 TEST 결과 대기열도 함께 재전송
        await flushPendingVocabTests();

        // 4) 새 영상 대기열을 Worker로 순차 전송. 실패한 항목만 다시 보관.
        const pending = getPendingVideoWatch();
        setPendingVideoCount(pending.length);
        if (pending.length === 0) return;
        const failed = [];
        for (const item of pending) {
          try {
            await postVideoWatchToWorker(item);
            setVideoWatch(prev => applyVideoWatchLocal(prev || {}, item));
          } catch (e) {
            failed.push(item);
          }
        }
        setPendingVideoWatch(failed.slice(-100));
        setPendingVideoCount(failed.length);
        setLastVideoSaveStatus(failed.length > 0 ? `저장 대기 ${failed.length}개` : "대기 기록 전송 완료");
      } catch (e) { /* ignore */ }
    };
    flush();
    const pendingTimer = setInterval(() => setPendingVideoCount(getPendingVideoWatch().length), 5000);
    return () => clearInterval(pendingTimer);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#1C66A5", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 14, color: "#999" }}>불러오는 중...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>링크를 확인해주세요</div>
          <div style={{ fontSize: 14, color: "#999", lineHeight: 1.6 }}>선생님이 보내주신 링크로<br />접속해주세요</div>
        </div>
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>학생 정보를 찾을 수 없어요</div>
          <div style={{ fontSize: 14, color: "#999", lineHeight: 1.6 }}>링크가 올바른지 선생님께<br />다시 확인해주세요</div>
          <div style={{ fontSize: 12, color: "#ccc", marginTop: 16 }}>ID: {studentId}</div>
        </div>
      </div>
    );
  }

  if (error === "load_error") {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>연결 오류</div>
          <div style={{ fontSize: 14, color: "#999", marginBottom: 20 }}>잠시 후 다시 시도해주세요</div>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>다시 시도</button>
        </div>
      </div>
    );
  }

  if (!student) return null;

  const sRec = records[studentId] || records[Number(studentId)] || {};
  const pinnedMessages = Object.entries(sRec)
    .filter(([, v]) => v && v.pinned)
    .sort(([a], [b]) => b.localeCompare(a));

  // allDates: homework/academy 또는 steps5 중 하나라도 데이터가 있는 날짜
  const allDates = Object.keys(todos)
    .filter((d) => {
      const t = todos[d]?.[studentId] || todos[d]?.[Number(studentId)];
      if (!t) return false;
      const hw = stripLabels(t.homework || "").trim();
      const ac = stripLabels(t.academy || "").trim();
      const hasSteps5 = t.steps5 && Object.values(t.steps5).some(v => (v || "").trim());
      return hw || ac || hasSteps5;
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3);

  const activeDate = selectedDate || allDates[0] || getTodayStr();
  const todo = todos[activeDate]?.[studentId] || todos[activeDate]?.[Number(studentId)] || {};

  // 5단계 그룹
  // 빈 단계도 "오늘 없음"으로 보여줘 학생이 전체 학습 흐름을 확인할 수 있게 한다.
  const stepGroups = buildStepGroups(todo);

  const chk = checklistData[activeDate]?.[studentId] || checklistData[activeDate]?.[Number(studentId)] || {};
  // 어드민과 동일한 3-상태 모델: undefined/false → none, true/"done" → done, "fail:사유..." → fail
  // 원장앱은 stableKey(step1_0, step3_1)를 우선 저장 키로 쓰므로 학생앱도 stableKey부터 조회한다.
  const TODO_CHECK_CLEAR_VALUE = "__todo_clear__";
  const getCheckValue = (itemOrType, idx) => {
    const candidates = [];
    if (itemOrType && typeof itemOrType === "object") {
      if (itemOrType.stableKey) candidates.push(itemOrType.stableKey);
      if (itemOrType.key) candidates.push(itemOrType.key);
      if (itemOrType.legacyKey) candidates.push(itemOrType.legacyKey);
      if (itemOrType.type && itemOrType.idx !== undefined) candidates.push(`${itemOrType.type}_${itemOrType.idx}`);
    } else if (itemOrType) {
      candidates.push(`${itemOrType}_${idx}`);
    }
    for (const key of [...new Set(candidates)]) {
      if (!Object.prototype.hasOwnProperty.call(chk, key)) continue;
      const value = chk[key];
      // 원장앱에서 명시적 미체크로 저장한 센티널이면 구버전 fallback을 더 보지 않는다.
      if (value === TODO_CHECK_CLEAR_VALUE) return undefined;
      if (value !== false && value !== null && value !== undefined && value !== "") return value;
    }
    return undefined;
  };
  const getCheckStatus = (itemOrType, idx) => {
    const val = getCheckValue(itemOrType, idx);
    if (!val) return "none";
    if (val === true || val === "done") return "done";
    if (typeof val === "string" && val.startsWith("fail:")) return "fail";
    return "done";
  };
  const getFailReason = (itemOrType, idx) => {
    const val = getCheckValue(itemOrType, idx);
    if (typeof val === "string" && val.startsWith("fail:")) return val.slice(5);
    return "";
  };
  const isChecked = (itemOrType, idx) => getCheckStatus(itemOrType, idx) === "done";
  const isFailed = (itemOrType, idx) => getCheckStatus(itemOrType, idx) === "fail";

  // 진행률: 모든 step의 모든 item 합산
  const allItems = stepGroups.flatMap(s => s.items);
  // 미완료(fail) 항목은 진행률 계산에서 완전히 제외 (분모/분자 둘 다 빠짐)
  const countableItems = allItems.filter(item => !isFailed(item));
  const totalTasks = countableItems.length;
  const doneTasks = countableItems.filter(item => isChecked(item)).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const studentVideos = videos.filter(v => !v.studentId || String(v.studentId) === String(studentId));
  const hasVocabWrong = Object.values(vocabWrongWords || {}).some(m =>
    Object.values(m?.words || {}).some(w => (w.status || "active") === "active" && Array.isArray(w.correctAnswers) && w.correctAnswers.length > 0)
  );

  // 주간 오답 복습 경고 (지난주 틀린 단어 이번 주 마감 / 기한 초과)
  const vocabWarn = computeVocabReviewWarning(vocabWrongWords);

  // 다가올 등원일 텍스트 (헤더 표시용)
  const upcomingAtt = computeUpcomingAttendance(student, makeups, customHolidays);
  const upcomingAttText = upcomingAtt
    .map(a => `${fmtAttDay(a.dateObj)} ${fmtTime(a.time)}${a.isMakeup ? " (보충)" : ""}`)
    .join(", ");
  const examDdays = buildStudentExamDdays(student, exams, 2);

  const F = "'Pretendard Variable', -apple-system, sans-serif";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", fontFamily: F }}>
      <div style={{ background: BRAND.blue, padding: "20px 24px 24px", color: "#fff" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {/* 브랜드 로고 락업 */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 19, border: "2px solid rgba(255,255,255,0.6)", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: -0.5 }}>MP</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>마플영어</span>
          <button onClick={() => setShowAttQr(true)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <span style={{ fontSize: 13 }}>▦</span> 출석 QR
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          {/* 아바타 + 코너 브래킷 (로고 시그니처) */}
          <div style={{ position: "relative", width: 48, height: 48, flexShrink: 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, border: "1px solid rgba(255,255,255,0.12)" }}>
              {student.name?.[0] || "?"}
            </div>
            <span style={{ position: "absolute", top: -3, left: -3, width: 10, height: 10, borderTop: "2px solid #fff", borderLeft: "2px solid #fff", borderTopLeftRadius: 3 }} />
            <span style={{ position: "absolute", bottom: -3, right: -3, width: 10, height: 10, borderBottom: "2px solid #fff", borderRight: "2px solid #fff", borderBottomRightRadius: 3 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
              {student.name}
              <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>
                {student.school || ""} {student.grade || ""}
              </span>
            </div>
            <div style={{ marginTop: 3, color: "rgba(255,255,255,0.65)" }}>
              <FitText text={upcomingAttText || "예정된 등원일이 없어요"} maxFont={13} minFont={9} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => loadData({ manual: true })}
              disabled={refreshing}
              title={lastLoadedAt ? `마지막 동기화: ${lastLoadedAt.toLocaleTimeString()}${syncSource ? ` · ${syncSource}` : ""}` : "새로고침"}
              style={{
                width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)",
                background: refreshing ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
                color: "#fff", cursor: refreshing ? "default" : "pointer", fontSize: 17, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: refreshing ? 0.65 : 1,
              }}
            >
              {refreshing ? "…" : "↻"}
            </button>
            {lastLoadedAt && (
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 3, whiteSpace: "nowrap" }}>
                {lastLoadedAt.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} 동기화
              </div>
            )}
          </div>
        </div>

        <StudentExamDdaySection items={examDdays} />

        {pinnedMessages.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pinnedMessages.map(([dateKey, rec]) => (
              <div key={dateKey} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", borderLeft: "3px solid #ffd43b" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>📌</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {fmtDateShort(dateKey) ? `${fmtDateShort(dateKey)} · ` : ""}{rec.author || "선생님"}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rec.text}</div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {showAttQr && student && (
        <AttQrModal
          value={`maple-att:${student.id}:${params.get("t") || ""}`}
          studentName={student.name}
          onClose={() => setShowAttQr(false)}
        />
      )}

      {offlineNotice && (
        <div style={{ padding: "10px 24px", background: "#fff7e6", borderBottom: "1px solid #ffe0a3", color: "#8a5a00", fontSize: 12, fontWeight: 700 }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>⚠️ {offlineNotice}</div>
        </div>
      )}

      {/* 주간 오답 복습 경고: 기한 초과(빨강) 우선, 없으면 이번 주 마감(노랑) */}
      {vocabWarn.hasWarning && (
        <div style={{
          padding: "12px 24px",
          background: vocabWarn.overdue > 0 ? "#fdecea" : "#fff8e1",
          borderBottom: `1px solid ${vocabWarn.overdue > 0 ? "#f5c2bd" : "#ffe49c"}`,
        }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{vocabWarn.overdue > 0 ? "🚨" : "📌"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {vocabWarn.overdue > 0 ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#c0392b" }}>
                    기한이 지난 복습 단어 {vocabWarn.overdue}개가 있어요
                  </div>
                  <div style={{ fontSize: 12, color: "#a14a40", marginTop: 2 }}>
                    지금 바로 끝내자! {vocabWarn.dueThisWeek > 0 && `· 이번 주 마감 ${vocabWarn.dueThisWeek}개`}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#9a6b00" }}>
                    이번 주 복습 단어 {vocabWarn.dueThisWeek}개 — {vocabWarn.sundayLabel}까지!
                  </div>
                  <div style={{ fontSize: 12, color: "#a3791a", marginTop: 2 }}>
                    지난주에 틀린 단어예요. 일요일 전에 통과하면 끝 (D-{vocabWarn.dday})
                  </div>
                </>
              )}
            </div>
            {hasVocabWrong && (
              <button onClick={() => setTab("vocabWrong")} style={{
                flexShrink: 0, padding: "7px 13px", borderRadius: 9, border: "none", cursor: "pointer",
                background: vocabWarn.overdue > 0 ? "#c0392b" : "#9a6b00", color: "#fff",
                fontSize: 12, fontWeight: 800,
              }}>복습하기</button>
            )}
          </div>
        </div>
      )}

      {totalTasks > 0 && (
        <div style={{ padding: "14px 24px", background: "#fff", borderBottom: "1px solid #eee" }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: "#999" }}>과제 진행률</span>
              <span style={{ color: pct === 100 ? "#00b894" : "#333", fontWeight: 700 }}>
                {doneTasks}/{totalTasks} ({pct}%){pct === 100 && " 🎉"}
              </span>
            </div>
            <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg, #00b894, #69f0ae)" : "linear-gradient(90deg, #4fc3f7, #1C66A5)", transition: "width 0.5s cubic-bezier(.4,0,.2,1)" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex" }}>
        {[
          { key: "tasks", label: "📋 숙제/과제" },
          ...(studentVideos.length > 0 ? [{ key: "videos", label: "🎬 강의 영상" }] : []),
          ...(hasVocabWrong ? [{ key: "vocabWrong", label: "📝 오답 단어" }] : []),
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "14px 0", border: "none", cursor: "pointer",
            background: "transparent", fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? "#2A2A28" : "#999",
            borderBottom: tab === t.key ? "2.5px solid #2A2A28" : "2.5px solid transparent",
          }}>{t.label}</button>
        ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {tab === "tasks" && (
          <>
            {allDates.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
                {allDates.map((d) => (
                  <button key={d} onClick={() => setSelectedDate(d)} style={{
                    flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: d === activeDate ? "#2A2A28" : "#fff",
                    color: d === activeDate ? "#fff" : "#666",
                    boxShadow: d === activeDate ? "0 2px 8px rgba(26,26,46,0.25)" : "0 1px 3px rgba(0,0,0,0.06)",
                    whiteSpace: "nowrap",
                  }}>{isToday(d) ? "오늘" : fmtDateShort(d)}</button>
                ))}
              </div>
            )}
            {allDates.length > 0 && (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#2A2A28", margin: "12px 0 16px" }}>
                {fmtDateKR(activeDate)}
                {isToday(activeDate) && <span style={{ fontSize: 12, color: "#1C66A5", marginLeft: 8, fontWeight: 600 }}>TODAY</span>}
              </div>
            )}

            {/* 5단계 렌더링 (빈 단계는 StepSection 내부에서 "오늘 없음"으로 표시) */}
            {stepGroups.map((step, idx) => (
              <StepSection
                key={step.key}
                step={step}
                displayNum={idx + 1}
                isChecked={isChecked}
                isFailed={isFailed}
                getFailReason={getFailReason}
                studentVideos={studentVideos}
                viewingVideo={viewingVideo}
                toggleVideo={toggleVideo}
              />
            ))}

            {stepGroups.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#999" }}>
                  {allDates.length === 0 ? "등록된 과제가 아직 없어요" : "이 날짜에 등록된 과제가 없어요"}
                </div>
              </div>
            )}
          </>
        )}
        {tab === "videos" && (() => {
          // ─── 영상 탭 책별 자동 분류 ───
          // 책(subject)별로 그룹핑. 책이 1개면 평면 리스트 (sub-tab 없음). 2개 이상이면 sub-tab으로 분류.
          const videoGroups = {};
          studentVideos.forEach(v => {
            const key = v.subject || "기타";
            if (!videoGroups[key]) videoGroups[key] = [];
            videoGroups[key].push(v);
          });
          const bookNames = Object.keys(videoGroups);
          const hasMultipleBooks = bookNames.length >= 2;
          // 활성 책: 사용자가 고른 책을 우선 적용. 선택값이 없을 때만 현재 재생 중인 영상의 책으로 자동 이동.
          // subject가 없는 영상은 "기타" 그룹으로 묶기 때문에 viewingVideo도 같은 규칙으로 찾는다.
          let activeBook = null;
          if (hasMultipleBooks) {
            const viewingVideoBook = viewingVideo ? (viewingVideo.subject || "기타") : null;
            if (selectedVideoBook && videoGroups[selectedVideoBook]) {
              activeBook = selectedVideoBook;
            } else if (viewingVideoBook && videoGroups[viewingVideoBook]) {
              activeBook = viewingVideoBook;
            } else {
              activeBook = bookNames[0];
            }
          }
          const visibleVideos = hasMultipleBooks ? (videoGroups[activeBook] || []) : studentVideos;
          return (
          <div>
            {/* 책별 sub-tab (책 ≥ 2개일 때만) */}
            {hasMultipleBooks && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {bookNames.map(bn => {
                  const isActive = bn === activeBook;
                  const count = videoGroups[bn].length;
                  return (
                    <button key={bn} onClick={() => setSelectedVideoBook(bn)} style={{
                      flexShrink: 0, padding: "8px 14px", borderRadius: 20,
                      border: isActive ? "1.5px solid #1C66A5" : "1px solid #e0e0e0",
                      background: isActive ? "#1C66A5" : "#fff",
                      color: isActive ? "#fff" : "#555",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      whiteSpace: "nowrap", transition: "all 0.15s",
                    }}>
                      {bn} <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 3 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            )}
            {(pendingVideoCount > 0 || lastVideoSaveStatus) && (
              <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 10, background: pendingVideoCount > 0 ? "#fff7ed" : "#f0fdf4", border: pendingVideoCount > 0 ? "1px solid #fed7aa" : "1px solid #bbf7d0", color: pendingVideoCount > 0 ? "#c2410c" : "#047857", fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
                {pendingVideoCount > 0 ? `영상 기록 저장 대기 ${pendingVideoCount}개 · 인터넷 연결 후 자동 재전송됩니다.` : lastVideoSaveStatus}
              </div>
            )}
            <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>
              강의를 누른 뒤 재생 버튼을 눌러야 실제 재생시간이 기록됩니다.{hasMultipleBooks ? ` (${activeBook}: ${visibleVideos.length}개)` : ""}
            </div>
            {visibleVideos.map((v) => {
              const isOpen = viewingVideo?.id === v.id;
              return (
                <div key={v.id} style={{
                  background: "#fff", borderRadius: 14, marginBottom: 12,
                  boxShadow: isOpen ? "0 4px 16px rgba(74,108,247,0.15)" : "0 1px 4px rgba(0,0,0,0.04)",
                  border: isOpen ? "2px solid #1C66A5" : "2px solid transparent",
                  overflow: "hidden", transition: "box-shadow 0.2s, border-color 0.2s",
                }}>
                  {/* 카드 헤더 (클릭으로 토글) */}
                  <div onClick={() => toggleVideo(v)} style={{
                    padding: 16, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: v.type === "playlist" ? "linear-gradient(135deg, #e74c3c, #e67e22)" : "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{v.type === "playlist" ? "📋" : "▶️"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#2A2A28" }}>{v.title}</div>
                      <div style={{ fontSize: 12, color: "#bbb", marginTop: 3 }}>{v.type === "playlist" ? "재생목록 전체 보기" : (v.subject || "")}</div>
                    </div>
                    <div style={{ color: isOpen ? "#1C66A5" : "#ccc", fontSize: 18, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</div>
                  </div>

                  {/* 펼쳐진 영상 (인라인) */}
                  {isOpen && (
                    <div style={{ padding: "0 16px 16px" }}>
                      {v.type === "playlist" && v.playlistUrl ? (
                        <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                          <TrackedYoutubePlayer video={v} />
                        </div>
                      ) : v.url && v.url.includes("youtu") ? (
                        <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                          <TrackedYoutubePlayer video={v} />
                        </div>
                      ) : (
                        <div style={{ background: "#f5f5f5", borderRadius: 10, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <a href={v.url} target="_blank" rel="noreferrer" style={{ background: "#ff0033", color: "#fff", padding: "10px 24px", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>▶ 영상 보기</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })()}
        {tab === "vocabWrong" && (
          <VocabWrongTab vocabWrongWords={vocabWrongWords} studentId={studentId} />
        )}
        </div>
      </div>
    </div>
  );
}

// ─── VocabWrongTab: 월별 오답 단어 TEST ───
// 숙제/과제의 "2. 단어 TEST"와 섞지 않고 상단 별도 탭에서만 보여준다.
// 2차: 완료 결과를 Worker로 보내고, 통과한 단어는 다음 풀에서 제외되도록 한다.
function VocabWrongTab({ vocabWrongWords = {}, studentId }) {
  const [mode, setMode] = useState("list"); // list | test | done
  const [active, setActive] = useState(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [judged, setJudged] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [startedAt, setStartedAt] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sendStatus, setSendStatus] = useState("");

  const monthLabel = (mk) => {
    const [y, m] = String(mk || "").split("-");
    return y && m ? `${y}년 ${Number(m)}월` : mk;
  };

  const fmtWrongDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };

  // 학생앱은 AI 채점 없음. 정답 배열과 단순 비교만 한다.
  const norm = (s) => String(s || "").trim().replace(/\s+/g, "");

  const months = Object.keys(vocabWrongWords || {})
    .map((mk) => {
      const all = Object.values(vocabWrongWords[mk]?.words || {});
      const words = all
        .filter((w) => (w.status || "active") === "active" && Array.isArray(w.correctAnswers) && w.correctAnswers.length > 0)
        .sort((a, b) => String(a.word || "").localeCompare(String(b.word || "")));
      const starredCount = all.filter(w => w.starred && (w.status || "active") !== "archived").length;
      const lastWrongAt = all.map(w => w.lastWrongAt || w.firstWrongAt || "").filter(Boolean).sort().slice(-1)[0] || "";
      return { monthKey: mk, words, count: words.length, starredCount, lastWrongAt };
    })
    .filter((m) => m.count > 0 || m.starredCount > 0)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const resetProgress = () => {
    setIdx(0);
    setInput("");
    setRevealed(false);
    setJudged(null);
    setAnswers([]);
    setSummary(null);
    setSendStatus("");
  };

  const startTest = (m) => {
    if (!m.words.length) return;
    setActive(m);
    resetProgress();
    setStartedAt(new Date().toISOString());
    setMode("test");
  };

  const backToList = () => {
    setMode("list");
    setActive(null);
    resetProgress();
    setStartedAt(null);
  };

  const buildFinalSummary = (finalAnswers) => {
    const words = active?.words || [];
    const wrongItems = words.filter((w, i) => finalAnswers[i] && finalAnswers[i].correct === false);
    const wrongWordKeys = wrongItems.map(w => w.wordKey || String(w.word || "").trim().toLowerCase()).filter(Boolean);
    const wrongLabels = wrongItems.map(w => w.word || w.wordKey).filter(Boolean);
    const total = words.length;
    const wrong = wrongWordKeys.length;
    const { accuracy, result } = judgeVocabTest(total, wrong);
    return { total, correct: Math.max(0, total - wrong), wrong, accuracy, result, wrongWordKeys, wrongLabels };
  };

  const sendResult = async (finalSummary) => {
    const completedAt = new Date().toISOString();
    const payload = {
      attemptId: makeVocabAttemptId(studentId, active?.monthKey),
      studentId: String(studentId || ""),
      monthKey: active?.monthKey || "",
      testedWordKeys: (active?.words || []).map(w => w.wordKey || String(w.word || "").trim().toLowerCase()).filter(Boolean),
      wrongWords: finalSummary.wrongWordKeys,
      wrongWordLabels: finalSummary.wrongLabels,
      totalCount: finalSummary.total,
      correctCount: finalSummary.correct,
      wrongCount: finalSummary.wrong,
      accuracy: finalSummary.accuracy,
      result: finalSummary.result,
      startedAt,
      completedAt,
    };
    const ok = await postVocabTestResult(payload);
    setSendStatus(ok ? "원장앱에 결과가 저장되었습니다." : "인터넷 연결 후 원장앱으로 자동 전송됩니다.");
  };

  if (mode === "list") {
    return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: "#2A2A28" }}>오답 단어 TEST</div>
        <div style={{ fontSize: 13, color: "#777", marginBottom: 16 }}>원장앱 채점에서 틀린 단어만 월별로 복습합니다.</div>
        {months.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14, background: "#fff", borderRadius: 14 }}>
            아직 오답 단어가 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {months.map((m) => (
              <div key={m.monthKey} style={{ background: "#fff", border: "1px solid #eee", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#2A2A28" }}>{monthLabel(m.monthKey)}</div>
                    <div style={{ fontSize: 13, color: "#777", marginTop: 4 }}>
                      테스트할 단어 <b style={{ color: "#1C66A5" }}>{m.count}</b>개
                      {m.starredCount > 0 && <span style={{ color: "#d4537e", marginLeft: 8 }}>★ 어려운 단어 {m.starredCount}개</span>}
                    </div>
                    {m.lastWrongAt && <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>최근 오답: {fmtWrongDate(m.lastWrongAt)}</div>}
                  </div>
                  <button onClick={() => startTest(m)} disabled={m.count === 0} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: m.count === 0 ? "#ccc" : "#1C66A5", color: "#fff", fontWeight: 800, fontSize: 13, cursor: m.count === 0 ? "default" : "pointer", flexShrink: 0 }}>
                    {m.count === 0 ? "모두 통과" : "TEST 시작"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (mode === "done" && summary) {
    const pass = summary.result === "pass";
    return (
      <div>
        <button onClick={backToList} style={{ border: "none", background: "transparent", color: "#777", fontSize: 14, cursor: "pointer", marginBottom: 12 }}>← 월별 목록</button>
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 22, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>{pass ? "✅" : "⭐"}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: pass ? "#047857" : "#c0392b", marginBottom: 6 }}>{pass ? "통과!" : "재시험 필요"}</div>
          <div style={{ fontSize: 13, color: "#777", marginBottom: 18 }}>{monthLabel(active?.monthKey)} 오답 단어 TEST 결과입니다.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "#f6f7fb" }}><b>{summary.total}</b><br/><span style={{ fontSize: 12, color: "#777" }}>전체</span></div>
            <div style={{ padding: 12, borderRadius: 12, background: "#e8f8ef", color: "#047857" }}><b>{summary.correct}</b><br/><span style={{ fontSize: 12 }}>정답</span></div>
            <div style={{ padding: 12, borderRadius: 12, background: "#fde8e8", color: "#c0392b" }}><b>{summary.wrong}</b><br/><span style={{ fontSize: 12 }}>오답</span></div>
          </div>
          <div style={{ fontSize: 14, color: pass ? "#047857" : "#c0392b", fontWeight: 800, marginBottom: 10 }}>정답률 {summary.accuracy}% · 기준 90%</div>
          {!pass && summary.wrongLabels.length > 0 && (
            <div style={{ marginTop: 12, marginBottom: 16, textAlign: "left" }}>
              <div style={{ fontSize: 13, color: "#777", marginBottom: 6 }}>★ 별표된 어려운 단어</div>
              {summary.wrongLabels.map(w => <span key={w} style={{ display: "inline-block", margin: "0 6px 6px 0", padding: "4px 10px", borderRadius: 8, background: "#fbeaf0", color: "#993556", fontSize: 13 }}>{w}</span>)}
            </div>
          )}
          {sendStatus && <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>{sendStatus}</div>}
          <button onClick={() => startTest(active)} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 8 }}>다시 풀기</button>
          <button onClick={backToList} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", color: "#333", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>월별 목록으로</button>
        </div>
      </div>
    );
  }

  const words = active?.words || [];
  const current = words[idx];
  const correctAnswers = current?.correctAnswers || [];
  const currentAnswer = answers[idx] || {};

  const check = () => {
    if (!current) return;
    const ans = norm(input);
    const ok = correctAnswers.some((c) => norm(c) === ans);
    setJudged(ok ? "correct" : "wrong");
    setRevealed(true);
    setAnswers(prev => {
      const next = [...prev];
      next[idx] = { word: current?.word || "", wordKey: current?.wordKey || "", input, correct: ok };
      return next;
    });
  };

  const next = () => {
    const finalAnswers = [...answers];
    if (!finalAnswers[idx] && current) {
      finalAnswers[idx] = { word: current.word || "", wordKey: current.wordKey || "", input, correct: judged === "correct" };
    }
    if (idx + 1 >= words.length) {
      const finalSummary = buildFinalSummary(finalAnswers);
      setAnswers(finalAnswers);
      setSummary(finalSummary);
      setMode("done");
      sendResult(finalSummary);
      return;
    }
    setAnswers(finalAnswers);
    setIdx(idx + 1);
    setInput("");
    setRevealed(false);
    setJudged(null);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <button onClick={backToList} style={{ border: "none", background: "transparent", color: "#777", fontSize: 14, cursor: "pointer" }}>← 목록</button>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#777", fontWeight: 700 }}>{idx + 1} / {words.length}</div>
      </div>
      {!current ? (
        <div style={{ padding: 24, textAlign: "center", color: "#999", background: "#fff", borderRadius: 14 }}>단어가 없습니다.</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden", marginBottom: 28 }}>
            <div style={{ height: "100%", width: `${((idx + 1) / Math.max(words.length, 1)) * 100}%`, background: "linear-gradient(90deg, #1C66A5, #1C66A5)", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, textAlign: "center", color: "#2A2A28", marginBottom: 22 }}>{current.word}</div>
          <div style={{ fontSize: 13, color: "#777", marginBottom: 7 }}>이 단어의 뜻을 한국어로 적어주세요.</div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !revealed && input.trim()) check(); }}
            disabled={revealed}
            placeholder="정답을 입력하세요"
            style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 16, boxSizing: "border-box" }}
          />
          {!revealed ? (
            <button onClick={check} disabled={!input.trim()} style={{ width: "100%", marginTop: 14, padding: "13px 0", borderRadius: 10, border: "none", background: input.trim() ? "#1C66A5" : "#ccc", color: "#fff", fontWeight: 800, fontSize: 15, cursor: input.trim() ? "pointer" : "default" }}>정답 확인</button>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ padding: 13, borderRadius: 12, background: judged === "correct" ? "#e8f8ef" : "#fde8e8", border: judged === "correct" ? "1px solid #bbf7d0" : "1px solid #fecaca", marginBottom: 12 }}>
                <div style={{ fontWeight: 900, color: judged === "correct" ? "#047857" : "#c0392b", marginBottom: 7 }}>{judged === "correct" ? "정답입니다!" : "오답이에요!"}</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.7 }}>내 답: {currentAnswer.input?.trim() || input.trim() || "(빈칸)"}</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.7 }}>정답: <b>{correctAnswers.join(", ")}</b></div>
              </div>
              <button onClick={next} style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{idx + 1 >= words.length ? "결과 보기" : "다음 단어"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FitText: 한 줄에 들어가도록 글씨 크기 자동 축소 ───
function FitText({ text, maxFont = 13, minFont = 9, style = {} }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      let s = maxFont;
      el.style.fontSize = `${s}px`;
      // 한 프레임 후 측정 (레이아웃 확정)
      while (s > minFont && el.scrollWidth > el.clientWidth + 0.5) {
        s -= 0.5;
        el.style.fontSize = `${s}px`;
      }
    };

    const raf = requestAnimationFrame(fit);

    let ro;
    if (typeof ResizeObserver !== "undefined" && el.parentElement) {
      ro = new ResizeObserver(fit);
      ro.observe(el.parentElement);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, [text, maxFont, minFont]);

  return (
    <div ref={ref} style={{
      whiteSpace: "nowrap",
      overflow: "hidden",
      fontSize: maxFont,
      lineHeight: 1.4,
      ...style,
    }}>
      {text}
    </div>
  );
}

// ─── 영상 매칭 헬퍼 (숙제 텍스트 → 학생의 영상들 매칭) ───
// 사용처: 숙제 항목 옆에 ▶ 버튼 표시 + 인라인 영상 재생
// 숙제/과제 탭 관련 강의 버튼은 원장님이 명시적으로 "수강"이라고 적은 항목에만 표시한다.
// 숙제/과제 탭 관련 강의 버튼은 원장님이 명시적으로 "수강"이라고 적은 항목에만 표시한다.
const VIDEO_TASK_KEYWORDS = ["수강"];

function hasVideoKeyword(text) {
  if (!text) return false;
  return VIDEO_TASK_KEYWORDS.some(kw => text.includes(kw));
}

// 하이픈/언더스코어/콤마를 모두 스페이스로 통일 후 비교
function normalizeForMatch(s) {
  return String(s || "").replace(/[-_,]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

// 키워드 매칭용: 공백/기호 제거 후 비교
function normalizeKeywordMatchText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣0-9]/g, "")
    .trim();
}

function getVideoMatchKeywords(video = {}) {
  const raw = Array.isArray(video.matchKeywords) ? video.matchKeywords.join(",") : String(video.matchKeywords || "");
  return raw.split(/[,，、/\n]+/g).map(x => x.trim()).filter(Boolean);
}

function countVideoKeywordMatches(taskText, video = {}) {
  const taskNorm = normalizeKeywordMatchText(taskText);
  if (!taskNorm) return 0;
  return getVideoMatchKeywords(video).filter(k => {
    const kn = normalizeKeywordMatchText(k);
    return kn && taskNorm.includes(kn);
  }).length;
}

// 키워드가 책 이름 안에 포함되고 짧으면 그 책에서는 generic 키워드로 본다.
// 예: 책 이름 "천일문-기본", 키워드 "천일문"/"기본" → 모든 UNIT 공통이라 변별력 없음.
const isGenericVideoKeyword = (keyword = "", video = {}) => {
  const kn = normalizeKeywordMatchText(keyword);
  if (!kn) return true;
  const bookNorm = normalizeKeywordMatchText(video.subject || video.bookName || "");
  return bookNorm.includes(kn) && kn.length <= 5;
};

const videoMatchesTaskNumber = (video = {}, taskNumbers = []) => {
  if (!taskNumbers.length) return false;
  const titleNums = extractTaskNumbers(video.title || "");
  if (titleNums.some(n => taskNumbers.includes(n))) return true;
  const keywordNums = getVideoMatchKeywords(video).flatMap(k => extractTaskNumbers(k));
  return keywordNums.some(n => taskNumbers.includes(n));
};

const countSpecificVideoKeywordMatches = (taskText, video = {}) => {
  const taskNorm = normalizeKeywordMatchText(taskText);
  if (!taskNorm) return 0;
  return getVideoMatchKeywords(video).filter(k => {
    if (isGenericVideoKeyword(k, video)) return false;
    const kn = normalizeKeywordMatchText(k);
    return kn && taskNorm.includes(kn);
  }).length;
};

const NAESIN_VIDEO_HINTS = ["내신", "기말", "중간", "수행평가", "내신콘서트"];
const REGULAR_VIDEO_HINTS = ["구문", "문법", "독해", "단어", "어휘", "천일문", "그래머", "어법끝", "voca", "VOCA"];

const inferTaskArea = (taskText = "") => {
  const t = String(taskText || "");
  const isNaesin = NAESIN_VIDEO_HINTS.some(h => t.includes(h));
  const isRegular = REGULAR_VIDEO_HINTS.some(h => t.includes(h));
  if (isNaesin && !isRegular) return "naesin";
  if (isRegular && !isNaesin) return "regular";
  return null;
};

const inferVideoArea = (video = {}) => {
  const t = `${video.subject || ""} ${video.bookName || ""} ${video.title || ""}`;
  const isNaesin = NAESIN_VIDEO_HINTS.some(h => t.includes(h));
  const isRegular = REGULAR_VIDEO_HINTS.some(h => t.includes(h));
  if (isNaesin && !isRegular) return "naesin";
  if (isRegular && !isNaesin) return "regular";
  return null;
};

// 텍스트에서 숫자 추출 (예: "37 38" → [37, 38], "2,3" → [2, 3])
function extractTaskNumbers(text) {
  const m = (text || "").match(/\d+/g);
  return m ? m.map(n => parseInt(n, 10)).filter(n => n > 0 && n < 10000) : [];
}

const uniqVideosById = (videos = []) => {
  const seen = new Set();
  return (videos || []).filter(v => {
    const key = String(v?.id || `${v?.title || ""}_${v?.url || v?.playlistUrl || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};


// 매칭 메인 함수
// 반환: { hasKeyword, matched, bookCandidates }
//   - matchKeywords가 있으면 숙제 문장에 키워드가 포함되는 영상을 1순위로 매칭
//   - 기존 책 이름+숫자 매칭은 fallback으로 유지
function matchVideosForTask(taskText, studentVideos) {
  const hasKw = hasVideoKeyword(taskText);
  if (!studentVideos || studentVideos.length === 0) {
    return { hasKeyword: hasKw, matched: [], bookCandidates: [] };
  }

  // "수강"이 없는 숙제/과제 항목은 키워드가 일부 겹쳐도 관련 강의 버튼을 띄우지 않는다.
  if (!hasKw) {
    return { hasKeyword: false, matched: [], bookCandidates: [] };
  }

  // 영역 힌트가 명확하면 영상 풀을 먼저 좁힌다. 모호하면 전체 풀을 그대로 쓴다.
  const taskArea = inferTaskArea(taskText);
  const filteredVideos = taskArea
    ? studentVideos.filter(v => {
        const va = inferVideoArea(v);
        return !va || va === taskArea;
      })
    : studentVideos;

  const taskNorm = normalizeForMatch(taskText);
  const taskNumbers = extractTaskNumbers(taskText);

  // 1순위: 책 이름으로 후보를 먼저 좁힌다.
  // "천일문/기본" 같은 공통 키워드가 UNIT 1부터 잡는 문제를 막기 위한 핵심 변경.
  const bookCandidates = uniqVideosById(filteredVideos.filter(v => {
    const subj = normalizeForMatch(v.subject || v.bookName);
    return subj && (taskNorm.includes(subj) || subj.includes(taskNorm));
  }));

  // 2순위: 과제에 숫자가 있으면, 책 후보 안에서 제목/키워드 숫자가 맞는 영상만 확정한다.
  if (taskNumbers.length > 0 && bookCandidates.length > 0) {
    const numberMatched = uniqVideosById(bookCandidates.filter(v => videoMatchesTaskNumber(v, taskNumbers)));
    if (numberMatched.length > 0) {
      return { hasKeyword: true, matched: numberMatched.slice(0, 4), bookCandidates };
    }
  }

  // 3순위: generic을 제외한 구체 키워드(수동태, 관계대명사, UNIT 17 등)만 매칭한다.
  const keywordMatched = uniqVideosById(
    filteredVideos
      .map(v => ({ ...v, _keywordMatchCount: countSpecificVideoKeywordMatches(taskText, v) }))
      .filter(v => v._keywordMatchCount > 0)
      .sort((a, b) => (b._keywordMatchCount || 0) - (a._keywordMatchCount || 0) || (a.order || 0) - (b.order || 0))
  );
  if (keywordMatched.length > 0) {
    return { hasKeyword: true, matched: keywordMatched.slice(0, 4), bookCandidates: keywordMatched };
  }

  // 4순위: 숫자 없는 과제는 책 후보 전체를 보여준다. 숫자가 있는데 숫자 매칭이 없으면 빈 결과.
  if (bookCandidates.length > 0) {
    const matched = taskNumbers.length === 0 ? bookCandidates : [];
    return { hasKeyword: true, matched: matched.slice(0, 4), bookCandidates };
  }

  return { hasKeyword: true, matched: [], bookCandidates: [] };
}

// 영상 제목에서 짧은 라벨 추출 (버튼에 표시할 용도)
// 예: "천일문-기본 UNIT 37" → "UNIT 37"
function getVideoShortLabel(video) {
  const title = video.title || "";
  const m = title.match(/(?:UNIT|Unit|unit|Lesson|lesson|LESSON|강|챕터|Chapter|chapter|CHAPTER|Day|DAY|day)\s*\d+/);
  if (m) return m[0];
  const nums = extractTaskNumbers(title);
  if (nums.length > 0) return String(nums[nums.length - 1]);
  return title.length > 12 ? title.slice(0, 12) + "…" : title;
}

function extractYoutubeId(url) {
  if (!url) return "";
  let m = url.match(/youtu\.be\/([^?&]+)/);
  if (m) return m[1];
  m = url.match(/[?&]v=([^?&]+)/);
  if (m) return m[1];
  m = url.match(/embed\/([^?&]+)/);
  if (m) return m[1];
  return "";
}

function extractPlaylistId(url) {
  if (!url) return "";
  const m = url.match(/[?&]list=([^?&]+)/);
  return m ? m[1] : "";
}

// ─── HomeworkItem: 숙제 항목 한 줄 (영상 매칭 + 인라인 플레이어 + 폴백) ───
// [디자인 수정] 영상 매칭 ▶ 버튼들을 텍스트 행에서 분리하여 별도 줄(체크박스와 좌측 정렬)에 배치.
// 이전엔 매칭 영상이 4개 이상이면 텍스트가 한 글자씩 세로로 쪼개지는 버그가 있었음.
function HomeworkItem({ item, isLast, isCheckedFn, isFailedFn, getFailReasonFn, studentVideos, viewingVideo, toggleVideo }) {
  const [showAll, setShowAll] = useState(false);
  const done = isCheckedFn(item);
  const fail = isFailedFn ? isFailedFn(item) : false;
  const failReason = fail && getFailReasonFn ? getFailReasonFn(item) : "";

  const { hasKeyword, matched, bookCandidates } = matchVideosForTask(item.text, studentVideos);
  const hasMatch = matched.length > 0;
  const showFallback = hasKeyword && bookCandidates.length > 0 && !!toggleVideo;
  const showVideoButtons = hasMatch && !!toggleVideo;

  // 현재 펼쳐진 영상 (matched 또는 폴백 펼침 모두 포함)
  const openVideo = matched.find(v => viewingVideo?.id === v.id) || bookCandidates.find(v => viewingVideo?.id === v.id) || null;
  const isAnyOpen = !!openVideo;

  // 폴백 라벨용 책 이름 (보통 1개 책만 매칭됨)
  const bookSubject = bookCandidates[0]?.subject || matched[0]?.subject || "";

  // 들여쓰기: 체크박스(22) + gap(12) + 좌측 padding(16) = 50px. fail reason과 동일한 정렬.
  const INDENT_LEFT = 50;

  return (
    <div style={{ borderBottom: !isLast ? "1px solid #f5f5f5" : "none", background: done ? "#f0fdf4" : fail ? "#fef2f2" : "#fff" }}>
      {/* 항목 행 (체크박스 + 텍스트만). 영상 ▶ 버튼이 같이 있으면 다음 줄에 자리를 비워줘야 하므로 paddingBottom을 줄인다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: showVideoButtons ? "14px 16px 8px" : "14px 16px" }}>
        <div style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0,
          border: done || fail ? "none" : "2px solid #e0e0e0",
          background: done ? "linear-gradient(135deg, #00b894, #00cec9)" : fail ? "linear-gradient(135deg, #ef4444, #f87171)" : "#f9f9f9",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
          {fail && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✕</span>}
        </div>
        {(() => {
          // "->" 또는 "→" 화살표 뒤의 부분을 보라색 뱃지로 분리 (예: "...준비 -> 수업-랜덤 해석 test")
          const arrowSplit = item.text.split(/\s*(?:->|→)\s*/);
          if (arrowSplit.length >= 2 && arrowSplit[0].trim() && arrowSplit.slice(1).join('').trim()) {
            const mainText = arrowSplit[0].trim();
            const badgeText = arrowSplit.slice(1).join(' → ').trim();
            return (
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: done ? "#999" : "#333", textDecoration: done ? "line-through" : "none" }}>{mainText}</span>
                <span style={{ background: "#f3e8ff", color: "#7c3aed", fontSize: 11, padding: "3px 9px", borderRadius: 10, fontWeight: 600, whiteSpace: "nowrap" }}>{badgeText}</span>
              </div>
            );
          }
          return (
            <span style={{ flex: 1, fontSize: 14, lineHeight: 1.5, color: done ? "#999" : "#333", textDecoration: done ? "line-through" : "none", minWidth: 0 }}>{item.text}</span>
          );
        })()}
      </div>

      {/* 매칭된 영상 ▶ 버튼들: 텍스트 아래 별도 줄. 체크박스와 좌측 정렬되도록 padding-left로 들여씀. */}
      {showVideoButtons && (
        <div style={{ padding: `0 16px 12px ${INDENT_LEFT}px`, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {matched.map(v => {
            const isOpen = viewingVideo?.id === v.id;
            return (
              <button key={v.id} onClick={(e) => { e.stopPropagation(); toggleVideo(v); }} style={{
                padding: "5px 11px", borderRadius: 7,
                border: isOpen ? "1.5px solid #1C66A5" : "1px solid #d0d4e0",
                background: isOpen ? "#eef1ff" : "#fff",
                color: isOpen ? "#1C66A5" : "#555",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4, transition: "all 0.15s", whiteSpace: "nowrap",
              }}>
                <span style={{ fontSize: 10 }}>{isOpen ? "▼" : "▶"}</span> {getVideoShortLabel(v)}
              </button>
            );
          })}
        </div>
      )}

      {/* 미완료 사유 표시 (fail이고 사유가 있을 때만) — 텍스트와 정렬되도록 padding-left 50 (체크박스 22 + gap 12 + padding 16) */}
      {fail && failReason && (
        <div style={{ padding: `0 16px 12px ${INDENT_LEFT}px`, fontSize: 12, color: "#dc2626", lineHeight: 1.4 }}>
          💬 {failReason}
        </div>
      )}

      {/* 폴백 안내/버튼: 매칭이 있어도 작은 링크로 항상 노출 (숫자 잘못 입력 안전망) */}
      {showFallback && (hasMatch ? (
        <div style={{ padding: "0 16px 10px", textAlign: "right" }}>
          <button onClick={() => setShowAll(s => !s)} style={{
            border: "none", background: "transparent", color: "#9ca3af",
            fontSize: 11, padding: 0, cursor: "pointer", fontWeight: 600,
          }}>
            📚 다른 강의 보기 {showAll ? "▴" : "▾"}
          </button>
        </div>
      ) : (
        <div style={{ padding: "2px 16px 12px" }}>
          <div style={{ fontSize: 11, color: "#999", marginBottom: 6, fontStyle: "italic" }}>
            매칭되는 강의를 못 찾았어요. 직접 찾아보세요:
          </div>
          <button onClick={() => setShowAll(s => !s)} style={{
            border: "1px solid #e0e0e0", background: "#f9fafb", color: "#374151",
            fontSize: 12, padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 600,
          }}>
            📚 {bookSubject} 전체 강의 {showAll ? "닫기 ▴" : `보기 ▾ (${bookCandidates.length})`}
          </button>
        </div>
      ))}

      {/* 폴백 펼침: 책의 모든 영상 ▶ 버튼 그리드 (매칭됐던 영상은 노란 배경으로 강조) */}
      {showFallback && showAll && (
        <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {bookCandidates.map(v => {
            const isOpen = viewingVideo?.id === v.id;
            const isMatched = matched.some(m => m.id === v.id);
            return (
              <button key={v.id} onClick={(e) => { e.stopPropagation(); toggleVideo(v); }} style={{
                padding: "4px 9px", borderRadius: 6,
                border: isOpen ? "1.5px solid #1C66A5" : (isMatched ? "1px solid #fde047" : "1px solid #e0e0e0"),
                background: isOpen ? "#eef1ff" : (isMatched ? "#fef9c3" : "#fff"),
                color: isOpen ? "#1C66A5" : (isMatched ? "#854d0e" : "#666"),
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 3, transition: "all 0.15s", whiteSpace: "nowrap",
              }}>
                <span style={{ fontSize: 9 }}>{isOpen ? "▼" : "▶"}</span> {getVideoShortLabel(v)}
              </button>
            );
          })}
        </div>
      )}

      {/* 인라인 영상 플레이어 */}
      {isAnyOpen && (() => {
        const v = openVideo;
        return (
          <div style={{ padding: "0 16px 16px", background: "#fafbff" }}>
            {v.type === "playlist" && v.playlistUrl ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                <TrackedYoutubePlayer video={v} />
              </div>
            ) : v.url && v.url.includes("youtu") ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                <TrackedYoutubePlayer video={v} />
              </div>
            ) : (
              <div style={{ background: "#f5f5f5", borderRadius: 10, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <a href={v.url} target="_blank" rel="noreferrer" style={{ background: "#ff0033", color: "#fff", padding: "10px 24px", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>▶ 영상 보기</a>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── StepSection: 단계별 카드 (라벨 + 배지 + notice + 체크리스트) ───
function StepSection({ step, displayNum, isChecked, isFailed, getFailReason, studentVideos = [], viewingVideo, toggleVideo }) {
  const { label, color, bg, badges = [], notice, items } = step;
  return (
    <div style={{ marginBottom: 20 }}>
      {/* 헤더: 라벨 탭 + 배지 (한 줄) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color, padding: "6px 12px", background: bg, borderRadius: "10px 10px 0 0", letterSpacing: 0.5 }}>
          {displayNum}. {label}
        </div>
        {badges.map(b => {
          const bs = BADGE_STYLES[b] || { bg: "#eee", fg: "#666" };
          return (
            <span key={b} style={{ background: bs.bg, color: bs.fg, fontSize: 11, padding: "3px 8px", borderRadius: 10, fontWeight: 600 }}>
              {b}
            </span>
          );
        })}
      </div>

      {/* 본문 카드 */}
      <div style={{ background: "#fff", borderRadius: "0 12px 12px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
        {notice && (
          <div style={{ fontSize: 12, color: "#a16207", background: "#fffbeb", padding: "8px 14px", borderBottom: "1px solid #f5f5f5", lineHeight: 1.5 }}>
            💡 {notice}
          </div>
        )}
        {items.length === 0 ? (
          <div style={{ padding: "18px 16px", fontSize: 13, color: "#bbb", textAlign: "center", fontStyle: "italic" }}>
            오늘 없음
          </div>
        ) : items.map((item, i) => (
          <HomeworkItem
            key={item.key || item.legacyKey || `${item.type}_${item.idx}`}
            item={item}
            isLast={i === items.length - 1}
            isCheckedFn={isChecked}
            isFailedFn={isFailed}
            getFailReasonFn={getFailReason}
            studentVideos={studentVideos}
            viewingVideo={viewingVideo}
            toggleVideo={toggleVideo}
          />
        ))}
      </div>
    </div>
  );
}
