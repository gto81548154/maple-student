import { useEffect, useRef, useState } from "react";
import { APP_BUILD_ID, clearCachesAndReload } from "../core/buildId.jsx";

// [120차수] 앱 새 판(서비스워커) 알아채기와 [업데이트] 단추 — App.jsx에서 그대로 옮김.
// [142차수] 서비스워커(sw.js)는 푸시용이라 배포 때 거의 안 바뀌어 띠가 안 떴다 → /version.json(빌드 번호)도 같이 본다.
//   켜질 때·화면이 다시 보일 때·30분마다 읽어 내 빌드 번호(__BUILD_ID__)와 다르면 "found"(via: "version").
//   그렇게 찾은 새 판은 [지금 적용]에서 캐시를 전부 비우고 새로고침한다(서비스워커 길은 전과 같다).
const VERSION_CHECK_MS = 30 * 60 * 1000;
export function useAppUpdate(D) {
  const { mockBusyRef, recordBusyRef, viewingVideoRef, vocaHwBusyRef, vocabTestBusyRef } = D;
  // [98차수→101차수] 앱 새 판(서비스워커) 감지.
  //   상태: "" 없음 / "found" 새 판 발견(대기 중) / "applying" 적용 중 / "swapped" 이미 교체됨(새로고침만 하면 됨) / "failed" 적용 실패
  //   98차수는 새 워커를 보자마자 SKIP_WAITING을 보내고 "준비 완료"라고 띄웠다. 이제는
  //     · 발견만 하고 스스로 바꾸지 않는다(학생이 [업데이트]를 눌러야 적용) · 자동 새로고침 없음
  //     · 설치 중(installing)·설치 발견(updatefound)·상태 바뀜(statechange)까지 지켜본다
  //     · 첫 설치(controller 없음→생김)는 새 판이 아니다. 그 뒤 또 바뀌면 그때가 새 판이다(hadController를 고정하지 않는다)
  //     · 서비스워커 등록이 나중에(푸시 준비 뒤) 생겨도 따라간다(ready로 기다림, 15초 상한)
  //   참고: 지금 sw.js는 설치되자마자 스스로 교체되는 구조(skipWaiting·claim)라 실제로는 "swapped"가 대부분이고,
  //         "found"·"applying"은 sw.js가 나중에 기다리는 구조로 바뀔 때를 위한 것이다.
  const [swUpdate, setSwUpdate] = useState({ state: "", msg: "" });
  const swUpdateRef = useRef({ state: "", msg: "" });
  const setSw = (next) => { swUpdateRef.current = next; setSwUpdate(next); };
  // [142차수] 빌드 번호 비교 — 오프라인·실패는 조용히 무시. 이미 다른 상태(found/applying/…)면 건드리지 않는다.
  useEffect(() => {
    if (!APP_BUILD_ID) return;
    let dead = false;
    let busy = false;
    const check = async () => {
      if (dead || busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const remote = j && typeof j.build === "string" ? j.build : "";
        if (!dead && remote && remote !== APP_BUILD_ID && swUpdateRef.current.state === "") setSw({ state: "found", msg: "", via: "version" });
      } catch (e) { /* 오프라인·서버 오류 — 조용히 */ }
      finally { busy = false; }
    };
    const onVis = () => { if (!document.hidden) check(); };
    check();
    document.addEventListener("visibilitychange", onVis);
    const timer = setInterval(check, VERSION_CHECK_MS);
    return () => { dead = true; document.removeEventListener("visibilitychange", onVis); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let dead = false;
    let hadController = !!navigator.serviceWorker.controller;
    let reg = null;
    const tracked = new Set();
    const cleanups = [];
    const timers = [];
    const set = (state, msg = "") => { if (!dead) setSw({ state, msg }); };

    const trackWorker = (w) => {
      if (!w || tracked.has(w)) return;
      tracked.add(w);
      const onState = () => {
        if (dead) return;
        // installed + 이미 controller가 있다 = 새 판이 대기 중(자동으로 바꾸지 않는다). 첫 설치면 controller가 없어 안 띄운다.
        if (w.state === "installed" && navigator.serviceWorker.controller && swUpdateRef.current.state !== "applying") set("found");
        // 적용 중이었는데 새 워커가 버려졌다(redundant) = 실패
        if (w.state === "redundant" && swUpdateRef.current.state === "applying") set("failed");
      };
      w.addEventListener("statechange", onState);
      cleanups.push(() => w.removeEventListener("statechange", onState));
      onState(); // 리스너를 단 뒤 지금 상태도 한 번 본다(전환 순간을 놓치지 않게)
    };
    const attachReg = (r) => {
      if (!r || dead || reg === r) return;
      reg = r;
      if (r.waiting && navigator.serviceWorker.controller) set("found");
      if (r.installing) trackWorker(r.installing);
      const onFound = () => trackWorker(r.installing);
      r.addEventListener("updatefound", onFound);
      cleanups.push(() => r.removeEventListener("updatefound", onFound));
    };
    const poke = async () => {
      try {
        let r = await navigator.serviceWorker.getRegistration();
        if (!r) {
          // 등록은 학생 자료가 뜬 뒤(푸시 준비)에 생긴다 — 생길 때까지 기다리되 15초면 그만둔다(중복 등록은 안 한다)
          r = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((res) => { timers.push(setTimeout(() => res(null), 15000)); }),
          ]);
        }
        if (!r || dead) return;
        attachReg(r);
        try { await r.update(); } catch (e) { /* 오프라인이면 그냥 넘어간다 */ }
        if (dead) return;
        if (reg.waiting && navigator.serviceWorker.controller && swUpdateRef.current.state === "") set("found");
      } catch (e) { /* ignore */ }
    };
    const onVis = () => { if (!document.hidden) poke(); };
    const onCtrl = () => {
      if (dead) return;
      if (!hadController) { hadController = true; return; } // 첫 설치(claim) — 새 판 아님. 다음 교체부터 새 판이다
      if (!navigator.serviceWorker.controller) return;        // controller가 없어지는 현상은 새 판이 아니다
      if (swUpdateRef.current.state === "applying") return;   // 학생이 눌러서 바꾸는 중 — 아래 applyAppUpdate가 처리한다
      set("swapped");                                         // 외부 요인으로 바뀜 — 안내만, 자동 새로고침 없음
    };
    poke();
    document.addEventListener("visibilitychange", onVis);
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrl);
      cleanups.forEach((f) => { try { f(); } catch (e) {} });
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);
  // [101차수] 학생이 [업데이트]를 눌렀을 때만 적용한다. 진행 중 작업이 있으면 안내만 하고 멈춘다.
  const appUpdateBusyMsg = () => {
    // [145차수] 녹음 중에도 새 판을 적용하지 않는다(녹음이 날아가지 않게)
    if (vocabTestBusyRef.current || vocaHwBusyRef.current || mockBusyRef.current || viewingVideoRef.current || (recordBusyRef && recordBusyRef.current)) {
      return "진행 중인 시험·영상·녹음을 마친 뒤 업데이트해 주세요.";
    }
    return "";
  };
  const applyAppUpdate = async () => {
    const cur = swUpdateRef.current.state;
    const busyMsg = appUpdateBusyMsg();
    if (busyMsg) { setSw({ state: cur, msg: busyMsg }); return; }
    if (cur === "applying") return;
    // [142차수] 빌드 번호 차이로 찾은 새 판(또는 서비스워커가 아예 없는 폰) = 캐시를 비우고 새로고침
    if ((cur === "found" && swUpdateRef.current.via === "version") || !("serviceWorker" in navigator)) {
      setSw({ state: "applying", msg: "" });
      await clearCachesAndReload();
      return;
    }
    // 이미 새 controller로 바뀐 상태면 메시지를 다시 보낼 필요 없이 새로고침만(학생이 눌렀으니 이건 사용자 요청의 후속 동작).
    if (cur === "swapped") { try { window.location.reload(); } catch (e) {} return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      // [102차수] 등록을 기다리는 사이에도 시험·영상이 시작됐을 수 있다 — 기다린 뒤 한 번 더 본다. (1차 검토 지적 4번)
      const busyAfterWait = appUpdateBusyMsg();
      if (busyAfterWait) { setSw({ state: cur, msg: busyAfterWait }); return; }
      const waiting = reg && reg.waiting;
      if (!waiting) {
        // 대기 중인 워커가 없다 = 이미 바뀌었거나(→ 새로고침) 아직 안 왔다(→ 실패 안내)
        if (navigator.serviceWorker.controller && cur === "found") { try { window.location.reload(); } catch (e) {} return; }
        setSw({ state: "failed", msg: "" }); return;
      }
      setSw({ state: "applying", msg: "" });
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        navigator.serviceWorker.removeEventListener("controllerchange", onSwapped);
        clearTimeout(timer);
      };
      const onSwapped = () => {
        // 대상 워커가 활성화되고 controller가 실제로 바뀐 것을 확인한 뒤에만 새로고침(학생이 누른 요청의 후속 동작)
        if (!navigator.serviceWorker.controller) return;
        finish();
        // [102차수] 교체를 기다리는 동안(최대 10초) 학생이 시험·영상을 시작했을 수 있다 — 새로고침 직전에 다시 본다.
        //   바쁘면 새로고침하지 않고 "이미 바뀜(swapped)"으로 안내만 한다. 일을 마친 뒤 [업데이트]를 다시 누르면 그때 새로고침된다.
        //   (새 워커는 이미 활성화돼 있으므로 다시 메시지를 보낼 필요가 없다 → swapped 경로가 맞다) (1차 검토 지적 4번)
        const busyNow = appUpdateBusyMsg();
        if (busyNow) { setSw({ state: "swapped", msg: "🆕 새 버전이 준비됐어요. 진행 중인 시험·영상을 마친 뒤 [업데이트]를 눌러 주세요." }); return; }
        try { window.location.reload(); } catch (e) {}
      };
      // 리스너를 먼저 걸고 → 그 다음 메시지를 보낸다(순서가 바뀌면 교체 순간을 놓칠 수 있다)
      navigator.serviceWorker.addEventListener("controllerchange", onSwapped);
      const timer = setTimeout(() => {
        // 10초 안에 안 바뀌면(sw.js가 메시지를 모르거나 실패) 안내하고 단추를 정상으로 돌린다 — 다시 시도·반복 새로고침은 안 한다
        finish();
        setSw({ state: "failed", msg: "" });
      }, 10000);
      try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch (e) { finish(); setSw({ state: "failed", msg: "" }); }
    } catch (e) {
      setSw({ state: "failed", msg: "" });
    }
  };
  // [142차수] 더보기 > 앱 설정 [앱 새로고침] — 캐시 비우고 새로고침. 시험·영상 중이면 안내만.
  const reloadAppHard = async () => {
    const busyMsg = appUpdateBusyMsg();
    if (busyMsg) { setSw({ state: swUpdateRef.current.state, msg: busyMsg, via: swUpdateRef.current.via }); return; }
    await clearCachesAndReload();
  };
  return { applyAppUpdate, reloadAppHard, swUpdate };
}
