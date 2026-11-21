// [186차수] 마플 포인트 화면만 따로 띄워 보는 시험 틀 — 워커 대신 가짜 답을 준다(주문·취소도 흉내).
import React from "react";
import { createRoot } from "react-dom/client";
import { PointsScreen } from "../../../src/screens/more/PointsScreen.jsx";
import { RewardScreen } from "../../../src/screens/more/RewardScreen.jsx";

const db = {
  balance: 12300,
  items: [
    { id: "a1", date: "2026-12-03", kind: "ontime", label: "제시간 등원", amount: 100, at: "2026-12-03T10:00:00Z" },
    { id: "a2", date: "2026-12-03", kind: "hwAll", label: "숙제 다 함", amount: 100, at: "2026-12-03T10:00:01Z" },
    { id: "a3", date: "2026-12-03", kind: "vocaFirst", label: "단어 TEST 한 번에 통과", amount: 100, at: "2026-12-03T10:00:02Z" },
    { id: "a4", date: "2026-12-02", kind: "score", label: "성적 장학금", amount: 10000, at: "2026-12-02T10:00:00Z" },
    { id: "a5", date: "2026-12-01", kind: "manual", label: "칭찬 포인트", amount: 2000, at: "2026-12-01T10:00:00Z" },
  ],
  orders: [],
};
const rules = [["ontime", "제시간 등원", 100], ["hwAll", "숙제 다 함", 100], ["hwPart", "숙제 일부만 함", 50], ["vocaFirst", "단어 TEST 한 번에 통과", 100], ["perfectMonth", "한 달 개근", 1000], ["score", "성적 장학금", 10000], ["improve", "성적 향상 장학금", 5000], ["referralConsult", "친구 소개 · 상담", 3000], ["referral", "친구 소개 · 등록", 30000]].map(([key, label, amount]) => ({ key, label, amount }));
const products = [{ id: "oliveyoung", name: "올리브영 기프트카드", emoji: "💄", image: "", prices: [10000, 20000, 30000] }, { id: "cvs", name: "편의점 상품권", emoji: "🏪", image: "", prices: [10000, 20000, 30000] }, { id: "coffee", name: "커피 기프티콘", emoji: "☕", image: "", prices: [10000, 20000, 30000] }];
const reply = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (url, opt = {}) => {
  const u = String(url);
  const body = opt.body ? JSON.parse(opt.body) : {};
  if (u.includes("/student/points")) return reply({ success: true, on: true, balance: db.balance, startDate: "2026-12-01", items: db.items, rules, products, orders: db.orders });
  if (u.endsWith("/student/point-order")) {
    if (db.balance < body.price) return reply({ success: false, code: "not_enough" }, 409);
    const p = products.find(x => x.id === body.productId);
    const order = { id: "o" + Date.now(), productId: p.id, productName: p.name, emoji: p.emoji, price: body.price, status: "pending", reason: "", at: new Date().toISOString() };
    db.balance -= body.price; db.orders.unshift(order);
    db.items.unshift({ id: "i" + Date.now(), date: "2026-12-04", kind: "order", label: `${p.name} ${body.price.toLocaleString("ko-KR")}원권 주문`, amount: -body.price, at: new Date().toISOString() });
    return reply({ success: true, order, balance: db.balance });
  }
  if (u.endsWith("/student/point-order/cancel")) {
    const o = db.orders.find(x => x.id === body.id); o.status = "canceled"; db.balance += o.price;
    return reply({ success: true, order: o, balance: db.balance });
  }
  if (u.includes("/student/reward-claims")) return reply({ success: true, items: [{ id: "r1", kind: "improve", at: "2026-12-02T01:00:00Z", status: "pending", level: "middle", semester: "2026-2", exam: "final", prev: 72, now: 85, usesPoints: true, amount: 5000 }, { id: "r2", kind: "referral", at: "2026-12-01T01:00:00Z", status: "checking", friendName: "김마플", usesPoints: true, consultPoints: 3000, amount: 30000 }] });
  return reply({ success: false }, 404);
};
const view = new URLSearchParams(location.search).get("view") || "points";
createRoot(document.getElementById("root")).render(
  <div style={{ maxWidth: 600, margin: "0 auto", padding: 16 }}>
    {view === "reward" ? <RewardScreen student={{ grade: "중2" }} studentId="1" pointsOn /> : <PointsScreen studentId="1" onBalance={() => {}} goReward={() => {}} />}
  </div>
);
