import { useEffect, useRef, useState } from "react";
import { IS_STAFF_VIEW } from "../../core/auth.jsx";
import { cancelPointOrder, fetchPoints, fmtP, orderPoint, writePeek } from "../../domain/points.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";

// ═══ [186차수] 더보기 → 마플 포인트 ═══
//   위: 내 포인트(잔액). 탭 3개: 상점(상품 카드를 눌러 금액을 고르고 주문) · 내역(한 줄씩) · 모으는 법(표).
//   상점은 PC방 매점·선물하기처럼 "카드 누르기 → 금액 고르기 → 주문" 세 번이면 끝난다.
//   주문하면 포인트가 바로 묶이고, 원장님이 사서 보내면 "받았어요"로 바뀐다. 거절·취소면 포인트가 돌아온다(워커가 한다).
const CARD = { background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16 };
const BTN = { minHeight: TAP, border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const ORDER_STATUS = {
  pending: { label: "기다리는 중", bg: UI.blueBg, fg: UI.blue },
  sent: { label: "받았어요 ✓", bg: UI.okBg, fg: UI.okFg },
  rejected: { label: "거절됨 · 포인트 돌아옴", bg: UI.warnBg, fg: UI.warnFg },
  canceled: { label: "취소함 · 포인트 돌아옴", bg: "#EEF0F4", fg: UI.sub },
};
const TABS = [{ v: "shop", label: "상점" }, { v: "history", label: "내역" }, { v: "rules", label: "모으는 법" }];
const fmtDay = (iso) => { const d = new Date(iso); if (isNaN(d.getTime())) return ""; return `${d.getMonth() + 1}/${d.getDate()}`; };
const fmtYmd = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "")); return m ? `${Number(m[2])}/${Number(m[3])}` : ""; };
const won = (n) => `${Math.round(n / 10000) === n / 10000 ? `${n / 10000}만원` : `${Number(n).toLocaleString("ko-KR")}원`}`;

export function PointsScreen({ studentId, onBalance, goReward }) {
  const [state, setState] = useState("loading");   // loading | ok | off | fail
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("shop");
  const [pick, setPick] = useState(null);          // 고른 상품(아래에서 올라오는 주문 칸)
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [flash, setFlash] = useState("");
  const aliveRef = useRef(true);
  const load = async () => {
    try {
      const d = await fetchPoints(studentId);
      if (!aliveRef.current) return;
      writePeek(studentId, d.on, d.balance);
      if (onBalance) onBalance({ on: !!d.on, balance: Number(d.balance) || 0 });
      setData(d); setState(d.on ? "ok" : "off");
    } catch (e) { if (aliveRef.current) setState((s) => (s === "ok" ? "ok" : "fail")); }
  };
  useEffect(() => { aliveRef.current = true; load(); return () => { aliveRef.current = false; }; }, [studentId]);
  const say = (m) => { setFlash(m); setTimeout(() => { if (aliveRef.current) setFlash(""); }, 3000); };
  const applyBalance = (balance) => {
    writePeek(studentId, true, balance);
    if (onBalance) onBalance({ on: true, balance });
    setData((d) => (d ? { ...d, balance } : d));
  };
  const openPick = (p) => { setNotice(""); setPick(p); setPrice(p.prices.find((x) => x <= balance) || p.prices[0]); };
  const submit = async () => {
    if (busy || !pick) return;
    setNotice("");
    if (IS_STAFF_VIEW) { setNotice("보기 전용 화면에서는 주문할 수 없어요"); return; }
    setBusy(true);
    try {
      const r = await orderPoint(studentId, pick.id, price);
      if (!aliveRef.current) return;
      applyBalance(Number(r.balance) || 0);
      setData((d) => (d ? { ...d, orders: [r.order, ...(d.orders || [])] } : d));
      setPick(null);
      say("주문했어요 ✓ 원장님이 확인하고 보내 드려요");
      load();
    } catch (e) {
      if (!aliveRef.current) return;
      setNotice(e.code === "not_enough" ? "포인트가 모자라요" : e.code === "too_many_pending" ? "기다리는 주문이 많아요. 받은 뒤에 다시 주문해 주세요" : e.status === 401 || e.status === 403 ? "앱을 새로고침한 뒤 다시 해 주세요" : "지금은 주문할 수 없어요. 잠시 뒤 다시 해 주세요.");
    } finally { if (aliveRef.current) setBusy(false); }
  };
  const cancel = async (o) => {
    if (busy) return;
    if (IS_STAFF_VIEW) { say("보기 전용 화면에서는 취소할 수 없어요"); return; }
    if (!window.confirm(`${o.productName} ${won(o.price)} 주문을 취소할까요?\n포인트는 바로 돌아와요.`)) return;
    setBusy(true);
    try {
      const r = await cancelPointOrder(studentId, o.id);
      if (!aliveRef.current) return;
      applyBalance(Number(r.balance) || 0);
      setData((d) => (d ? { ...d, orders: (d.orders || []).map((x) => (x.id === o.id ? r.order : x)) } : d));
      say("주문을 취소했어요. 포인트가 돌아왔어요");
      load();
    } catch (e) { if (aliveRef.current) say(e.code === "not_pending" ? "이미 처리된 주문이에요" : "지금은 취소할 수 없어요"); load(); }
    finally { if (aliveRef.current) setBusy(false); }
  };

  if (state === "loading") return <div style={{ ...CARD, padding: 34, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>불러오는 중…</div>;
  if (state === "fail") return <div style={{ ...CARD, padding: 34, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>포인트를 아직 불러올 수 없어요<br /><span style={{ fontSize: 12.5 }}>잠시 뒤 다시 열어 주세요</span></div>;
  if (state === "off") return <div style={{ ...CARD, padding: 34, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>마플 포인트를 준비하고 있어요{data && data.startDate ? <><br /><span style={{ fontSize: 12.5 }}>{fmtYmd(data.startDate)}부터 시작해요</span></> : null}</div>;

  const balance = Number(data.balance) || 0;
  const products = Array.isArray(data.products) ? data.products : [];
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const items = Array.isArray(data.items) ? data.items : [];
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const minPrice = products.reduce((m, p) => Math.min(m, ...(p.prices || [])), Infinity);
  const need = Number.isFinite(minPrice) ? Math.max(0, minPrice - balance) : 0;
  const pct = Number.isFinite(minPrice) && minPrice > 0 ? Math.min(100, Math.round((balance / minPrice) * 100)) : 0;
  return (
    <div>
      {/* 내 포인트 */}
      <div style={{ background: UI.navy, borderRadius: 16, padding: "18px 18px 16px", color: "#fff" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>내 포인트</div>
        <div data-testid="points-balance" style={{ fontSize: 32, fontWeight: 900, marginTop: 2, letterSpacing: -0.5 }}>{fmtP(balance)}</div>
        {Number.isFinite(minPrice) && (
          <>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.18)", marginTop: 12, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "#FFD25E" }} />
            </div>
            <div style={{ fontSize: 12.5, marginTop: 7, color: "rgba(255,255,255,0.85)" }}>
              {need > 0 ? <>가장 싼 상품까지 <b>{fmtP(need)}</b> 남았어요</> : "지금 주문할 수 있는 상품이 있어요 🎉"}
            </div>
          </>
        )}
      </div>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 6, background: "#EEF0F4", borderRadius: 14, padding: 4, marginTop: 12 }}>
        {TABS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTab(t.v)}
            style={{ ...BTN, flex: 1, padding: "8px 6px", borderRadius: 11, background: tab === t.v ? "#fff" : "transparent", color: tab === t.v ? UI.text : UI.sub, boxShadow: tab === t.v ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>{t.label}</button>
        ))}
      </div>
      {flash && <div role="status" style={{ marginTop: 10, background: UI.okBg, color: UI.okFg, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 800, textAlign: "center" }}>{flash}</div>}

      {tab === "shop" && (
        <>
          {products.length === 0
            ? <div style={{ ...CARD, marginTop: 10, padding: 30, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>상품을 준비하고 있어요</div>
            : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
                {products.map((p) => {
                  const low = Math.min(...p.prices);
                  const can = balance >= low;
                  return (
                    <button key={p.id} type="button" data-testid={`points-product-${p.id}`} onClick={() => openPick(p)}
                      style={{ ...CARD, padding: 0, overflow: "hidden", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column" }}>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 96, background: UI.bg, fontSize: 44 }}>
                        {p.image ? <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span aria-hidden="true">{p.emoji || "🎁"}</span>}
                      </span>
                      <span style={{ display: "block", padding: "10px 12px 12px" }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: UI.text, lineHeight: 1.35, wordBreak: "keep-all" }}>{p.name}</span>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: can ? UI.blue : UI.dim, marginTop: 4 }}>{fmtP(low)}{p.prices.length > 1 ? "부터" : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, margin: "18px 2px 8px" }}>내 주문</div>
          {orders.length === 0
            ? <div style={{ ...CARD, padding: 22, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>아직 주문한 것이 없어요</div>
            : (
              <div style={{ ...CARD, overflow: "hidden" }}>
                {orders.map((o, i) => {
                  const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
                  return (
                    <div key={o.id} style={{ padding: "12px 14px", borderTop: i ? `1px solid ${UI.line}` : "none", display: "flex", alignItems: "center", gap: 10 }}>
                      <span aria-hidden="true" style={{ fontSize: 24, flexShrink: 0 }}>{o.emoji || "🎁"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: UI.text, lineHeight: 1.4 }}>{o.productName} {won(o.price)}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: UI.dim }}>{fmtDay(o.at)}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: st.fg, background: st.bg, borderRadius: 8, padding: "2px 8px" }}>{st.label}</span>
                        </span>
                        {o.reason ? <span style={{ display: "block", fontSize: 12.5, color: o.status === "rejected" ? UI.warnFg : UI.sub, marginTop: 3, lineHeight: 1.5 }}>{o.status === "rejected" ? "이유: " : "💬 "}{o.reason}</span> : null}
                      </span>
                      {o.status === "pending" && <button type="button" onClick={() => cancel(o)} disabled={busy} style={{ ...BTN, flexShrink: 0, background: "#EEF0F4", color: UI.sub, padding: "8px 12px", fontSize: 13 }}>취소</button>}
                    </div>
                  );
                })}
              </div>
            )}
        </>
      )}

      {tab === "history" && (
        items.length === 0
          ? <div style={{ ...CARD, marginTop: 10, padding: 30, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>아직 받은 포인트가 없어요<br /><span style={{ fontSize: 12.5 }}>"모으는 법"을 눌러 보세요</span></div>
          : (
            <div style={{ ...CARD, marginTop: 10, overflow: "hidden" }}>
              {items.map((it, i) => (
                <div key={it.id} style={{ padding: "11px 14px", borderTop: i ? `1px solid ${UI.line}` : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: UI.dim, width: 40, flexShrink: 0 }}>{fmtYmd(it.date) || fmtDay(it.at)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: UI.text, lineHeight: 1.4, wordBreak: "break-word" }}>{it.label}</span>
                  <span style={{ flexShrink: 0, fontSize: 14.5, fontWeight: 900, color: it.amount >= 0 ? UI.okFg : UI.warnFg }}>{it.amount >= 0 ? "+" : "−"}{Math.abs(it.amount).toLocaleString("ko-KR")}</span>
                </div>
              ))}
            </div>
          )
      )}

      {tab === "rules" && (
        <>
          <div style={{ ...CARD, marginTop: 10, overflow: "hidden" }}>
            {rules.map((r, i) => (
              <div key={r.key} style={{ padding: "12px 14px", borderTop: i ? `1px solid ${UI.line}` : "none", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: UI.text }}>{r.label}</span>
                <span style={{ flexShrink: 0, fontSize: 14.5, fontWeight: 900, color: UI.blue }}>{fmtP(r.amount)}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: UI.sub, lineHeight: 1.7, margin: "10px 4px 0", wordBreak: "keep-all" }}>
            · 제시간 등원은 정규 수업 날만 받아요(보충 날은 빼요).<br />
            · 숙제·단어 TEST 포인트는 선생님이 검사한 뒤에 들어와요.<br />
            · 포인트는 없어지지 않아요. 1포인트는 1원이에요.
          </div>
          {goReward && <button type="button" onClick={goReward} style={{ ...BTN, width: "100%", marginTop: 12, background: UI.blueBg, color: UI.blue }}>🎁 장학금·친구 소개 신청하러 가기</button>}
        </>
      )}

      {/* 아래에서 올라오는 주문 칸 */}
      {pick && (
        <div role="dialog" aria-modal="true" onClick={() => { if (!busy) setPick(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,22,40,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 600, background: "#fff", borderRadius: "20px 20px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 14, background: UI.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0, overflow: "hidden" }}>
                {pick.image ? <img src={pick.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (pick.emoji || "🎁")}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16.5, fontWeight: 900, color: UI.text, lineHeight: 1.35 }}>{pick.name}</span>
                <span style={{ display: "block", fontSize: 12.5, color: UI.sub, marginTop: 2 }}>내 포인트 {fmtP(balance)}</span>
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, margin: "16px 0 8px" }}>금액 고르기</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pick.prices.map((v) => {
                const can = balance >= v;
                const on = price === v;
                return (
                  <button key={v} type="button" onClick={() => { setPrice(v); setNotice(""); }}
                    style={{ ...BTN, flex: "1 1 30%", background: on ? UI.navy : "#fff", color: on ? "#fff" : can ? UI.text : UI.dim, border: `1.5px solid ${on ? UI.navy : UI.line}` }}>{won(v)}</button>
                );
              })}
            </div>
            <div style={{ marginTop: 14, borderRadius: 12, padding: "10px 12px", fontSize: 13.5, fontWeight: 800, textAlign: "center", background: balance >= price ? UI.okBg : UI.warnBg, color: balance >= price ? UI.okFg : UI.warnFg }}>
              {balance >= price ? `주문하면 ${fmtP(balance - price)}가 남아요` : `${fmtP(price - balance)}가 모자라요`}
            </div>
            {notice && <div style={{ marginTop: 10, background: UI.warnBg, color: UI.warnFg, borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700 }}>{notice}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => setPick(null)} disabled={busy} style={{ ...BTN, flex: 1, height: 52, borderRadius: 14, background: "#EEF0F4", color: UI.sub }}>닫기</button>
              <button type="button" data-testid="points-order-btn" onClick={submit} disabled={busy || balance < price}
                style={{ ...BTN, flex: 2, height: 52, borderRadius: 14, fontSize: 16, background: UI.navy, color: "#fff", opacity: (busy || balance < price) ? 0.45 : 1, cursor: (busy || balance < price) ? "default" : "pointer" }}>{busy ? "주문하는 중…" : `${fmtP(price)}로 주문`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
