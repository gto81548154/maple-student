import { IS_MASTER_MODE, IS_STAFF_VIEW, IS_TEACHER_MODE, MASTER_MK, TEACHER_AUTH, teacherLinkDead } from "./auth.jsx";
import { STUDENT_SYNC_API_URL } from "./config.jsx";
import { fetchTextWithTimeout } from "./net.jsx";

const resolveStudentSyncUrl = (studentId, { forceFresh = false } = {}) => {
  if (!STUDENT_SYNC_API_URL) return "";
  const u = new URL(STUDENT_SYNC_API_URL, window.location.origin);
  u.searchParams.set("id", String(studentId));
  u.searchParams.set("studentId", String(studentId));
  u.searchParams.set("resilient", "1"); // 통계 장애와 학습 자료 열기를 분리한다.
  // [100차수] 학생이 [다시 받기]를 눌렀을 때만 fresh=1 — 워커(09-07판)가 60초 기억을 건너뛰고 DB에서 다시 읽는다.
  //   옛 워커는 이 값을 모르고 무시하므로 답은 그대로 읽힌다(그때는 "진짜 새로 읽었다"고 표시하지 않는다).
  if (forceFresh) u.searchParams.set("fresh", "1");
  const accessToken = new URLSearchParams(window.location.search).get("t") || "";
  if (accessToken) u.searchParams.set("t", accessToken);
  // [마스터] 워커가 "앱 접속" 배지를 갱신하지 않게 한다(학생 토큰 검사는 그대로 통과).
  if (IS_MASTER_MODE) u.searchParams.set("mk", MASTER_MK);
  // [교사] 선생님이 학생 화면을 열 때 — 학생 열쇠(t) 대신 교사 열쇠로 통과한다.
  //   워커가 이 조합이면 학생 토큰 검사를 건너뛰고, "앱 접속" 배지도 안 찍는다.
  if (TEACHER_AUTH) { u.searchParams.set("tid", TEACHER_AUTH.tid); u.searchParams.set("tk", TEACHER_AUTH.tk); }
  u.searchParams.set("ts", String(Date.now()));
  return u.toString();
};
const unwrapBundlePayload = (raw) => raw?.data || raw?.bundle || raw?.result || raw || {};
const getStudentFromPayload = (payload, studentId) => {
  if (payload.student && String(payload.student.id) === String(studentId) && !payload.student.deletedAt) return payload.student;
  const students = payload.students || payload.stu3 || [];
  return (students || []).find(s => String(s.id) === String(studentId) && !s.deletedAt) || null;
};
// [08-07] 삭제(deletedAt)·일시정지(paused) 상태까지 포함해 찾는다.
// 위 함수가 null을 주더라도 자료 자체는 남아 있으므로, "링크가 잘못됨"과 "그만둔 학생"을 구분할 수 있다.
const findStudentAnyState = (payload, studentId) => {
  if (payload.student && String(payload.student.id) === String(studentId)) return payload.student;
  const students = payload.students || payload.stu3 || [];
  return (students || []).find(s => String(s.id) === String(studentId)) || null;
};
// 지금 학원에 다니지 않는 상태인지 (삭제 또는 일시정지)
const isWithdrawnStudent = (s) => !!(s && (s.deletedAt || s.paused));
// 🌱 차단 화면을 띄우는 전용 오류. 이름을 알면 넣고, 모르면 빈 값으로 둔다.
const makeWithdrawnError = (s, msg) => {
  const e = new Error(msg || "현재 수강 중이 아닌 학생입니다");
  e.code = "withdrawn";
  e.studentName = String(s?.name || "");
  return e;
};
// [08-07] 워커가 "제대로 된 답"을 줬는지 본다.
// 학생 목록(students/stu3)이 배열로 왔거나 student 객체가 왔으면 제대로 된 답이다.
//   → 그런데 그 안에 본인이 없다 = 워커가 이 학생을 빼고 보냈다 = 그만둔 학생. 차단해야 한다.
// 빈 응답 {}, success:false 같은 반쪽 답은 서버가 아픈 것으로 보고 예전처럼 폰 저장본을 쓴다.
//   → 멀쩡한 학생이 서버 장애로 막히는 일을 막기 위함.
const looksLikeValidBundle = (raw, payload) => {
  if (raw && raw.success === false) return false;
  if (payload && payload.student && typeof payload.student === "object") return true;
  return Array.isArray(payload?.students || payload?.stu3);
};
// ─── [99차수] 서버 답 검증 — "정상인 빈 답"과 "반쪽 답"을 가른다 ───
// 예전엔 새 답이 비어 있으면 무조건 옛 값을 지켰다(keepPrevIfUnexpectedEmpty). 그래서 선생님이 숙제·강의를
// 지워도 학생 폰에서는 안 없어졌다. 이제는
//   · 칸이 있고 모양이 맞으면(빈 {}·[] 포함) → 그대로 믿고 화면·백업에 반영한다(지운 것은 지워진다)
//   · 칸이 정식 이름·옛 이름 모두 없거나, 있는데 모양이 틀리면(문자열 등) → 반쪽 답. 화면에 안 쓰고 백업도 안 덮는다
// "칸이 있다"는 값이 비었는지가 아니라 열쇠(key)가 실제로 있는지로 본다(|| {} 로 감추지 않는다).
export const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const hasKey = (obj, k) => !!obj && Object.prototype.hasOwnProperty.call(obj, k);
// 정식 이름이 있으면 그 값, 없으면 옛 이름 값. 둘 다 없으면 undefined (빈 값과 구별된다).
const pickField = (payload, ...names) => {
  for (const n of names) if (hasKey(payload, n)) return payload[n];
  return undefined;
};
// 서버가 항상 보내는 필수 칸 5개 — 없거나 모양이 틀리면 "불완전" 오류를 던진다.
const REQUIRED_BUNDLE_FIELDS = [
  { names: ["todos", "todo4"], kind: "object", label: "숙제" },
  { names: ["checklistData", "chk3", "checklist"], kind: "object", label: "체크" },
  { names: ["records", "rec3"], kind: "object", label: "기록" },
  { names: ["videos", "student_videos"], kind: "array", label: "강의" },
  { names: ["vocabWrongWords", "vocab_wrong_words"], kind: "object", label: "오답단어" },
];
const makeIncompleteError = (label) => {
  const e = new Error(`서버 답이 불완전합니다: ${label}`);
  e.code = "incomplete";
  return e;
};
const validateBundleFields = (payload) => {
  for (const f of REQUIRED_BUNDLE_FIELDS) {
    const v = pickField(payload, ...f.names);
    if (v === undefined) throw makeIncompleteError(f.label + " 칸 없음");
    const ok = f.kind === "array" ? Array.isArray(v) : isPlainObject(v);
    if (!ok) throw makeIncompleteError(f.label + " 모양 이상");
  }
};
// [99차수] 시험범위 — 서버가 주는 { school, schools, data } 모양을 그대로 보존한다.
//   없거나(구버전 서버) 모양이 아니면 null. 빈 범위 { school, schools, data: {} }도 정상(→ 카드가 비는 게 맞다).
export const normalizeExamRanges = (v) => (isPlainObject(v) ? v : null);
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
const loadStudentBundleFromWorker = async (studentId, { forceFresh = false } = {}) => {
  const url = resolveStudentSyncUrl(studentId, { forceFresh });
  if (!url) throw new Error("STUDENT_SYNC_API_URL 미설정");
  // [08-10] 기다리는 시간 10초 → 20초. 자료가 커져 서버가 느린 날, 폰 인터넷이 느린 학생도 끊기지 않게.
  // [110차수 09-09] 본문을 다 받을 때까지 20초 안(예전엔 답이 시작되면 타이머를 지워 본문 멈춤을 못 막았다).
  const { resp, text } = await fetchTextWithTimeout(url, { method: "GET", cache: "no-store" }, 20000);
  if (!resp.ok) {
    // [08-07] "서버가 거절한 것"과 "서버가 아픈 것"을 가른다.
    //  401·403·404 = 토큰이 죽었거나 그런 학생이 없다는 뜻 → 폰 저장본으로 우회하면 안 된다.
    //  500대·429  = 서버 장애 → 멀쩡한 학생이 막히면 안 되므로 예전처럼 폰 저장본을 쓴다.
    if (IS_TEACHER_MODE && (resp.status === 401 || resp.status === 403)) { teacherLinkDead(); throw new Error("교사 링크가 유효하지 않습니다"); }
    if (!IS_STAFF_VIEW && (resp.status === 401 || resp.status === 403 || resp.status === 404)) {
      throw makeWithdrawnError(null, `학생 동기화 API 거절: ${resp.status}`);
    }
    // [110차수] 워커 09-09판은 오류 답에 짧은 코드(db_timeout = DB 응답 지연 등)를 실어 준다 → 오류 코드 표시에 쓴다
    let serverCode = "";
    try { const j = JSON.parse(text); serverCode = typeof j?.code === "string" ? j.code.slice(0, 40) : ""; } catch (e) { /* 본문이 JSON이 아니면 코드 없음 */ }
    throw new Error(`학생 동기화 API 오류: ${resp.status}${serverCode ? ` (${serverCode})` : ""}`);
  }
  let raw;
  try { raw = JSON.parse(text); }
  catch (e) { throw new Error("학생 동기화 API 응답 해석 실패: 답이 JSON이 아닙니다"); }   // [110차수] 깨진 답은 백업 경로로
  const payload = unwrapBundlePayload(raw);
  // [99차수] HTTP는 200인데 몸통이 실패(success:false)면 정상 답으로 읽지 않는다 → 폰 백업 경로.
  if (raw && raw.success === false) throw new Error("학생 동기화 API 실패 응답: " + String(raw.error || raw.message || ""));
  let student = getStudentFromPayload(payload, studentId);
  const anyState = findStudentAnyState(payload, studentId);
  let withdrawnFlag = false;

  if (IS_STAFF_VIEW) {
    // [08-07] 원장(·[08-27] 선생님)이 학생앱을 열어보는 경우 — 그만둔 학생도 그대로 보여주고, 화면 위에 띠로만 알린다.
    if (!student && anyState) student = anyState;
    withdrawnFlag = isWithdrawnStudent(student);
    if (!student) throw new Error("학생 정보를 찾을 수 없습니다");
  } else if (!student) {
    // [08-07] 자료는 있는데 삭제·정지 상태라면 "잘못된 링크"가 아니라 "그만둔 학생"이다 — 따로 알린다.
    if (isWithdrawnStudent(anyState)) throw makeWithdrawnError(anyState);
    // [08-07] 답 모양은 정상인데 본인만 없다 = 워커가 삭제 학생을 아예 안 보내는 경우. 이때도 차단한다.
    if (looksLikeValidBundle(raw, payload)) throw makeWithdrawnError(null, "학생 목록에 없는 학생입니다");
    throw new Error("학생 정보를 찾을 수 없습니다");
  } else if (isWithdrawnStudent(student)) {
    // 워커가 정지 학생까지 그대로 보내는 경우에도 여기서 막는다.
    const stopErr = makeWithdrawnError(student);
    // [137차수] 워커(리마스터 2차~)가 "이 학생은 정지 상태"라고 분명히 말해 주면(studentState) 세 번 기다리지 않고 바로 안내한다.
    //   명단이 통째로 비는 식의 서버 실수와 달리, 이 답은 명단을 제대로 읽고 그 학생 칸의 정지 표시를 본 것이라 한 번으로 충분하다.
    //   (명단에 없음·403·404 는 예전처럼 10분 안에 3번 연속일 때만 판정한다 — 서버가 잠깐 잘못 답해도 폰 저장본을 지우지 않게)
    if (payload.studentState === "paused" && student.paused && !student.deletedAt) stopErr.definite = true;
    throw stopErr;
  }

  // [99차수] 검증 → 정규화 → (loadData에서) 한 번에 적용 → 같은 자료를 백업.
  //   필수 칸이 빠졌거나 모양이 틀리면 여기서 던진다 → 화면·백업 그대로, "이전 자료 표시 중" 안내.
  validateBundleFields(payload);
  const todoSource = pickField(payload, "todos", "todo4");
  const chkSource = pickField(payload, "checklistData", "chk3", "checklist");
  const recSource = pickField(payload, "records", "rec3");
  const vwSource = payload.videoWatch || payload.video_watch || {};
  const examSource = payload.exams || payload.exam3 || [];
  const vocabWrongSource = pickField(payload, "vocabWrongWords", "vocab_wrong_words");
  const videosSource = pickField(payload, "videos", "student_videos");
  // [99차수] 시험범위 — 서버는 예전부터 examRanges·examr3 둘 다 보냈는데 학생앱이 여기서 빠뜨려 카드가 비어 있었다.
  const examRangesSource = pickField(payload, "examRanges", "examr3");

  return {
    source: "worker",
    videoStatsUnavailable: raw?.sync?.videoStatsUnavailable === true,
    student,
    // [100차수] 워커 09-07판이 붙여 주는 메모: fresh=1을 받아 실제로 DB를 다시 읽었는지. 옛 워커면 null.
    syncMeta: (raw && raw.sync && typeof raw.sync === "object") ? raw.sync : null,
    withdrawnFlag, // [08-07] 마스터 모드에서만 true가 될 수 있다 — 화면 위 안내 띠용
    todos: normalizeByDateForStudent(todoSource, studentId),
    checklistData: normalizeByDateForStudent(chkSource, studentId),
    records: normalizeRecordsForStudent(recSource, studentId),
    videos: videosSource,
    videoWatch: normalizeVideoWatchForStudent(vwSource, studentId),
    examRanges: normalizeExamRanges(examRangesSource),
    makeups: payload.makeups || payload.mkp3 || [],
    customHolidays: payload.customHolidays || payload.holi3 || {},
    exams: Array.isArray(examSource) ? examSource : [],
    vocabWrongWords: normalizeVocabWrongWordsForStudent(vocabWrongSource, studentId),
    progressTree: payload.progressTree || payload.ptree3 || null,
    attLog: normalizeByDateForStudent(payload.attLog || payload.att_log3 || {}, studentId), // [일정] 등하원 기록
    att: normalizeByDateForStudent(payload.att || payload.att3 || {}, studentId), // [출결] 결석/지각 표시 (워커가 att3를 보내면 자동 표시)
    surveys: Array.isArray(payload.surveys || payload.svy3) ? (payload.surveys || payload.svy3) : [], // [설문] 진행 중 + 본인 대상
    surveyResponses: payload.surveyResponses || payload.svyr3 || {}, // [설문] 본인 응답
    // [137차수] 워커(리마스터 2차~)가 새로 주는 칸. 옛 워커면 둘 다 undefined.
    settings: isPlainObject(payload.settings) ? payload.settings : undefined,                       // 앱 설정(공휴일 등)
    vocaHw: payload.vocaHw === null ? null : (isPlainObject(payload.vocaHw) ? payload.vocaHw : undefined),   // 내 단어숙제 도장 { 날짜: 도장 } · null = 서버가 못 읽음
  };
};
export const loadStudentBundle = async (studentId, opts = {}) => {
  return await loadStudentBundleFromWorker(studentId, opts);
};
// [100차수] 수동 우회가 성공한 뒤 이 시간 동안은 자동 새로고침에도 fresh=1을 붙인다.
//   워커는 여러 대가 돌아서, 방금 새로 읽은 뒤에도 다음 자동 요청이 다른 워커의 옛 60초 기억을 받을 수 있기 때문.
//   워커의 BUNDLE_SHARED_TTL_MS(60초)와 같은 값. 수동 성공 때만 켜지고 자동 성공으로는 늘어나지 않는다.
export const FRESH_GRACE_MS = 60 * 1000;
// [110차수 09-09] 자동 새로고침 주기 — 60초 → 90초(서버 부담 1/3 감소). 연속 실패하면 150초 → 240초로 늘리고, 성공하면 90초로 돌아온다.
//   여러 폰이 같은 순간에 두드리지 않게 0~10초를 무작위로 더한다(09-09 검토 Q3). 화면을 다시 켜면 예전처럼 즉시 1번 받는다.
const BUNDLE_POLL_STEPS_MS = [90 * 1000, 150 * 1000, 240 * 1000];
const BUNDLE_POLL_JITTER_MS = 10 * 1000;
export const bundlePollDelayMs = (failCount, rnd = Math.random()) => {
  const idx = Math.max(0, Math.min(BUNDLE_POLL_STEPS_MS.length - 1, Number(failCount) || 0));
  return BUNDLE_POLL_STEPS_MS[idx] + Math.floor(rnd * BUNDLE_POLL_JITTER_MS);
};
export const getStudentBundleStorageKey = (studentId) => `maple_student_bundle_${studentId}`;
// ─── [08-10] "그만둔 학생" 판정 유예 (3진 아웃) ───
// 서버가 잠깐 잘못 답하는 순간(빈 명단, 순간적인 403·404)에도 예전 코드는
// 곧바로 차단 화면을 띄우고 폰 백업까지 지웠다. 지운 백업은 되돌릴 수 없다.
// 이제는 "같은 답이 10분 안에 3번 연속" 왔을 때만 진짜 그만둔 학생으로 보고 차단한다.
// 정말 그만둔 학생도 자동 새로고침(30초) 덕분에 1분 정도면 3번이 채워져 차단 화면을 본다.
export const WITHDRAWN_STRIKE_LIMIT = 3;
const WITHDRAWN_STRIKE_WINDOW_MS = 10 * 60 * 1000;
 // 10분 넘게 지난 기록은 "연속"으로 안 친다
const getWithdrawnStrikeKey = (studentId) => `maple_withdrawn_strikes_${studentId}`;
export const addWithdrawnStrike = (studentId) => {
  try {
    const key = getWithdrawnStrikeKey(studentId);
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { rec = null; }
    const now = Date.now();
    const fresh = rec && Number(rec.n) > 0 && (now - (Number(rec.at) || 0) < WITHDRAWN_STRIKE_WINDOW_MS);
    const n = (fresh ? Number(rec.n) : 0) + 1;
    localStorage.setItem(key, JSON.stringify({ n, at: now }));
    return n;
  } catch (e) {
    // 폰 저장이 아예 안 되는 환경이면 세는 것 자체가 불가능 — 예전처럼 즉시 판정한다.
    return WITHDRAWN_STRIKE_LIMIT;
  }
};
export const clearWithdrawnStrikes = (studentId) => {
  try { localStorage.removeItem(getWithdrawnStrikeKey(studentId)); } catch (e) { /* ignore */ }
};
// ─── [08-10] 연결 오류 화면용 짧은 오류 코드 ───
// 학생이 "E500 떠요"라고만 알려줘도 원장이 원인을 바로 좁힐 수 있게 한다.
//  E500·E429 등 숫자 = 서버가 그 번호로 거절함 / E-시간초과 = 20초 안에 답이 안 옴
//  E-네트워크 = 인터넷 끊김 / E-설정없음 = 앱 빌드에 서버 주소가 빠짐 / E-빈응답 = 서버 답에 알맹이가 없음
export const makeLoadErrorCode = (e) => {
  const msg = String(e?.message || "");
  if (/\(db_timeout\)/.test(msg)) return "E503-DB지연";        // [110차수] 워커가 DB 답을 8초 안에 못 받음(서버가 바쁨) — 폰 백업으로 넘어간 상태
  if (/응답 해석 실패/.test(msg)) return "E-깨진응답";              // [110차수] 답이 왔는데 JSON이 아님
  const m = msg.match(/API (?:오류|거절): (\d+)/);
  if (m) return "E" + m[1];
  if (/응답 지연/.test(msg)) return "E-시간초과";
  if (/미설정|주소가 없습니다/.test(msg)) return "E-설정없음";
  if (/찾을 수 없습니다|목록에 없는/.test(msg)) return "E-빈응답";
  if (/불완전|실패 응답/.test(msg)) return "E-불완전"; // [99차수] 서버 답에 필수 칸이 빠졌거나 success:false
  if (e && e.name === "TypeError") return "E-네트워크";
  return "E-알수없음";
};
// [08-08] 학원 서버에 기록을 저장할 때 "본인 확인 값"으로 함께 보내는 링크의 t 값.
// 주소가 없거나 값이 없으면 빈 문자열 — 워커는 값이 없으면 예전처럼 받아준다.
export const getSelfAccessToken = () => {
  try { return new URLSearchParams(window.location.search).get("t") || ""; } catch (e) { return ""; }
};
export const restoreStudentBundleFromLocal = (studentId) => {
  try {
    const raw = localStorage.getItem(getStudentBundleStorageKey(studentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.bundle || !parsed.bundle.student) return null;
    // [08-07] 예전 판(정지를 안 보던 때)이 저장해 둔 자료로 그만둔 학생이 열리는 것을 막는다.
    if (isWithdrawnStudent(parsed.bundle.student)) return null;
    // [08-10] 백업 유효기간 24시간 → 7일. 학생은 보통 이틀에 한 번 오므로 24시간이면 안전망이 거의 못 쓰였다.
    //         서버가 아픈 날에도 최근 일주일 안에 한 번이라도 열었던 학생은 화면이 뜬다.
    if (Date.now() - (parsed.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) return null;
    return { ...parsed.bundle, source: "local-backup", savedAt: parsed.savedAt || 0 };   // [98차수] 저장 시각도 같이 — 화면에 "언제 것인지" 보여주려고
  } catch (e) {
    return null;
  }
};
export const saveStudentBundleToLocal = (studentId, bundle = {}) => {
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
        videoStatsUnavailable: bundle.videoStatsUnavailable === true,
        makeups: bundle.makeups || [],
        customHolidays: bundle.customHolidays || {},
        exams: Array.isArray(bundle.exams || bundle.exam3) ? (bundle.exams || bundle.exam3) : [],
        examRanges: normalizeExamRanges(bundle.examRanges ?? bundle.examr3), // [99차수] 오프라인에서도 시험범위 카드가 뜨게
        vocabWrongWords: bundle.vocabWrongWords || {},
        progressTree: bundle.progressTree || null,
        attLog: bundle.attLog || {},
        att: bundle.att || {},
        surveys: bundle.surveys || [],
        surveyResponses: bundle.surveyResponses || {},
      },
    };
    localStorage.setItem(getStudentBundleStorageKey(studentId), JSON.stringify(snapshot));
  } catch (e) {
    console.warn("localStorage 백업 실패:", e?.message || e);
  }
};
