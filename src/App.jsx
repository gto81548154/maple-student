import { useState, useEffect, useRef, useMemo } from "react";
// [4차] QR 만드는 라이브러리. 앱 안에 같이 들어가므로 인터넷 없이도 QR이 그려진다.
//       설치: npm install qrcode   (예전에 쓰던 cdnjs qrcodejs와는 다른 물건이다)
import QRCodeLib from "qrcode";
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

// ─── [단어 TEST] 마플보카 연동 ───────────────────────
// 마플보카 HTML 파일을 학생앱 public/voca.html 로 넣으면 별도 설정 없이 열립니다.
// 다른 곳(R2 등)에 올렸다면 .env 로 주소를 지정하세요.
// .env 예시: VITE_VOCA_APP_URL=https://example.com/voca.html
const VOCA_APP_URL = import.meta.env.VITE_VOCA_APP_URL || "/voca.html";
// [단어 TEST] 탭 스위치 — 마플보카 3단계 배포(워커 /voca/* + public/voca.html + R2 단어 데이터) 완료 후 true로 변경
const VOCA_TAB_ENABLED = true;

// ─── [08-04] 마플보카 임베드 공용 프레임: 스크롤을 학생앱 하나로 통일 ───
// voca.html이 문서 높이(maplVocaHeight)를 계속 보내오면 iframe 높이를 그 값으로 맞춰
// 내부 스크롤을 없앤다. 반대로 여기서는 "지금 보이는 영역"(maplVis)을 계속 알려줘
// 마플보카의 모달·토스트가 화면 안에 뜨게 하고, 화면 전환(maplVocaScroll) 때는 맨 위로 스크롤한다.
// 옛 voca.html(높이를 안 보내는 판)과 섞이면 아래가 잘리므로 두 파일은 반드시 한 커밋으로 배포.
function VocaFrame({ title, src, topOffset = 60 }) {
  const ref = useRef(null);
  const [h, setH] = useState(560);
  useEffect(() => {
    let raf = 0;
    const sendVis = () => {
      raf = 0;
      const el = ref.current;
      if (!el || !el.contentWindow) return;
      const r = el.getBoundingClientRect();
      const top = Math.max(0, -r.top);
      const vh = Math.max(0, Math.min(window.innerHeight, r.bottom) - Math.max(r.top, 0));
      try { el.contentWindow.postMessage({ type: "maplVis", top: Math.round(top), h: Math.round(vh) }, "*"); } catch (e) {}
    };
    const queueVis = () => { if (!raf) raf = requestAnimationFrame(sendVis); };
    const onMsg = (e) => {
      const el = ref.current;
      if (!el || e.source !== el.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "maplVocaHeight" && Number.isFinite(d.h)) { setH(Math.max(360, Math.ceil(d.h))); queueVis(); }
      if (d.type === "maplVocaScroll") {
        const r = el.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top + (d.y || 0) - topOffset), behavior: "auto" });
        queueVis();
      }
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("scroll", queueVis, { passive: true });
    window.addEventListener("resize", queueVis);
    const tick = setInterval(queueVis, 700);       // 레이아웃 변동 대비 보험
    queueVis();
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("scroll", queueVis);
      window.removeEventListener("resize", queueVis);
      clearInterval(tick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [topOffset]);
  return (
    <iframe ref={ref} title={title} src={src} scrolling="no"
      style={{ width: "100%", height: h, border: "none", display: "block", background: "#FBF7EF", overflow: "hidden" }} />
  );
}
const WORKER_ORIGIN = (() => { try { return new URL(STUDENT_SYNC_API_URL).origin; } catch (e) { return ""; } })();
// 진도 맵·강의 영상의 교재명에서 이 학생이 배우는 단어장을 추정한다. (정규 커리큘럼 연동)
// 매칭되는 책이 하나도 없으면 전체(원장 전용 제외)를 보여준다 — 새 학생도 막히지 않게.
const VOCA_BOOK_MATCHERS = [
  { id: "wm_sn",    re: /워(드)?\s*마(스터)?[^\n]*수능/ },
  { id: "wm_basic", re: /워(드)?\s*마(스터)?[^\n]*(basic|베이직)/i },
  { id: "wm_hi",    re: /하이스트/ },
  { id: "ve_ess",   re: /어휘끝[^\n]*필수/ },
  { id: "ve_adv",   re: /어휘끝[^\n]*고난도/ },
];
const guessVocaBooks = (progressTree, videos) => {
  const texts = [];
  (progressTree?.lanes || []).forEach((l) => {
    texts.push(String(l.name || l.label || l.book || ""));
    (l.nodes || []).forEach((n) => texts.push(String(n.label || n.title || n.name || "")));
  });
  (videos || []).forEach((v) => texts.push(String(v.subject || "")));
  const blob = texts.join("\n");
  return VOCA_BOOK_MATCHERS.filter((m) => m.re.test(blob)).map((m) => m.id);
};

// ─── [PWA] 홈 화면 설치 지원 ─────────────────────────
// 아이콘은 maple-sync 워커가 내장 서빙(/pwa/*.png, 무인증). 동기화 URL에서 origin을 재사용한다.
const PWA_ICON_BASE = (() => {
  try { return new URL(STUDENT_SYNC_API_URL).origin + "/pwa"; } catch (e) { return ""; }
})();

// 지금 화면이 홈 화면 설치본(standalone)으로 열렸는지
const isPwaStandalone = () => {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
};

// ─── [마스터] 원장 전용 앱 ───────────────────────────────
// 판별값(이름·뒷4자리)과 마스터 열쇠는 워커에만 있다 — 이 파일은 번들로 공개되므로 절대 넣지 않는다.
// 앱은 본인 확인을 통과했을 때 워커가 내려준 열쇠를 폰에 보관만 하고, 주소창에는 ?master=1 만 남긴다.
// (주소창·스크린샷·브라우저 방문기록·링크 복사로 열쇠가 새는 구멍을 막기 위함)
const MASTER_MK_KEY = "mapl_master_mk";
const MASTER_ID = "__master__";   // 원장 전용 가상 학생 id — 마플보카 진도가 이 이름으로 따로 저장된다
const getMasterMk = () => { try { return localStorage.getItem(MASTER_MK_KEY) || ""; } catch (e) { return ""; } };
const clearMasterMk = () => { try { localStorage.removeItem(MASTER_MK_KEY); } catch (e) {} };

// 설치형 PWA가 쿼리 없이 실행될 때를 대비해 마지막 학생 링크(id/t)를 저장·복원한다.
// (일부 브라우저가 manifest start_url의 쿼리를 버리는 문제 대응 — URL을 복원하면 이후 파싱 로직이 전부 그대로 동작)
const LINK_STORE_KEY = "mapl_student_link_v1";
const restoreStudentLink = () => {
  try {
    const sp = new URLSearchParams(window.location.search);
    // [마스터] 마스터 모드에서는 학생 링크를 저장하지 않는다.
    // 저장하면 다음 실행 때 아래 복원 로직이 그 학생 화면을 띄워 마스터 진입로가 막힌다.
    if (sp.has("master")) return;
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
const MASTER_MK = (() => {
  try {
    if (!new URLSearchParams(window.location.search).has("master")) return "";
    return getMasterMk();
  } catch (e) { return ""; }
})();
const IS_MASTER_MODE = !!MASTER_MK;

// manifest(학생별 start_url 포함)와 아이콘 메타를 런타임 주입한다.
// index.html을 안 건드리기 위한 방식 — 설치된 아이콘을 누르면 "그 학생 링크"로 열린다.
const setupStudentPwa = () => {
  try {
    if (!PWA_ICON_BASE) return;
    // [마스터] 마스터 모드 주소(?master=1, 학생 id 포함 가능)를 설치 아이콘의 시작 주소로 심으면 안 된다.
    if (IS_MASTER_MODE) return;
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
    ensure('meta[name="theme-color"]', () => { const m = document.createElement("meta"); m.name = "theme-color"; m.content = "#16213e"; return m; });
    ensure('meta[name="apple-mobile-web-app-capable"]', () => { const m = document.createElement("meta"); m.name = "apple-mobile-web-app-capable"; m.content = "yes"; return m; });
    ensure('meta[name="apple-mobile-web-app-title"]', () => { const m = document.createElement("meta"); m.name = "apple-mobile-web-app-title"; m.content = "마플영어"; return m; });
  } catch (e) { console.warn("PWA 셋업 실패:", e?.message || e); }
};

// ─── [푸시] 웹 푸시 알림 구독 (2026-07-23) ───
// 흐름: [알림 켜기] → 권한 허용 → 이 폰의 구독을 워커 /push/subscribe에 저장.
// 이후 원장앱이 설문을 보내면 워커가 이 폰으로 빈 푸시를 쏘고, public/sw.js가 받아서 알림+배지를 띄운다.
const PUSH_VAPID_PUBLIC_KEY = "BFKk73eo2D2L82x5lpRRY2ySZq-K9tVV3TwntnWn65v4FCeVhXc0oyA4JXXZUY7MMJ7xPgl3D8PS828uXpPys_Y";
const pushSupport = () =>
  ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) ? "supported" : "unsupported";
const pushB64urlToUint8 = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
};
const registerMaplSw = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); }
  catch (e) { console.warn("서비스 워커 등록 실패:", e?.message || e); return null; }
};
// 구독 생성 + 워커 저장. 권한이 granted인 상태에서 호출해야 한다.
const subscribeMaplPush = async (student) => {
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
// 홈 상단 "알림 켜기" 배너 — 마스터 모드·미지원 기기·이미 허용된 폰에서는 안 보인다
// [수정 07-30] 학생이 배너를 닫았는지 폰에 기억해 둔다 (설치 안내 배너와 같은 방식).
const PUSH_BANNER_DISMISS_KEY = "mapl_push_banner_dismissed_v1";
function PushEnableBanner({ student }) {
  const [state, setState] = useState(() => {
    if (IS_MASTER_MODE || pushSupport() === "unsupported") return "hidden";
    if (Notification.permission === "granted") return "hidden"; // 허용된 폰은 앱이 알아서 구독을 갱신한다
    // [수정 07-30] 차단(denied)은 앱에서 되돌릴 수 없어 배너가 영구히 남았다 → 아예 띄우지 않는다.
    if (Notification.permission === "denied") return "hidden";
    try { if (localStorage.getItem(PUSH_BANNER_DISMISS_KEY) === "1") return "hidden"; } catch (e) {}
    return "off";
  });
  const [busy, setBusy] = useState(false);
  if (state === "hidden") return null;
  const dismiss = () => {
    try { localStorage.setItem(PUSH_BANNER_DISMISS_KEY, "1"); } catch (e) {}
    setState("hidden");
  };
  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await registerMaplSw();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); setBusy(false); return; }
      await subscribeMaplPush(student);
      setState("done");
      setTimeout(() => setState("hidden"), 5000);
    } catch (e) { alert("알림 설정에 실패했어요: " + (e?.message || e)); }
    setBusy(false);
  };
  return (
    <div style={{ maxWidth: MAX_W, margin: "12px auto 0", padding: "0 16px", boxSizing: "border-box" }}>
      {state === "done" ? (
        <div style={{ background: "#E8F6EE", border: "1.5px solid #BFE5CE", borderRadius: 14, padding: "12px 16px", fontSize: 13.5, fontWeight: 800, color: "#1B8A5A" }}>
          ✅ 알림이 켜졌어요! 새 설문·공지가 오면 알려드릴게요.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1.5px solid #E4E0D8", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🔔</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#2A2A28" }}>새 설문·공지 알림 받기</div>
            <div style={{ fontSize: 11.5, color: "#888", marginTop: 1 }}>중요한 안내가 오면 바로 알려드려요</div>
          </div>
          <button onClick={enable} disabled={busy} style={{ flexShrink: 0, padding: "9px 16px", borderRadius: 10, border: "none", background: busy ? "#c9d6ea" : "#2A6FDB", color: "#fff", fontSize: 13, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
            {busy ? "설정 중..." : "알림 켜기"}
          </button>
          {/* [수정 07-30] 닫기 버튼이 없어 원치 않는 학생에게 배너가 계속 남았다. */}
          <button onClick={dismiss} disabled={busy} aria-label="알림 배너 닫기" style={{ flexShrink: 0, border: "none", background: "transparent", color: "#bbb", fontSize: 15, fontWeight: 900, cursor: busy ? "default" : "pointer", padding: 4, lineHeight: 1 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// 설치 안내 배너: 폰에서만, 설치본이 아니고, 닫은 적 없을 때만 표시
const PWA_BANNER_DISMISS_KEY = "mapl_pwa_banner_dismissed_v1";
function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(PWA_BANNER_DISMISS_KEY) === "1"; } catch (e) { return false; } });
  const [installEvt, setInstallEvt] = useState(null); // 안드로이드 beforeinstallprompt
  const [installed, setInstalled] = useState(false);
  const ua = navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isMobileUa = isIos || /Android/i.test(ua);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (dismissed || installed || isPwaStandalone()) return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(PWA_BANNER_DISMISS_KEY, "1"); } catch (e) {} };
  // 카카오톡 인앱 브라우저: 설치 자체가 불가 → 외부 브라우저(크롬/사파리)로 원탭 탈출 버튼 제공
  const isKakao = /KAKAOTALK/i.test(ua);
  if (isKakao) {
    const openExternal = () => {
      try { window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(window.location.href); } catch (e) {}
    };
    return (
      <div style={{ background: "#0f3460", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>📲</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>카카오톡 안에서는 홈 화면 추가가 안 돼요</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2, lineHeight: 1.5 }}>
            오른쪽 버튼으로 {isIos ? "Safari" : "브라우저"}에서 열면 바로 추가할 수 있어요
          </div>
        </div>
        <button onClick={openExternal}
          style={{ border: "none", borderRadius: 8, background: "#ffd166", color: "#1a1a2e", fontWeight: 900, fontSize: 12, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{isIos ? "Safari로 열기" : "브라우저로 열기"}</button>
        <button onClick={dismiss} aria-label="배너 닫기" style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: 900, cursor: "pointer", flexShrink: 0, padding: 4 }}>✕</button>
      </div>
    );
  }
  if (!isMobileUa) return null;
  return (
    <div style={{ background: "#0f3460", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>📲</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>홈 화면에 추가하면 앱처럼 한 번에 열려요</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2, lineHeight: 1.5 }}>
          {isIos
            ? <>Safari 하단 <b>공유 버튼(네모+화살표)</b> → <b>홈 화면에 추가</b></>
            : installEvt
              ? <>오른쪽 <b>설치</b> 버튼 한 번이면 끝!</>
              : <>브라우저 메뉴(⋮) → <b>홈 화면에 추가</b></>}
        </div>
      </div>
      {!isIos && installEvt && (
        <button onClick={async () => { try { installEvt.prompt(); const r = await installEvt.userChoice; if (r && r.outcome === "accepted") setInstalled(true); } catch (e) {} }}
          style={{ border: "none", borderRadius: 8, background: "#ffd166", color: "#1a1a2e", fontWeight: 900, fontSize: 12, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>설치</button>
      )}
      <button onClick={dismiss} aria-label="배너 닫기" style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: 900, cursor: "pointer", flexShrink: 0, padding: 4 }}>✕</button>
    </div>
  );
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
  // [마스터] 워커가 "앱 접속" 배지를 갱신하지 않게 한다(학생 토큰 검사는 그대로 통과).
  if (IS_MASTER_MODE) u.searchParams.set("mk", MASTER_MK);
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
  // [08-10] 기다리는 시간 10초 → 20초. 자료가 커져 서버가 느린 날, 폰 인터넷이 느린 학생도 끊기지 않게.
  const resp = await fetchWithTimeout(url, { method: "GET", cache: "no-store" }, 20000);
  if (!resp.ok) {
    // [08-07] "서버가 거절한 것"과 "서버가 아픈 것"을 가른다.
    //  401·403·404 = 토큰이 죽었거나 그런 학생이 없다는 뜻 → 폰 저장본으로 우회하면 안 된다.
    //  500대·429  = 서버 장애 → 멀쩡한 학생이 막히면 안 되므로 예전처럼 폰 저장본을 쓴다.
    if (!IS_MASTER_MODE && (resp.status === 401 || resp.status === 403 || resp.status === 404)) {
      throw makeWithdrawnError(null, `학생 동기화 API 거절: ${resp.status}`);
    }
    throw new Error(`학생 동기화 API 오류: ${resp.status}`);
  }
  const raw = await resp.json();
  const payload = unwrapBundlePayload(raw);
  let student = getStudentFromPayload(payload, studentId);
  const anyState = findStudentAnyState(payload, studentId);
  let withdrawnFlag = false;

  if (IS_MASTER_MODE) {
    // [08-07] 원장이 학생앱을 열어보는 경우 — 그만둔 학생도 그대로 보여주고, 화면 위에 띠로만 알린다.
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
    throw makeWithdrawnError(student);
  }

  const todoSource = payload.todos || payload.todo4 || {};
  const chkSource = payload.checklistData || payload.chk3 || payload.checklist || {};
  const recSource = payload.records || payload.rec3 || {};
  const vwSource = payload.videoWatch || payload.video_watch || {};
  const examSource = payload.exams || payload.exam3 || [];
  const vocabWrongSource = payload.vocabWrongWords || payload.vocab_wrong_words || {};

  return {
    source: "worker",
    student,
    withdrawnFlag, // [08-07] 마스터 모드에서만 true가 될 수 있다 — 화면 위 안내 띠용
    todos: normalizeByDateForStudent(todoSource, studentId),
    checklistData: normalizeByDateForStudent(chkSource, studentId),
    records: normalizeRecordsForStudent(recSource, studentId),
    videos: payload.videos || payload.student_videos || [],
    videoWatch: normalizeVideoWatchForStudent(vwSource, studentId),
    makeups: payload.makeups || payload.mkp3 || [],
    customHolidays: payload.customHolidays || payload.holi3 || {},
    exams: Array.isArray(examSource) ? examSource : [],
    vocabWrongWords: normalizeVocabWrongWordsForStudent(vocabWrongSource, studentId),
    progressTree: payload.progressTree || payload.ptree3 || null,
    attLog: normalizeByDateForStudent(payload.attLog || payload.att_log3 || {}, studentId), // [일정] 등하원 기록
    att: normalizeByDateForStudent(payload.att || payload.att3 || {}, studentId), // [출결] 결석/지각 표시 (워커가 att3를 보내면 자동 표시)
    surveys: Array.isArray(payload.surveys || payload.svy3) ? (payload.surveys || payload.svy3) : [], // [설문] 진행 중 + 본인 대상
    surveyResponses: payload.surveyResponses || payload.svyr3 || {}, // [설문] 본인 응답
  };
};

const loadStudentBundle = async (studentId) => {
  return await loadStudentBundleFromWorker(studentId);
};

const getStudentBundleStorageKey = (studentId) => `maple_student_bundle_${studentId}`;

// ─── [08-10] "그만둔 학생" 판정 유예 (3진 아웃) ───
// 서버가 잠깐 잘못 답하는 순간(빈 명단, 순간적인 403·404)에도 예전 코드는
// 곧바로 차단 화면을 띄우고 폰 백업까지 지웠다. 지운 백업은 되돌릴 수 없다.
// 이제는 "같은 답이 10분 안에 3번 연속" 왔을 때만 진짜 그만둔 학생으로 보고 차단한다.
// 정말 그만둔 학생도 자동 새로고침(30초) 덕분에 1분 정도면 3번이 채워져 차단 화면을 본다.
const WITHDRAWN_STRIKE_LIMIT = 3;
const WITHDRAWN_STRIKE_WINDOW_MS = 10 * 60 * 1000; // 10분 넘게 지난 기록은 "연속"으로 안 친다
const getWithdrawnStrikeKey = (studentId) => `maple_withdrawn_strikes_${studentId}`;
const addWithdrawnStrike = (studentId) => {
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
const clearWithdrawnStrikes = (studentId) => {
  try { localStorage.removeItem(getWithdrawnStrikeKey(studentId)); } catch (e) { /* ignore */ }
};

// ─── [08-10] 연결 오류 화면용 짧은 오류 코드 ───
// 학생이 "E500 떠요"라고만 알려줘도 원장이 원인을 바로 좁힐 수 있게 한다.
//  E500·E429 등 숫자 = 서버가 그 번호로 거절함 / E-시간초과 = 20초 안에 답이 안 옴
//  E-네트워크 = 인터넷 끊김 / E-설정없음 = 앱 빌드에 서버 주소가 빠짐 / E-빈응답 = 서버 답에 알맹이가 없음
const makeLoadErrorCode = (e) => {
  const msg = String(e?.message || "");
  const m = msg.match(/API (?:오류|거절): (\d+)/);
  if (m) return "E" + m[1];
  if (/응답 지연/.test(msg)) return "E-시간초과";
  if (/미설정|주소가 없습니다/.test(msg)) return "E-설정없음";
  if (/찾을 수 없습니다|목록에 없는/.test(msg)) return "E-빈응답";
  if (e && e.name === "TypeError") return "E-네트워크";
  return "E-알수없음";
};

// [08-08] 학원 서버에 기록을 저장할 때 "본인 확인 값"으로 함께 보내는 링크의 t 값.
// 주소가 없거나 값이 없으면 빈 문자열 — 워커는 값이 없으면 예전처럼 받아준다.
const getSelfAccessToken = () => {
  try { return new URLSearchParams(window.location.search).get("t") || ""; } catch (e) { return ""; }
};

const restoreStudentBundleFromLocal = (studentId) => {
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
  "2027-03-01":"삼일절","2027-05-01":"근로자의 날","2027-05-03":"대체공휴일","2027-05-05":"어린이날","2027-05-13":"석가탄신일","2027-06-06":"현충일",
  "2027-07-17":"제헌절","2027-07-19":"대체공휴일","2027-08-15":"광복절","2027-08-16":"대체공휴일",
  "2027-09-14":"추석","2027-09-15":"추석","2027-09-16":"추석",
  "2027-10-03":"개천절","2027-10-04":"대체공휴일","2027-10-09":"한글날","2027-10-11":"대체공휴일","2027-12-25":"크리스마스","2027-12-27":"대체공휴일",
};

// 학생의 임시 시간표(tempSchedules)·방학 시간표(vacationSchedule) 처리 - admin과 동일
// ⚠️ 원장앱 getEffectiveSchedule과 동시 수정 규칙: 방학 분기는 두 파일에 동일하게 유지할 것
const getStudentVacation = (student, dateStr) => {
  const vs = student && student.vacationSchedule;
  if (vs && vs.startDate && vs.endDate && dateStr >= vs.startDate && dateStr <= vs.endDate
      && vs.schedule && Object.keys(vs.schedule).length > 0) return vs;
  return null;
};
const getEffectiveSchedule = (student, dateStr) => {
  // [방학] 방학 스케줄은 정규를 '통째로 교체'한다(요일이 바뀌는 학생 때문에 merge 금지). 우선순위: 방학 > 특별기간 > 정규
  const vac = getStudentVacation(student, dateStr);
  if (vac) return { schedule: { ...(vac.schedule || {}) }, isVacation: true };
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
        if (t) out.push({ date: ds, dateObj: new Date(d), time: t, isMakeup: false, isVacation: !!eff.isVacation });
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

// 학년별 영어시험일(engDates[학년]) — 원장앱 D-day 칩과 동일하게 "영어학원이니까 영어일 우선" 규칙의 근거값.
const getEngExamDateForDday = (exam = {}, student = {}) => {
  const grade = getStudentGradeForDday(student);
  return (grade && (
    exam.engDates?.[grade] ||
    exam.englishDates?.[grade] ||
    exam.gradeDates?.[grade] ||
    exam.byGrade?.[grade]
  )) || "";
};

const getExamTargetDateForDday = (exam = {}, student = {}) => {
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

// ─── 이번 내신 시험범위 카드 (examr3 학생 노출 — 워커가 본인 학교 항목만 내려줌) ───
// 슬롯 v2 호환: 구형 문자열 / 신형 {rows:[{bookLabel,bookKey,range,memo}],legacyText} 모두 텍스트로 변환해 표시.
const normalizeExamRangeSlot = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const rows = (Array.isArray(v.rows) ? v.rows : []).filter(r => r && typeof r === "object");
    return { rows, legacyText: String(v.legacyText || "") };
  }
  return { rows: [], legacyText: v == null ? "" : String(v) };
};
const examRangeSlotToText = (v) => {
  const { rows, legacyText } = normalizeExamRangeSlot(v);
  const lines = rows.map(r => {
    const head = [String(r.bookLabel || r.bookKey || "").trim(), String(r.range || "").trim()].filter(Boolean).join(" ");
    const memo = String(r.memo || "").trim();
    return memo ? (head ? `${head} — ${memo}` : memo) : head;
  }).filter(Boolean);
  const legacy = legacyText.trim();
  return [...lines, ...(legacy ? [legacy] : [])].join("\n");
};
const getStudentSchoolCodeForRange = (student = {}) => {
  const school = getStudentSchoolForDday(student);
  const grade = getStudentGradeForDday(student);
  return school && grade ? `${school}${grade}` : "";
};
// 시험(exam3 항목) → 시험범위 슬롯 라벨. 종류는 시험명(중간/기말), 학기는 시험 시작월(8월~=2학기)로 판정.
const getExamRangeSlotForExam = (exam = {}) => {
  // 구조화 필드(개편 2단계) 우선 — 시험 등록 시 선택한 값이라 추론이 필요 없다.
  const kindS = String(exam.kind || "");
  const semS = Number(exam.semester);
  if (/^(중간|기말)$/.test(kindS) && (semS === 1 || semS === 2)) return `${semS}학기 ${kindS}`;
  const name = String(exam.name || "");
  const kind = /^(중간|기말)$/.test(kindS) ? kindS : (/중간/.test(name) ? "중간" : /기말/.test(name) ? "기말" : null);
  const ds = String(exam.date || exam.start || "");
  const mm = Number(ds.slice(5, 7));
  if (!kind || !(mm >= 1 && mm <= 12)) return null;
  return `${mm >= 8 ? 2 : 1}학기 ${kind}`;
};
const getExamRangeTextForStudent = (examRanges, schoolCode, exam = {}) => {
  const slot = getExamRangeSlotForExam(exam);
  if (!slot || !schoolCode) return null;
  const ds = String(exam.date || exam.start || "");
  const year = Number(ds.slice(0, 4));
  if (!year) return null;
  const byYear = examRanges?.data?.[schoolCode];
  const entry = byYear ? (byYear[year] || byYear[String(year)]) : null;
  const text = entry ? examRangeSlotToText(entry[slot]).trim() : "";
  return text ? { slot, year, text, value: entry[slot] } : null;
};
function StudentExamRangeCard({ student, items, examRanges }) {
  // [수정 07-31] 평소에는 접어두고, 시험이 일주일 안으로 들어오면 저절로 펼쳐지게.
  // null = 학생이 아직 안 눌렀다는 뜻(위 StudentExamDdaySection과 같은 방식).
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen === null ? isExamSoon(items) : userOpen;
  const naesin = (items || []).find(x => x && x.type === "내신") || null;
  const code = getStudentSchoolCodeForRange(student || {});
  const info = naesin ? getExamRangeTextForStudent(examRanges, code, { name: naesin.name, date: naesin.start, kind: naesin.kind, semester: naesin.semester }) : null;
  if (!info) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
      <button onClick={() => setUserOpen(!open)} style={{ width: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2 }}>📋 이번 시험 범위</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{code} · {info.slot}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#34d399", flexShrink: 0 }}>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (() => {
        const nv = normalizeExamRangeSlot(info.value);
        const rows = nv.rows.filter(r => String(r.bookLabel || r.bookKey || "").trim() || String(r.range || "").trim() || String(r.memo || "").trim());
        if (rows.length === 0 && !nv.legacyText.trim()) {
          // 방어: value가 비정상이어도 텍스트 fallback으로 항상 내용은 보인다
          return <div style={{ marginTop: 10, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.75, color: "rgba(255,255,255,0.92)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{info.text}</div>;
        }
        return <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r, i) => (
            <div key={r.id || i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "9px 12px", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#6ee7b7" }}>{String(r.bookLabel || r.bookKey || "교재")}</span>
              {String(r.range || "").trim() && <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>{r.range}</span>}
              {String(r.memo || "").trim() && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>— {r.memo}</span>}
            </div>
          ))}
          {nv.legacyText.trim() && <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "9px 12px", fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{nv.legacyText}</div>}
        </div>;
      })()}
    </div>
  );
}

// [수정 07-31] 앱을 켜면 위쪽에 배너·시험·경고·설문이 쌓여 정작 숙제가 첫 화면에 안 보였다.
// 그래서 이 칸을 평소에는 한 줄로 접어두고, 시험이 일주일 안으로 들어오면 자동으로 펼친다.
// ※ 시험이 하나도 없으면 예전처럼 칸 자체가 안 나온다(아래 return null).
//    단, useState는 "칸이 안 나오는 경우"보다 반드시 위에 있어야 한다.
//    (React 규칙 — 화면을 그리다 말고 중간에 useState 개수가 달라지면 앱이 하얗게 죽는다.
//     시험이 없다가 새로고침으로 생기는 경우가 실제로 있으므로 이 순서가 중요하다.)
const isExamSoon = (list) => (list || []).some(
  (x) => x && (x.ongoing || (typeof x.diff === "number" && x.diff >= 0 && x.diff <= 7))
);
function StudentExamDdaySection({ items }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const examSoon = isExamSoon(list);
  // null = 학생이 아직 한 번도 안 눌렀다는 뜻. 그동안은 시험이 가까운지에 따라 저절로 열린다.
  // 한 번 누른 뒤로는 학생이 고른 상태를 그대로 지킨다(앱이 멋대로 다시 펼치지 않는다).
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen === null ? examSoon : userOpen;
  if (list.length === 0) return null;

  // [수정 07-30] 예전에는 "내신 1 · 모의 1"이 글자로 박혀 있어 실제 개수와 무관하게 늘 같았다.
  const mockCnt = list.filter((x) => x.type === "모의고사").length;
  const naesinCnt = list.length - mockCnt;
  const countParts = [];
  if (naesinCnt > 0) countParts.push(`내신 ${naesinCnt}`);
  if (mockCnt > 0) countParts.push(`모의 ${mockCnt}`);
  const countText = countParts.join(" · ");

  // 접었을 때 한 줄 요약에 쓸 "가장 가까운 시험" (시험 기간 중이면 그게 0순위)
  const rank = (x) => (typeof x.diff === "number" ? Math.max(x.diff, 0) : 99999);
  const nearest = list.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  const nearestAccent = nearest.type === "모의고사" ? "#a78bfa" : "#34d399";
  const nearestDdayColor = nearest.ddayLabel === "영어 끝"
    ? "rgba(255,255,255,0.45)" : nearest.ongoing ? "#fde68a" : nearestAccent;

  return (
    <div style={{
      background: "rgba(255,255,255,0.035)",
      borderRadius: 12,
      padding: "12px 14px",
      marginBottom: 12,
    }}>
      <button
        onClick={() => setUserOpen(!open)}
        style={{
          width: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: "inherit",
          marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2, flexShrink: 0 }}>
          다가오는 시험
        </span>
        {open ? (
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>{countText}</span>
        ) : (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nearest.name}
            <span style={{ color: nearestDdayColor, marginLeft: 6 }}>{nearest.ddayLabel}</span>
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#34d399", flexShrink: 0 }}>
          {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>
      {open && (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {list.map(item => {
          const isMock = item.type === "모의고사";
          const accent = isMock ? "#a78bfa" : "#34d399";
          const ddayColor = item.ddayLabel === "영어 끝" ? "rgba(255,255,255,0.45)" : item.ongoing ? "#fde68a" : accent;
          const showEngBadge = item.isEngTarget && item.ddayLabel !== "영어 끝";
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
              {showEngBadge && (
                <span style={{
                  fontSize: 9, fontWeight: 800, color: accent,
                  border: `1px solid ${accent}55`, borderRadius: 6,
                  padding: "1px 5px", flexShrink: 0, letterSpacing: 0.3,
                }} title="영어시험일 기준 D-day">영어</span>
              )}
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
      )}
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
  if (base) return String(base).replace(/\/+$/, "") + "/vocab-test-result";
  // [08-08] 위 두 값이 설정에 없어도 되게 한다.
  // 영상 기록 주소(…/video-watch)의 끝만 바꿔서 쓴다. 같은 워커의 옆 문이라 주소가 항상 같다.
  // 이게 없으면 주소가 빈 문자열이 되어 오답 TEST 결과가 전송조차 안 된다(08-08 발견한 버그).
  const vw = String(VIDEO_WATCH_API_URL || "").replace(/\/+$/, "");
  if (vw) return vw.replace(/\/video-watch$/, "") + "/vocab-test-result";
  return "";
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
      // [08-08] 본인 확인 값(t)을 보낼 때 붙인다. 대기열에 들어간 옛 기록도 보내는 순간 붙으므로
      //         앱을 바꾸기 전에 쌓인 기록이 버려지지 않는다.
      body: JSON.stringify({ ...payload, t: getSelfAccessToken() }),
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

// ─── QR 그리기: 값 하나를 QR 그림으로 (출석 QR·카톡 문의 QR 공용) ───
// [4차] 예전에는 QR 만드는 코드를 그때그때 인터넷(cdnjs)에서 내려받았다.
//       학원 와이파이가 끊기면 QR이 안 나왔다. 이제는 앱 안에 들어있는 qrcode로 그린다.
//       실패하면 하얀 네모를 남기지 않고 "왜 안 되는지"를 글자로 보여준다.
//       그림(img)으로 그리는 이유: 좁은 폰에서도 정사각형을 지키며 저절로 줄어들어 잘리지 않는다.
function QrBox({ value, size = 168 }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setFailed(false);
    const text = value == null ? "" : String(value);
    // 값이 비어 있으면(예: 열쇠값 누락) 만들어봐야 스캔이 안 되므로 바로 안내를 띄운다.
    if (!text) { setFailed(true); return undefined; }
    // 화면 크기의 2배로 만들어 두면 고화질 폰에서도 또렷하다. 실제 표시 크기는 아래 style이 정한다.
    QRCodeLib.toDataURL(text, { width: Math.round(size * 2), margin: 1, errorCorrectionLevel: "M" })
      .then((url) => { if (!cancelled) { setSrc(url); setFailed(false); } })
      .catch(() => { if (!cancelled) { setSrc(""); setFailed(true); } });
    return () => { cancelled = true; };
  }, [value, size]);

  return (
    <div style={{ display: "inline-flex", padding: 8, background: "#fff", borderRadius: 10, border: "1px solid #eef0f3", maxWidth: "100%", boxSizing: "border-box" }}>
      {failed ? (
        <div style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#c0392b", lineHeight: 1.6, padding: 12, boxSizing: "border-box" }}>
          QR을 못 만들었어요<br />데스크 선생님께<br />이름을 말해주세요
        </div>
      ) : src ? (
        <img
          src={src}
          alt="QR"
          style={{ display: "block", width: size, maxWidth: "100%", height: "auto", background: "#fff" }}
        />
      ) : (
        // 만드는 중(아주 잠깐). 빈 img를 두면 깨진 그림 아이콘이 뜨므로 빈 칸으로 자리만 잡아둔다.
        <div style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", background: "#fff" }} />
      )}
    </div>
  );
}

// ─── 출석 QR 모달: 데스크에서 스캔할 개인 QR(maple-att:{id}:{token}) ───
// [4차] QR 그리는 코드를 따로 갖고 있지 않고 QrBox를 그대로 쓴다(크기만 240으로 넘김).
//       고칠 일이 생기면 QrBox 한 군데만 고치면 된다.
function AttQrModal({ value, studentName, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: "24px 20px 20px", width: "100%", maxWidth: 340, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", boxSizing: "border-box" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C66A5", marginBottom: 2 }}>출석 QR</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#2A2A28", marginBottom: 16 }}>{studentName}</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <QrBox value={value} size={240} />
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
  // [마스터] 대기열에 넣으면 나중에 원장 폰에서 재전송돼 결국 그 학생 기록으로 들어간다. 넣지 않는다.
  if (IS_MASTER_MODE) return;
  const pending = getPendingVideoWatch();
  const sid = payload?.sessionId || `${payload?.studentId || ""}_${payload?.videoId || ""}_${payload?.timestamp || Date.now()}`;
  if (!pending.some(x => (x.sessionId || "") === sid)) {
    pending.push({ ...payload, sessionId: sid });
    setPendingVideoWatch(pending.slice(-100)); // 기기 저장소 보호용: 최근 100개만 보관
  }
};

const postVideoWatchToWorker = async (payload) => {
  // [마스터] 원장 검수 기록이 학생 시청 통계에 섞이면 안 되므로 전송하지 않는다.
  // 호출부가 실패로 보고 대기열에 넣지 않도록 성공 형태로 반환한다.
  if (IS_MASTER_MODE) return { success: true, master: true, skipped: true };
  if (!VIDEO_WATCH_API_URL) throw new Error("VITE_VIDEO_WATCH_API_URL이 설정되지 않았습니다");
  const headers = { "Content-Type": "application/json" };
  if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
  const resp = await fetch(VIDEO_WATCH_API_URL, {
    method: "POST",
    headers,
    // [08-08] 본인 확인 값(t)을 보낼 때 붙인다. 대기열에 쌓여 있던 옛 기록도 보내는 순간 붙는다.
    body: JSON.stringify({ ...payload, t: getSelfAccessToken() }),
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
// id 없이 (설치 앱이 쿼리를 잃은 채) 열렸을 때: 이름+전화 뒷4자리로 본인 확인
function StudentLinkRecover({ apiBase }) {
  const [name, setName] = useState("");
  const [tail, setTail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [conflict, setConflict] = useState(false);
  // 마플영어 카톡 친구추가 QR. 원장 개인 연락처는 번들(공개 파일)에 넣지 않는다.
  // 이 주소는 스캔 전용이라 탭해도 카톡이 열리지 않으므로 링크가 아니라 QR로만 띄운다.
  const OWNER_KAKAO_QR = "http://qr.kakao.com/talk/2cbX2.v5KiS_mtOAbkXav4jlZC0-";
  const submit = async () => {
    const nm = name.trim();
    const tl = tail.replace(/[^0-9]/g, "").slice(-4);
    if (!nm || tl.length !== 4) { setMsg("이름과 전화 뒷 4자리를 정확히 입력해주세요."); return; }
    setBusy(true); setMsg(""); setConflict(false);
    try {
      const r = await fetch(new URL(apiBase).origin + "/student/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, tail: tl }),
      });
      const d = await r.json();
      // [마스터] 원장 진입 — 워커만이 판별값을 알고, 통과하면 열쇠(mk)를 내려준다.
      // 열쇠는 폰에만 보관하고 주소창에는 ?master=1 만 남긴다.
      if (d && d.success && d.master && d.mk) {
        try { localStorage.setItem(MASTER_MK_KEY, d.mk); } catch (e) {}
        window.location.href = window.location.pathname + "?master=1";
        return;
      }
      if (d && d.success && d.id) {
        try { localStorage.setItem(LINK_STORE_KEY, JSON.stringify({ id: d.id, t: d.t || "" })); } catch (e) {}
        const sp = new URLSearchParams();
        sp.set("id", d.id); if (d.t) sp.set("t", d.t);
        window.location.href = window.location.pathname + "?" + sp.toString();
        return;
      }
      if (d && d.code === "conflict") setConflict(true);
      setMsg(d?.error || "확인에 실패했습니다.");
    } catch (e) {
      setMsg("네트워크 오류입니다. 잠시 후 다시 시도해주세요.");
    } finally { setBusy(false); }
  };
  const inp = { width: "100%", padding: "13px 14px", fontSize: 16, border: "1px solid #dfe3ef", borderRadius: 10, boxSizing: "border-box", background: "#fff", outline: "none" };
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#222", marginBottom: 6 }}>처음 한 번만 확인할게요</div>
        <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.6, marginBottom: 22 }}>이름과 전화번호 뒷 4자리를 입력하면<br />다음부터 바로 열려요</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#666", display: "block", marginBottom: 5 }}>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="본인 이름" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#666", display: "block", marginBottom: 5 }}>전화번호 뒷 4자리</label>
            <input value={tail} onChange={(e) => setTail(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} inputMode="numeric" placeholder="예: 5089" style={{ ...inp, letterSpacing: 4, fontWeight: 700 }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
        </div>
        {msg && <div style={{ fontSize: 12.5, color: conflict ? "#b45309" : "#dc2626", marginTop: 12, lineHeight: 1.5 }}>{msg}</div>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", marginTop: 18, padding: "14px 0", fontSize: 15.5, fontWeight: 800, color: "#fff", background: busy ? "#9bb4cc" : "#1C66A5", border: "none", borderRadius: 10, cursor: busy ? "default" : "pointer" }}>{busy ? "확인 중..." : "확인"}</button>
        {conflict && (
          <div style={{ marginTop: 12, padding: "16px 14px", background: "#FEF7E0", border: "1px solid #F3D97B", borderRadius: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#7A5A00", marginBottom: 10 }}>💬 마플영어 카톡으로 문의해주세요</div>
            <QrBox value={OWNER_KAKAO_QR} size={168} />
            <div style={{ fontSize: 11.5, color: "#8B7540", marginTop: 8, lineHeight: 1.5 }}>친구추가 QR입니다. 다른 폰의 카메라나 카톡 QR로 찍어주세요.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── [설문 이미지] 원장앱이 첨부한 사진(R2 키, 예: survey/svy_123.jpg)을 워커 /files/ 프록시로 받아 표시 ───
// 키가 없거나 로드에 실패하면 아무것도 그리지 않는다 — 구형 설문·네트워크 오류에도 카드가 깨지지 않게.
function StudentSurveyImage({ imageKey }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true; let objUrl = "";
    setSrc("");
    if (!imageKey || !WORKER_ORIGIN) return undefined;
    (async () => {
      try {
        const headers = {};
        if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
        const path = String(imageKey).split("/").map(encodeURIComponent).join("/");
        const r = await fetch(`${WORKER_ORIGIN}/files/${path}`, { headers });
        if (!r.ok) throw new Error(`이미지 요청 실패 (${r.status})`);
        const buf = await r.arrayBuffer();
        if (!alive) return;
        objUrl = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
        setSrc(objUrl);
      } catch (e) { console.warn("설문 이미지 로드 실패:", e?.message || e); }
    })();
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [imageKey]);
  if (!imageKey || !src) return null;
  return <img src={src} alt="설문 이미지" style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }} />;
}

// ─── 설문 응답 카드 ───
// 단일 선택: 선택지를 누르면 바로 제출. 복수 선택(maxChoices>1): 정확히 maxChoices개를 골라야 [제출하기]가 활성화된다.
function StudentSurveyCard({ survey, myResponse, student, onSubmitted }) {
  const maxChoices = Math.max(1, Number(survey?.maxChoices) || 1);
  const savedChoices = Array.isArray(myResponse?.choices)
    ? myResponse.choices.map(Number)
    : (myResponse?.choice != null ? [Number(myResponse.choice)] : []);
  const savedKey = savedChoices.join(",");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState(savedChoices);
  useEffect(() => { setPicked(savedKey ? savedKey.split(",").map(Number) : []); setMsg(""); }, [survey.id, savedKey]);

  const post = async (choicesArr) => {
    // [마스터] 원장이 학생 화면에서 눌러도 그 학생 응답으로 제출되면 안 된다.
    if (IS_MASTER_MODE) { setMsg("마스터 모드에서는 설문이 제출되지 않습니다."); return; }
    setBusy(true); setMsg("");
    try {
      const t = new URLSearchParams(window.location.search).get("t") || "";
      const bodyObj = { surveyId: survey.id, studentId: String(student?.id || ""), t };
      if (maxChoices > 1) bodyObj.choices = choicesArr; else bodyObj.choice = choicesArr[0];
      const r = await fetch(new URL(STUDENT_SYNC_API_URL).origin + "/survey/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        const rec = { at: d.at || new Date().toISOString() };
        if (maxChoices > 1) rec.choices = choicesArr; else rec.choice = choicesArr[0];
        onSubmitted(survey.id, rec);
        setMsg("제출되었습니다. 마감 전까지 변경할 수 있어요.");
      } else setMsg(d?.error || "제출에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } catch (e) { setMsg("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요."); }
    setBusy(false);
  };

  const tap = (idx) => {
    if (busy) return;
    if (maxChoices <= 1) { if (idx !== savedChoices[0]) post([idx]); return; }
    setPicked((prev) => {
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      if (prev.length >= maxChoices) { setMsg(`${maxChoices}개만 선택할 수 있어요. 바꾸려면 먼저 하나를 눌러 해제하세요.`); return prev; }
      setMsg("");
      return [...prev, idx].sort((a, b) => a - b);
    });
  };
  const dirty = maxChoices > 1 && picked.join(",") !== savedKey;
  const submitted = savedChoices.length > 0;
  const activeSet = maxChoices > 1 ? picked : savedChoices;
  const needMore = maxChoices > 1 && picked.length < maxChoices; // 정확히 N개 골라야 제출 가능
  const submitDisabled = busy || needMore || !dirty;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E4E0D8", padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#2A6FDB", padding: "2px 9px", borderRadius: 999 }}>설문</span>
        {maxChoices > 1 && <span style={{ fontSize: 11, fontWeight: 800, color: "#8E44AD", background: "#F5EEF8", padding: "2px 9px", borderRadius: 999 }}>{maxChoices}개 선택</span>}
        {submitted && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#1B8A5A" }}>제출 완료</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#2A2A28", marginBottom: 10, lineHeight: 1.45 }}>{survey.title}</div>
      {(() => {
        // 여러 장(images 배열) 지원 — 구버전 설문의 단일 image 필드도 목록으로 취급
        const keys = Array.isArray(survey.images) && survey.images.length ? survey.images : (survey.image ? [survey.image] : []);
        return keys.length ? (
          // [설문 이미지] 2열 그리드 — 사진이 1장뿐이면 1열로 크게
          <div style={{ display: "grid", gridTemplateColumns: keys.length === 1 ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {keys.map((k, i) => <StudentSurveyImage key={i} imageKey={k} />)}
          </div>
        ) : null;
      })()}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(survey.options || []).map((op, idx) => {
          const on = activeSet.includes(idx);
          return (
            <button key={idx} disabled={busy} onClick={() => tap(idx)} style={{
              padding: "9px 14px", borderRadius: 10, cursor: busy ? "wait" : "pointer", fontSize: 13.5, fontWeight: 700,
              border: on ? "1.5px solid #2A6FDB" : "1.5px solid #E0DCD4",
              background: on ? "#EBF2FE" : "#fff", color: on ? "#2A6FDB" : "#555",
            }}>{op}</button>
          );
        })}
      </div>
      {maxChoices > 1 && (
        <button disabled={submitDisabled} onClick={() => post(picked)} style={{
          marginTop: 10, width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
          background: submitDisabled ? "#c9d6ea" : "#2A6FDB", color: "#fff",
          fontSize: 14, fontWeight: 800, cursor: submitDisabled ? "default" : "pointer",
        }}>{busy ? "제출 중..." : needMore ? `${maxChoices}개를 선택해주세요 (${picked.length}/${maxChoices})` : submitted ? (dirty ? "변경 저장" : "제출됨") : "제출하기"}</button>
      )}
      {/* [수정 07-30] 경고 색 조건이 "최대"를 찾는데 실제 문구엔 그 낱말이 없어 경고가 성공 초록으로 떴다. */}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.includes("실패") || msg.includes("오류") || msg.includes("유효") ? "#D2402E" : (msg.includes("개만 선택") || msg.includes("마스터")) ? "#B45309" : "#1B8A5A", fontWeight: 700 }}>{msg}</div>}
      {!submitted && !msg && <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>{maxChoices > 1 ? `원하는 항목을 꼭 ${maxChoices}개 고르고 [제출하기]를 눌러주세요.` : "선택지를 누르면 바로 제출됩니다."}</div>}
    </div>
  );
}

// ─── [모의고사 4차수 2·3·4단계] 모의고사 탭 — 회차 목록 → 회차 메뉴 → 듣기·시계 → 답 입력 → 결과 ───
// 회차는 워커 POST /mock/rounds 가 내려준다: 원장님이 잠갔고 + 정답 45개가 다 찬 + 이 학생 학년의 회차만.
// 정답·3점 정보는 이 화면까지 절대 내려오지 않는다 (제출한 뒤 결과 응답에만 들어옴).
// 시험 시계 규칙(원장 확정): 듣기 재생 = 70분 / 듣기 없이 시작 = 50분(듣기 제외) /
//   남은 시간이 아니라 "시작 시각"을 폰에 저장해서 앱을 껐다 켜도 시간이 계속 흐른다 /
//   시험이 도는 동안 답 입력은 잠긴다 / [시험 끝내기]로 일찍 끝낼 수 있다 /
//   답 입력(4단계)은 시계 없이도 들어갈 수 있다 — 종이로 이미 푼 학생용.
const MOCK_NOTE_COLORS = { "모평": { bg: "#f3e8ff", fg: "#7c3aed" }, "수능": { bg: "#fdf2f8", fg: "#e84393" } };

const fmtMockAttemptDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// ── [모의고사 시계 순수부 시작] 시계 계산 — 시험(검증)도 이 구간을 그대로 떼어 돌린다 ──
const MOCK_EXAM_MIN = { timed70: 70, timed50: 50 }; // 듣기 포함 70분 / 듣기 없이 50분

const mockExamDurationMin = (mode) => MOCK_EXAM_MIN[mode] || 0;

// 남은 시간(밀리초). 시작 시각 기준으로 계산하므로 앱을 껐다 켜도 이어진다. 0 밑으로 안 내려감.
const mockExamRemainingMs = (startedAt, mode, now) => {
  const total = mockExamDurationMin(mode) * 60 * 1000;
  const left = (Number(startedAt) || 0) + total - (Number(now) || 0);
  return Math.max(0, Math.min(total, left));
};

// 70:00 / 9:05 / 0:00 모양 시계 표시
const fmtMockClock = (ms) => {
  const sec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// 재생 속도: 0.5~2.0 사이, 0.1 단위 (소수점 오차 방지 반올림)
const mockClampSpeed = (v) => Math.min(2, Math.max(0.5, Math.round((Number(v) || 1) * 10) / 10));
// ── [모의고사 시계 순수부 끝] ──

// 진행 중인 시험은 폰(localStorage)에 시작 시각째로 저장한다 — 학생당 한 번에 한 시험.
const mockExamStateKey = (studentId) => `maple_mock_active_${studentId}`;
const loadMockExamState = (studentId) => {
  try {
    const r = JSON.parse(localStorage.getItem(mockExamStateKey(studentId)) || "null");
    if (r && r.v === 1 && r.roundId && r.startedAt && (r.phase === "running" || r.phase === "done")) return r;
  } catch (e) { /* 망가진 저장값은 없는 셈 친다 */ }
  return null;
};
const saveMockExamState = (studentId, st) => {
  try {
    if (st) localStorage.setItem(mockExamStateKey(studentId), JSON.stringify(st));
    else localStorage.removeItem(mockExamStateKey(studentId));
  } catch (e) { /* 저장 실패해도 시험 진행은 막지 않는다 */ }
};

const mockSpeedKey = (studentId) => `maple_mock_speed_${studentId}`;
const loadMockSpeed = (studentId) => {
  try { return mockClampSpeed(Number(localStorage.getItem(mockSpeedKey(studentId))) || 1); } catch (e) { return 1; }
};

const mockRoundTitle = (r) => `${r.year}년 ${r.month}월 · 고${r.grade}`;

// ─── 듣기 + 시험 시계 화면 (mode: timed70=듣기 포함 / timed50=듣기 없이) ───
function MockTimerScreen({ studentId, round, mode, exam, onExamChange, onBack }) {
  const withAudio = mode === "timed70";
  const durMs = mockExamDurationMin(mode) * 60 * 1000;
  const isMine = exam && exam.roundId === round.id && exam.mode === mode;
  const running = !!(isMine && exam.phase === "running");
  const done = !!(isMine && exam.phase === "done");

  const [now, setNow] = useState(Date.now());
  const [speed, setSpeed] = useState(() => loadMockSpeed(studentId));
  const [playing, setPlaying] = useState(false);
  const [posSec, setPosSec] = useState(0);
  const [durSec, setDurSec] = useState(0);
  const [audioErr, setAudioErr] = useState("");
  const audioRef = useRef(null);

  // 시계는 0.5초마다 다시 계산 — 값을 저장하지 않고 시작 시각에서 계산만 한다
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const remainMs = running ? mockExamRemainingMs(exam.startedAt, exam.mode, now) : (done ? 0 : durMs);

  // 시간이 다 되면 자동으로 "끝" 상태로 넘긴다 (앱을 껐다 켠 사이 끝난 경우도 여기서 잡힘)
  useEffect(() => {
    if (running && remainMs <= 0) {
      try { if (audioRef.current) audioRef.current.pause(); } catch (e) { /* 무시 */ }
      onExamChange({ ...exam, phase: "done", endedAt: (Number(exam.startedAt) || 0) + durMs });
    }
  }, [running, remainMs <= 0]);

  // 속도는 오디오에 즉시 반영 + 폰에 기억
  useEffect(() => {
    if (audioRef.current) { try { audioRef.current.playbackRate = speed; } catch (e) { /* 무시 */ } }
    try { localStorage.setItem(mockSpeedKey(studentId), String(speed)); } catch (e) { /* 무시 */ }
  }, [speed]);

  const startExam = () => {
    onExamChange({
      v: 1, roundId: round.id, mode, noListening: mode === "timed50",
      phase: "running", startedAt: Date.now(),
      snapshot: { id: round.id, year: round.year, month: round.month, grade: round.grade, note: round.note || "", host: round.host || "", hasAudio: !!round.hasAudio, audioPath: round.audioPath || "" },
    });
  };

  const finishEarly = () => {
    if (!running) return;
    if (!window.confirm("정말 시험을 끝낼까요?\n끝내면 시계가 멈추고 답 입력이 열려요.")) return;
    try { if (audioRef.current) audioRef.current.pause(); } catch (e) { /* 무시 */ }
    onExamChange({ ...exam, phase: "done", endedAt: Date.now() });
  };

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    setAudioErr("");
    if (a.paused) {
      try {
        a.playbackRate = speed;
        await a.play();
        if (!running && !done) startExam(); // 첫 재생 = 70분 시작 (원장 확정)
      } catch (e) {
        setAudioErr("재생을 시작하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.");
      }
    } else {
      a.pause(); // 재생을 멈춰도 시험 시계는 계속 흐른다 (실전과 같게)
    }
  };

  const seekBy = (d) => {
    const a = audioRef.current;
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + d));
  };

  const fmtPos = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 18 };
  const lowTime = running && remainMs <= 5 * 60 * 1000;

  return (
    <div>
      <button onClick={onBack} style={{ border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 0", marginBottom: 10 }}>← 회차 메뉴</button>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{mockRoundTitle(round)}{round.note ? ` · ${round.note}` : ""}</div>
        <div style={{ fontSize: 12.5, color: "#999", marginTop: 3 }}>{withAudio ? "듣기 시험 (70분)" : "듣기 없이 풀기 (50분 · 듣기 제외)"}</div>

        <div style={{ fontSize: 13, color: "#999", marginTop: 18 }}>남은 시간</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: 1, fontVariantNumeric: "tabular-nums", color: done ? "#00b894" : (lowTime ? "#ff4757" : "#2A2A28"), lineHeight: 1.15 }}>
          {fmtMockClock(remainMs)}
        </div>
        {!running && !done && (
          <div style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
            {withAudio ? "▶︎ 재생을 누르면 시험이 시작돼요" : "아래 버튼을 누르면 시험이 시작돼요"}
          </div>
        )}
        {done && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#00b894" }}>시험 끝났습니다! 🎉</div>
            <div style={{ fontSize: 13, color: "#999", marginTop: 6, lineHeight: 1.6 }}>
              수고했어요. 이제 답 입력이 열렸어요.<br />회차 메뉴에서 [답 입력]을 눌러 주세요.
            </div>
            <button onClick={onBack} style={{ marginTop: 14, padding: "11px 26px", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>회차 메뉴로</button>
          </div>
        )}

        {withAudio && !done && (
          <div style={{ marginTop: 20, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <audio
              ref={audioRef}
              src={`${WORKER_ORIGIN}${round.audioPath || `/files/mock-audio/${round.id}.mp3`}`}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setPosSec(e.target.currentTime || 0)}
              onLoadedMetadata={(e) => { setDurSec(e.target.duration || 0); try { e.target.playbackRate = speed; } catch (err) { /* 무시 */ } }}
              onError={() => setAudioErr("듣기 파일을 불러오지 못했어요. 인터넷을 확인해 주세요.")}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
              <button onClick={() => seekBy(-10)} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 999, width: 46, height: 46, fontSize: 12, fontWeight: 700, color: "#555", cursor: "pointer" }}>-10초</button>
              <button onClick={togglePlay} style={{ border: "none", background: "#1C66A5", color: "#fff", borderRadius: "50%", width: 62, height: 62, fontSize: 24, cursor: "pointer" }}>{playing ? "⏸" : "▶︎"}</button>
              <button onClick={() => seekBy(10)} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 999, width: 46, height: 46, fontSize: 12, fontWeight: 700, color: "#555", cursor: "pointer" }}>+10초</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <input
                type="range" min={0} max={Math.max(1, Math.floor(durSec))} step={1}
                value={Math.min(Math.floor(posSec), Math.max(1, Math.floor(durSec)))}
                onChange={(e) => { const a = audioRef.current; if (a && isFinite(a.duration)) a.currentTime = Number(e.target.value) || 0; }}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{fmtPos(posSec)} / {durSec ? fmtPos(durSec) : "--:--"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 13, color: "#999" }}>속도</span>
              <button onClick={() => setSpeed(s => mockClampSpeed(s - 0.1))} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer", color: "#555" }}>−</button>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 44, fontVariantNumeric: "tabular-nums" }}>{speed.toFixed(1)}배</span>
              <button onClick={() => setSpeed(s => mockClampSpeed(s + 0.1))} style={{ border: "1px solid #e5e5e5", background: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer", color: "#555" }}>+</button>
            </div>
            {audioErr && <div style={{ fontSize: 12.5, color: "#ff4757", marginTop: 10 }}>{audioErr}</div>}
          </div>
        )}

        {!withAudio && !running && !done && (
          <button onClick={startExam} style={{ marginTop: 18, padding: "13px 30px", borderRadius: 12, border: "none", background: "#1C66A5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>⏱ 50분 시작</button>
        )}

        {running && (
          <div style={{ marginTop: 18, borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 10 }}>시험이 끝날 때까지 답 입력은 잠겨 있어요</div>
            <button onClick={finishEarly} style={{ border: "1.5px solid #ff4757", background: "#fff", color: "#ff4757", borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>시험 끝내기</button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── [모의고사 답입력 순수부 시작] 쪽 나눔·검산 계산 — 시험(검증)도 이 구간을 그대로 떼어 돌린다 ──
// 쪽 나눔은 원장앱 정답 등록(C안)과 완전히 같다: 1~12 / 13~20 / 21~24 / 25~28 / 29~32 / 33~36 / 37~40 / 41~45
const MOCK_PAGES = [[1, 12], [13, 20], [21, 24], [25, 28], [29, 32], [33, 36], [37, 40], [41, 45]];

// 듣기 제외면 18번부터: 1쪽(1~12)은 통째로 빠지고 2쪽은 18~20만 남아 총 7쪽이 된다
const mockPagesFor = (noListening) => {
  if (!noListening) return MOCK_PAGES;
  return MOCK_PAGES.map(([a, b]) => [Math.max(a, 18), b]).filter(([a, b]) => a <= b);
};

const isMockPick = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5;

// 이 쪽에서 아직 안 찍은 번호들
const mockPageMissing = (answers, page) => {
  const miss = [];
  for (let n = page[0]; n <= page[1]; n++) if (!isMockPick((answers || [])[n - 1])) miss.push(n);
  return miss;
};

// 입력해야 하는 전체 범위에서 안 찍은 번호들
const mockAllMissing = (answers, noListening) => {
  const miss = [];
  for (let n = noListening ? 18 : 1; n <= 45; n++) if (!isMockPick((answers || [])[n - 1])) miss.push(n);
  return miss;
};

// 번호별 개수: ①8개 ②9개… — 밀려 찍으면 한쪽으로 쏠려서 학생이 스스로 알아챈다
const mockCountByChoice = (answers, noListening) => {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let n = noListening ? 18 : 1; n <= 45; n++) {
    const v = Number((answers || [])[n - 1]);
    if (c[v] != null) c[v]++;
  }
  return c;
};

// 끝난 시험 기록에서 걸린 시간(초) — 자유 입력이면 0
const mockDurationSecFromExam = (exam) => {
  if (!exam || exam.phase !== "done") return 0;
  const ms = (Number(exam.endedAt) || 0) - (Number(exam.startedAt) || 0);
  return Math.max(0, Math.round(ms / 1000));
};
// ── [모의고사 답입력 순수부 끝] ──

// 찍다 만 답은 폰에 임시 저장 — 전화가 와서 앱이 꺼져도 이어서 찍는다. 제출하면 지운다.
const mockDraftKey = (studentId) => `maple_mock_draft_${studentId}`;
const loadMockDraft = (studentId, roundId, noListening) => {
  try {
    const r = JSON.parse(localStorage.getItem(mockDraftKey(studentId)) || "null");
    if (r && r.v === 1 && r.roundId === roundId && !!r.noListening === !!noListening && Array.isArray(r.answers)) return r;
  } catch (e) { /* 망가진 저장값은 없는 셈 친다 */ }
  return null;
};
const saveMockDraft = (studentId, draft) => {
  try {
    if (draft) localStorage.setItem(mockDraftKey(studentId), JSON.stringify(draft));
    else localStorage.removeItem(mockDraftKey(studentId));
  } catch (e) { /* 무시 */ }
};

const MOCK_CIRCLED = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };

// ─── 답 입력 화면: 한 쪽씩 넘기며 손가락으로 찍기 ───
function MockAnswerScreen({ studentId, round, exam, onBack, onSubmitted }) {
  const mineDone = exam && exam.phase === "done" && exam.roundId === round.id ? exam : null;
  // 모드: 끝난 시험 기록이 있으면 그 기록대로(물어보지 않음), 없으면 학생이 고른다
  const [noListening, setNoListening] = useState(mineDone ? !!mineDone.noListening : null);
  const [answers, setAnswers] = useState(() => {
    const d = mineDone ? loadMockDraft(studentId, round.id, !!mineDone.noListening) : null;
    return d ? d.answers.slice(0, 45) : Array(45).fill(null);
  });
  const [pageIdx, setPageIdx] = useState(0);
  const [summary, setSummary] = useState(false); // 마지막 쪽 다음의 번호별 개수 화면
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState("");

  const pages = noListening === null ? [] : mockPagesFor(noListening);

  // 모드가 정해지면 임시 저장 복원 + 이후 찍을 때마다 저장
  useEffect(() => {
    if (noListening === null) return;
    const d = loadMockDraft(studentId, round.id, noListening);
    if (d) { setAnswers(d.answers.slice(0, 45)); setPageIdx(Math.max(0, Math.min(pages.length - 1, Number(d.page) || 0))); }
  }, [noListening]);
  useEffect(() => {
    if (noListening === null) return;
    saveMockDraft(studentId, { v: 1, roundId: round.id, noListening, answers, page: pageIdx });
  }, [answers, pageIdx, noListening]);

  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 16 };

  // ── 모드 고르기 (자유 입력일 때만) ──
  if (noListening === null) {
    return (
      <div>
        <button onClick={onBack} style={{ border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 0", marginBottom: 10 }}>← 회차 메뉴</button>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{mockRoundTitle(round)} 답 입력</div>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>어디까지 풀었는지 골라 주세요</div>
          <button onClick={() => setNoListening(false)} style={{ width: "100%", textAlign: "left", padding: "15px 16px", marginBottom: 10, borderRadius: 12, border: "1.5px solid #d8dfe8", background: "#fff", cursor: "pointer" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>듣기까지 다 풀었어요</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>1~45번 · 45문항 입력</div>
          </button>
          <button onClick={() => setNoListening(true)} style={{ width: "100%", textAlign: "left", padding: "15px 16px", borderRadius: 12, border: "1.5px solid #d8dfe8", background: "#fff", cursor: "pointer" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>듣기는 안 풀었어요</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>18~45번 · 28문항 입력 · 듣기 37점은 만점 처리 (듣기 제외 표시)</div>
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (busy) return;
    if (!window.confirm("제출하면 정답이 보이고 다시 못 고칩니다.\n제출할까요?")) return;
    setBusy(true); setSendErr("");
    try {
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/mock/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId, t: getSelfAccessToken(),
          roundId: round.id,
          answers,
          noListening,
          mode: mineDone ? mineDone.mode : "free",
          durationSec: mockDurationSecFromExam(mineDone),
        }),
      }, 20000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success || !data.result) throw new Error(data.error || `서버 오류 (${resp.status})`);
      saveMockDraft(studentId, null); // 임시 저장 지우기
      onSubmitted(data.result, noListening);
    } catch (e) {
      setSendErr((e?.message || "제출하지 못했어요") + " — 답은 그대로 있으니 다시 눌러 주세요");
    } finally {
      setBusy(false);
    }
  };

  // ── 번호별 개수(검산) + 제출 화면 ──
  if (summary) {
    const counts = mockCountByChoice(answers, noListening);
    const total = noListening ? 28 : 45;
    const maxCnt = Math.max(1, ...Object.values(counts));
    const missAll = mockAllMissing(answers, noListening);
    return (
      <div>
        <button onClick={() => setSummary(false)} style={{ border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 0", marginBottom: 10 }}>← 답 다시 보기</button>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>번호별로 몇 개 찍었나</div>
          <div style={{ fontSize: 12.5, color: "#999", marginTop: 3, marginBottom: 14 }}>한 번호에 몰려 있으면 밀려 찍은 것일 수 있어요</div>
          {[1, 2, 3, 4, 5].map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 15, width: 22 }}>{MOCK_CIRCLED[k]}</span>
              <div style={{ flex: 1, background: "#f0f2f5", borderRadius: 4, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${(counts[k] / maxCnt) * 100}%`, height: "100%", background: "#1C66A5", borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 13, color: "#555", width: 34, textAlign: "right" }}>{counts[k]}개</span>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: "#999", marginTop: 4 }}>모두 {total - missAll.length} / {total}문항</div>
          {sendErr && <div style={{ fontSize: 13, color: "#ff4757", marginTop: 12, lineHeight: 1.6 }}>{sendErr}</div>}
          <button onClick={submit} disabled={busy || missAll.length > 0} style={{ width: "100%", marginTop: 14, padding: "14px 0", borderRadius: 12, border: "none", background: (busy || missAll.length > 0) ? "#c8cdd6" : "#1C66A5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: (busy || missAll.length > 0) ? "default" : "pointer" }}>
            {busy ? "제출하는 중…" : "제출하기"}
          </button>
          <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", marginTop: 8 }}>제출하면 다시 못 고칩니다</div>
        </div>
      </div>
    );
  }

  // ── 한 쪽씩 찍기 ──
  const page = pages[pageIdx];
  const miss = mockPageMissing(answers, page);
  const lastPage = pageIdx === pages.length - 1;
  const nums = [];
  for (let n = page[0]; n <= page[1]; n++) nums.push(n);

  return (
    <div>
      <button onClick={onBack} style={{ border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 0", marginBottom: 10 }}>← 회차 메뉴</button>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
          {pages.map((p, i) => (
            <span key={i} onClick={() => { if (i < pageIdx) setPageIdx(i); }} style={{ width: 8, height: 8, borderRadius: "50%", background: i === pageIdx ? "#1C66A5" : (mockPageMissing(answers, p).length === 0 ? "#9fc3e0" : "#e3e6ec"), cursor: i < pageIdx ? "pointer" : "default" }} />
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{pageIdx + 1}쪽 · {page[0]}~{page[1]}번</div>
        <div style={{ textAlign: "center", fontSize: 12, color: "#bbb", marginBottom: 12 }}>{mockRoundTitle(round)}{noListening ? " · 듣기 제외" : ""}</div>

        {nums.map(n => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <span style={{ fontSize: 14, fontWeight: 700, width: 24, textAlign: "right", color: "#555" }}>{n}</span>
            {[1, 2, 3, 4, 5].map(v => {
              const on = Number(answers[n - 1]) === v;
              return (
                <button key={v} onClick={() => setAnswers(arr => { const a = [...arr]; a[n - 1] = v; return a; })}
                  style={{ flex: 1, height: 38, borderRadius: 19, border: on ? "none" : "1px solid #dfe3ea", background: on ? "#1C66A5" : "#fff", color: on ? "#fff" : "#8a90a0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  {MOCK_CIRCLED[v]}
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {pageIdx > 0 && (
            <button onClick={() => setPageIdx(i => i - 1)} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid #dfe3ea", background: "#fff", color: "#555", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← 앞 쪽</button>
          )}
          <button
            onClick={() => { if (miss.length) return; lastPage ? setSummary(true) : setPageIdx(i => i + 1); }}
            disabled={miss.length > 0}
            style={{ flex: 2, padding: "13px 0", borderRadius: 12, border: "none", background: miss.length ? "#c8cdd6" : "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 800, cursor: miss.length ? "default" : "pointer" }}>
            {miss.length ? `${miss.join(" · ")}번이 비었어요` : (lastPage ? "다 찍었어요 → 확인하기" : "다음 쪽 →")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 결과 화면: 점수·등급·듣기/독해·틀린 문항 (제출한 뒤에만 정답이 보인다) ───
function MockResultScreen({ round, result, onDone }) {
  const [showAll, setShowAll] = useState(false);
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 18 };
  const wrong = Array.isArray(result.wrong) ? result.wrong : [];
  const ca = Array.isArray(result.correctAnswers) ? result.correctAnswers : [];
  const myMap = {};
  wrong.forEach(w => { myMap[w.n] = w; });
  const startN = result.noListening ? 18 : 1;
  return (
    <div>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#999" }}>{mockRoundTitle(round)}{result.noListening ? " · 듣기 제외" : ""}</div>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.2, marginTop: 4 }}>{result.score}<span style={{ fontSize: 22 }}>점</span></div>
        <span style={{ display: "inline-block", marginTop: 4, fontSize: 14, fontWeight: 800, background: "#e8f8f5", color: "#0b7a5c", padding: "4px 14px", borderRadius: 999 }}>{result.band}등급</span>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, background: "#f7f8fa", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11.5, color: "#999" }}>듣기{result.noListening ? " (만점 처리)" : ""}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{result.listenScore} / 37</div>
          </div>
          <div style={{ flex: 1, background: "#f7f8fa", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11.5, color: "#999" }}>독해</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{result.readScore} / 63</div>
          </div>
        </div>
        <div style={{ textAlign: "left", borderTop: "1px solid #f0f0f0", marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{wrong.length ? `틀린 문항 ${wrong.length}개` : "다 맞았어요! 🎉"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {wrong.map(w => (
              <span key={w.n} style={{ fontSize: 12.5, fontWeight: 700, background: "#ffecec", color: "#c0392b", padding: "4px 10px", borderRadius: 999 }}>{w.n}번 {w.type}{w.pts === 3 ? " · 3점" : ""}</span>
            ))}
          </div>
        </div>
        <button onClick={() => setShowAll(s => !s)} style={{ marginTop: 14, border: "1px solid #e5e5e5", background: "#fff", color: "#666", fontSize: 13, fontWeight: 700, borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>
          {showAll ? "정답 접기" : "정답 전체 보기"}
        </button>
        {showAll && (
          <div style={{ textAlign: "left", marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
            {Array.from({ length: 45 - startN + 1 }, (_, i) => startN + i).map(n => {
              const w = myMap[n];
              const mine = w ? (w.my == null ? "—" : MOCK_CIRCLED[w.my]) : MOCK_CIRCLED[ca[n - 1]];
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "3px 0", color: w ? "#c0392b" : "#555" }}>
                  <span style={{ width: 26, textAlign: "right", fontWeight: 700 }}>{n}</span>
                  <span style={{ width: 60 }}>내 답 {mine}</span>
                  <span style={{ width: 60 }}>정답 {MOCK_CIRCLED[ca[n - 1]] || "?"}</span>
                  <span style={{ fontWeight: 800 }}>{w ? "✗" : "○"}</span>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onDone} style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 12, border: "none", background: "#1C66A5", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>확인</button>
      </div>
    </div>
  );
}

function MockExamTab({ studentId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rounds, setRounds] = useState([]);
  const [notice, setNotice] = useState("");
  const [sel, setSel] = useState(null);            // 고른 회차 — null이면 목록
  const [view, setView] = useState("menu");        // sel이 있을 때: "menu" | "exam70" | "exam50" | "answer" | "result"
  const [result, setResult] = useState(null);      // 방금 제출한 결과 (결과 화면용)
  const [exam, setExamState] = useState(() => loadMockExamState(studentId)); // 진행/완료된 시험 (폰 저장과 동기화)

  const setExam = (st) => { setExamState(st); saveMockExamState(studentId, st); };

  const load = async () => {
    setLoading(true); setError("");
    try {
      if (!WORKER_ORIGIN) throw new Error("서버 주소가 설정되지 않았어요");
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/mock/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, t: getSelfAccessToken() }),
      }, 20000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error(data.error || `서버 오류 (${resp.status})`);
      const list = Array.isArray(data.rounds) ? data.rounds : [];
      setRounds(list);
      setNotice(String(data.notice || ""));
      setSel(prev => {
        if (!prev) return prev;
        const fresh = list.find(r => r.id === prev.id);
        return fresh || prev; // 새 정보가 오면 갈아끼우고, 목록에서 빠졌어도 시험 중이면 유지
      });
    } catch (e) {
      setError(e?.message || "회차를 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [studentId]);

  // 앱을 껐다 켰을 때: 시험이 돌고 있으면 곧장 그 시계 화면으로 복귀 (폰 저장의 스냅샷으로 즉시 그림)
  useEffect(() => {
    const st = loadMockExamState(studentId);
    if (st && st.phase === "running" && st.snapshot) {
      setSel(prev => prev || st.snapshot);
      setView(st.mode === "timed50" ? "exam50" : "exam70");
    }
  }, [studentId]);

  const card = { background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: 16 };
  const badge = (text, bg, fg) => (
    <span style={{ fontSize: 11.5, fontWeight: 700, background: bg, color: fg, padding: "3px 9px", borderRadius: 999 }}>{text}</span>
  );
  const nowMs = Date.now();
  const runningExam = exam && exam.phase === "running" && mockExamRemainingMs(exam.startedAt, exam.mode, nowMs) > 0 ? exam : null;
  const doneExam = exam && exam.phase === "done" ? exam : null;

  if (loading && !sel) return <div style={{ ...card, textAlign: "center", color: "#999", padding: 36 }}>회차를 불러오는 중…</div>;

  if (error && !sel) return (
    <div style={{ ...card, textAlign: "center", padding: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>회차를 불러오지 못했어요</div>
      <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>{error}</div>
      <button onClick={load} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>다시 시도</button>
    </div>
  );

  // ── 답 입력 화면 ──
  if (sel && view === "answer") {
    return (
      <MockAnswerScreen
        studentId={studentId}
        round={sel}
        exam={exam}
        onBack={() => setView("menu")}
        onSubmitted={(res, noL) => {
          setExam(null);            // 끝난 시험 기록 청소 (제출 완료)
          setResult({ ...res, noListening: res.noListening != null ? res.noListening : noL });
          setView("result");
          load();                   // 지난 기록 배지 갱신
        }}
      />
    );
  }

  // ── 결과 화면 ──
  if (sel && view === "result" && result) {
    return <MockResultScreen round={sel} result={result} onDone={() => { setResult(null); setView("menu"); }} />;
  }

  // ── 시계 화면 ──
  if (sel && (view === "exam70" || view === "exam50")) {
    return (
      <MockTimerScreen
        studentId={studentId}
        round={sel}
        mode={view === "exam50" ? "timed50" : "timed70"}
        exam={exam}
        onExamChange={setExam}
        onBack={() => setView("menu")}
      />
    );
  }

  // ── 회차 메뉴 화면 ──
  if (sel) {
    const r = sel;
    const otherRunning = runningExam && runningExam.roundId !== r.id;      // 다른 회차 시험이 도는 중
    const mineRunning = runningExam && runningExam.roundId === r.id ? runningExam : null;
    const mineDone = doneExam && doneExam.roundId === r.id ? doneExam : null;
    const remainTxt = runningExam ? fmtMockClock(mockExamRemainingMs(runningExam.startedAt, runningExam.mode, nowMs)) : "";

    const menuBtn = (enabled) => ({
      width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
      padding: "15px 16px", marginBottom: 10, borderRadius: 12, cursor: enabled ? "pointer" : "default",
      border: enabled ? "1.5px solid #d8dfe8" : "1px solid #eee",
      background: enabled ? "#fff" : "#fafafa", opacity: enabled ? 1 : 0.6,
    });

    // 이미 끝난 시험 기록이 남아 있는데(답 입력 전) 새로 시작하려는 경우 확인
    const guardRestart = (go) => {
      if (mineDone) {
        if (!window.confirm("끝낸 시험의 답을 아직 입력하지 않았어요.\n새로 시작하면 시계가 처음부터 다시 갑니다. 새로 시작할까요?")) return;
        setExam(null);
      }
      go();
    };

    const attempts = Array.isArray(r.myAttempts) ? r.myAttempts : [];
    return (
      <div>
        <button onClick={() => { setSel(null); setView("menu"); }} style={{ border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "2px 0", marginBottom: 10 }}>← 회차 목록</button>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{mockRoundTitle(r)}</div>
            {r.note && MOCK_NOTE_COLORS[r.note] && badge(r.note, MOCK_NOTE_COLORS[r.note].bg, MOCK_NOTE_COLORS[r.note].fg)}
          </div>
          <div style={{ fontSize: 13, color: "#999", marginTop: 4, marginBottom: 16 }}>
            {r.host ? `${r.host} · ` : ""}45문항 · 100점 (듣기 37 + 독해 63)
          </div>

          {otherRunning && (
            <div style={{ background: "#fff8f0", border: "1px solid #ffd9ad", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "#b3641b", lineHeight: 1.6 }}>
              지금 <b>{runningExam.snapshot ? mockRoundTitle(runningExam.snapshot) : "다른 회차"}</b> 시험이 진행 중이에요 (남은 {remainTxt})<br />
              <button onClick={() => { setSel(runningExam.snapshot || r); setView(runningExam.mode === "timed50" ? "exam50" : "exam70"); }} style={{ marginTop: 6, border: "none", background: "#e67e22", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>이어서 하기</button>
            </div>
          )}
          {mineDone && (
            <div style={{ background: "#e8f8f5", border: "1px solid #b7ecdf", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "#0b7a5c", lineHeight: 1.6 }}>
              시험이 끝났어요{mineDone.noListening ? " (듣기 제외)" : ""}. 이제 [답 입력]에서 답을 옮겨 찍으면 돼요.
            </div>
          )}

          <button style={menuBtn(r.hasAudio && !otherRunning)} onClick={() => {
            if (!r.hasAudio || otherRunning) return;
            if (mineRunning && mineRunning.mode === "timed50") { alert("듣기 없이 50분 시험이 진행 중이에요.\n먼저 [시험 끝내기]를 해야 듣기를 시작할 수 있어요."); return; }
            guardRestart(() => setView("exam70"));
          }}>
            <span style={{ fontSize: 24 }}>🎧</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>{mineRunning && mineRunning.mode === "timed70" ? "듣기로 돌아가기" : "듣기"}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {!r.hasAudio ? "듣기 파일이 아직 없어요"
                  : mineRunning && mineRunning.mode === "timed70" ? `시험 진행 중 · 남은 ${remainTxt}`
                  : "재생하면 70분 시험이 시작돼요"}
              </div>
            </span>
          </button>

          <button style={menuBtn(!otherRunning)} onClick={() => {
            if (otherRunning) return;
            if (mineRunning && mineRunning.mode === "timed70") { alert("듣기 70분 시험이 진행 중이에요.\n먼저 [시험 끝내기]를 해야 해요."); return; }
            guardRestart(() => setView("exam50"));
          }}>
            <span style={{ fontSize: 24 }}>⏱</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>{mineRunning && mineRunning.mode === "timed50" ? "시계로 돌아가기" : "듣기 없이 풀기 (50분)"}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {mineRunning && mineRunning.mode === "timed50" ? `시험 진행 중 · 남은 ${remainTxt}` : "독해만 풀 때 · 듣기 37점은 만점으로 쳐요"}
              </div>
            </span>
          </button>

          <button style={menuBtn(!otherRunning && !mineRunning)} onClick={() => {
            if (otherRunning) return;
            if (mineRunning) { alert(`시험이 진행 중이에요!\n시험이 끝나면 답 입력이 열려요. (남은 ${remainTxt})`); return; }
            setView("answer");
          }}>
            <span style={{ fontSize: 24 }}>✍️</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>답 입력</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {mineRunning ? `시험이 끝나면 열려요 · 남은 ${remainTxt}`
                  : mineDone ? `방금 끝낸 시험${mineDone.noListening ? " (듣기 제외)" : ""} 답을 옮겨 찍어요`
                  : "다 풀고 나서 손가락으로 옮겨 찍어요 (시계 없이도 돼요)"}
              </div>
            </span>
          </button>

          <button style={menuBtn(false)}>
            <span style={{ fontSize: 24 }}>📷</span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2A2A28" }}>OMR 카드 사진</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>준비 중이에요</div>
            </span>
          </button>

          {attempts.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#2A2A28", marginBottom: 8 }}>지난 기록</div>
              {attempts.slice().reverse().map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", padding: "4px 0" }}>
                  <span style={{ color: "#999", minWidth: 34 }}>{fmtMockAttemptDate(a.at)}</span>
                  <span style={{ fontWeight: 800 }}>{a.score}점</span>
                  {a.band ? <span style={{ color: "#1C66A5", fontWeight: 700 }}>{a.band}등급</span> : null}
                  {a.noListening && badge("듣기 제외", "#fff4e6", "#e67e22")}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 회차 목록 화면 ──
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>✏️ 모의고사</div>
        <button onClick={load} style={{ border: "1px solid #e5e5e5", background: "#fff", color: "#666", fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}>새로고침</button>
      </div>
      {runningExam && (
        <button onClick={() => { setSel(runningExam.snapshot); setView(runningExam.mode === "timed50" ? "exam50" : "exam70"); }} style={{ ...card, width: "100%", textAlign: "left", display: "block", marginBottom: 10, cursor: "pointer", padding: 14, borderColor: "#ffd9ad", background: "#fff8f0" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#b3641b" }}>⏱ 시험 진행 중 — {runningExam.snapshot ? mockRoundTitle(runningExam.snapshot) : ""}</div>
          <div style={{ fontSize: 12.5, color: "#b3641b", marginTop: 3 }}>남은 {fmtMockClock(mockExamRemainingMs(runningExam.startedAt, runningExam.mode, nowMs))} · 누르면 이어서 해요</div>
        </button>
      )}
      {rounds.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#999", padding: 32, fontSize: 14, lineHeight: 1.7 }}>
          {notice || <>아직 열린 회차가 없어요.<br />선생님이 회차를 열면 여기에 나타나요.</>}
        </div>
      ) : rounds.map((r) => {
        const attempts = Array.isArray(r.myAttempts) ? r.myAttempts : [];
        const last = attempts.length ? attempts[attempts.length - 1] : null;
        return (
          <button key={r.id} onClick={() => { setSel(r); setView("menu"); }} style={{ ...card, width: "100%", textAlign: "left", display: "block", marginBottom: 10, cursor: "pointer", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15.5, fontWeight: 800, color: "#2A2A28" }}>{mockRoundTitle(r)}</span>
              {r.note && MOCK_NOTE_COLORS[r.note] && badge(r.note, MOCK_NOTE_COLORS[r.note].bg, MOCK_NOTE_COLORS[r.note].fg)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
              {r.host && <span style={{ fontSize: 12, color: "#999", marginRight: 2 }}>{r.host}</span>}
              {r.hasAudio ? badge("🎧 듣기 있음", "#e8f8f5", "#00926f") : badge("듣기 없음", "#f4f4f4", "#999")}
              {last && badge(`지난 기록 ${last.score}점${attempts.length > 1 ? ` · ${attempts.length}회` : ""}`, "#eef1ff", "#1C66A5")}
            </div>
          </button>
        );
      })}
      <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
        문제지는 학원에서 종이로 받아요 · 점수는 제출하면 바로 나와요
      </div>
    </div>
  );
}

// ─── 일정 달력 탭 ───
// 등원 요일(시간표) · 학원 휴원일 · 내 학교 시험 · 지난 출석 · 보강을 월 달력 한 장에서 확인한다.
function StudentCalendarTab({ student, makeups, customHolidays, exams, attLog, attStatus }) {
  const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
  const todayStr = fmtYMD(todayObj);
  const [ym, setYm] = useState({ y: todayObj.getFullYear(), m: todayObj.getMonth() });
  const [selDate, setSelDate] = useState(todayStr);

  const sid = String(student?.id || "");
  const allHol = { ...HOLIDAYS, ...(customHolidays || {}) };
  const holName = (v) => (typeof v === "string" ? v : (v && v.name) || "휴원");
  const mks = (makeups || []).filter((m) => m && String(m.studentId) === sid);
  const myExams = (exams || []).filter((ex) => ex && !ex.deletedAt && isExamVisibleForStudentDday(ex, student));

  const attOf = (ds) => { const day = attLog && attLog[ds]; if (!day || typeof day !== "object") return null; return day[sid] ?? Object.values(day)[0] ?? null; };
  // [출결] 결석/지각 (att3): 원장앱에서 기록한 출결 상태 — 본인 것만 번들로 수신
  const attStatusOf = (ds) => { const day = attStatus && attStatus[ds]; if (!day || typeof day !== "object") return null; return day[sid] ?? null; };
  const examsOf = (ds) => myExams.filter((ex) => {
    const { start, end } = getExamStartEndForDday(ex);
    const s = String(start || "").slice(0, 10);
    const e = String(end || start || "").slice(0, 10) || s;
    return s && s <= ds && ds <= e;
  });
  const dayInfo = (ds, dObj) => {
    const hol = allHol[ds];
    const hiddenMk = mks.some((m) => m.date === ds && m.isHidden);
    const visMk = mks.find((m) => m.date === ds && !m.isHidden);
    let attendTime = null;
    if (!hol && !hiddenMk) {
      if (visMk) attendTime = visMk.time || "";
      else {
        const dayKey = DAYS_EN[dObj.getDay() === 0 ? 6 : dObj.getDay() - 1];
        const eff = getEffectiveSchedule(student, ds);
        attendTime = (eff && eff.schedule && eff.schedule[dayKey]) || null;
      }
    }
    return { hol, hiddenMk, visMk, attendTime, isVac: !!getStudentVacation(student, ds), att: attOf(ds), attMark: attStatusOf(ds), dayExams: examsOf(ds) };
  };

  const first = new Date(ym.y, ym.m, 1);
  const firstDow = first.getDay(); // 0=일요일 시작
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(ym.y, ym.m, d));
  const move = (diff) => setYm((p) => { const d = new Date(p.y, p.m + diff, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const sel = selDate ? dayInfo(selDate, new Date(selDate + "T00:00:00")) : null;
  const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
  const navBtn = { width: 34, height: 34, borderRadius: 9, border: "1px solid #e5e0d8", background: "#faf9f7", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#555" };

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 12px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
          <button onClick={() => move(-1)} style={navBtn}>◀</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#2A2A28" }}>{ym.y}년 {ym.m + 1}월</div>
          <button onClick={() => move(1)} style={navBtn}>▶</button>
        </div>
        {student?.vacationSchedule?.startDate && student?.vacationSchedule?.endDate && (
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 800, color: "#B45309", background: "#FFF6E0", border: "1px solid #F2C14E", borderRadius: 999, padding: "3px 12px" }}>
              🏖 {student.vacationSchedule.name || "방학"} 시간표 · {String(student.vacationSchedule.startDate).slice(5).replace("-", "/")} ~ {String(student.vacationSchedule.endDate).slice(5).replace("-", "/")}
            </span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
          {WEEK_KO.map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i === 0 ? "#D2402E" : i === 6 ? "#2A6FDB" : "#999", padding: "4px 0" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {cells.map((dObj, idx) => {
            if (!dObj) return <div key={"e" + idx} />;
            const ds = fmtYMD(dObj);
            const info = dayInfo(ds, dObj);
            const isSel = ds === selDate;
            const isToday = ds === todayStr;
            const attended = !!(info.att && (info.att.inAt || info.att.inTime));
            return (
              <button key={ds} onClick={() => setSelDate(ds)} style={{
                minHeight: 52, padding: "5px 2px 4px", borderRadius: 9, cursor: "pointer",
                border: isSel ? "1.8px solid #2A6FDB" : isToday ? "1.5px solid #b9cff2" : (info.attendTime != null && info.isVac) ? "1.5px solid #F2C14E" : "1px solid transparent",
                background: info.hol ? "#FDF0EE" : info.attendTime != null ? "#F0F6FF" : info.isVac ? "#FFF6E0" : "#fff",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
                <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: info.hol ? "#D2402E" : dObj.getDay() === 0 ? "#D2402E" : dObj.getDay() === 6 ? "#2A6FDB" : "#333" }}>{dObj.getDate()}</span>
                <span style={{ display: "flex", gap: 2, alignItems: "center", minHeight: 9 }}>
                  {info.dayExams.length > 0 && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#E67E22" }} />}
                  {info.visMk && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#8E44AD" }} />}
                  {attended && <span style={{ fontSize: 8.5, fontWeight: 800, color: "#1B8A5A", lineHeight: 1 }}>✓</span>}
                  {info.attMark?.type === "late" && <span style={{ fontSize: 8.5, fontWeight: 900, color: "#E8890C", lineHeight: 1 }}>△</span>}
                  {info.attMark?.type === "absent" && <span style={{ fontSize: 8.5, fontWeight: 900, color: "#D2402E", lineHeight: 1 }}>✕</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 4px 0", borderTop: "1px solid #f2efe9" }}>
          {[["#F0F6FF", "등원일", 1], ["#FFF6E0", "방학기간", 1], ["#FDF0EE", "휴원", 1], ["#E67E22", "시험", 0], ["#8E44AD", "보강·시간변경", 0], ["#1B8A5A", "출석 ✓", 0]].map(([c, label, isBg]) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: isBg ? 3 : 5, background: c, border: isBg ? "1px solid #e0dcd4" : "none", display: "inline-block" }} />{label}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#E8890C", lineHeight: 1 }}>△</span>지각
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#D2402E", lineHeight: 1 }}>✕</span>결석
          </span>
        </div>
      </div>

      {sel && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 16px", marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#2A2A28", marginBottom: 8 }}>
            {Number(selDate.slice(5, 7))}월 {Number(selDate.slice(8, 10))}일 ({WEEK_KO[new Date(selDate + "T00:00:00").getDay()]})
          </div>
          {(() => {
            const rows = [];
            if (sel.hol) rows.push(["휴원", holName(sel.hol), "#D2402E"]);
            sel.dayExams.forEach((ex) => {
              const { start, end } = getExamStartEndForDday(ex);
              const period = start && end && start !== end ? `${String(start).slice(5, 10)} ~ ${String(end).slice(5, 10)}` : "";
              rows.push(["시험", `${ex.name || ex.type || "시험"}${period ? ` (${period})` : ""}`, "#E67E22"]);
            });
            if (sel.visMk) rows.push([sel.visMk.isOverride ? "시간변경" : "보강", sel.visMk.time ? `${sel.visMk.time} 등원` : "시간 미정", "#8E44AD"]);
            else if (sel.attendTime && !sel.hol) rows.push([sel.isVac ? "방학 시간표" : "등원", `${sel.attendTime} 등원 예정`, sel.isVac ? "#B45309" : "#2A6FDB"]);
            if (sel.hiddenMk) rows.push(["등원 취소", "이 날은 등원이 취소되었어요", "#999999"]);
            if (sel.attMark?.type === "late") rows.push(["지각", Number(sel.attMark.time) > 0 ? `${sel.attMark.time}분 지각` : "지각 처리됨", "#E8890C"]);
            if (sel.attMark?.type === "absent") rows.push(["결석", sel.attMark.reason ? `사유: ${sel.attMark.reason}` : "결석 처리됨", "#D2402E"]);
            if (sel.att && (sel.att.inTime || sel.att.inAt)) rows.push(["출석", `등원 ${sel.att.inTime || ""}${sel.att.outTime ? ` · 하원 ${sel.att.outTime}` : ""}`.trim(), "#1B8A5A"]);
            if (!rows.length) return <div style={{ fontSize: 13, color: "#999" }}>이 날은 표시할 일정이 없어요.</div>;
            return rows.map(([tag, text, color], i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderTop: i ? "1px solid #f6f4ef" : "none" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: color, padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>{tag}</span>
                <span style={{ fontSize: 13.5, color: "#444", fontWeight: 600, lineHeight: 1.45 }}>{text}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

// ─── [마스터] 원장 전용 홈 ─────────────────────────────────────────
// 탭 3개 = 단어 TEST(원장 진도) · 강의 영상(커리큘럼 전체) · 학생(목록 → 그 학생 앱)
// 열쇠(mk)는 폰 저장소에서만 읽는다 — 주소창에는 ?master=1 만 있다.
function MasterHome({ mk }) {
  const [tab, setTab] = useState("voca");
  const [students, setStudents] = useState([]);
  const [areas, setAreas] = useState([]);   // [{ areaId, areaLabel, books:[{bookId, name, videos:[...]}] }]
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [openBook, setOpenBook] = useState(null);
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [rl, rb] = await Promise.all([
          fetch(`${WORKER_ORIGIN}/student/master-list?mk=${encodeURIComponent(mk)}`, { cache: "no-store" }),
          fetch(`${WORKER_ORIGIN}/student/master-bundle?mk=${encodeURIComponent(mk)}`, { cache: "no-store" }),
        ]);
        // 열쇠가 안 맞으면(워커에서 값을 교체한 경우 등) 폰의 열쇠를 지우고 본인 확인 화면으로 돌려보낸다.
        if (rl.status === 403 || rb.status === 403) {
          clearMasterMk();
          window.location.href = window.location.pathname;
          return;
        }
        const dl = await rl.json().catch(() => null);
        const db = await rb.json().catch(() => null);
        if (dead) return;
        setStudents(Array.isArray(dl?.students) ? dl.students : []);
        setAreas(Array.isArray(db?.areas) ? db.areas : []);
        if (!dl?.success || !db?.success) setErr("일부 데이터를 불러오지 못했습니다.");
      } catch (e) {
        if (!dead) setErr("불러오지 못했습니다. 인터넷 연결을 확인해주세요.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [mk]);

  const F = "'Pretendard Variable', -apple-system, sans-serif";
  const kw = q.trim().toLowerCase();
  const shown = kw ? students.filter(s => String(s.name || "").toLowerCase().includes(kw)) : students;
  const bookCount = areas.reduce((n, a) => n + (a.books || []).length, 0);
  const videoCount = areas.reduce((n, a) => n + (a.books || []).reduce((m, b) => m + (b.videos || []).length, 0), 0);

  const openStudent = (s) => {
    const sp = new URLSearchParams();
    sp.set("id", String(s.id));
    if (s.t) sp.set("t", s.t);
    sp.set("master", "1");
    window.location.href = window.location.pathname + "?" + sp.toString();
  };

  // 원장 전용 단어 TEST — id를 __master__로 열어 진도를 학생과 완전히 분리한다.
  // t에는 마스터 열쇠를 넣는다(워커가 이 조합만 원장 id로 인정). books= 없음 → 전권.
  // mk=1 은 voca.html이 원장 전용 책(보카바이블)까지 책장에 올리게 하는 플래그.
  const vocaSrc = (() => {
    const p = new URLSearchParams();
    p.set("id", MASTER_ID);
    p.set("t", mk);
    p.set("n", "원장");
    if (WORKER_ORIGIN) p.set("api", WORKER_ORIGIN);
    p.set("mk", "1");
    return `${VOCA_APP_URL}?${p.toString()}`;
  })();

  const card = { width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", marginBottom: 8, borderRadius: 12, border: "1px solid #eceef4", background: "#fff", cursor: "pointer", fontFamily: "inherit" };
  const busyBox = <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", fontFamily: F }}>
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", padding: "18px 24px 20px", color: "#fff" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>👑</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#f0c419" }}>마스터 홈</span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>원장 전용</span>
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
            학생 {students.length}명 · 교재 {bookCount}권 · 강의 {videoCount}개
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        {/* [수정 07-31] 학생 화면 탭 바와 같은 처리 — 글자 접힘 방지 + 넘치면 옆으로 밀기 */}
        <style>{`.mplTabScroll::-webkit-scrollbar{display:none}`}</style>
        <div className="mplTabScroll" style={{
          maxWidth: MAX_W, margin: "0 auto", display: "flex",
          overflowX: "auto", WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
          {[
            { key: "voca", label: "📚 단어장" },
            { key: "videos", label: "🎬 강의 영상" },
            { key: "students", label: "👥 학생" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: "1 0 auto", whiteSpace: "nowrap", padding: "14px 12px", border: "none", cursor: "pointer", background: "transparent",
              fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "#2A2A28" : "#999",
              borderBottom: tab === t.key ? "2.5px solid #2A2A28" : "2.5px solid transparent",
              fontFamily: "inherit",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: 16 }}>
        {err && <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 12, fontWeight: 700 }}>⚠️ {err}</div>}

        {tab === "voca" && (
          <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #eee" }}>
            <VocaFrame title="원장 단어장" src={vocaSrc} />
          </div>
        )}

        {tab === "videos" && (loading ? busyBox : openBook ? (
          <div>
            <button onClick={() => { setOpenBook(null); setPlaying(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", marginBottom: 12, borderRadius: 9, border: "1px solid #dfe3ef", background: "#fff", color: "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 교재 목록</button>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#2A2A28", marginBottom: 3 }}>{openBook.name}</div>
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 14 }}>{openBook.areaLabel} · 강의 {(openBook.videos || []).length}개</div>
            {(openBook.videos || []).map((v) => {
              const isOpen = playing === v.id;
              const ytId = v.type === "playlist" ? "" : extractYoutubeId(v.url || "");
              const plId = v.type === "playlist" ? extractPlaylistId(v.playlistUrl || v.url || "") : "";
              return (
                <div key={v.id} style={{ background: "#fff", borderRadius: 14, marginBottom: 10, border: isOpen ? "2px solid #1C66A5" : "2px solid transparent", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                  <div onClick={() => setPlaying(isOpen ? null : v.id)} style={{ padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: v.type === "playlist" ? "linear-gradient(135deg,#e74c3c,#e67e22)" : "linear-gradient(135deg,#667eea,#764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{v.type === "playlist" ? "📋" : "▶️"}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: "#2A2A28" }}>{v.title}</div>
                      {v.type === "playlist" && <div style={{ fontSize: 11.5, color: "#bbb", marginTop: 2 }}>재생목록 전체 보기</div>}
                    </div>
                    <span style={{ flexShrink: 0, color: "#c8cdd8", fontSize: 15 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 14px 14px" }}>
                      {plId ? (
                        <iframe title={v.title} src={`https://www.youtube.com/embed/videoseries?list=${plId}&rel=0`} allowFullScreen style={{ width: "100%", aspectRatio: "16/9", border: "none", borderRadius: 10, background: "#000" }} />
                      ) : ytId ? (
                        <iframe title={v.title} src={`https://www.youtube.com/embed/${ytId}?rel=0`} allowFullScreen style={{ width: "100%", aspectRatio: "16/9", border: "none", borderRadius: 10, background: "#000" }} />
                      ) : (v.url || v.playlistUrl) ? (
                        <a href={v.url || v.playlistUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#ff0033", color: "#fff", padding: "10px 20px", borderRadius: 9, textDecoration: "none", fontSize: 13.5, fontWeight: 700 }}>▶ 영상 보기</a>
                      ) : (
                        <div style={{ fontSize: 12.5, color: "#c0392b" }}>영상 주소가 없습니다.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 12 }}>교재를 누르면 그 안의 강의가 나옵니다. 강의가 없는 교재는 표시되지 않습니다.</div>
            {areas.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13.5 }}>등록된 강의가 없습니다.</div>}
            {areas.map((a) => (
              <div key={a.areaId} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#8b909a", marginBottom: 8, letterSpacing: 0.3 }}>{a.areaLabel}</div>
                {(a.books || []).map((b) => (
                  <button key={b.bookId} onClick={() => { setOpenBook(b); setPlaying(null); }} style={card}>
                    <span style={{ fontSize: 17 }}>📘</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: "#2A2A28" }}>{b.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "#1C66A5", background: "#eaf2fb", padding: "3px 8px", borderRadius: 8 }}>{(b.videos || []).length}</span>
                    <span style={{ flexShrink: 0, color: "#c8cdd8", fontSize: 15 }}>›</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}

        {tab === "students" && (loading ? busyBox : (
          <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생 이름 검색"
              style={{ width: "100%", padding: "12px 14px", fontSize: 15, border: "1px solid #dfe3ef", borderRadius: 10, boxSizing: "border-box", background: "#fff", outline: "none", marginBottom: 12, fontFamily: "inherit" }} />
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 10 }}>이름을 누르면 그 학생의 실제 앱 화면이 열립니다. ({shown.length}명)</div>
            {shown.map((s) => (
              <button key={s.id} onClick={() => openStudent(s)} style={card}>
                <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: "#eef1f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#5a6a85" }}>{String(s.name || "?")[0]}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: "#2A2A28" }}>{s.name}</span>
                <span style={{ flexShrink: 0, color: "#c8cdd8", fontSize: 15 }}>›</span>
              </button>
            ))}
            {shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#aaa", fontSize: 13.5 }}>일치하는 학생이 없습니다.</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get("id");
  // [4차] 출석 QR에 들어가는 열쇠값. 없으면 QR을 만들어도 데스크에서 인식이 안 되므로
  //       아예 버튼을 안 띄우고 안내 문구로 바꾼다.
  const attToken = params.get("t") || "";

  // [PWA] manifest·아이콘 메타 주입 (학생별 start_url 포함) — 1회
  useEffect(() => { setupStudentPwa(); }, []);

  // [푸시] 앱을 열면: 배지(빨간 숫자) 지우기 + 서비스 워커 등록 + 이미 허용된 폰이면 구독을 조용히 최신으로 갱신
  useEffect(() => {
    const clearBadge = () => { try { if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {}); } catch (e) {} };
    clearBadge();
    const onVis = () => { if (document.visibilityState === "visible") clearBadge(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadErrorCode, setLoadErrorCode] = useState(""); // [08-10] 연결 오류 화면에 표시할 짧은 오류 코드
  const [withdrawnName, setWithdrawnName] = useState(""); // [08-07] 그만둔 학생 안내에 이름을 넣기 위해
  const [masterWithdrawn, setMasterWithdrawn] = useState(false); // [08-07] 마스터가 그만둔 학생 화면을 볼 때 띄우는 띠
  const [student, setStudent] = useState(null);
  const [todos, setTodos] = useState({});
  const [checklistData, setChecklistData] = useState({});
  const [records, setRecords] = useState({});
  const [videos, setVideos] = useState([]);
  const [makeups, setMakeups] = useState([]);
  const [customHolidays, setCustomHolidays] = useState({});
  const [exams, setExams] = useState([]);
  const [examRanges, setExamRanges] = useState(null); // 시험범위(examr3) — 워커가 본인 학교 항목만 전달, 읽기 전용
  const [vocabWrongWords, setVocabWrongWords] = useState({});
  const [progressTree, setProgressTree] = useState(null); // 원장앱 진도 트리(ptree3) — 읽기 전용
  const [attLog, setAttLog] = useState({}); // [일정] 등하원 기록(att_log3) — 읽기 전용
  const [attStatus, setAttStatus] = useState({}); // [출결] 결석/지각(att3) — 읽기 전용
  const [surveys, setSurveys] = useState([]); // [설문] 진행 중 설문(svy3) — 본인 대상만
  const [surveyResponses, setSurveyResponses] = useState({}); // [설문] 본인 응답(svyr3)
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
  // [08-07] 한 번 차단된 링크인지. true가 되면 30초 자동 새로고침이 서버를 그만 두드린다.
  //         학생이 [다시 확인]을 누를 때(manual)만 다시 물어본다.
  const withdrawnRef = useRef(false);
  // [3차] 영상 시청 중인지 여부를 항상 최신으로 들고 있는 ref.
  // 새로고침 useEffect는 studentId가 바뀔 때만 다시 만들어지기 때문에,
  // 그 안에서 viewingVideo state를 그냥 읽으면 옛날 값이 잡힌다. 그래서 ref로 읽는다.
  const viewingVideoRef = useRef(null);
  // [3차] 대기열 재전송(flush)이 겹쳐 도는 것을 막는 문지기. 겹치면 같은 기록이 두 번 저장된다.
  const flushingRef = useRef(false);

  // [PASS] 새로 완주한 책 감지 → 앱 진입 시 축하 연출 (책당 딱 1번, 이 폰 기준)
  // ※ 반드시 위의 student·todos·progressTree state 선언 "뒤"에 있어야 함 — 앞에 두면 TDZ 크래시로 앱이 안 열림
  const [passQueue, setPassQueue] = useState([]);
  const passCheckedRef = useRef(false);
  useEffect(() => {
    if (passCheckedRef.current || !student?.id || IS_MASTER_MODE) return;
    if (!progressTree || !Array.isArray(progressTree.lanes) || !Object.keys(todos || {}).length) return;
    passCheckedRef.current = true;
    try {
      const completed = computeCompletedBooks(student.id, todos, progressTree) || [];
      const key = `mapl_pass_seen_${student.id}`;
      let seen = null;
      try { seen = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { seen = null; }
      const ids = completed.map(b => String(b.id));
      if (!seen || !Array.isArray(seen.ids)) {
        // 첫 실행: 이미 끝나 있던 책은 기준선으로만 기록 (과거 완주까지 축하가 쏟아지지 않게)
        localStorage.setItem(key, JSON.stringify({ ids }));
        return;
      }
      const fresh = completed.filter(b => !seen.ids.includes(String(b.id)));
      localStorage.setItem(key, JSON.stringify({ ids }));
      if (fresh.length) setPassQueue(fresh);
    } catch (e) { console.warn("완주 감지 실패:", e?.message || e); }
  }, [student?.id, todos, progressTree]);
  const pushSyncedRef = useRef(false);
  useEffect(() => {
    if (!student?.id || IS_MASTER_MODE || pushSupport() === "unsupported" || pushSyncedRef.current) return;
    pushSyncedRef.current = true;
    (async () => {
      const reg = await registerMaplSw();
      if (!reg) return;
      if (Notification.permission === "granted") {
        // 허용은 되어 있는데 구독이 끊겼거나 새 기기인 경우를 대비해 매 실행마다 저장을 갱신한다
        try { await subscribeMaplPush(student); } catch (e) { console.warn("푸시 구독 갱신 실패:", e?.message || e); }
      }
    })();
  }, [student?.id]);

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
    // [08-07] 마스터가 그만둔 학생 화면을 열었을 때만 켜진다. 학생 화면에서는 항상 꺼져 있다.
    setMasterWithdrawn(!!bundle.withdrawnFlag && IS_MASTER_MODE);
    setProgressTree(bundle.progressTree || null);
    setTodos(prev => keepPrevIfUnexpectedEmpty(prev, bundle.todos || {}, "todos"));
    setChecklistData(prev => keepPrevIfUnexpectedEmpty(prev, bundle.checklistData || {}, "checklistData"));
    setRecords(prev => keepPrevIfUnexpectedEmpty(prev, bundle.records || {}, "records"));
    setVideos(prev => keepPrevIfUnexpectedEmpty(prev, bundle.videos || [], "videos"));
    setVideoWatch(prev => mergeVideoWatchSnapshots(bundle.videoWatch || {}, prev || {}));
    setMakeups(bundle.makeups || []);
    setCustomHolidays(bundle.customHolidays || {});
    setExams(Array.isArray(bundle.exams || bundle.exam3) ? (bundle.exams || bundle.exam3) : []);
    setAttLog(bundle.attLog || {});
    setAttStatus(bundle.att || {});
    setSurveys(Array.isArray(bundle.surveys) ? bundle.surveys : []);
    setSurveyResponses(bundle.surveyResponses || {});
    setExamRanges(bundle.examRanges || bundle.examr3 || null);
    setVocabWrongWords(prev => keepPrevIfUnexpectedEmpty(prev, bundle.vocabWrongWords || {}, "vocabWrongWords"));
    setSyncSource(bundle.source || "");
    setOfflineNotice(bundle.source === "local-backup" ? "동기화 서버 연결 실패로 최근 백업 데이터를 표시 중입니다." : "");
    setLastLoadedAt(new Date());
  };

  const loadData = async ({ manual = false } = {}) => {
    if (!studentId) { setLoading(false); return; }
    // [08-07] 이미 차단된 링크면 자동 새로고침은 서버를 두드리지 않는다.
    //         학생이 [다시 확인]을 눌렀을 때만(manual) 다시 물어본다.
    if (withdrawnRef.current && !manual) return;
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
      withdrawnRef.current = false; // 다시 등록되면 여기로 들어와 잠금이 풀린다
      clearWithdrawnStrikes(studentId); // [08-10] 정상 응답이 오면 3진 아웃 카운트를 0으로 되돌린다
      setError(null);
      setLoadErrorCode(""); // [08-10]
    } catch (e) {
      console.error("Load error:", e);
      // [08-07→08-10] 그만둔(삭제·정지) 학생 차단 — 단, 한 번에 판정하지 않는다.
      // 서버가 잠깐 잘못 답하는 순간(빈 명단·순간 403/404)에 멀쩡한 학생의 백업을 지우면 되돌릴 수 없기 때문.
      // 10분 안에 같은 답이 3번 연속 왔을 때만 차단 + 백업 삭제를 실행한다.
      if (e && e.code === "withdrawn") {
        const strikes = addWithdrawnStrike(studentId);
        if (strikes >= WITHDRAWN_STRIKE_LIMIT) {
          try { localStorage.removeItem(getStudentBundleStorageKey(studentId)); } catch (err) { /* ignore */ }
          withdrawnRef.current = true;
          setWithdrawnName(String(e.studentName || ""));
          setError("withdrawn");
          return;
        }
        // 아직 판정 전(1·2번째): 차단하지 않고 아래로 내려가 폰 백업으로 화면을 지킨다.
        // 백업이 없으면 연결 오류 화면이 뜨고, 30초 자동 새로고침이 3번째 확인을 대신해 준다.
      }
      // [08-07] 차단 화면에서 [다시 확인]을 눌렀는데 인터넷이 안 되는 경우.
      //         "연결 오류" 화면으로 넘기지 말고 차단 화면을 그대로 둔다.
      if (withdrawnRef.current) return;
      setLoadErrorCode(makeLoadErrorCode(e)); // [08-10] 어떤 이유로 실패했는지 짧은 코드로 기억해 둔다
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

  // viewingVideo state가 바뀔 때마다 ref를 최신으로 맞춰준다.
  useEffect(() => { viewingVideoRef.current = viewingVideo; }, [viewingVideo]);

  // [3차 ①] 자동 새로고침 방식
  //  - 화면을 보고 있을 때: 예전처럼 30초마다
  //  - 화면을 껐거나 다른 앱으로 갔을 때: 아예 멈춤 (데이터·배터리 절약)
  //  - 화면을 다시 켠 순간: 즉시 한 번 불러오기
  //  - 단, 강의 영상을 보는 중이면 즉시 불러오기는 건너뛴다.
  //    (영상 보다가 잠깐 나갔다 온 경우 화면을 다시 그리면 영상이 튈 수 있어서)
  //    이때도 30초 타이머는 다시 돌기 때문에 최대 30초 안에 최신이 된다.
  useEffect(() => {
    // 학생 id가 없는 경우(링크 복구 첫 화면)에도 loadData를 한 번은 불러야 한다.
    // loadData 안에서 로딩 표시를 꺼주기 때문에, 여기서 그냥 return 하면 화면이 계속 "불러오는 중"에 멈춘다.
    if (!studentId) { loadData(); return; }

    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const start = () => { stop(); timer = setInterval(() => loadData(), 30000); };

    const onVisRefresh = () => {
      if (document.hidden) {
        stop();
      } else {
        if (!viewingVideoRef.current) loadData();
        start();
      }
    };

    loadData();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisRefresh);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisRefresh); };
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
      // [마스터] 부팅 직후 도는 재전송. 원장 폰에 남아 있던 대기 기록이
      // 마스터 홈이 뜨기도 전에 학생 기록으로 나가는 것을 막는다.
      if (IS_MASTER_MODE) return;
      // [08-07] 차단된 링크에서는 남은 기록을 더 보내지 않는다(서버를 계속 두드리지 않게).
      if (withdrawnRef.current) return;
      // [3차 ④] 문지기. 인터넷 복귀와 화면 복귀가 거의 동시에 오면 flush가 두 번 겹칠 수 있고,
      // 그러면 같은 기록이 두 번 저장된다. 이미 돌고 있으면 그냥 돌아간다.
      // finally에서 반드시 풀어줘야 한다. 안 그러면 한 번 돌고 영영 안 돈다.
      if (flushingRef.current) return;
      flushingRef.current = true;
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
      finally { flushingRef.current = false; }
    };

    // [3차 ④] 예전에는 앱을 켤 때 딱 한 번만 다시 보냈다.
    // 인터넷이 돌아왔을 때와 화면을 다시 켰을 때도 다시 보내게 한다.
    // 화면에 적힌 "인터넷 연결 후 자동 재전송됩니다"가 이제 사실이 된다.
    flush();
    const onOnline = () => { flush(); };
    const onVisFlush = () => { if (!document.hidden) flush(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisFlush);
    const pendingTimer = setInterval(() => setPendingVideoCount(getPendingVideoWatch().length), 5000);
    return () => {
      clearInterval(pendingTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisFlush);
    };
  }, []);

  // [마스터] 열쇠는 있고 학생 id는 없음 → 원장 전용 홈. 학생 데이터 로딩은 이미 건너뛴 상태.
  if (IS_MASTER_MODE && !studentId) {
    return <MasterHome mk={MASTER_MK} />;
  }

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
    return <StudentLinkRecover apiBase={STUDENT_SYNC_API_URL} />;
  }

  // [08-07] 그만둔(삭제·정지) 학생 — 잘못된 링크가 아니라 "지금은 멈춰 있다"고 알리고 재등록을 안내한다.
  if (error === "withdrawn") {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 340, background: "#fff", borderRadius: 18, padding: "36px 24px", boxShadow: "0 8px 30px rgba(15,23,42,.08)" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🌱</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e", marginBottom: 10, lineHeight: 1.5 }}>
            {withdrawnName ? `${withdrawnName} 학생, ` : ""}지금은 수업이 멈춰 있어요
          </div>
          <div style={{ fontSize: 14, color: "#5a6076", lineHeight: 1.75 }}>
            다시 등록하면 <b style={{ color: "#1C66A5" }}>바로 이어서</b> 쓸 수 있어요.<br />
            그동안 공부한 기록은 그대로 남아 있습니다.
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", background: "#fff5f5", border: "1px solid #f7c9cd", borderRadius: 10, fontSize: 12.5, color: "#b03a2e", fontWeight: 700, lineHeight: 1.65 }}>
            다만 <b>새해가 되면 기록이 다 사라집니다</b>
          </div>
          <div style={{ marginTop: 12, padding: "12px 14px", background: "#eef2ff", borderRadius: 12, fontSize: 13, color: "#3552d4", fontWeight: 700, lineHeight: 1.6 }}>
            다시 시작하고 싶으면<br />원장님께 연락해 주세요
          </div>
          {/* [08-07] 다시 등록한 뒤 앱을 껐다 켜지 않아도 되게. 자동 새로고침은 멈춰 있으므로 이 단추가 유일한 재확인 통로다. */}
          <button onClick={() => loadData({ manual: true })} disabled={refreshing}
            style={{ width: "100%", marginTop: 16, padding: "12px 0", borderRadius: 10, border: "1px solid #dfe3ef", background: refreshing ? "#f2f4f9" : "#fff", color: refreshing ? "#a0a8c0" : "#5a6076", fontSize: 13.5, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: "inherit" }}>
            {refreshing ? "확인 중..." : "다시 확인"}
          </button>
          {/* [08-07] 진짜로 링크가 잘못된 경우도 이 화면으로 온다 — 한 줄로만 알린다. */}
          <div style={{ fontSize: 11.5, color: "#a0a8c0", marginTop: 14, lineHeight: 1.6 }}>링크가 잘못됐을 수도 있어요</div>
          <div style={{ fontSize: 11.5, color: "#a0a8c0", marginTop: 6 }}>마플영어</div>
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
          {/* [08-10] 학생이 이 코드만 알려줘도 원장이 원인을 바로 좁힐 수 있다 (E500=서버 오류, E-시간초과=20초 무응답, E-네트워크=인터넷 끊김 등) */}
          <div style={{ fontSize: 11.5, color: "#c3c9d8", marginTop: 16 }}>오류 코드: {loadErrorCode || "E-알수없음"}</div>
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

  // [3차 ②] 앱을 열었을 때 기본으로 보여줄 날짜.
  // 오늘 기록이 있으면 오늘, 없으면 예전처럼 가장 나중에 기록된 날짜.
  // 학생이 날짜 단추를 눌러 고른 것(selectedDate)이 언제나 먼저다.
  const todayStrForTab = getTodayStr();
  const defaultDate = allDates.includes(todayStrForTab) ? todayStrForTab : (allDates[0] || todayStrForTab);
  const activeDate = selectedDate || defaultDate;
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
    .map(a => `${fmtAttDay(a.dateObj)} ${fmtTime(a.time)}${a.isMakeup ? " (보충)" : a.isVacation ? " (방학)" : ""}`)
    .join(", ");
  const examDdays = buildStudentExamDdays(student, exams, 2);

  const F = "'Pretendard Variable', -apple-system, sans-serif";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", fontFamily: F }}>
      {/* [PWA] 홈 화면 설치 안내 배너 — 설치본/닫음/PC에선 자동 숨김 */}
      <PwaInstallBanner />
      {/* [마스터] 지금 남의 화면을 보고 있다는 표시 + 홈 복귀. 학생에게는 절대 안 뜬다(열쇠 없음). */}
      {IS_MASTER_MODE && (
        <div style={{ background: "#16213e", borderBottom: "1px solid #c9a227", padding: "9px 24px" }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#f0c419", flexShrink: 0 }}>👑 마스터</span>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {student.name}</span>
            <button onClick={() => { window.location.href = window.location.pathname + "?master=1"; }}
              style={{ marginLeft: "auto", flexShrink: 0, padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(240,196,25,0.5)", background: "rgba(240,196,25,0.14)", color: "#f0c419", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>마스터 홈</button>
          </div>
        </div>
      )}
      {/* [08-07] 원장은 그만둔 학생 화면도 볼 수 있게 통과시키되, 지금 보는 게 그만둔 학생임을 알린다. */}
      {IS_MASTER_MODE && masterWithdrawn && (
        <div style={{ background: "#fff5f5", borderBottom: "1px solid #f7c9cd", padding: "9px 24px" }}>
          <div style={{ maxWidth: MAX_W, margin: "0 auto", fontSize: 12.5, fontWeight: 700, color: "#b03a2e" }}>
            ⏸ 그만둔 학생입니다 — 학생 본인에게는 이 화면이 열리지 않습니다
          </div>
        </div>
      )}
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", padding: "20px 24px 24px", color: "#fff" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {/* 브랜드 로고 락업 */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 19, border: "2px solid rgba(255,255,255,0.6)", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: -0.5 }}>MP</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>마플영어</span>
          {/* [마스터] 원장이 학생 화면에서 출석 QR을 띄워 잘못 찍히는 일이 없도록 숨긴다. */}
          {IS_MASTER_MODE ? (
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>출석 QR 숨김</span>
          ) : !attToken ? (
            /* [4차] 열쇠값 없는 링크 — QR을 만들어도 데스크에서 안 읽힌다. 미리 안내로 바꾼다. */
            <span style={{ marginLeft: "auto", flexShrink: 0, whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, color: "rgba(255,214,120,0.95)" }}>QR 없음 — 선생님께 문의</span>
          ) : (
            <button onClick={() => setShowAttQr(true)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h3v3h-3v-3zm5 0h3v3h-3v-3zm-5 5h3v3h-3v-3zm5 0h3v3h-3v-3z"/></svg> 출석 QR
            </button>
          )}
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
        <StudentExamRangeCard student={student} items={examDdays} examRanges={examRanges} />

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

      {showAttQr && student && attToken && (
        <AttQrModal
          value={`maple-att:${student.id}:${attToken}`}
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

      {/* [PASS] 교재 완주 축하 오버레이 — 새 완주가 있을 때만 */}
      {passQueue.length > 0 && <BookPassCelebration books={passQueue} onClose={() => setPassQueue([])} />}

      {/* [푸시] 알림 켜기 배너 — 허용 전인 폰에만 보인다 */}
      {student && <PushEnableBanner student={student} />}

      {/* [설문] 진행 중 설문 — 선택지를 누르면 제출, 마감 전까지 변경 가능 */}
      {(() => {
        // [설문 기간] 시작 전·기간 종료 설문은 표시하지 않는다 (워커도 거르지만 캐시 번들 대비 이중 안전장치)
        const t = new Date(); const z = (n) => String(n).padStart(2, "0");
        const today = `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
        const list = surveys.filter((sv) => sv && !(sv.startDate && today < sv.startDate) && !(sv.endDate && today > sv.endDate));
        if (!list.length) return null;
        return (
          <div style={{ maxWidth: MAX_W, margin: "12px auto 0", padding: "0 16px", boxSizing: "border-box" }}>
            {list.map((sv) => (
              <StudentSurveyCard key={sv.id} survey={sv} myResponse={surveyResponses[sv.id]} student={student}
                onSubmitted={(svId, resp) => setSurveyResponses((prev) => ({ ...prev, [svId]: resp }))} />
            ))}
          </div>
        );
      })()}

      <div style={{ background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        {/* [수정 07-31] 탭이 최대 6개까지 늘어나면 폰에서 글자가 두 줄로 접혔다.
            폭을 똑같이 나누는 대신, 글자 폭만큼 차지하고 넘치면 옆으로 미는 방식으로 바꾼다. */}
        <style>{`.mplTabScroll::-webkit-scrollbar{display:none}`}</style>
        <div className="mplTabScroll" style={{
          maxWidth: MAX_W, margin: "0 auto", display: "flex",
          overflowX: "auto", WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
        {[
          { key: "tasks", label: "📋 숙제/과제" },
          { key: "cal", label: "일정" },
          ...(getStudentLevelForDday(student) === "high" ? [{ key: "mock", label: "✏️ 모의고사" }] : []),
          ...(VOCA_TAB_ENABLED ? [{ key: "voca", label: "📚 단어장" }] : []),
          ...(studentVideos.length > 0 ? [{ key: "videos", label: "🎬 강의 영상" }] : []),
          ...(hasVocabWrong ? [{ key: "vocabWrong", label: "📝 오답 단어" }] : []),
          ...((progressTree?.lanes || []).length ? [{ key: "progress", label: "🌳 진도" }] : []),
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: "1 0 auto", whiteSpace: "nowrap", padding: "14px 12px", border: "none", cursor: "pointer",
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
              <div style={{ fontSize: 16, fontWeight: 700, color: "#2A2A28", margin: "12px 0 6px" }}>
                {fmtDateKR(activeDate)}
                {isToday(activeDate) && <span style={{ fontSize: 12, color: "#1C66A5", marginLeft: 8, fontWeight: 600 }}>TODAY</span>}
              </div>
            )}
            {/* [추가 07-30] 학생은 체크할 수 없다. 눌러도 반응이 없어 고장으로 오해하던 것을 안내 한 줄로 막는다. */}
            {allDates.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: totalTasks > 0 ? "0 0 10px" : "0 0 16px", fontSize: 12, color: "#999", lineHeight: 1.5 }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>ℹ️</span>
                <span>체크와 통과 도장은 조교 선생님이 찍어줘요</span>
              </div>
            )}
            {/* [추가 07-31] 진행률은 이미 계산해 놓고 화면에 안 쓰고 있었다(재시 항목은 분모에서 제외됨). */}
            {allDates.length > 0 && totalTasks > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px" }}>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: "#e9ecf2", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct === 100 ? "#00b894" : "#1C66A5", transition: "width .3s" }} />
                </div>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: pct === 100 ? "#00b894" : "#666" }}>
                  {doneTasks}/{totalTasks}
                </span>
              </div>
            )}

            {/* 5단계 렌더링 (빈 단계는 StepSection 내부에서 "오늘 없음"으로 표시) */}
            {stepGroups.map((step, idx) => (
              <StepSection
                key={step.key}
                step={step}
                displayNum={idx + 1}
                stampDate={(() => { const q = String(activeDate || "").split("-"); return q.length === 3 ? `${Number(q[1])}/${Number(q[2])}` : ""; })()}
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
        {tab === "cal" && (
          <StudentCalendarTab student={student} makeups={makeups} customHolidays={customHolidays} exams={exams} attLog={attLog} attStatus={attStatus} />
        )}

        {tab === "mock" && (
          <MockExamTab studentId={studentId} />
        )}

        {VOCA_TAB_ENABLED && tab === "voca" && (() => {
          // ─── [단어 TEST] 마플보카 임베드 ───
          // 학생 링크의 id/t 를 그대로 넘겨 이름표(학생 식별)와 학원 서버 저장을 자동 연결한다.
          // books= 는 진도/영상 교재명에서 추정한 이 학생의 단어장 목록 (없으면 전체 표시).
          const sp = new URLSearchParams(window.location.search);
          const books = guessVocaBooks(progressTree, studentVideos);
          const q = new URLSearchParams();
          q.set("id", String(studentId || sp.get("id") || ""));
          if (sp.get("t")) q.set("t", sp.get("t"));
          if (student?.name) q.set("n", student.name);
          if (WORKER_ORIGIN) q.set("api", WORKER_ORIGIN);
          if (books.length) q.set("books", books.join(","));
          const src = `${VOCA_APP_URL}?${q.toString()}`;
          return (
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #eee" }}>
              <VocaFrame title="단어장" src={src} />
            </div>
          );
        })()}

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
        {tab === "progress" && (
          <StudentProgressTree student={student} todos={todos} progressTree={progressTree} />
        )}
        </div>
      </div>
    </div>
  );
}

// ─── StudentProgressTree: 진도 스킬트리 (원장앱 진도 맵과 동일 산출 규칙, 읽기 전용) ───
// 트리 정의/보정은 원장앱 ptree3에서 그대로 내려오고, 진도는 이 학생의 투두 기록에서 계산한다.
const extractTodoLinesForProgress = (row) => {
  const out = [];
  const push = (v) => String(v || "").split(/\r?\n/).forEach(l => { const t = l.trim(); if (t) out.push(t); });
  if (row && row.steps5) ["step1","step2","step3","step4","step5"].forEach(k => push(row.steps5[k]));
  else if (row) { push(row.homework); push(row.academy); }
  return out;
};
const computeTreeProgressForStudent = (sid, todos, tree) => {
  const result = { units: {}, recent: {} };
  if (!sid || !tree) return result;
  const prepared = (tree.lanes || []).flatMap(l => l.nodes || [])
    .map(n => ({ n, keys: String(n.alias || n.name || "").split(",").map(v => v.trim()).filter(Boolean) }));
  Object.keys(todos || {}).sort().forEach(dk => {
    const day = todos[dk] || {};
    const row = day[String(sid)] !== undefined ? day[String(sid)] : day[sid];
    if (!row) return;
    extractTodoLinesForProgress(row).forEach(line => {
      prepared.forEach(({ n, keys }) => {
        if (!keys.length || !keys.some(k => k && line.includes(k))) return;
        const set = result.units[n.id] || (result.units[n.id] = new Set());
        // 별칭 자체의 숫자(예: "그래머2")가 과번호로 집계되지 않게 별칭을 지운 뒤 숫자 추출
        let scan = line;
        keys.forEach(k => { if (k) scan = scan.split(k).join(" "); });
        (scan.match(/\d{1,3}/g) || []).forEach(v => { const num = +v; if (num >= 1 && num <= (n.total || 0)) set.add(num); });
        result.recent[n.id] = `${dk.slice(5).replace("-", "/")} · ${line.slice(0, 40)}`;
      });
    });
  });
  return result;
};
const effectiveTreeDone = (node, matched, ovr) => {
  if (ovr && ovr.forceDone) return node.total || 0;
  return Math.min(node.total || 0, (matched || 0) + (Number(ovr && ovr.baseDone) || 0));
};
// ─── [PASS] 교재 완주 축하 (2026-07-23) ───
// 진도 트리에서 100%가 된 교재(투두 자동 집계 + 원장 보정/완료 처리 포함)를 찾아,
// 폰에 기억해 둔 "이미 축하한 책"과 비교해 새로 완주한 책만 앱 진입 시 축하한다.
const computeCompletedBooks = (sid, todos, tree) => {
  if (!sid || !tree) return null;
  const prog = computeTreeProgressForStudent(sid, todos, tree);
  const ovrMap = (tree.ovr || {})[String(sid)] || (tree.ovr || {})[sid] || {};
  const out = [];
  (tree.lanes || []).forEach(l => (l.nodes || []).forEach(n => {
    const matched = prog.units[n.id] ? prog.units[n.id].size : 0;
    const done = effectiveTreeDone(n, matched, ovrMap[n.id] || null);
    if ((n.total || 0) > 0 && done >= (n.total || 0)) out.push({ id: String(n.id), name: String(n.name || "교재") });
  }));
  return out;
};
function BookPassCelebration({ books, onClose }) {
  const [idx, setIdx] = useState(0);
  const book = books[idx];
  const pieces = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.5,
    color: ["#ffd166", "#4aa3e8", "#E24B4A", "#7bd88f"][i % 4], dur: 1.5 + Math.random() * 1.2,
  })), [idx]);
  useEffect(() => {
    // 쾅 효과음 + 진동 (첫 진입이라 브라우저가 소리를 막으면 조용히 넘어간다 — 연출은 그대로)
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ac = new AC();
        if (ac.state === "suspended") ac.resume().catch(() => {});
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(150, ac.currentTime); o.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.16);
        g.gain.setValueAtTime(0.9, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.28);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.3);
      }
    } catch (e) { /* 무시 */ }
    try { if (navigator.vibrate) navigator.vibrate([20, 40, 90]); } catch (e) { /* 무시 */ }
  }, [idx]);
  if (!book) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,15,40,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <style>{`
        @keyframes mplPassSlam{0%{transform:scale(3.4) rotate(16deg);opacity:0}55%{transform:scale(.85) rotate(-9deg);opacity:1}75%{transform:scale(1.1) rotate(-11deg)}100%{transform:scale(1) rotate(-10deg)}}
        @keyframes mplConfetti{0%{transform:translateY(-30px) rotate(0);opacity:1}100%{transform:translateY(78vh) rotate(560deg);opacity:0}}
        @keyframes mplPassPop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
      `}</style>
      {pieces.map((pc, i) => (
        <span key={`${idx}_${i}`} style={{ position: "absolute", top: 0, left: `${pc.left}%`, width: 9, height: 14, background: pc.color, borderRadius: 2, animation: `mplConfetti ${pc.dur}s ease-in ${pc.delay}s both` }} />
      ))}
      <div key={book.id} style={{ textAlign: "center", animation: "mplPassPop .3s ease-out both" }}>
        <div style={{ color: "#ffd166", fontSize: 13, fontWeight: 900, letterSpacing: 4, marginBottom: 10 }}>BOOK CLEAR</div>
        <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, lineHeight: 1.35, wordBreak: "keep-all", marginBottom: 26 }}>{book.name}<br />완주!</div>
        <div style={{ width: 150, height: 150, margin: "0 auto 26px", borderRadius: "50%", border: "5px solid #E24B4A", background: "rgba(252,235,235,0.1)", color: "#ff6b6a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "mplPassSlam .45s cubic-bezier(.2,.9,.3,1.2) both" }}>
          <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: 4 }}>PASS</span>
          <span style={{ fontSize: 11, fontWeight: 800, marginTop: 4, letterSpacing: 1 }}>MAPLE ENGLISH</span>
        </div>
        <button onClick={() => { if (idx + 1 < books.length) setIdx(idx + 1); else onClose(); }}
          style={{ padding: "12px 36px", borderRadius: 999, border: "none", background: "#ffd166", color: "#1a1a2e", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>
          {idx + 1 < books.length ? `다음 (${idx + 1}/${books.length})` : "확인"}
        </button>
      </div>
    </div>
  );
}

function StudentProgressTree({ student, todos, progressTree }) {
  const G = { bg: "linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)", tile: "#1d2b4e", tileDim: "#172441", glow: "#4aa3e8", gold: "#ffd166", text: "#e9edff", dim: "#8fa3c8" };
  const sid = student?.id;
  const prog = useMemo(() => computeTreeProgressForStudent(sid, todos, progressTree), [sid, todos, progressTree]);
  const ovrMap = (progressTree?.ovr || {})[String(sid)] || (progressTree?.ovr || {})[sid] || {};
  const getOvr = (nid) => ovrMap[nid] || null;

  const nodeInfo = (node, idx, nodes) => {
    const matched = prog.units[node.id] ? prog.units[node.id].size : 0;
    const done = effectiveTreeDone(node, matched, getOvr(node.id));
    const total = node.total || 0;
    let st;
    if (total > 0 && done >= total) st = "done";
    else if (done > 0) st = "current";
    else {
      const prev = nodes[idx - 1];
      if (!prev) st = "next";
      else {
        const pm = prog.units[prev.id] ? prog.units[prev.id].size : 0;
        st = effectiveTreeDone(prev, pm, getOvr(prev.id)) >= (prev.total || 0) ? "next" : "locked";
      }
    }
    return { done, total, st, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  let sumDone = 0, sumTotal = 0, doneBooks = 0;
  (progressTree?.lanes || []).forEach(l => (l.nodes || []).forEach((n, i, arr) => {
    const info = nodeInfo(n, i, arr);
    sumDone += Math.min(info.done, info.total); sumTotal += info.total;
    if (info.st === "done") doneBooks += 1;
  }));
  const overall = sumTotal ? Math.round((sumDone / sumTotal) * 100) : 0;

  return (
    <div style={{ background: G.bg, borderRadius: 16, padding: "20px 16px", color: G.text, border: "1px solid #2a3a66" }}>
      <style>{`@keyframes mplTreePulse{0%{box-shadow:0 0 0 0 rgba(74,163,232,.5)}70%{box-shadow:0 0 0 12px rgba(74,163,232,0)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 900, fontSize: 16 }}>{String(student?.name || "").split("-")[0]}의 스킬트리</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: G.gold, border: `1px solid ${G.gold}66`, borderRadius: 8, padding: "2px 9px" }}>LV.{doneBooks} · 정복 {doneBooks}권</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, height: 9, borderRadius: 6, background: "#0a0f28", overflow: "hidden" }}>
          <div style={{ width: `${overall}%`, height: "100%", background: `linear-gradient(90deg,#1C66A5,#4aa3e8,${G.gold})`, transition: "width .4s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 900, color: G.glow }}>{overall}%</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {(progressTree?.lanes || []).map(lane => (
          <div key={lane.id}>
            <div style={{ fontWeight: 900, fontSize: 12, color: G.dim, letterSpacing: 2, marginBottom: 9 }}>{lane.name}</div>
            {/* [수정 07-31] 칸 사이 연결선을 없앴다. 줄바꿈되면 새 줄 맨 앞에도 선이 붙어
                아무것도 잇지 않는 선이 허공에 떴기 때문. 대신 columnGap으로 칸 사이를 띄운다. */}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 12, columnGap: 10 }}>
              {(lane.nodes || []).map((n, i) => {
                const info = nodeInfo(n, i, lane.nodes);
                return (
                  <div key={n.id} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{
                      width: 104, padding: "11px 8px", borderRadius: 13, textAlign: "center", position: "relative",
                      background: info.st === "locked" ? G.tileDim : G.tile,
                      border: `1.5px solid ${info.st === "done" ? G.gold : info.st === "current" ? (lane.color || G.glow) : info.st === "next" ? "#33477e" : "#22335f"}`,
                      boxShadow: info.st === "done" ? `0 0 14px ${G.gold}55` : info.st === "current" ? `0 0 16px ${(lane.color || G.glow)}66` : "none",
                      animation: info.st === "current" ? "mplTreePulse 2.2s infinite" : "none",
                      opacity: info.st === "locked" ? 0.5 : 1,
                    }}>
                      <div style={{ fontWeight: 900, fontSize: 11.5, color: info.st === "done" ? G.gold : G.text, lineHeight: 1.3, minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{n.name}</div>
                      {info.st === "done" && <div aria-hidden="true" style={{ position: "absolute", top: -9, right: -9, width: 36, height: 36, borderRadius: "50%", border: "2.5px solid #E24B4A", background: "#1a1a2e", color: "#ff6b6a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 900, transform: "rotate(-14deg)", letterSpacing: 0.5 }}>PASS</div>}
                      {info.st === "done" && <div style={{ fontSize: 10, fontWeight: 900, color: G.gold, marginTop: 4 }}>정복 완료</div>}
                      {info.st === "current" && (<>
                        <div style={{ height: 6, borderRadius: 4, background: "#0a0f28", marginTop: 6, overflow: "hidden" }}>
                          <div style={{ width: `${info.pct}%`, height: "100%", background: `linear-gradient(90deg, ${lane.color || "#1C66A5"}, #4aa3e8)`, transition: "width .4s" }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 900, color: G.glow, marginTop: 4 }}>{info.done}/{info.total} · {info.pct}%</div>
                      </>)}
                      {info.st === "next" && <div style={{ fontSize: 9.5, fontWeight: 900, color: "#7f97c6", marginTop: 4, letterSpacing: 1 }}>NEXT</div>}
                      {info.st === "locked" && <div style={{ fontSize: 9.5, fontWeight: 900, color: "#4e618f", marginTop: 4, letterSpacing: 1 }}>LOCKED</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: G.dim, fontWeight: 600 }}>진도는 학원 수업 기록으로 자동 계산돼요. 궁금한 건 선생님께!</div>
    </div>
  );
}

// ─── [08-04] 정답 한 덩어리 → 낱개 뜻 쪼개기 ───
// 정답 JSON의 뜻은 "[명] 1. 주소 2. 연설 [동] 1. 주소를 쓰다 2. 연설하다"처럼
// 여러 뜻이 한 문자열에 붙어 있다. 예전에는 쉼표로만 잘라서 "주소" 한 낱개를 못 알아봤고,
// 학생앱 오답 복습에서 맞게 써도 오답이 됐다. 채점 워커의 정답 분해와 같은 취지로
// 품사 딱지·뜻 번호·빗금·대괄호 이형태·괄호 부연까지 쪼갠다.
const VOCAB_POS_TAG_RE = /[\[(](?:명|동|형|부|전|접|대|감|조|관|수|자|타|복|숙어|구|명사|동사|형용사|부사)[\])]/g;
// "교육[훈련]시키다" → 교육시키다 / 훈련시키다 (대괄호는 바로 앞 낱말을 갈아 끼운다는 뜻)
function expandVocabBracketForms(s, depth = 0) {
  if (depth > 3) return [s];
  const m = /^(.*?)([^\s\[\]]+)\[([^\[\]]+)\](.*)$/.exec(s);
  if (!m) return [s];
  const [, head, prev, inner, tail] = m;
  return [
    ...expandVocabBracketForms(head + prev + tail, depth + 1),
    ...expandVocabBracketForms(head + inner + tail, depth + 1),
  ];
}
// "얻다(성취하다/달성하다)" → 얻다 / 성취하다 / 달성하다,  "(정)반대" → 반대 / 정반대
function expandVocabParenForms(s) {
  const out = new Set([s]);
  out.add(s.replace(/\([^()]*\)/g, " "));
  out.add(s.replace(/\(([0-9A-Za-z가-힣]{1,6})\)/g, "$1"));  // (정)반대 → 정반대 (한자 부연은 합치지 않음)
  (s.match(/\(([^()]*)\)/g) || []).forEach(g => {
    const inner = g.slice(1, -1);
    if (inner.includes("/")) inner.split("/").forEach(p => out.add(p));
    else if (/^\S{2,}$/.test(inner) && !/등|따위/.test(inner)) out.add(inner);
  });
  return [...out];
}
function splitVocabMeaningCandidates(raw = "") {
  const src = String(raw || "").trim();
  if (!src) return [];
  let t = src.replace(VOCAB_POS_TAG_RE, "|");                       // 품사 딱지를 칸막이로
  t = t.replace(/(^|[\s\]|)])\s*\d{1,2}\s*[.)]\s*/g, "$1|");        // "1." "2)" 뜻 번호를 칸막이로
  t = t.replace(/[\u2460-\u2469]/g, "|");                            // 원문자 ①②③ 도 칸막이로
  const pieces = [];
  let buf = "", depth = 0;
  for (const ch of t) {                                              // 괄호 안의 쉼표·빗금은 자르지 않는다
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "|" || ch === ";" || ch === "," || ch === "，" || ch === "/" || ch === "·" || ch === "・" || ch === "ㆍ")) { pieces.push(buf); buf = ""; continue; }
    buf += ch;
  }
  pieces.push(buf);
  const out = [], seen = new Set();
  const push = (v) => {
    let c = String(v || "").replace(/[\[\]]/g, "")
      .replace(/^[\-\u2013\u2014·,;.\s|]+/, "").replace(/[,;.\s|]+$/, "")
      .replace(/\s+/g, " ").trim();
    if (!c) return;
    // 쉼표로 미리 잘린 조각이면 괄호 짝이 안 맞는다 — 그때는 괄호 글자를 떼어낸다
    const opens = (c.match(/\(/g) || []).length, closes = (c.match(/\)/g) || []).length;
    if (opens !== closes) c = c.replace(/[()]/g, "").trim();
    if (!c) return;
    if (!/[0-9A-Za-z가-힣ㄱ-ㅎ\u4e00-\u9fff]/.test(c)) return;        // 부호만 남은 것 버리기
    if (/^(등을|등의|등에|등|따위)$/.test(c)) return;
    const k = c.replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(c);
  };
  pieces.forEach(p => expandVocabBracketForms(p).forEach(b => expandVocabParenForms(b).forEach(push)));
  return out.slice(0, 60);
}

// 저장된 정답들 + 낱개로 쪼갠 뜻을 전부 모아 "이 중 하나면 정답" 목록으로 만든다.
function buildVocabAcceptList(correctAnswers = []) {
  const out = [], seen = new Set();
  const add = (v) => {
    const c = String(v || "").trim();
    if (!c) return;
    const k = c.replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(c);
  };
  (Array.isArray(correctAnswers) ? correctAnswers : []).forEach(a => {
    add(a);
    splitVocabMeaningCandidates(a).forEach(add);
  });
  return out;
}
// 화면에 보여줄 정답 — 괄호 안 부연이 붙은 형태는 빼고 낱개 뜻만 깔끔하게
function buildVocabAnswerDisplay(correctAnswers = []) {
  const all = [], seen = new Set();
  (Array.isArray(correctAnswers) ? correctAnswers : []).forEach(a => {
    splitVocabMeaningCandidates(a).forEach(c => {
      const k = c.replace(/\s+/g, "").toLowerCase();
      if (seen.has(k)) return;
      seen.add(k); all.push(c);
    });
  });
  const clean = all.filter(c => !/[()]/.test(c));
  const list = (clean.length ? clean : all).slice(0, 12);
  return list.length ? list.join(", ") : (Array.isArray(correctAnswers) ? correctAnswers.join(", ") : "");
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
  // [3차 ③] 테스트 도중에 목록으로 나가려 할 때 띄우는 확인 카드
  const [askLeave, setAskLeave] = useState(false);

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
  // [08-04] 띄어쓰기뿐 아니라 물결(~)·문장부호·대소문자도 무시한다.
  // 예전에는 "~에 싫증나다"를 "에 싫증나다"로 저장해 두면 안 맞았다.
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s~·ㆍ.,;:'"\u2018\u2019\u201c\u201d\-]/g, "");

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
    setAskLeave(false); // [3차 ③] 새로 시작하거나 목록으로 돌아갈 때 확인 카드는 항상 닫아둔다
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
  // [08-04] 정답이 "[명] 1. 주소 2. 연설 [동] …"처럼 한 덩어리로 저장돼 있어도
  // 낱개 뜻("주소")으로 쪼개서 비교한다. 예전 기록도 이 자리에서 함께 살아난다.
  const acceptAnswers = buildVocabAcceptList(correctAnswers);
  const answerDisplay = buildVocabAnswerDisplay(correctAnswers);
  const currentAnswer = answers[idx] || {};

  const check = () => {
    if (!current) return;
    const ans = norm(input);
    const ok = acceptAnswers.some((c) => norm(c) === ans);
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
        {/* [3차 ③] 아직 아무것도 안 풀었으면 그냥 나가고, 하나라도 풀었으면 확인 카드를 띄운다 */}
        <button onClick={() => { if (idx === 0 && !revealed) backToList(); else setAskLeave(true); }} style={{ border: "none", background: "transparent", color: "#777", fontSize: 14, cursor: "pointer" }}>← 목록</button>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#777", fontWeight: 700 }}>{idx + 1} / {words.length}</div>
      </div>
      {askLeave && (
        <div style={{ background: "#fff", border: "1.5px solid #fecaca", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#c0392b", marginBottom: 4 }}>지금 나가면 푼 게 사라져요</div>
          <div style={{ fontSize: 13, color: "#777", marginBottom: 12 }}>{idx + 1}번째까지 풀었어요. 그래도 나갈까요?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setAskLeave(false)} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "#1C66A5", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>계속 풀기</button>
            <button onClick={() => { setAskLeave(false); backToList(); }} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", color: "#c0392b", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>나가기</button>
          </div>
        </div>
      )}
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
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.7 }}>정답: <b>{answerDisplay}</b></div>
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
function HomeworkItem({ item, stampDate, isLast, isCheckedFn, isFailedFn, getFailReasonFn, studentVideos, viewingVideo, toggleVideo }) {
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
        {/* [도장] 조교가 원장앱에서 체크 완료한 항목 = "통과" 도장 마크 (학생은 직접 체크 불가 — 도장은 조교 서명) */}
        {done && (
          <span aria-hidden="true" style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: "50%",
            border: "2.5px solid #E24B4A", background: "rgba(252,235,235,0.55)",
            color: "#E24B4A", transform: "rotate(-10deg)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>통과</span>
            {stampDate ? <span style={{ fontSize: 8, fontWeight: 700, marginTop: 0.5 }}>{stampDate}</span> : null}
          </span>
        )}
        {/* [도장] 미완료(재시) — 애니메이션 없이 뱃지만 (확정안) */}
        {fail && (
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#A32D2D", background: "#F7C1C1", padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>재시</span>
        )}
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
function StepSection({ step, displayNum, stampDate, isChecked, isFailed, getFailReason, studentVideos = [], viewingVideo, toggleVideo }) {
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
            stampDate={stampDate}
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
