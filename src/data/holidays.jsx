// 한국 공휴일 2025-2027 — "기본값" 표. 원장앱 domain/time.jsx 의 DEFAULT_HOLIDAYS 와 같은 표다.
// [137차수] 이제 이 표는 기본값일 뿐이고, 원장앱 "앱 설정 → 공휴일"에서 고친 해는 서버(마플싱커 리마스터 2차~)가 내려 주는 설정이 이긴다.
//   → 공휴일을 고치려고 학생앱 코드를 손댈 필요가 없다. (옛 워커면 설정이 안 와서 이 기본값 그대로)
// [2026-10-14] 제헌절 재지정 및 우주항공청 2027년 월력요항 반영. 저장된 연도별 사용자 설정은 유지.
export const DEFAULT_HOLIDAYS = Object.freeze({
  "2025-01-01":"신정","2025-01-27":"임시공휴일","2025-01-28":"설날","2025-01-29":"설날","2025-01-30":"설날",
  "2025-03-01":"삼일절","2025-03-03":"대체공휴일","2025-05-01":"근로자의 날","2025-05-05":"어린이날","2025-05-06":"대체공휴일","2025-06-03":"대통령선거일","2025-06-06":"현충일",
  "2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석","2025-10-06":"추석","2025-10-07":"추석","2025-10-08":"대체공휴일",
  "2025-10-09":"한글날","2025-12-25":"크리스마스",
  "2026-01-01":"신정","2026-02-16":"설날","2026-02-17":"설날","2026-02-18":"설날",
  "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-01":"근로자의 날","2026-05-05":"어린이날","2026-05-24":"석가탄신일","2026-05-25":"대체공휴일",
  "2026-06-03":"지방선거일","2026-06-06":"현충일","2026-07-17":"제헌절","2026-08-15":"광복절","2026-08-17":"대체공휴일",
  "2026-09-24":"추석","2026-09-25":"추석","2026-09-26":"추석",
  "2026-10-03":"개천절","2026-10-05":"대체공휴일","2026-10-09":"한글날","2026-12-25":"크리스마스",
  "2027-01-01":"신정","2027-02-06":"설날","2027-02-07":"설날","2027-02-08":"설날","2027-02-09":"대체공휴일",
  "2027-03-01":"삼일절","2027-05-01":"근로자의 날","2027-05-03":"대체공휴일","2027-05-05":"어린이날","2027-05-13":"석가탄신일","2027-06-06":"현충일","2027-07-17":"제헌절","2027-07-19":"대체공휴일",
  "2027-08-15":"광복절","2027-08-16":"대체공휴일",
  "2027-09-14":"추석","2027-09-15":"추석","2027-09-16":"추석",
  "2027-10-03":"개천절","2027-10-04":"대체공휴일","2027-10-09":"한글날","2027-10-11":"대체공휴일","2027-12-25":"크리스마스","2027-12-27":"대체공휴일",
});
// 앱 전체가 읽는 표. 같은 객체를 그 자리에서 다시 채우므로(setHolidayOverrides) 읽는 쪽 코드는 예전 그대로다.
export const HOLIDAYS = { ...DEFAULT_HOLIDAYS };

// 날짜 글자 "YYYY-MM-DD"이고 달력에 실제로 있는 날인지
const isHolidayDateKey = (k) => {
  const s = String(k || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);   // 2월 30일처럼 달력에 없는 날은 거른다
  return !isNaN(d.getTime()) && d.getMonth() + 1 === Number(s.slice(5, 7)) && d.getDate() === Number(s.slice(8, 10));
};
// 설정의 공휴일 묶음 { "2028": { "2028-01-01": "신정", … } } 을 안전한 꼴로(원장앱과 같은 규칙): 해 4자리·그 해 날짜만·이름은 글자(비면 "공휴일")
const normalizeHolidayOverrides = (byYear) => {
  const out = {};
  if (!byYear || typeof byYear !== "object" || Array.isArray(byYear)) return out;
  Object.keys(byYear).forEach((y) => {
    if (!/^\d{4}$/.test(y)) return;
    const t = byYear[y];
    if (!t || typeof t !== "object" || Array.isArray(t)) return;
    const yr = {};
    Object.keys(t).sort().forEach((d) => { if (isHolidayDateKey(d) && d.slice(0, 4) === y) yr[d] = String(t[d] ?? "").trim() || "공휴일"; });
    out[y] = yr;
  });
  return out;
};
// 설정 표를 HOLIDAYS에 반영한다. 설정에 있는 해는 그 해 전체를 설정 표로 갈아 끼우고, 없는 해는 기본값 그대로.
const setHolidayOverrides = (byYear) => {
  const ov = normalizeHolidayOverrides(byYear);
  Object.keys(HOLIDAYS).forEach((k) => { delete HOLIDAYS[k]; });
  Object.keys(DEFAULT_HOLIDAYS).forEach((d) => { if (!ov[d.slice(0, 4)]) HOLIDAYS[d] = DEFAULT_HOLIDAYS[d]; });
  Object.keys(ov).forEach((y) => { Object.assign(HOLIDAYS, ov[y]); });
};

// ─── [137차수] 서버가 내려 준 앱 설정 받기 ───
// 받는 모양(마플싱커 리마스터 2차~): { holidays: {해:{날짜:이름}} | null, fixnoteBooks, mockExams, updatedAt }
//   · holidays 가 null = 원장앱에서 공휴일을 고친 적 없음 → 기본값.
//   · 설정 칸 자체가 안 오면(옛 워커) 아무것도 안 한다(폰에 저장해 둔 지난 설정이 있으면 그것을 계속 쓴다).
// 받은 공휴일 설정은 폰에 적어 둔다 → 다음에 앱을 켤 때(인터넷이 느려도) 처음부터 맞는 달력이 뜬다.
const APP_SETTINGS_STORAGE_KEY = "maple_app_settings_v1";
let appliedHolidaysJson = "null";
const applyHolidaySetting = (holidays) => {
  const clean = normalizeHolidayOverrides(holidays);
  const json = Object.keys(clean).length ? JSON.stringify(clean) : "null";
  if (json === appliedHolidaysJson) return false;
  setHolidayOverrides(clean);
  appliedHolidaysJson = json;
  return true;
};
export const applyServerAppSettings = (settings) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;   // 옛 워커: 칸 없음
  if (!("holidays" in settings)) return false;
  const changed = applyHolidaySetting(settings.holidays);
  if (changed) {
    try {
      if (appliedHolidaysJson === "null") localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
      else localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({ holidays: JSON.parse(appliedHolidaysJson), savedAt: Date.now() }));
    } catch (e) { /* 폰 저장이 안 돼도 이번 화면에는 반영됐다 */ }
  }
  return changed;
};
// 앱이 켜질 때: 폰에 적어 둔 지난 설정을 먼저 반영(서버 답이 오면 그것으로 다시 맞춘다)
try {
  const saved = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(APP_SETTINGS_STORAGE_KEY)) || "null");
  if (saved && saved.holidays) applyHolidaySetting(saved.holidays);
} catch (e) { /* 저장본이 깨졌으면 기본값 */ }
