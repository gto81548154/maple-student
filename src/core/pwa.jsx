import { IS_MASTER_MODE, IS_TEACHER_MODE } from "./auth.jsx";
import { STUDENT_SYNC_API_URL, WORKER_ORIGIN } from "./config.jsx";

// ─── [PWA] 홈 화면 설치 지원 ─────────────────────────
// 아이콘은 maple-sync 워커가 내장 서빙(/pwa/*.png, 무인증). 동기화 URL에서 origin을 재사용한다.
const PWA_ICON_BASE = (() => {
  try { return new URL(STUDENT_SYNC_API_URL).origin + "/pwa"; } catch (e) { return ""; }
})();
// 지금 화면이 홈 화면 설치본(standalone)으로 열렸는지
export const isPwaStandalone = () => {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
};
// [교사 아이콘 08-30] 선생님 폰·PC에 깔리는 "마플쌤" 아이콘(초록) — 학생앱(남색)과 다른 앱으로 깔린다.
//   시작 주소 = 주소창에서 쿼리를 통째로 뗀 것. 학생 id도, 열쇠(tid·tk)도 아이콘에 안 박힌다.
//   → 원장이 [재발급]을 눌러 열쇠가 바뀌어도 깔아 둔 아이콘이 안 죽고,
//     앱을 열면 위 restoreStudentLink가 폰에 저장해 둔 열쇠로 선생님 홈을 되살린다.
const setupTeacherPwa = () => {
  try {
    if (!PWA_ICON_BASE) return;
    const head = document.head;
    const ensure = (sel, make) => { if (!head.querySelector(sel)) head.appendChild(make()); };
    const u = new URL(window.location.href);
    const startUrl = u.origin + u.pathname;   // 쿼리 없음
    ensure('link[rel="manifest"]', () => {
      const l = document.createElement("link");
      l.rel = "manifest";
      l.crossOrigin = "anonymous";
      l.href = `${PWA_ICON_BASE}/teacher-manifest.json?u=${encodeURIComponent(startUrl)}&scope=${encodeURIComponent(startUrl)}`;
      return l;
    });
    ensure('link[rel="apple-touch-icon"]', () => { const l = document.createElement("link"); l.rel = "apple-touch-icon"; l.sizes = "180x180"; l.href = `${PWA_ICON_BASE}/teacher-apple-touch-icon-180.png`; return l; });
    const fav = head.querySelector('link[rel="icon"], link[rel="shortcut icon"]') || (() => { const l = document.createElement("link"); l.rel = "icon"; head.appendChild(l); return l; })();
    fav.type = "image/png";
    fav.href = `${PWA_ICON_BASE}/teacher-icon-192.png`;
    ensure('meta[name="theme-color"]', () => { const m = document.createElement("meta"); m.name = "theme-color"; m.content = "#0b543d"; return m; });
    ensure('meta[name="apple-mobile-web-app-capable"]', () => { const m = document.createElement("meta"); m.name = "apple-mobile-web-app-capable"; m.content = "yes"; return m; });
    ensure('meta[name="apple-mobile-web-app-title"]', () => { const m = document.createElement("meta"); m.name = "apple-mobile-web-app-title"; m.content = "마플쌤"; return m; });
  } catch (e) { console.warn("선생님 PWA 셋업 실패:", e?.message || e); }
};
// manifest(학생별 start_url 포함)와 아이콘 메타를 런타임 주입한다.
// index.html을 안 건드리기 위한 방식 — 설치된 아이콘을 누르면 "그 학생 링크"로 열린다.
export const setupStudentPwa = () => {
  try {
    if (!PWA_ICON_BASE) return;
    // [마스터] 마스터 모드 주소(?master=1, 학생 id 포함 가능)를 설치 아이콘의 시작 주소로 심으면 안 된다.
    if (IS_MASTER_MODE) return;
    // [교사 아이콘 08-30] 선생님은 위 setupTeacherPwa로 따로 깐다.
    //   08-27에는 "설치 아이콘이 학생 링크로 굳어진다"는 이유로 통째로 껐지만,
    //   시작 주소에서 쿼리를 통째로 떼면 그 걱정이 사라진다.
    if (IS_TEACHER_MODE) { setupTeacherPwa(); return; }
    const head = document.head;
    const ensure = (sel, make) => { if (!head.querySelector(sel)) head.appendChild(make()); };
    const u = new URL(window.location.href);
    u.searchParams.delete("ts"); // 일회성 파라미터 제거 (id, t는 유지)
    const startUrl = u.origin + u.pathname + u.search;
    ensure('link[rel="manifest"]', () => {
      const l = document.createElement("link");
      l.rel = "manifest";
      l.crossOrigin = "anonymous";
      // 워커가 실제 URL로 manifest를 서빙 — data/blob 방식의 브라우저 호환 문제(아이콘·start_url 유실) 해소
      l.href = `${PWA_ICON_BASE}/student-manifest.json?u=${encodeURIComponent(startUrl)}&scope=${encodeURIComponent(u.origin + u.pathname)}`;
      return l;
    });
    ensure('link[rel="apple-touch-icon"]', () => { const l = document.createElement("link"); l.rel = "apple-touch-icon"; l.sizes = "180x180"; l.href = `${PWA_ICON_BASE}/apple-touch-icon-180.png`; return l; });
    // [패치] PC 브라우저 탭 파비콘 = 앱 아이콘 (워커가 서빙하는 icon-192 재사용, 기존 태그 있으면 교체)
    const fav = head.querySelector('link[rel="icon"], link[rel="shortcut icon"]') || (() => { const l = document.createElement("link"); l.rel = "icon"; head.appendChild(l); return l; })();
    fav.type = "image/png";
    fav.href = `${PWA_ICON_BASE}/icon-192.png`;
    ensure('meta[name="theme-color"]', () => { const m = document.createElement("meta"); m.name = "theme-color"; m.content = "#182848"; return m; });
    ensure('meta[name="apple-mobile-web-app-capable"]', () => { const m = document.createElement("meta"); m.name = "apple-mobile-web-app-capable"; m.content = "yes"; return m; });
    ensure('meta[name="apple-mobile-web-app-title"]', () => { const m = document.createElement("meta"); m.name = "apple-mobile-web-app-title"; m.content = "마플영어"; return m; });
  } catch (e) { console.warn("PWA 셋업 실패:", e?.message || e); }
};
// ─── [푸시] 웹 푸시 알림 구독 (2026-07-23) ───
// 흐름: [알림 켜기] → 권한 허용 → 이 폰의 구독을 워커 /push/subscribe에 저장.
// 이후 원장앱이 설문을 보내면 워커가 이 폰으로 빈 푸시를 쏘고, public/sw.js가 받아서 알림+배지를 띄운다.
const PUSH_VAPID_PUBLIC_KEY = "BFKk73eo2D2L82x5lpRRY2ySZq-K9tVV3TwntnWn65v4FCeVhXc0oyA4JXXZUY7MMJ7xPgl3D8PS828uXpPys_Y";
export const pushSupport = () =>
  ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) ? "supported" : "unsupported";
const pushB64urlToUint8 = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
};
export const registerMaplSw = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); }
  catch (e) { console.warn("서비스 워커 등록 실패:", e?.message || e); return null; }
};
// 구독 생성 + 워커 저장. 권한이 granted인 상태에서 호출해야 한다.
export const subscribeMaplPush = async (student) => {
  if (!WORKER_ORIGIN) throw new Error("동기화 서버 주소가 없습니다");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushB64urlToUint8(PUSH_VAPID_PUBLIC_KEY) });
  const t = new URLSearchParams(window.location.search).get("t") || "";
  const r = await fetch(WORKER_ORIGIN + "/push/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: String(student?.id || ""), t, subscription: sub.toJSON() }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.success) throw new Error(d?.error || "알림 등록 저장 실패");
  return d;
};
// ─── [103차수 09-08 디자인 개편] 알림·설치 안내는 "더보기 → 앱 설정"으로 이사 ───
//   예전 PushEnableBanner(홈 카드 아래)·PwaInstallBanner(맨 위 남색 띠)는 없앴다. 첫 화면의 학습 영역을 밀지 않기 위해서다(원장 결정 09-08).
//   남는 것 하나 = 카카오톡 안에서 열었을 때의 "브라우저로 열기" 띠(KakaoOpenBanner). 카카오톡 안에서는 홈 화면 추가·알림이
//   아예 안 되므로 이것만은 위에 그대로 둔다. 닫기 기억 키는 예전 설치 배너 키를 그대로 쓴다(전에 닫은 학생은 계속 안 보이게).
//   브라우저 권한·설치 조건은 우회하지 않는다 — 설정 화면은 "지금 상태"를 글자로 보여주고, 할 수 있는 동작만 단추로 준다.
export const PWA_BANNER_DISMISS_KEY = "mapl_pwa_banner_dismissed_v1";
const UA_STR = (() => { try { return navigator.userAgent || ""; } catch (e) { return ""; } })();
export const IS_IOS_UA = /iPhone|iPad|iPod/i.test(UA_STR);
export const IS_MOBILE_UA = IS_IOS_UA || /Android/i.test(UA_STR);
export const IS_KAKAO_UA = /KAKAOTALK/i.test(UA_STR);
// 안드로이드 "설치" 신호(beforeinstallprompt)는 앱이 뜨자마자 한 번만 온다. 설정 화면은 나중에 열리므로 여기(모듈 위)에서 미리 받아 둔다.
export let PWA_INSTALL_EVT = null;
export let PWA_INSTALLED_FLAG = false;
export const PWA_INSTALL_LISTENERS = new Set();
try {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); PWA_INSTALL_EVT = e; PWA_INSTALL_LISTENERS.forEach((f) => { try { f(); } catch (err) {} }); });
  window.addEventListener("appinstalled", () => { PWA_INSTALLED_FLAG = true; PWA_INSTALL_EVT = null; PWA_INSTALL_LISTENERS.forEach((f) => { try { f(); } catch (err) {} }); });
} catch (e) {}
// [118차수] 다른 파일(설정 화면의 설치 단추)은 가져온 값을 직접 바꿀 수 없으므로 이 함수로 "설치됨"을 적는다. 읽는 쪽은 위 두 값을 그대로 가져다 쓰면 늘 최신 값이 보인다.
export const markPwaInstalled = () => { PWA_INSTALLED_FLAG = true; };
export const openOutsideKakao = () => {
  try { window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(window.location.href); } catch (e) {}
};
