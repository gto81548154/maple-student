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
  { key: 'step3', label: '오늘 수업',   color: '#4a6cf7', bg: '#eef1ff', badges: ['강사'], notice: '→ 수업 준비되면 조교T 한테 말씀드리기' },
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

// ─── todo → 단계별 그룹 ───
// admin 앱은 step별 시각 그룹핑만 하고 체크 키는 hw_index/ac_index 유지 → 학생 앱도 동일
// steps5 텍스트와 homework/academy 라인을 매칭해서 각 라인이 어느 step에 속하는지 결정
const buildStepGroups = (todo) => {
  if (!todo) return [];
  const hwLines = stripLabels(todo.homework || "").split("\n").filter(l => l.trim());
  const acLines = stripLabels(todo.academy || "").split("\n").filter(l => l.trim());
  const items = [
    ...hwLines.map((text, i) => ({ text: stripBox(text.trim()), type: 'hw', idx: i })),
    ...acLines.map((text, i) => ({ text: stripBox(text.trim()), type: 'ac', idx: i })),
  ];

  // steps5 텍스트 → step 매핑 (admin의 stepKeyByText 패턴)
  const steps5 = todo.steps5;
  const stepKeyByText = new Map();
  if (steps5) {
    STEP_DEFS.forEach(def => {
      String(steps5[def.key] || "").split('\n').forEach(line => {
        const t = stripBox(line.trim());
        if (t && !stepKeyByText.has(t)) stepKeyByText.set(t, def.key);
      });
    });
  }

  // 각 라인을 step 버킷에 분류 (매칭 실패 시 폴백: hw→step1, ac→step3)
  const grouped = { step1: [], step2: [], step3: [], step4: [], step5: [] };
  items.forEach(item => {
    const stepKey = stepKeyByText.get(item.text)
      || (item.type === 'hw' ? 'step1' : 'step3');
    grouped[stepKey].push(item);
  });

  // STEP_DEFS 순서대로 (빈 단계도 포함 — 학생이 전체 5단계 흐름을 보도록)
  return STEP_DEFS
    .map(def => ({ ...def, items: grouped[def.key] }));
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

  // 이탈 추적용 ref (state로 안 쓰는 이유: 매 visibilitychange마다 리렌더 안 시키기 위함)
  const awayStartRef = useRef(null);   // 이탈 시작 시각 (Date.now() 또는 null)
  const activeSecRef = useRef(0);      // 영상 펼친 후 누적 활성 시간
  const awaySecRef = useRef(0);        // 영상 펼친 후 누적 이탈 시간 (5초+ 만)
  const awayCountRef = useRef(0);      // 이탈 횟수 (5초+ 만)
  const longestAwayRef = useRef(0);    // 가장 길었던 이탈 (초)
  const lastActiveAtRef = useRef(null); // 마지막 활성 측정 시각 (활성 시간 누적용)

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    const load = async () => {
      try {
        const [stuData, todoData, chkData, recData, vidData, vwData, mkData, holData] = await Promise.all([
          db.get("stu3"), db.get("todo4"), db.get("chk3"), db.get("rec3"), db.get("student_videos"), db.get("video_watch"),
          db.get("mkp3"), db.get("holi3"),
        ]);
        const found = (stuData || []).find(s => String(s.id) === String(studentId));
        if (!found) { setError("not_found"); setLoading(false); return; }
        setStudent(found);
        setTodos(todoData || {});
        setChecklistData(chkData || {});
        setRecords(recData || {});
        setVideos(vidData || []);
        setVideoWatch(vwData || {});
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
        // 닫는 순간까지 이탈 중이었음 → away 마감
        const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
        if (awayDur >= MIN_AWAY_SEC) {
          awaySecRef.current += awayDur;
          awayCountRef.current += 1;
          if (awayDur > longestAwayRef.current) longestAwayRef.current = awayDur;
        }
        awayStartRef.current = null;
      } else if (lastActiveAtRef.current) {
        // 활성 상태로 닫음 → 마지막 활성 시간을 active에 더함
        activeSecRef.current += Math.round((Date.now() - lastActiveAtRef.current) / 1000);
      }

      const activeSec = activeSecRef.current;
      const awaySec = awaySecRef.current;
      const awayCount = awayCountRef.current;
      const longestAway = longestAwayRef.current;
      console.log("시청시간:", elapsed, "초, active:", activeSec, "away:", awaySec, "(", awayCount, "회)", "videoId:", viewingVideo.id);

      try {
        const key = `vtime_${studentId}`;
        const existing = await db.get(key) || [];
        existing.push({ videoId: viewingVideo.id, title: viewingVideo.title, seconds: elapsed, activeSec, awaySec, awayCount, longestAwaySec: longestAway, date: getTodayStr(), timestamp: new Date().toISOString() });
        await db.set(key, existing);
        console.log("vtime 저장 완료");
        // video_watch 집계 업데이트
        const vw = await db.get("video_watch") || {};
        if (!vw[studentId]) vw[studentId] = {};
        const prev = vw[studentId][viewingVideo.id] || { watchSec: 0, sessions: 0, activeSec: 0, awaySec: 0, awayCount: 0, longestAwaySec: 0 };
        const totalSec = prev.watchSec + elapsed;
        const estDur = 720; // 12분 기본 추정
        vw[studentId][viewingVideo.id] = {
          watchSec: totalSec,
          durSec: prev.durSec || estDur,
          pct: Math.min(100, Math.round(totalSec / estDur * 100)),
          lastAt: new Date().toISOString(),
          sessions: prev.sessions + 1,
          // 이탈 추적 누적
          activeSec: (prev.activeSec || 0) + activeSec,
          awaySec: (prev.awaySec || 0) + awaySec,
          awayCount: (prev.awayCount || 0) + awayCount,
          longestAwaySec: Math.max(prev.longestAwaySec || 0, longestAway),
        };
        await db.set("video_watch", vw);
        console.log("video_watch 저장 완료", vw);
        setVideoWatch(vw);
      } catch (e) { console.error("체류시간 저장 실패:", e); }
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
          // 이탈 중 페이지 떠남 → away 마감
          const awayDur = Math.round((Date.now() - awayStartRef.current) / 1000);
          if (awayDur >= MIN_AWAY_SEC) {
            finalAway += awayDur;
            finalAwayCount += 1;
            if (awayDur > finalLongestAway) finalLongestAway = awayDur;
          }
        } else if (lastActiveAtRef.current) {
          finalActive += Math.round((Date.now() - lastActiveAtRef.current) / 1000);
        }

        try {
          const pending = JSON.parse(localStorage.getItem("pending_vtime") || "[]");
          pending.push({
            studentId, videoId: viewingVideo.id, title: viewingVideo.title,
            seconds: elapsed,
            activeSec: finalActive, awaySec: finalAway,
            awayCount: finalAwayCount, longestAwaySec: finalLongestAway,
            date: getTodayStr(), timestamp: new Date().toISOString(),
          });
          localStorage.setItem("pending_vtime", JSON.stringify(pending));
          localStorage.removeItem("pending_away"); // 정상 처리됐으니 제거
        } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [viewingVideo, viewStartTime, studentId]);

  useEffect(() => {
    const flush = async () => {
      try {
        // 1) pending_away 고아 데이터 복구 (앱이 강제 종료되어 visibility 복귀 처리 못 한 경우)
        // 예: iOS가 백그라운드에서 JS 정지시켜서 돌아왔을 때 처리 못 한 경우
        try {
          const orphanAway = JSON.parse(localStorage.getItem("pending_away") || "null");
          if (orphanAway && orphanAway.awayStartedAt) {
            const awayDur = Math.round((Date.now() - orphanAway.awayStartedAt) / 1000);
            if (awayDur >= MIN_AWAY_SEC && orphanAway.studentId && orphanAway.videoId) {
              // 단, 비현실적으로 긴 이탈(24시간 이상)은 무시 — 학생이 그냥 앱 닫고 나간 것
              const MAX_REALISTIC_AWAY = 86400; // 24h
              if (awayDur < MAX_REALISTIC_AWAY) {
                const vw = await db.get("video_watch") || {};
                if (!vw[orphanAway.studentId]) vw[orphanAway.studentId] = {};
                const prev = vw[orphanAway.studentId][orphanAway.videoId] || { watchSec: 0, sessions: 0, activeSec: 0, awaySec: 0, awayCount: 0, longestAwaySec: 0 };
                vw[orphanAway.studentId][orphanAway.videoId] = {
                  ...prev,
                  awaySec: (prev.awaySec || 0) + awayDur,
                  awayCount: (prev.awayCount || 0) + 1,
                  longestAwaySec: Math.max(prev.longestAwaySec || 0, awayDur),
                };
                await db.set("video_watch", vw);
              }
            }
          }
          localStorage.removeItem("pending_away");
        } catch (e) { /* ignore */ }

        // 2) pending_vtime flush (기존 로직 + 이탈 데이터)
        const pending = JSON.parse(localStorage.getItem("pending_vtime") || "[]");
        if (pending.length === 0) return;
        const vw = await db.get("video_watch") || {};
        for (const item of pending) {
          const key = `vtime_${item.studentId}`;
          const existing = await db.get(key) || [];
          existing.push(item);
          await db.set(key, existing);
          // video_watch 집계 (이탈 데이터 포함)
          if (!vw[item.studentId]) vw[item.studentId] = {};
          const prev = vw[item.studentId][item.videoId] || { watchSec: 0, sessions: 0, activeSec: 0, awaySec: 0, awayCount: 0, longestAwaySec: 0 };
          const totalSec = prev.watchSec + item.seconds;
          const estDur = prev.durSec || 720;
          vw[item.studentId][item.videoId] = {
            watchSec: totalSec,
            durSec: estDur,
            pct: Math.min(100, Math.round(totalSec / estDur * 100)),
            lastAt: item.timestamp,
            sessions: prev.sessions + 1,
            activeSec: (prev.activeSec || 0) + (item.activeSec || 0),
            awaySec: (prev.awaySec || 0) + (item.awaySec || 0),
            awayCount: (prev.awayCount || 0) + (item.awayCount || 0),
            longestAwaySec: Math.max(prev.longestAwaySec || 0, item.longestAwaySec || 0),
          };
        }
        await db.set("video_watch", vw);
        localStorage.removeItem("pending_vtime");
      } catch (e) { /* ignore */ }
    };
    flush();
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
  const isChecked = (type, idx) => !!chk[`${type}_${idx}`];

  // 진행률: 모든 step의 모든 item 합산 (체크 키는 hw_/ac_ 그대로)
  const allItems = stepGroups.flatMap(s => s.items);
  const totalTasks = allItems.length;
  const doneTasks = allItems.filter(item => isChecked(item.type, item.idx)).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const studentVideos = videos.filter(v => !v.studentId || v.studentId === studentId);

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
        {tab === "videos" && (
          <div>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>강의를 눌러 시청하세요.</div>
            {studentVideos.map((v) => {
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
        )}
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

// ─── StepSection: 단계별 카드 (라벨 + 배지 + notice + 체크리스트) ───
function StepSection({ step, displayNum, isChecked }) {
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
        ) : items.map((item, i) => {
          const done = isChecked(item.type, item.idx);
          return (
            <div key={`${item.type}_${item.idx}`} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              borderBottom: i < items.length - 1 ? "1px solid #f5f5f5" : "none",
              background: done ? "#f0fdf4" : "#fff",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                border: done ? "none" : "2px solid #e0e0e0",
                background: done ? "linear-gradient(135deg, #00b894, #00cec9)" : "#f9f9f9",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: done ? "#999" : "#333", textDecoration: done ? "line-through" : "none" }}>{item.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
