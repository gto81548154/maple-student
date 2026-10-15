import { WORKER_ORIGIN } from "./config.jsx";

// ─── [마스터] 원장 전용 앱 ───────────────────────────────
// 판별값(이름·뒷4자리)과 마스터 열쇠는 워커에만 있다 — 이 파일은 번들로 공개되므로 절대 넣지 않는다.
// 앱은 본인 확인을 통과했을 때 워커가 내려준 열쇠를 폰에 보관만 하고, 주소창에는 ?master=1 만 남긴다.
// (주소창·스크린샷·브라우저 방문기록·링크 복사로 열쇠가 새는 구멍을 막기 위함)
export const MASTER_MK_KEY = "mapl_master_mk";
export const MASTER_ID = "__master__";
   // 원장 전용 가상 학생 id — 마플보카 진도가 이 이름으로 따로 저장된다
const getMasterMk = () => { try { return localStorage.getItem(MASTER_MK_KEY) || ""; } catch (e) { return ""; } };
export const clearMasterMk = () => { try { localStorage.removeItem(MASTER_MK_KEY); } catch (e) {} };
// 설치형 PWA가 쿼리 없이 실행될 때를 대비해 마지막 학생 링크(id/t)를 저장·복원한다.
// (일부 브라우저가 manifest start_url의 쿼리를 버리는 문제 대응 — URL을 복원하면 이후 파싱 로직이 전부 그대로 동작)
// ─── [교사 열람 모드 2026-08-27] 선생님 전용 진입 ───────────────────
// 선생님은 계정관리에서 받은 개인 링크 `?tid={계정id}&tk={교사토큰}` 으로 들어온다.
//   · 학생 링크(?id=&t=)와 열쇠 이름이 아예 다르므로 두 모드가 절대 섞이지 않는다.
//   · 원장이 계정관리에서 [재발급]을 누르면 워커의 토큰이 바뀌어 옛 링크는 그 자리에서 죽는다.
//   · 학생 화면을 열어볼 때는 `?tid=&tk=&id={학생id}` — 학생 열쇠(t) 없이 워커가 통과시키고,
//     "앱 접속" 배지도 안 찍히며, 이 앱에서도 읽기 전용으로 동작한다(아래 IS_STAFF_VIEW).
const TEACHER_LINK_KEY = "mapl_teacher_link_v1";
const getSavedTeacherLink = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TEACHER_LINK_KEY) || "null");
    return saved && saved.tid && saved.tk ? saved : null;
  } catch (e) { return null; }
};
export const saveTeacherLink = (tid, tk) => { try { localStorage.setItem(TEACHER_LINK_KEY, JSON.stringify({ tid: String(tid), tk: String(tk) })); } catch (e) {} };
const clearTeacherLink = () => { try { localStorage.removeItem(TEACHER_LINK_KEY); } catch (e) {} };
export const LINK_STORE_KEY = "mapl_student_link_v1";
const restoreStudentLink = () => {
  try {
    const sp = new URLSearchParams(window.location.search);
    // [마스터] 마스터 모드에서는 학생 링크를 저장하지 않는다.
    // 저장하면 다음 실행 때 아래 복원 로직이 그 학생 화면을 띄워 마스터 진입로가 막힌다.
    if (sp.has("master")) return;
    // [교사] 선생님 링크(tid·tk)가 실려 오면 그것부터 저장한다. 학생 화면을 열어보는 중이라
    //   id가 함께 있어도 학생 링크로 저장하면 안 된다(다음에 열 때 학생 화면이 떠 교사 진입로가 막힌다).
    if (sp.get("tid") && sp.get("tk")) { saveTeacherLink(sp.get("tid"), sp.get("tk")); return; }
    if (sp.get("id")) {
      localStorage.setItem(LINK_STORE_KEY, JSON.stringify({ id: sp.get("id"), t: sp.get("t") || "" }));
      return;
    }
    // [마스터] 파라미터 없이 열렸고 폰에 마스터 열쇠가 있으면 마스터 홈으로 복원한다(이름+뒷4자리 재입력 없음).
    // 학생 링크 복원보다 우선 — 원장 폰에 학생 링크가 남아 있어도 마스터가 열린다.
    if (getMasterMk()) {
      sp.set("master", "1");
      window.history.replaceState(null, "", window.location.pathname + "?" + sp.toString());
      return;
    }
    // [교사] 쿼리 없이 열렸고 폰에 선생님 열쇠가 있으면 선생님 홈으로 되돌린다(설치형 PWA 대응).
    const savedT = getSavedTeacherLink();
    if (savedT) {
      sp.set("tid", savedT.tid); sp.set("tk", savedT.tk);
      window.history.replaceState(null, "", window.location.pathname + "?" + sp.toString());
      return;
    }
    const saved = JSON.parse(localStorage.getItem(LINK_STORE_KEY) || "null");
    if (saved && saved.id) {
      sp.set("id", String(saved.id));
      if (saved.t) sp.set("t", String(saved.t));
      window.history.replaceState(null, "", window.location.pathname + "?" + sp.toString());
    }
  } catch (e) {}
};
restoreStudentLink();
// [마스터] 지금 화면이 마스터 모드인지 — restoreStudentLink()가 주소를 고친 뒤에 계산해야 한다.
// 주소에 master가 있어도 폰에 열쇠가 없으면 마스터가 아니다(주소만 흉내낸 접근 차단).
export const MASTER_MK = (() => {
  try {
    if (!new URLSearchParams(window.location.search).has("master")) return "";
    return getMasterMk();
  } catch (e) { return ""; }
})();
export const IS_MASTER_MODE = !!MASTER_MK;
// [교사] 지금 화면이 교사 모드인지 — restoreStudentLink()가 주소를 고친 뒤에 계산해야 한다.
// 주소에 tid·tk가 둘 다 있어야 하고, 진짜인지는 워커가 판정한다(틀리면 403 → 아래에서 열쇠를 지우고 안내 화면).
export const TEACHER_AUTH = (() => {
  try {
    const sp = new URLSearchParams(window.location.search);
    const tid = sp.get("tid") || "";
    const tk = sp.get("tk") || "";
    return tid && tk ? { tid, tk } : null;
  } catch (e) { return null; }
})();
export const IS_TEACHER_MODE = !!TEACHER_AUTH;
// [교사] 학생 화면을 "직원(원장·선생님)이 열어보는 중"인지 — 기록을 남기면 안 되는 자리에 함께 쓴다.
//   (출석 QR 숨김·푸시 끔·PWA 시작주소 안 건드림·학생 시청 통계 오염 방지·PASS 축하 안 띄움)
export const IS_STAFF_VIEW = IS_MASTER_MODE || IS_TEACHER_MODE;
// [교사] 교사 문 주소 만들기 — 항상 tid·tk를 달고 나간다.
export const teacherUrl = (path, extra = {}) => {
  const u = new URL(String(WORKER_ORIGIN || "") + path, window.location.origin);
  u.searchParams.set("tid", TEACHER_AUTH ? TEACHER_AUTH.tid : "");
  u.searchParams.set("tk", TEACHER_AUTH ? TEACHER_AUTH.tk : "");
  Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
};
// [교사] 링크가 죽었을 때(재발급·계정 삭제) 폰의 열쇠를 지우고 안내 화면으로 돌린다.
export const teacherLinkDead = () => {
  clearTeacherLink();
  try { window.location.href = window.location.pathname + "?teacher_dead=1"; } catch (e) {}
};
