import { useEffect, useState } from "react";
import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { IS_IOS_UA, IS_KAKAO_UA, IS_MOBILE_UA, PWA_INSTALLED_FLAG, PWA_INSTALL_EVT, PWA_INSTALL_LISTENERS, isPwaStandalone, markPwaInstalled, openOutsideKakao, pushSupport, registerMaplSw, subscribeMaplPush } from "../core/pwa.jsx";
import { UI, TAP } from "../theme/tokens.jsx";

// 설정 화면 공용 모양 — 흰 카드 + 제목 + 설명 + 상태 딱지
export const SETTING_CARD = { background: "#fff", border: "1px solid #E4E8EF", borderRadius: 14, padding: "14px 16px", marginBottom: 12 };
export const SETTING_TITLE = { fontSize: 15, fontWeight: 800, color: "#232B3B" };
export const SETTING_DESC = { fontSize: 12.5, color: "#647084", marginTop: 4, lineHeight: 1.55 };
export function SettingStatus({ tone = "ok", children }) {
  const c = tone === "ok" ? { bg: "#E8F6EE", fg: "#1B8A5A" } : tone === "warn" ? { bg: "#FDECEA", fg: "#B03A2E" } : { bg: "#EEF1F5", fg: "#556072" };
  return <span style={{ display: "inline-block", marginTop: 9, fontSize: 12, fontWeight: 800, padding: "4px 9px", borderRadius: 7, background: c.bg, color: c.fg }}>{children}</span>;
}
export const SETTING_BTN = { marginTop: 10, display: "inline-block", padding: "10px 16px", borderRadius: 9, border: "none", background: "#2466D9", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 44 };
// [108차수 · 검토 3번] 알림 "등록"(서버에 구독 저장) 결과 — 브라우저 권한과는 다른 상태다. App의 자동 갱신과 설정 카드가 같이 쓴다.
//   state: "" 모름 / "ok" 등록됨 / "fail" 등록 실패(권한은 허용됨). 카드가 열려 있으면 바로 다시 그린다.
const PUSH_SUB = { state: "", msg: "" };
const PUSH_SUB_LISTENERS = new Set();
export const setPushSubState = (state, msg = "") => { PUSH_SUB.state = state; PUSH_SUB.msg = msg; PUSH_SUB_LISTENERS.forEach((f) => { try { f(); } catch (e) {} }); };
// 알림(푸시) 설정 카드 — 폰의 실제 권한 상태를 그대로 보여준다. 가짜 스위치 없음.
//   권한(브라우저)과 등록(서버 저장)을 따로 본다: 권한은 허용됐는데 등록이 실패하면 "권한 허용됨 · 알림 등록 실패" + [다시 연결](권한을 또 묻지 않고 등록만 다시).
export function PushSettingCard({ student }) {
  const [perm, setPerm] = useState(() => { try { return ("Notification" in window) ? Notification.permission : "unsupported"; } catch (e) { return "unsupported"; } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sub, setSub] = useState({ ...PUSH_SUB });
  useEffect(() => {
    const f = () => setSub({ ...PUSH_SUB });
    PUSH_SUB_LISTENERS.add(f); f();
    return () => { PUSH_SUB_LISTENERS.delete(f); };
  }, []);
  const support = pushSupport();
  // 등록만 다시(권한은 이미 허용된 상태에서 부른다)
  const subscribeOnly = async () => {
    await registerMaplSw();
    await subscribeMaplPush(student);
  };
  const enable = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      await registerMaplSw();
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") { setMsg(p === "denied" ? "알림이 차단됐어요. 폰 설정에서 허용한 뒤 다시 열어 주세요." : "알림을 허용하지 않았어요."); setBusy(false); return; }
      try { await subscribeMaplPush(student); setPushSubState("ok", ""); setMsg("알림이 켜졌어요! 새 설문·공지가 오면 알려드릴게요."); }
      catch (e) { setPushSubState("fail", String(e?.message || e)); setMsg(""); }
    } catch (e) { setMsg("알림 설정에 실패했어요: " + (e?.message || e)); }
    setBusy(false);
  };
  const retry = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    try { await subscribeOnly(); setPushSubState("ok", ""); setMsg("알림이 연결됐어요!"); }
    catch (e) { setPushSubState("fail", String(e?.message || e)); }
    setBusy(false);
  };
  let body;
  if (IS_STAFF_VIEW) {
    body = <SettingStatus tone="dim">선생님·원장 화면에서는 학생 알림을 바꾸지 않아요</SettingStatus>;
  } else if (support === "unsupported") {
    body = (
      <>
        <SettingStatus tone="dim">이 브라우저에서는 알림을 지원하지 않아요</SettingStatus>
        {IS_IOS_UA && !isPwaStandalone() && <div style={{ ...SETTING_DESC, marginTop: 8 }}>아이폰은 먼저 홈 화면에 추가한 뒤, 그 아이콘으로 열면 알림을 켤 수 있어요.</div>}
      </>
    );
  } else if (perm === "granted" && sub.state === "fail") {
    body = (
      <>
        <SettingStatus tone="warn">권한 허용됨 · 알림 등록 실패</SettingStatus>
        <div style={{ ...SETTING_DESC, marginTop: 8, color: UI.warnFg, fontWeight: 700 }}>서버에 알림 주소를 저장하지 못했어요{sub.msg ? `: ${sub.msg}` : ""}. 인터넷을 확인하고 다시 연결해 주세요.</div>
        <div><button type="button" onClick={retry} disabled={busy} style={{ minHeight: TAP, ...SETTING_BTN, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>{busy ? "연결 중..." : "다시 연결"}</button></div>
      </>
    );
  } else if (perm === "granted") {
    body = <SettingStatus tone="ok">켜져 있어요</SettingStatus>;
  } else if (perm === "denied") {
    body = (
      <>
        <SettingStatus tone="warn">차단됨</SettingStatus>
        <div style={{ ...SETTING_DESC, marginTop: 8 }}>앱에서는 되돌릴 수 없어요. 폰 설정 → 브라우저(또는 이 앱) → 알림에서 허용한 뒤 다시 열어 주세요.</div>
      </>
    );
  } else {
    body = (
      <>
        <SettingStatus tone="dim">아직 안 켬</SettingStatus>
        <div>
          <button type="button" onClick={enable} disabled={busy} style={{ minHeight: TAP, ...SETTING_BTN, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>{busy ? "설정 중..." : "알림 켜기"}</button>
        </div>
      </>
    );
  }
  return (
    <div style={SETTING_CARD}>
      <div style={SETTING_TITLE}>🔔 새 설문·공지 알림</div>
      <div style={SETTING_DESC}>중요한 안내가 오면 폰으로 바로 알려드려요</div>
      {body}
      {msg && <div style={{ ...SETTING_DESC, marginTop: 8, color: (perm === "granted" && sub.state !== "fail") ? "#1B8A5A" : "#B03A2E", fontWeight: 700 }}>{msg}</div>}
    </div>
  );
}
// 홈 화면 추가(설치) 안내 카드 — 이미 추가됨·카카오톡·아이폰·안드로이드·PC를 실제 상태로 구분한다
export function PwaInstallCard() {
  const [installEvt, setInstallEvt] = useState(PWA_INSTALL_EVT);
  const [installed, setInstalled] = useState(PWA_INSTALLED_FLAG);
  useEffect(() => {
    const f = () => { setInstallEvt(PWA_INSTALL_EVT); setInstalled(PWA_INSTALLED_FLAG); };
    PWA_INSTALL_LISTENERS.add(f); f();
    return () => { PWA_INSTALL_LISTENERS.delete(f); };
  }, []);
  let body;
  if (installed || isPwaStandalone()) {
    body = <SettingStatus tone="ok">이미 추가됨 — 지금 앱처럼 열려 있어요</SettingStatus>;
  } else if (IS_KAKAO_UA) {
    body = (
      <>
        <SettingStatus tone="warn">카카오톡 안에서는 추가가 안 돼요</SettingStatus>
        <div><button type="button" onClick={openOutsideKakao} style={SETTING_BTN}>{IS_IOS_UA ? "Safari로 열기" : "브라우저로 열기"}</button></div>
      </>
    );
  } else if (!IS_MOBILE_UA) {
    body = <SettingStatus tone="dim">폰에서 열면 홈 화면에 추가할 수 있어요</SettingStatus>;
  } else if (IS_IOS_UA) {
    body = <div style={{ ...SETTING_DESC, marginTop: 8 }}>Safari 아래쪽 <b>공유 버튼(네모+화살표)</b> → <b>홈 화면에 추가</b>를 누르면 돼요.</div>;
  } else if (installEvt) {
    body = (
      <div>
        <button type="button" style={SETTING_BTN}
          onClick={async () => { try { installEvt.prompt(); const r = await installEvt.userChoice; if (r && r.outcome === "accepted") { markPwaInstalled(); setInstalled(true); } } catch (e) {} }}>설치</button>
      </div>
    );
  } else {
    body = <div style={{ ...SETTING_DESC, marginTop: 8 }}>브라우저 메뉴(⋮) → <b>홈 화면에 추가</b>를 누르면 돼요.</div>;
  }
  return (
    <div style={SETTING_CARD}>
      <div style={SETTING_TITLE}>📲 홈 화면에 추가</div>
      <div style={SETTING_DESC}>앱처럼 한 번에 열려요</div>
      {body}
    </div>
  );
}
