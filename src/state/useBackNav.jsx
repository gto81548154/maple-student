import { useEffect, useRef } from "react";
import { pushRoute, readHistIdx, replaceRoute, routeFromHash } from "../core/route.jsx";

// [133차수] 폰 뒤로가기 훅 — 학생 화면·선생님 홈·마스터 홈이 같이 쓴다.
//   enabled    : false 면 아무것도 안 한다(주소도 안 건드림)
//   ids        : 주소에 쓸 수 있는 화면 이름들
//   currentRef : 지금 화면 이름(ref — 늘 최신)
//   canLeaveRef: (target) => true/false. 떠나도 되는지 묻는 함수(오답 TEST 도중의 확인창 등). 거절하면 방금 움직인 만큼 되돌린다(원장앱 231차수 방식).
//   applyRef   : (target, state) => 화면을 그 이름으로 바꾸는 함수
//   sameRef    : (state) => 같은 화면 칸으로 돌아왔을 때 할 일(예: 열어 둔 강의 닫기). 없으면 아무것도 안 함.
// 돌려주는 go(pg, extra) 는 "주소 한 칸 쌓기"만, stay(pg, extra) 는 "지금 칸을 바꿔 쓰기"만 한다 — 화면을 실제로 바꾸는 setState 는 부르는 쪽이 한다.
export function useBackNav({ enabled = true, ids, currentRef, canLeaveRef, applyRef, sameRef }) {
  const histIdxRef = useRef(0);
  useEffect(() => { histIdxRef.current = readHistIdx(); }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    let busy = false;
    const onPop = (e) => {
      const st = (e && e.state) || {};
      const target = (st.pg && ids.includes(st.pg)) ? st.pg : routeFromHash(ids, window.location.hash);
      if (!target) { replaceRoute(currentRef.current); return; }   // 모르는 주소면 지금 화면 이름으로 고쳐 쓴다
      if (target === currentRef.current) {
        histIdxRef.current = readHistIdx();
        if (sameRef && typeof sameRef.current === "function") { try { sameRef.current(st); } catch (err) {} }
        return;
      }
      if (busy) return;
      let ok = true;
      if (canLeaveRef && typeof canLeaveRef.current === "function") {
        busy = true;
        try { ok = !!canLeaveRef.current(target); } catch (err) { ok = true; }
        busy = false;
      }
      if (!ok) {
        // 거절 → 떠나기 전 칸(histIdxRef)과 지금 서 있는 칸의 차이만큼 되돌아간다(이 되돌림은 같은 화면이라 아무 일도 안 함).
        const delta = readHistIdx() - histIdxRef.current;
        if (delta) { try { window.history.go(-delta); } catch (err) {} }
        else { pushRoute(currentRef.current); histIdxRef.current = readHistIdx(); }
        return;
      }
      histIdxRef.current = readHistIdx();
      applyRef.current(target, st);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = (pg, extra) => { if (!enabled) return; pushRoute(pg, extra); histIdxRef.current = readHistIdx(); };
  const stay = (pg, extra) => { if (!enabled) return; replaceRoute(pg, extra); histIdxRef.current = readHistIdx(); };
  return { go, stay, histIdxRef };
}

// [134차수] "화면 이름이 상태에서 계산되는" 홈(선생님 홈·마스터 홈)용 — 상태가 바뀌어 화면 이름이 달라지면 주소를 한 칸 쌓고,
//   뒤로가기가 오면 apply(target, state) 로 상태를 그 화면에 맞춘다. 자식 화면(parent 표)에서 부모로 돌아가는 변화는 "쌓기" 대신 "한 칸 뒤로"로 처리해
//   (예: 오늘 수업 요약의 [← 홈]) 뒤로가기를 두 번 누르지 않아도 되게 한다.
//   screenId : 지금 화면 이름(상태에서 계산한 값)  extra : 그 화면의 세부(예: { b: 책 id })  apply : (target, st) => 상태 맞추기  parent : { 자식: 부모 }
export function useScreenRoute({ enabled = true, ids, parent, screenId, extra, apply }) {
  const screenRef = useRef(screenId); screenRef.current = screenId;
  const applyRef = useRef(null);
  const pendingRef = useRef(null);     // 뒤로가기로 가는 중인 화면 이름(그 변화는 주소를 또 쌓지 않는다)
  const lastRef = useRef(null);
  applyRef.current = (target, st) => { pendingRef.current = (target === screenRef.current) ? null : target; apply(target, st || {}); };
  const { go, stay } = useBackNav({ enabled, ids, currentRef: screenRef, canLeaveRef: null, applyRef, sameRef: null });
  useEffect(() => {
    if (!enabled) return;
    const id = screenId;
    if (lastRef.current === null) {   // 처음: 주소와 화면이 다르면(세부를 못 살린 경우) 주소를 화면에 맞춘다
      lastRef.current = id;
      let cur = null; try { cur = (window.history.state || {}).pg; } catch (e) {}
      if (cur !== id && !(parent && parent[cur] === id)) stay(id, extra);   // 주소가 이 화면의 자식(예: 책)이면 그대로 둔다 — 자료가 오면 부르는 쪽이 살린다(책). 못 살리면 부르는 쪽이 주소를 고쳐 쓴다
      return;
    }
    if (id === lastRef.current) return;
    const prev = lastRef.current; lastRef.current = id;
    if (pendingRef.current === id) { pendingRef.current = null; return; }   // 뒤로가기로 온 것 — 주소는 이미 그 칸
    pendingRef.current = null;
    let st = null; try { st = window.history.state; } catch (e) {}
    if (st && st.pg === id) { stay(id, extra); return; }   // 주소가 이미 이 화면(새로고침 뒤 세부를 살린 경우) — 쌓지 않고 세부만 맞춘다
    if (parent && parent[prev] === id && st && st.pg === prev && readHistIdx() > 0) { try { window.history.back(); } catch (e) {} return; }
    go(id, extra);
  }, [screenId]);
  useEffect(() => { pendingRef.current = null; });   // 렌더가 한 번 돌면 "뒤로가기로 가는 중"은 끝난 것(상태가 안 바뀐 경우에도 안 남게)
}
