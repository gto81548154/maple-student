import { useState, useEffect, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

// ─── Supabase 연결 (원장님 앱과 같은 DB) ───
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const db = {
  async get(k) {
    try {
      const { data, error } = await supabase
        .from("kv_store")
        .select("value")
        .eq("key", k)
        .maybeSingle();
      if (error || !data) return null;
      if (typeof data.value === 'string') {
        return JSON.parse(data.value);
      }
      return data.value;
    } catch (e) { console.error("DB get error:", e); return null; }
  },
  async set(k, v) {
    try {
      const { error } = await supabase
        .from("kv_store")
        .upsert({ key: k, value: JSON.stringify(v) }, { onConflict: "key" });
      if (error) console.error("DB set error for key:", k, error);
    } catch (e) { console.error("DB set error:", e); }
  },
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
const HOLIDAYS = {
  "2025-01-01":"신정","2025-01-28":"설날","2025-01-29":"설날","2025-01-30":"설날",
  "2025-03-01":"삼일절","2025-05-05":"어린이날","2025-05-06":"대체공휴일","2025-06-06":"현충일",
  "2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석","2025-10-06":"추석","2025-10-07":"추석","2025-10-08":"대체공휴일",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2026-01-01":"신정","2026-02-16":"설날","2026-02-17":"설날","2026-02-18":"설날",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-05":"어린이날","2026-05-24":"석가탄신일",
  "2026-06-06":"현충일","2026-08-15":"광복절","2026-09-24":"추석","2026-09-25":"추석","2026-09-26":"추석",
  "2026-10-03":"개천절","2026-10-09":"한글날","2026-12-25":"크리스마스",
  "2027-01-01":"신정","2027-02-06":"설날","2027-02-07":"설날","2027-02-08":"설날","2027-02-09":"대체공휴일",
  "2027-03-01":"삼일절","2027-05-05":"어린이날","2027-05-13":"석가탄신일","2027-06-06":"현충일",
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

// ─── stripLabels (원장님 앱과 동일) ───
const stripLabels = (v) => v.split('\n').filter(l => !/^\s*\[(숙제|학원|학원과제)\]\s*$/.test(l)).join('\n');

// ─── 줄 맨 앞의 'ㅁ' 글자 제거 (학생 표시용 — 왼쪽에 이미 체크박스 있어서 중복) ───
const stripBox = (s) => s.replace(/^\s*ㅁ\s*/, '');

// ─── 5단계 정의 (학생용 라벨/색상/배지) ───
const STEP_DEFS = [
  { key: 'step1', label: '숙제',        color: '#e84393', bg: '#fdf2f8', badges: ['조교', '강사'] },
  { key: 'step2', label: '단어 TEST',   color: '#7c3aed', bg: '#f3e8ff', badges: ['조교'] },
  { key: 'step3', label: '오늘 수업',   color: '#4a6cf7', bg: '#eef1ff', badges: ['조교', '강사'], notice: '→ 수업 준비되면 조교T 한테 말씀드리기' },
  { key: 'step4', label: '마무리 TEST', color: '#00b894', bg: '#e8f8f5', badges: ['조교'] },
  { key: 'step5', label: '받을 자료',   color: '#e67e22', bg: '#fff4e6', badges: ['강사'] },
];

// 배지 스타일 (조교: 그린, 강사: 블루)
const BADGE_STYLES = {
  '조교': { bg: '#d1fae5', fg: '#065f46' },
  '강사': { bg: '#dbeafe', fg: '#1e40af' },
};

// ─── 동기부여 멘트 풀 (12개 — 매일 자정에 자동 변경, 학생 모두 같은 멘트) ───
// 4가지 테마: 시작·꾸준함 / 슬럼프 극복 / 노력·집중 / 자기확신
const MOTIVATION_MESSAGES = [
  { quote: "The secret of getting ahead is getting started.",                                           translation: "앞서가는 비결은 일단 시작하는 것이다.",                  author: "Mark Twain" },
  { quote: "Motivation is what gets you started. Habit is what keeps you going.",                       translation: "동기는 시작하게 만들고, 습관은 계속 나아가게 한다.",     author: "Jim Ryun" },
  { quote: "You don't have to be great to start, but you have to start to be great.",                   translation: "위대해지려면 시작해야 한다.",                              author: "Zig Ziglar" },
  { quote: "It always seems impossible until it's done.",                                               translation: "모든 일은 끝나기 전까진 불가능해 보인다.",                author: "Nelson Mandela" },
  { quote: "Don't watch the clock; do what it does. Keep going.",                                       translation: "시계를 보지 마라. 시계처럼 계속 나아가라.",               author: "Sam Levenson" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.",    translation: "중요한 것은 계속 나아가는 용기다.",                       author: "Winston Churchill" },
  { quote: "There are no shortcuts to any place worth going.",                                          translation: "갈 가치가 있는 곳에는 지름길이 없다.",                    author: "Beverly Sills" },
  { quote: "Do something today that your future self will thank you for.",                              translation: "미래의 내가 고마워할 일을 오늘 하라.",                    author: "Sean Patrick Flanery" },
  { quote: "I find that the harder I work, the more luck I seem to have.",                              translation: "더 열심히 할수록 운도 더 따른다.",                        author: "Thomas Jefferson" },
  { quote: "Believe you can and you're halfway there.",                                                 translation: "할 수 있다고 믿으면 이미 절반은 온 것이다.",              author: "Theodore Roosevelt" },
  { quote: "Doubt kills more dreams than failure ever will.",                                           translation: "의심은 실패보다 더 많은 꿈을 죽인다.",                    author: "Suzy Kassem" },
  { quote: "The future belongs to those who believe in the beauty of their dreams.",                    translation: "미래는 자신의 꿈을 믿는 자들의 것이다.",                  author: "Eleanor Roosevelt" },
];

// 오늘 날짜 기준 멘트 선택 (모든 학생이 같은 날 같은 멘트, 매일 자정에 변경)
const pickMotivation = () => {
  const now = new Date();
  const dayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return MOTIVATION_MESSAGES[dayKey % MOTIVATION_MESSAGES.length];
};

// ─── 학생 앱 가운데 정렬 폭 (PC 대응) ───
const MAX_W = 600;

// ─── 이탈 추적 임계값 (이 시간보다 짧은 이탈은 무시 — 카톡 알림 슬쩍 보고 돌아오는 경우) ───
const MIN_AWAY_SEC = 5;


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

const clampNum = (v, min = 0, max = 21600) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
};

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
  const sessionsToAdd = payload.eventType === "away" ? 0 : 1;
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
// 핵심 수정:
// steps5가 있으면 homework/academy 텍스트를 다시 매칭하지 않고, 원장앱에서 입력한 5칸 위치를 그대로 사용한다.
// 같은 문장이 step1과 step2에 반복되어도 각각 원래 칸에 표시되도록 하기 위함.
// 체크 키는 기존 호환을 위해 step1은 hw_index, step2~5는 academy 합산 순서의 ac_index를 유지한다.
const buildStepGroups = (todo) => {
  if (!todo) return [];
  const grouped = { step1: [], step2: [], step3: [], step4: [], step5: [] };
  const steps5 = todo.steps5;
  const hasSteps5 = steps5 && STEP_DEFS.some(def => String(steps5[def.key] || "").trim());

  if (hasSteps5) {
    let hwIdx = 0;
    let acIdx = 0;

    STEP_DEFS.forEach(def => {
      String(steps5[def.key] || "")
        .split("\n")
        .map(line => stripBox(line.trim()))
        .filter(Boolean)
        .forEach(text => {
          const isHomeworkStep = def.key === "step1";
          grouped[def.key].push({
            text,
            type: isHomeworkStep ? "hw" : "ac",
            idx: isHomeworkStep ? hwIdx++ : acIdx++,
          });
        });
    });

    return STEP_DEFS.map(def => ({ ...def, items: grouped[def.key] }));
  }

  // 구버전 데이터 폴백: steps5가 없는 예전 todo는 기존 homework/academy 기준으로 표시
  const hwLines = stripLabels(todo.homework || "").split("\n").filter(l => l.trim());
  const acLines = stripLabels(todo.academy || "").split("\n").filter(l => l.trim());

  hwLines.forEach((text, i) => {
    grouped.step1.push({ text: stripBox(text.trim()), type: "hw", idx: i });
  });
  acLines.forEach((text, i) => {
    grouped.step3.push({ text: stripBox(text.trim()), type: "ac", idx: i });
  });

  return STEP_DEFS.map(def => ({ ...def, items: grouped[def.key] }));
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
  const [tab, setTab] = useState("tasks");
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingVideo, setViewingVideo] = useState(null);
  const [viewStartTime, setViewStartTime] = useState(null);
  const [videoWatch, setVideoWatch] = useState({});
  const [selectedVideoBook, setSelectedVideoBook] = useState(null); // 영상 탭 책별 sub-tab 선택값 (null이면 첫 책 자동)
  const [pendingVideoCount, setPendingVideoCount] = useState(() => getPendingVideoWatch().length); // 저장 실패/대기 기록 개수
  const [lastVideoSaveStatus, setLastVideoSaveStatus] = useState(""); // 최근 영상 기록 저장 상태 표시

  // 이탈 추적용 ref (state로 안 쓰는 이유: 매 visibilitychange마다 리렌더 안 시키기 위함)
  const awayStartRef = useRef(null);   // 이탈 시작 시각 (Date.now() 또는 null)
  const activeSecRef = useRef(0);      // 영상 펼친 후 누적 활성 시간
  const awaySecRef = useRef(0);        // 영상 펼친 후 누적 이탈 시간 (5초+ 만)
  const awayCountRef = useRef(0);      // 이탈 횟수 (5초+ 만)
  const longestAwayRef = useRef(0);    // 가장 길었던 이탈 (초)
  const lastActiveAtRef = useRef(null); // 마지막 활성 측정 시각 (활성 시간 누적용)
  const currentSessionIdRef = useRef(null); // 현재 열려 있는 영상 세션 ID(중복 저장 방지용)

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    const load = async () => {
      try {
        const [stuData, todoData, chkData, recData, vidData, vwData, mkData, holData] = await Promise.all([
          db.get("stu3"), db.get("todo4"), db.get("chk3"), db.get("rec3"), db.get("student_videos"), db.get("video_watch"),
          db.get("mkp3"), db.get("holi3"),
        ]);
        const found = (stuData || []).find(s => String(s.id) === String(studentId) && !s.deletedAt);
        if (!found) { setError("not_found"); setLoading(false); return; }
        setStudent(found);
        setTodos(todoData || {});
        setChecklistData(chkData || {});
        setRecords(recData || {});
        setVideos(vidData || []);
        setVideoWatch(prev => mergeVideoWatchSnapshots(vwData || {}, prev || {}));
        setMakeups(mkData || []);
        setCustomHolidays(holData || {});
      } catch (e) {
        console.error("Load error:", e);
        setError("load_error");
      }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [studentId]);

  // 인라인 확장 토글: 같은 카드 클릭 → 닫기 / 다른 카드 클릭 → 이전 닫고 새로 열기
  const toggleVideo = async (video) => {
    const sameVideo = viewingVideo?.id === video.id;
    if (viewingVideo) {
      await closeVideo(); // 이전 영상 시청시간 저장하면서 닫기
    }
    if (!sameVideo) {
      // 이탈 추적 ref 초기화
      awayStartRef.current = null;
      activeSecRef.current = 0;
      awaySecRef.current = 0;
      awayCountRef.current = 0;
      longestAwayRef.current = 0;
      lastActiveAtRef.current = Date.now();
      currentSessionIdRef.current = makeVideoSessionId(studentId, video.id);
      setViewingVideo(video);
      setViewStartTime(Date.now());
    }
  };

  const closeVideo = async () => {
    console.log("closeVideo 호출됨", { viewingVideo, viewStartTime, studentId });
    if (viewingVideo && viewStartTime) {
      const elapsed = Math.round((Date.now() - viewStartTime) / 1000);

      // 이탈 추적: 마지막으로 활성 상태였다면 그 시간을 active에 더함
      // 반대로 이탈 중이었다면(awayStartRef 존재) 그 시간을 away로 마감
      if (awayStartRef.current) {
        const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
        if (awayDur >= MIN_AWAY_SEC) {
          awaySecRef.current += awayDur;
          awayCountRef.current += 1;
          if (awayDur > longestAwayRef.current) longestAwayRef.current = awayDur;
        }
        awayStartRef.current = null;
      } else if (lastActiveAtRef.current) {
        activeSecRef.current += Math.round((Date.now() - lastActiveAtRef.current) / 1000);
      }

      const activeSec = activeSecRef.current;
      const awaySec = awaySecRef.current;
      const awayCount = awayCountRef.current;
      const longestAway = longestAwayRef.current;
      const timestamp = new Date().toISOString();
      const payload = {
        eventType: "session",
        sessionId: currentSessionIdRef.current || makeVideoSessionId(studentId, viewingVideo.id),
        studentId: String(studentId),
        videoId: String(viewingVideo.id),
        title: viewingVideo.title || "",
        subject: viewingVideo.subject || "",
        url: viewingVideo.url || viewingVideo.playlistUrl || "",
        videoType: viewingVideo.type || "video",
        seconds: clampNum(elapsed),
        activeSec: clampNum(activeSec),
        awaySec: clampNum(awaySec, 0, 86400),
        awayCount: clampNum(awayCount, 0, 10000),
        longestAwaySec: clampNum(longestAway, 0, 86400),
        durSec: 720,
        date: getTodayStr(),
        timestamp,
        source: "student_app",
      };

      console.log("시청 기록 저장 요청:", payload);
      try {
        await postVideoWatchToWorker(payload);
        console.log("video-watch Worker 저장 완료");
        setLastVideoSaveStatus("영상 기록 저장 완료");
      } catch (e) {
        console.error("video-watch Worker 저장 실패, 로컬 대기열에 보관:", e);
        queuePendingVideoWatch(payload);
        setPendingVideoCount(getPendingVideoWatch().length);
        setLastVideoSaveStatus("저장 대기 중");
      }
      // Supabase에 직접 쓰지 않는다. Turso 원본 저장은 Worker가 담당하고, 화면은 즉시 로컬 반영만 한다.
      setVideoWatch(prev => applyVideoWatchLocal(prev || {}, payload));
      try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
    } else {
      console.log("조건 불충족 - viewingVideo:", !!viewingVideo, "viewStartTime:", !!viewStartTime);
    }
    // ref 초기화
    awayStartRef.current = null;
    activeSecRef.current = 0;
    awaySecRef.current = 0;
    awayCountRef.current = 0;
    longestAwayRef.current = 0;
    lastActiveAtRef.current = null;
    currentSessionIdRef.current = null;
    setViewingVideo(null);
    setViewStartTime(null);
  };

  // ─── 이탈 추적: 사용자가 다른 앱/탭으로 갔다가 돌아올 때 측정 ───
  // (visibilitychange 이벤트는 iOS/Android/PC 모두 지원하는 표준 API)
  useEffect(() => {
    if (!viewingVideo) return;

    const handleVisibility = () => {
      if (document.hidden) {
        // 이탈 시작
        // 활성 시간 누적 (visible → hidden 전환 시점)
        if (lastActiveAtRef.current) {
          activeSecRef.current += Math.round((Date.now() - lastActiveAtRef.current) / 1000);
          lastActiveAtRef.current = null;
        }
        awayStartRef.current = Date.now();
        // iOS Safari가 30초 후 JS 정지시킬 수 있어서, 이탈 시작 시각을 즉시 localStorage에 기록
        // → 돌아왔을 때 또는 다음 방문 시 복구 가능
        try {
          localStorage.setItem("pending_away", JSON.stringify({
            studentId, videoId: viewingVideo.id, title: viewingVideo.title,
            awayStartedAt: awayStartRef.current,
          }));
        } catch (e) { /* ignore */ }
      } else {
        // 복귀
        if (awayStartRef.current) {
          const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
          // 5초 미만은 무시 (카톡 알림 슬쩍 보고 돌아오는 경우)
          if (awayDur >= MIN_AWAY_SEC) {
            awaySecRef.current += awayDur;
            awayCountRef.current += 1;
            if (awayDur > longestAwayRef.current) longestAwayRef.current = awayDur;
          }
          awayStartRef.current = null;
        }
        // 활성 측정 재시작
        lastActiveAtRef.current = Date.now();
        try { localStorage.removeItem("pending_away"); } catch (e) { /* ignore */ }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [viewingVideo, studentId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (viewingVideo && viewStartTime) {
        const elapsed = Math.round((Date.now() - viewStartTime) / 1000);

        // 이탈 추적 마감 처리
        let finalActive = activeSecRef.current;
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
        } else if (lastActiveAtRef.current) {
          finalActive += Math.round((Date.now() - lastActiveAtRef.current) / 1000);
        }

        const payload = {
          eventType: "session",
          sessionId: currentSessionIdRef.current || makeVideoSessionId(studentId, viewingVideo.id),
          studentId: String(studentId),
          videoId: String(viewingVideo.id),
          title: viewingVideo.title || "",
          subject: viewingVideo.subject || "",
          url: viewingVideo.url || viewingVideo.playlistUrl || "",
          videoType: viewingVideo.type || "video",
          seconds: clampNum(elapsed),
          activeSec: clampNum(finalActive),
          awaySec: clampNum(finalAway, 0, 86400),
          awayCount: clampNum(finalAwayCount, 0, 10000),
          longestAwaySec: clampNum(finalLongestAway, 0, 86400),
          durSec: 720,
          date: getTodayStr(),
          timestamp: new Date().toISOString(),
          source: "student_app_beforeunload",
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

        // 3) 새 대기열을 Worker로 순차 전송. 실패한 항목만 다시 보관.
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
          <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#4a6cf7", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
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
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#4a6cf7", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>다시 시도</button>
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

  // 5단계 그룹 (빈 단계 자동 숨김 + 재번호는 렌더링 시 idx+1)
  const stepGroups = buildStepGroups(todo);

  const chk = checklistData[activeDate]?.[studentId] || checklistData[activeDate]?.[Number(studentId)] || {};
  // 어드민과 동일한 3-상태 모델: undefined/false → none, true/"done" → done, "fail:사유..." → fail
  const getCheckStatus = (type, idx) => {
    const val = chk[`${type}_${idx}`];
    if (!val) return "none";
    if (val === true || val === "done") return "done";
    if (typeof val === "string" && val.startsWith("fail:")) return "fail";
    return "done";
  };
  const getFailReason = (type, idx) => {
    const val = chk[`${type}_${idx}`];
    if (typeof val === "string" && val.startsWith("fail:")) return val.slice(5);
    return "";
  };
  const isChecked = (type, idx) => getCheckStatus(type, idx) === "done";
  const isFailed = (type, idx) => getCheckStatus(type, idx) === "fail";

  // 진행률: 모든 step의 모든 item 합산 (체크 키는 hw_/ac_ 그대로)
  const allItems = stepGroups.flatMap(s => s.items);
  // 미완료(fail) 항목은 진행률 계산에서 완전히 제외 (분모/분자 둘 다 빠짐)
  const countableItems = allItems.filter(item => !isFailed(item.type, item.idx));
  const totalTasks = countableItems.length;
  const doneTasks = countableItems.filter(item => isChecked(item.type, item.idx)).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const studentVideos = videos.filter(v => !v.studentId || String(v.studentId) === String(studentId));

  // 다가올 등원일 텍스트 (헤더 표시용)
  const upcomingAtt = computeUpcomingAttendance(student, makeups, customHolidays);
  const upcomingAttText = upcomingAtt
    .map(a => `${fmtAttDay(a.dateObj)} ${fmtTime(a.time)}${a.isMakeup ? " (보충)" : ""}`)
    .join(", ");

  const F = "'Pretendard Variable', -apple-system, sans-serif";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", fontFamily: F }}>
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", padding: "28px 24px 24px", color: "#fff" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
            {student.name?.[0] || "?"}
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
        </div>

        {/* 오늘의 영어 명언 (매일 자정에 자동 변경 — 학생 전원 동일) */}
        {(() => {
          const m = pickMotivation();
          return (
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 12,
              padding: "12px 14px", marginBottom: pinnedMessages.length > 0 ? 12 : 0,
              borderLeft: "3px solid rgba(255,255,255,0.35)",
            }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.95)", lineHeight: 1.5, fontStyle: "italic" }}>
                "{m.quote}"
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4, lineHeight: 1.5 }}>
                {m.translation} <span style={{ color: "rgba(255,255,255,0.45)" }}>— {m.author}</span>
              </div>
            </div>
          );
        })()}

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
              <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg, #00b894, #69f0ae)" : "linear-gradient(90deg, #4fc3f7, #7c4dff)", transition: "width 0.5s cubic-bezier(.4,0,.2,1)" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex" }}>
        {[
          { key: "tasks", label: "📋 숙제/과제" },
          ...(studentVideos.length > 0 ? [{ key: "videos", label: "🎬 강의 영상" }] : []),
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "14px 0", border: "none", cursor: "pointer",
            background: "transparent", fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? "#1a1a2e" : "#999",
            borderBottom: tab === t.key ? "2.5px solid #1a1a2e" : "2.5px solid transparent",
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
                    background: d === activeDate ? "#1a1a2e" : "#fff",
                    color: d === activeDate ? "#fff" : "#666",
                    boxShadow: d === activeDate ? "0 2px 8px rgba(26,26,46,0.25)" : "0 1px 3px rgba(0,0,0,0.06)",
                    whiteSpace: "nowrap",
                  }}>{isToday(d) ? "오늘" : fmtDateShort(d)}</button>
                ))}
              </div>
            )}
            {allDates.length > 0 && (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: "12px 0 16px" }}>
                {fmtDateKR(activeDate)}
                {isToday(activeDate) && <span style={{ fontSize: 12, color: "#7c4dff", marginLeft: 8, fontWeight: 600 }}>TODAY</span>}
              </div>
            )}

            {/* 5단계 렌더링 (빈 단계 자동 숨김 + 재번호 1,2,3...) */}
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
                      border: isActive ? "1.5px solid #4a6cf7" : "1px solid #e0e0e0",
                      background: isActive ? "#4a6cf7" : "#fff",
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
              강의를 눌러 시청하세요.{hasMultipleBooks ? ` (${activeBook}: ${visibleVideos.length}개)` : ""}
            </div>
            {visibleVideos.map((v) => {
              const isOpen = viewingVideo?.id === v.id;
              return (
                <div key={v.id} style={{
                  background: "#fff", borderRadius: 14, marginBottom: 12,
                  boxShadow: isOpen ? "0 4px 16px rgba(74,108,247,0.15)" : "0 1px 4px rgba(0,0,0,0.04)",
                  border: isOpen ? "2px solid #4a6cf7" : "2px solid transparent",
                  overflow: "hidden", transition: "box-shadow 0.2s, border-color 0.2s",
                }}>
                  {/* 카드 헤더 (클릭으로 토글) */}
                  <div onClick={() => toggleVideo(v)} style={{
                    padding: 16, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: v.type === "playlist" ? "linear-gradient(135deg, #e74c3c, #e67e22)" : "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{v.type === "playlist" ? "📋" : "▶️"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>{v.title}</div>
                      <div style={{ fontSize: 12, color: "#bbb", marginTop: 3 }}>{v.type === "playlist" ? "재생목록 전체 보기" : (v.subject || "")}</div>
                    </div>
                    <div style={{ color: isOpen ? "#4a6cf7" : "#ccc", fontSize: 18, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</div>
                  </div>

                  {/* 펼쳐진 영상 (인라인) */}
                  {isOpen && (
                    <div style={{ padding: "0 16px 16px" }}>
                      {v.type === "playlist" && v.playlistUrl ? (
                        <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                          <iframe
                            src={`https://www.youtube.com/embed/videoseries?list=${extractPlaylistId(v.playlistUrl)}&rel=0`}
                            style={{ width: "100%", height: "100%", border: "none" }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : v.url && v.url.includes("youtu") ? (
                        <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${extractYoutubeId(v.url)}?rel=0`}
                            style={{ width: "100%", height: "100%", border: "none" }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
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
        </div>
      </div>
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
const VIDEO_TASK_KEYWORDS = ["수강", "시청", "강의", "영상"];

function hasVideoKeyword(text) {
  if (!text) return false;
  return VIDEO_TASK_KEYWORDS.some(kw => text.includes(kw));
}

// 하이픈/언더스코어/콤마를 모두 스페이스로 통일 후 비교
function normalizeForMatch(s) {
  return String(s || "").replace(/[-_,]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

// 텍스트에서 숫자 추출 (예: "37 38" → [37, 38], "2,3" → [2, 3])
function extractTaskNumbers(text) {
  const m = (text || "").match(/\d+/g);
  return m ? m.map(n => parseInt(n, 10)).filter(n => n > 0 && n < 10000) : [];
}

// 매칭 메인 함수
// 반환: { hasKeyword, matched, bookCandidates }
//   - hasKeyword: 시청 키워드 포함 여부 (▶ 버튼 표시 트리거)
//   - matched: 책+숫자 모두 매칭된 영상들
//   - bookCandidates: 책만 매칭된 영상들 (3단계에서 폴백용)
function matchVideosForTask(taskText, studentVideos) {
  const hasKw = hasVideoKeyword(taskText);
  if (!hasKw || !studentVideos || studentVideos.length === 0) {
    return { hasKeyword: hasKw, matched: [], bookCandidates: [] };
  }
  const taskNorm = normalizeForMatch(taskText);
  const taskNumbers = extractTaskNumbers(taskText);

  // 1단계: subject(책 이름)가 숙제 텍스트에 포함된 영상만 후보로
  const bookCandidates = studentVideos.filter(v => {
    const subj = normalizeForMatch(v.subject);
    return subj && taskNorm.includes(subj);
  });
  if (bookCandidates.length === 0) {
    return { hasKeyword: true, matched: [], bookCandidates: [] };
  }

  // 2단계: 후보 영상 중 제목 숫자가 숙제 숫자에 포함된 것만 매칭
  // 단, 숙제에 숫자가 없으면 책의 영상 전체가 매칭 대상 (예: "천일문 고등 그래머 강의 듣기")
  const matched = taskNumbers.length === 0
    ? bookCandidates
    : bookCandidates.filter(v => {
        const titleNums = extractTaskNumbers(v.title);
        return titleNums.some(tn => taskNumbers.includes(tn));
      });

  return { hasKeyword: true, matched, bookCandidates };
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
function HomeworkItem({ item, isLast, isCheckedFn, isFailedFn, getFailReasonFn, studentVideos, viewingVideo, toggleVideo }) {
  const [showAll, setShowAll] = useState(false);
  const done = isCheckedFn(item.type, item.idx);
  const fail = isFailedFn ? isFailedFn(item.type, item.idx) : false;
  const failReason = fail && getFailReasonFn ? getFailReasonFn(item.type, item.idx) : "";
  const { hasKeyword, matched, bookCandidates } = matchVideosForTask(item.text, studentVideos);
  const hasMatch = matched.length > 0;
  const showFallback = hasKeyword && bookCandidates.length > 0 && !!toggleVideo;
  const showVideoButtons = hasMatch && !!toggleVideo;

  // 현재 펼쳐진 영상 (matched 또는 폴백 펼침 모두 포함)
  const openVideo = showFallback ? bookCandidates.find(v => viewingVideo?.id === v.id) : null;
  const isAnyOpen = !!openVideo;

  // 폴백 라벨용 책 이름 (보통 1개 책만 매칭됨)
  const bookSubject = bookCandidates[0]?.subject || "";

  return (
    <div style={{ borderBottom: !isLast ? "1px solid #f5f5f5" : "none", background: done ? "#f0fdf4" : fail ? "#fef2f2" : "#fff" }}>
      {/* 항목 행 (체크박스 + 텍스트 + 매칭 ▶ 버튼들) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
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
        {showVideoButtons && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {matched.map(v => {
              const isOpen = viewingVideo?.id === v.id;
              return (
                <button key={v.id} onClick={(e) => { e.stopPropagation(); toggleVideo(v); }} style={{
                  padding: "5px 11px", borderRadius: 7,
                  border: isOpen ? "1.5px solid #4a6cf7" : "1px solid #d0d4e0",
                  background: isOpen ? "#eef1ff" : "#fff",
                  color: isOpen ? "#4a6cf7" : "#555",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4, transition: "all 0.15s", whiteSpace: "nowrap",
                }}>
                  <span style={{ fontSize: 10 }}>{isOpen ? "▼" : "▶"}</span> {getVideoShortLabel(v)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 미완료 사유 표시 (fail이고 사유가 있을 때만) — 텍스트와 정렬되도록 padding-left 50 (체크박스 22 + gap 12 + padding 16) */}
      {fail && failReason && (
        <div style={{ padding: "0 16px 12px 50px", fontSize: 12, color: "#dc2626", lineHeight: 1.4 }}>
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
                border: isOpen ? "1.5px solid #4a6cf7" : (isMatched ? "1px solid #fde047" : "1px solid #e0e0e0"),
                background: isOpen ? "#eef1ff" : (isMatched ? "#fef9c3" : "#fff"),
                color: isOpen ? "#4a6cf7" : (isMatched ? "#854d0e" : "#666"),
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
                <iframe
                  src={`https://www.youtube.com/embed/videoseries?list=${extractPlaylistId(v.playlistUrl)}&rel=0`}
                  style={{ width: "100%", height: "100%", border: "none" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : v.url && v.url.includes("youtu") ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                <iframe
                  src={`https://www.youtube.com/embed/${extractYoutubeId(v.url)}?rel=0`}
                  style={{ width: "100%", height: "100%", border: "none" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
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
            key={`${item.type}_${item.idx}`}
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
