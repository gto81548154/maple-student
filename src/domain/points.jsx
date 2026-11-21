import { useEffect, useState } from "react";
import { getSelfAccessToken } from "../core/bundle.jsx";
import { WORKER_ORIGIN } from "../core/config.jsx";
import { fetchWithTimeout } from "../core/net.jsx";

// ═══ [186차수] 마플 포인트 — 워커 문 부르기 ═══
//   1포인트 = 1원. 포인트 계산은 전부 워커가 한다(학생앱은 보여 주고 주문만 보낸다).
//   GET  ${WORKER_ORIGIN}/student/points?studentId=&t=&peek=1 → { success, on, balance }            홈 카드·더보기 줄용(가볍다)
//   GET  ${WORKER_ORIGIN}/student/points?studentId=&t=        → { success, on, balance, startDate, items, rules, products, orders }
//        items:   [{ id, date, kind, label, amount, at }]            최신 먼저
//        rules:   [{ key, label, amount }]                           모으는 법 표
//        products:[{ id, name, emoji, image, prices:[10000,…] }]     상점 상품
//        orders:  [{ id, productId, productName, emoji, price, status, reason, at }]   status: pending | sent | rejected | canceled
//   POST ${WORKER_ORIGIN}/student/point-order         body { studentId, t, productId, price } → { success, order, balance }   (409 = 포인트 모자람·기다리는 주문 많음)
//   POST ${WORKER_ORIGIN}/student/point-order/cancel  body { studentId, t, id }               → { success, order, balance }   (기다리는 중일 때만)
//   워커가 옛 판이거나 원장이 아직 안 켰으면 on:false(또는 404) → 포인트 메뉴가 아예 안 보인다.
const PEEK_KEY = "maple_points_peek_v1";
const PEEK_FRESH_MS = 2 * 60 * 1000;
export const fmtP = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}P`;
const readPeek = (sid) => { try { const v = JSON.parse(localStorage.getItem(PEEK_KEY) || "null"); return v && v.sid === String(sid) ? v : null; } catch (e) { return null; } };
export const writePeek = (sid, on, balance) => { try { localStorage.setItem(PEEK_KEY, JSON.stringify({ sid: String(sid), on: !!on, balance: Number(balance) || 0, at: Date.now() })); } catch (e) { /* 못 적어도 화면은 맞게 그린다 */ } };
const base = (studentId, extra = "") => `${WORKER_ORIGIN}/student/points?studentId=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}${extra}`;

// 더보기·홈이 쓰는 값 — { on, balance }. 2분 안에 다시 묻지 않는다. tick(자료를 새로 받은 시각)이 바뀌면 다시 본다.
export function usePointsPeek(studentId, tick) {
  const [peek, setPeek] = useState(() => { const c = readPeek(studentId); return { on: !!(c && c.on), balance: c ? c.balance : 0 }; });
  useEffect(() => {
    if (!WORKER_ORIGIN || !studentId) return undefined;
    const cached = readPeek(studentId);
    if (cached && Date.now() - (Number(cached.at) || 0) < PEEK_FRESH_MS) { setPeek({ on: !!cached.on, balance: cached.balance }); return undefined; }
    let dead = false;
    fetch(base(studentId, "&peek=1"), { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (dead || !d || !d.success || typeof d.on !== "boolean") return;
      writePeek(studentId, d.on, d.balance);
      setPeek({ on: d.on, balance: Number(d.balance) || 0 });
    }).catch(() => { /* 인터넷이 끊겼으면 적어 둔 값 그대로 */ });
    return () => { dead = true; };
  }, [studentId, tick]);
  return [peek, setPeek];
}
export async function fetchPoints(studentId) {
  const resp = await fetchWithTimeout(base(studentId), { method: "GET", cache: "no-store" }, 15000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error("points");
  return data;
}
const post = async (path, body) => {
  const resp = await fetchWithTimeout(`${WORKER_ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, t: getSelfAccessToken() }) }, 20000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) { const e = new Error(data.error || data.message || "fail"); e.status = resp.status; e.code = data.code || ""; throw e; }
  return data;
};
export const orderPoint = (studentId, productId, price) => post("/student/point-order", { studentId, productId, price });
export const cancelPointOrder = (studentId, id) => post("/student/point-order/cancel", { studentId, id });
