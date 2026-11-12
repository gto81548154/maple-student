import { useEffect, useState } from "react";
import { fmtDateShort } from "../domain/time.jsx";
import { MAX_W, TAP } from "../theme/tokens.jsx";

// ═══ [168차수] 새 팝업(준비 중) — 탭이 있는 파스텔 창. 아직 앱을 켤 때 저절로 뜨지 않는다. ═══
//   더보기 → "안 쓰는 기능" → [새 팝업]을 눌렀을 때만 열린다. 지금 쓰는 안내 카드(HomePopup)는 그대로 둔다.
//   탭 3개: 공지(지금 올라온 공지 그대로) · 시험 일정(가장 가까운 시험 D-day·범위·숙제·다음 수업) · 단어 리그(준비 중 안내만).
//   전부 이미 받은 자료로 그린다(서버 추가 요청 없음). 단어 리그는 순위 계산이 아직 없어서 가짜 이름·상품을 보여 주지 않는다.
const P = {
  ink: "#1F456B", sub: "#6B7B8B", line: "#E3EDF6", soft: "#F6FAFE", card: "#FFFDFB",
  blue: "#BFDAF3", blueSoft: "#D6E8F8", blueText: "#2F6DA3", dday: "#7FB2E0",
  mint: "#D9EFE5", mintText: "#2E7D63", text: "#16283A",
};
const TABS = [{ key: "notice", label: "공지" }, { key: "exam", label: "시험 일정" }, { key: "league", label: "단어 리그" }];
const box = { background: P.soft, border: `1px solid ${P.line}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10 };
const boxHead = { fontSize: 12.5, fontWeight: 700, color: P.sub, marginBottom: 6 };
const mainBtn = { width: "100%", minHeight: 50, border: "none", borderRadius: 14, background: P.blue, color: P.ink, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const emptyBox = { ...box, textAlign: "center", color: P.sub, fontSize: 14, padding: "26px 14px", lineHeight: 1.6 };

function dateChip(dateKey, mint) {
  const d = /^\d{4}-\d{2}-\d{2}/.test(String(dateKey)) ? new Date(String(dateKey).slice(0, 10) + "T00:00:00") : null;
  const ok = d && !isNaN(d.getTime());
  return (
    <span style={{ flex: "none", width: 46, minHeight: 46, borderRadius: 10, background: mint ? P.mint : P.blueSoft, color: mint ? P.mintText : P.blueText, fontWeight: 800, fontSize: 12, lineHeight: 1.25, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      {ok ? <>{d.getMonth() + 1}월<br />{d.getDate()}일</> : "공지"}
    </span>
  );
}

// ─── [170차수] 단어 리그 탭 — 워커가 묶음에 넣어 주는 league를 그대로 그린다(약속: 인계 글 "단어 리그 자료 약속 (2)") ───
//   league가 없거나 모양이 이상하면 null → "준비하고 있어요" 안내 그대로. 점수 세는 법은 워커 몫이라 score·unit을 보여 주기만 한다.
//   다른 학생 이름은 워커가 가려서 준 것("김○준")만 받는다. 선생님·원장 보기에서는 me가 null이라 내 순위 칸이 안 나온다.
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const str = (v) => (typeof v === "string" ? v.trim() : "");
export function normalizeLeague(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = str(raw.title);
  const status = ["upcoming", "running", "ended"].includes(raw.status) ? raw.status : "";
  if (!title || !status) return null;
  const prizes = (Array.isArray(raw.prizes) ? raw.prizes : []).map((p) => ({ rank: str(p?.rank), label: str(p?.label) })).filter((p) => p.rank && p.label);
  const top = (Array.isArray(raw.top) ? raw.top : []).map((t) => ({ rank: num(t?.rank), name: str(t?.name), score: num(t?.score) }))
    .filter((t) => t.rank != null && t.rank >= 1 && t.rank <= 3 && t.name && t.score != null).sort((a, b) => a.rank - b.rank).slice(0, 3);
  const m = raw.me && typeof raw.me === "object" ? raw.me : null;
  const nx = m && m.next && typeof m.next === "object" && num(m.next.rank) != null && num(m.next.gap) != null ? { rank: m.next.rank, gap: m.next.gap } : null;
  const me = m ? { rank: num(m.rank), score: num(m.score) ?? 0, next: nx } : null;
  const f = raw.finisher && typeof raw.finisher === "object" && num(raw.finisher.days) > 0 ? raw.finisher : null;
  const finisher = f ? { days: f.days, label: str(f.label), myDays: num(f.myDays) } : null;
  return { title, status, startDate: str(raw.startDate), endDate: str(raw.endDate), unit: str(raw.unit) || "점", prizes, top, me, total: num(raw.total), finisher, updatedAt: str(raw.updatedAt) };
}
const LEAGUE_BADGE = { upcoming: "곧 시작해요", running: "진행 중", ended: "끝났어요 · 최종 순위" };
const PODIUM_H = { 1: 74, 2: 54, 3: 40 };
function fmtUpdated(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 기준`;
}
function LeagueBody({ lg }) {
  const ended = lg.status === "ended", upcoming = lg.status === "upcoming";
  const period = [fmtDateShort(lg.startDate), fmtDateShort(lg.endDate)].filter(Boolean).join(" ~ ");
  const byRank = (r) => lg.top.find((t) => t.rank === r);
  const me = lg.me;
  const fin = lg.finisher;
  const finDone = fin && fin.myDays != null && fin.myDays >= fin.days;
  return (
    <>
      <div style={{ borderRadius: 18, padding: "16px 18px", background: `linear-gradient(160deg, ${P.blueSoft}, #D3EDE2)`, color: P.ink, marginBottom: 10 }}>
        <span data-testid="lab-league-badge" style={{ display: "inline-block", background: "#fff", color: P.blueText, fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 99 }}>{LEAGUE_BADGE[lg.status]}</span>
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35, margin: "8px 0 4px", wordBreak: "keep-all" }}>{lg.title}</div>
        {period && <div style={{ fontSize: 13.5 }}>{period}</div>}
      </div>
      {lg.prizes.length > 0 && (
        <div style={box}>
          <div style={boxHead}>상품</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lg.prizes.map((p, i) => (
              <span key={i} style={{ background: "#fff", border: `1px solid ${P.line}`, borderRadius: 10, padding: "6px 10px", fontSize: 13.5, color: P.text }}>
                <b style={{ color: P.blueText }}>{p.rank}</b> {p.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {upcoming ? (
        <div style={emptyBox}>{fmtDateShort(lg.startDate) ? `${fmtDateShort(lg.startDate)}에 시작해요` : "곧 시작해요"}<br /><span style={{ fontSize: 12.5 }}>시작하면 여기에 순위가 보여요</span></div>
      ) : lg.top.length === 0 ? (
        <div style={emptyBox}>아직 순위가 없어요<br /><span style={{ fontSize: 12.5 }}>단어 숙제를 통과하면 순위에 올라가요</span></div>
      ) : (
        <div data-testid="lab-league-podium" style={{ ...box, display: "flex", alignItems: "flex-end", gap: 8, paddingTop: 14 }}>
          {[2, 1, 3].map((r) => { const t = byRank(r); return (
            <div key={r} style={{ flex: 1, minWidth: 0, textAlign: "center", visibility: t ? "visible" : "hidden" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t ? t.name : "-"}</div>
              <div style={{ fontSize: 12.5, color: P.sub, marginBottom: 5 }}>{t ? `${t.score}${lg.unit}` : ""}</div>
              <div style={{ height: PODIUM_H[r], borderRadius: "10px 10px 4px 4px", background: r === 1 ? P.blue : r === 2 ? P.blueSoft : P.mint, color: r === 3 ? P.mintText : P.ink, fontWeight: 900, fontSize: r === 1 ? 22 : 17, display: "flex", alignItems: "center", justifyContent: "center" }}>{r}등</div>
            </div>
          ); })}
        </div>
      )}
      {me && !upcoming && (
        <div data-testid="lab-league-me" style={{ ...box, background: "#fff", border: `1.5px solid ${P.blue}` }}>
          <div style={boxHead}>{ended ? "내 최종 순위" : "내 순위"}{lg.total ? ` · ${lg.total}명 중` : ""}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: P.blueText }}>{me.rank != null ? `${me.rank}등` : "순위 없음"}</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: P.text }}>{me.score}{lg.unit}</span>
          </div>
          {!ended && (
            <div style={{ fontSize: 13.5, color: P.sub, marginTop: 4 }}>
              {me.rank == null ? "단어 숙제를 통과하면 순위에 올라가요"
                : me.next ? `${me.next.rank}등까지 ${me.next.gap}${lg.unit} 남았어요`
                : me.rank === 1 ? "지금 1등이에요" : ""}
            </div>
          )}
        </div>
      )}
      {fin && !upcoming && (
        <div data-testid="lab-league-finisher" style={box}>
          <div style={boxHead}>완주상{fin.label ? ` · ${fin.label}` : ""}</div>
          {fin.myDays != null ? (
            <>
              <div style={{ height: 12, borderRadius: 99, background: "#fff", border: `1px solid ${P.line}`, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(0, Math.min(100, (fin.myDays / fin.days) * 100))}%`, height: "100%", background: "#8FD3B6", borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 13.5, color: finDone ? P.mintText : P.text, fontWeight: 700, marginTop: 6 }}>
                {finDone ? `${fin.days}일을 다 채웠어요` : `${fin.days}일 중 ${fin.myDays}일 했어요${ended ? "" : ` · ${fin.days - fin.myDays}일 남음`}`}
              </div>
            </>
          ) : <div style={{ fontSize: 13.5, color: P.text, fontWeight: 700 }}>{fin.days}일을 채우면 받아요</div>}
        </div>
      )}
      {fin && upcoming && <div style={box}><div style={boxHead}>완주상{fin.label ? ` · ${fin.label}` : ""}</div><div style={{ fontSize: 13.5, color: P.text, fontWeight: 700 }}>{fin.days}일을 채우면 받아요</div></div>}
      {fmtUpdated(lg.updatedAt) && !upcoming && <div style={{ fontSize: 11.5, color: P.sub, textAlign: "right", margin: "-4px 2px 8px" }}>{fmtUpdated(lg.updatedAt)}</div>}
    </>
  );
}

export function LabPopup({ pinnedMessages = [], exam = null, rangeText = "", doneTasks = 0, totalTasks = 0, activeDate = "", classLine = "", league = null, onClose, onGo }) {
  const lg = normalizeLeague(league);
  const [tab, setTab] = useState("notice");
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const notices = (Array.isArray(pinnedMessages) ? pinnedMessages : []).filter(([, rec]) => rec && rec.text);

  const noticeTab = (
    <>
      {notices.length === 0 ? <div style={emptyBox}>지금 올라온 공지가 없어요</div> : notices.slice(0, 4).map(([dateKey, rec], i) => (
        <div key={dateKey} style={{ ...box, display: "flex", gap: 12 }}>
          {dateChip(dateKey, i > 1)}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: P.sub, marginBottom: 3 }}>{rec.author || "선생님"}</div>
            <div style={{ fontSize: 14.5, color: P.text, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{rec.text}</div>
          </div>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <button type="button" data-testid="lab-go-notices" onClick={() => onGo("notices")} style={{ ...mainBtn, background: "#fff", color: P.blueText, border: `1.5px solid ${P.blue}` }}>공지 전체 보기</button>
    </>
  );

  const examTab = !exam ? (
    <>
      <div style={emptyBox}>다가오는 시험이 없어요<br /><span style={{ fontSize: 12.5 }}>선생님이 시험 일정을 등록하면 여기에 보여요</span></div>
      <div style={{ flex: 1 }} />
    </>
  ) : (
    <>
      <div style={{ textAlign: "center", padding: "4px 0 10px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: P.text, wordBreak: "keep-all" }}>{exam.name}</div>
        <div data-testid="lab-dday" style={{ fontSize: 64, fontWeight: 900, color: P.dday, lineHeight: 1.1 }}>{exam.ddayLabel}</div>
        <div style={{ fontSize: 14, color: P.sub }}>{exam.dateLabel}{exam.isEngTarget ? " · 영어 시험일 기준" : ""}</div>
      </div>
      <div style={box}>
        <div style={boxHead}>시험 범위</div>
        <div style={{ fontSize: 14.5, color: P.text, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{rangeText || "아직 등록되지 않았어요"}</div>
      </div>
      <div style={box}>
        <div style={boxHead}>숙제{fmtDateShort(activeDate) ? ` · ${fmtDateShort(activeDate)}` : ""}</div>
        <div style={{ fontSize: 14.5, color: P.text, fontWeight: 700 }}>{totalTasks > 0 ? `${totalTasks}개 중 ${doneTasks}개 끝` : "등록된 숙제가 없어요"}</div>
      </div>
      {classLine && <div style={box}><div style={boxHead}>수업</div><div style={{ fontSize: 14.5, color: P.text, fontWeight: 700 }}>{classLine}</div></div>}
      <div style={{ flex: 1 }} />
      <button type="button" data-testid="lab-go-tasks" onClick={() => onGo("tasks")} style={mainBtn}>숙제 보러 가기 →</button>
    </>
  );

  const leagueTab = lg ? (
    <>
      <LeagueBody lg={lg} />
      <div style={{ flex: 1 }} />
      <button type="button" data-testid="lab-go-voca" onClick={() => onGo("voca")} style={mainBtn}>단어 공부 하러 가기 →</button>
    </>
  ) : (
    <>
      <div style={{ borderRadius: 18, padding: "20px 18px", background: `linear-gradient(160deg, ${P.blueSoft}, #D3EDE2)`, color: P.ink, marginBottom: 10 }}>
        <span style={{ display: "inline-block", background: "#fff", color: P.blueText, fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 99 }}>준비 중</span>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, margin: "10px 0 6px", wordBreak: "keep-all" }}>단어 리그를 준비하고 있어요</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>앱에서 단어를 통과한 횟수로 순위를 매기는 이벤트예요. 시작하면 여기에 순위가 보여요.</div>
      </div>
      <div style={{ flex: 1 }} />
      <button type="button" data-testid="lab-go-voca" onClick={() => onGo("voca")} style={mainBtn}>단어 공부 하러 가기 →</button>
    </>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="새 팝업 (준비 중)" data-testid="lab-popup" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(40,60,90,0.45)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: Math.min(MAX_W - 32, 420), maxHeight: "calc(100vh - 32px)", background: P.card, borderRadius: 22, overflow: "hidden", boxShadow: "0 12px 34px rgba(40,60,90,0.28)", display: "flex", flexDirection: "column" }}>
        <div style={{ background: P.blueSoft, color: P.ink, padding: "12px 14px 12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ fontSize: 17 }}>마플영어</b><span style={{ fontSize: 12, opacity: 0.8 }}>알려 드려요</span>
          <button type="button" aria-label="닫기" onClick={onClose} style={{ marginLeft: "auto", width: TAP, height: TAP, borderRadius: "50%", border: "1.5px solid #9DBEDD", background: "transparent", color: P.ink, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 6, padding: 8, background: "#F1F6FB" }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-testid={"lab-tab-" + t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, minHeight: TAP, border: "none", borderRadius: 10, background: tab === t.key ? P.blue : "transparent", color: tab === t.key ? P.ink : P.sub, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {t.label}{t.key === "notice" && notices.length ? ` ${notices.length}` : ""}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 320, overflowY: "auto", padding: "16px 16px 14px", display: "flex", flexDirection: "column" }}>
          {tab === "notice" ? noticeTab : tab === "exam" ? examTab : leagueTab}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 10px", borderTop: "1px solid #E8EEF4", background: "#FAFBFD" }}>
          <button type="button" onClick={onClose} style={{ minHeight: TAP, border: "none", background: "transparent", color: P.sub, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "8px 10px" }}>닫기 ✕</button>
        </div>
      </div>
    </div>
  );
}
