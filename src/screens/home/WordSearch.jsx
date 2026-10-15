import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { VOCA_TAB_ENABLED, WORKER_ORIGIN } from "../../core/config.jsx";
import { getWordIndex, startWordIndex, subscribeWordIndex } from "../../core/wordIndex.jsx";
import { getNaesinVocaParams } from "../../domain/examRange.jsx";
import { guessVocaBooks } from "../../domain/voca.jsx";
import { groupHitsByMean, matchRange, naverDictUrl, pushRecentWord, readRecentWords, searchWords } from "../../domain/wordSearch.jsx";
import { TAB_BAR_H, TAP, UI } from "../../theme/tokens.jsx";

// ─── [125차수 10-12] 홈 맨 위 단어 검색 칸 (원장 결정 10-07, 화면 모형 "학생앱-새기능-화면모형-1007") ───
//   한 글자 칠 때마다 아래에 낱말·뜻·"어느 책 몇 단원"이 뜬다. 낱말을 누르면 뜻 카드 + [단어장 열기] + [네이버 사전].
//   찾는 범위 = 정규 단어장 + 내 학교 내신 단어(지금 준비하는 시험범위). 시험이 끝나 달력의 "다음 시험"이 바뀌면 범위도 따라 바뀐다.
//   검색 칸을 처음 누를 때 단어책을 받는다(앱을 켤 때는 받지 않는다).
const GREEN = UI.okFg, GREEN_BG = UI.okBg, PURPLE = "#5B3FB8", PURPLE_BG = "#EFEAFB";
const chip = (ns) => ({ display: "inline-block", fontSize: 12, fontWeight: 800, padding: "3px 8px", borderRadius: 7, background: ns ? PURPLE_BG : GREEN_BG, color: ns ? PURPLE : GREEN, whiteSpace: "nowrap" });

export function WordSearch({ student, studentId, examRanges, examDdays, progressTree, studentVideos, goTab }) {
  const idx = useSyncExternalStore(subscribeWordIndex, getWordIndex);
  const [q, setQ] = useState("");
  // focused = 검색 칸을 쓰는 중. 칸 바깥을 누를 때만 꺼진다(자판이 내려가는 것만으로는 안 꺼짐 — 아래 "최근 찾은 단어" 단추가 눌리기 전에 사라지지 않게).
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState(null);                 // 누른 낱말(뜻 카드)
  const [recent, setRecent] = useState(() => readRecentWords(studentId));
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // 받아 올 범위 — 단어 탭(마플보카)에 넘기는 값과 같은 계산을 쓴다.
  const nsp = getNaesinVocaParams(student, examRanges, examDdays);
  const myBooks = guessVocaBooks(progressTree, studentVideos);
  const spec = { origin: WORKER_ORIGIN, sc: nsp.sc, nsl: nsp.nsl, year: nsp.year || 0, exam: nsp.exam || "", firstBooks: myBooks };
  const specKey = `${nsp.sc}|${nsp.nsl.join(",")}|${nsp.year || ""}|${nsp.exam || ""}`;
  const startedRef = useRef(false);
  const begin = (force = false) => { startedRef.current = true; startWordIndex(spec, force); };
  // 이미 한 번 받은 뒤 시험범위가 바뀌면(새로고침으로 달력·범위가 갱신됨) 그 범위로 다시 맞춘다. 폰에 저장해 둔 책은 다시 받지 않는다.
  useEffect(() => { if (startedRef.current) startWordIndex(spec); }, [specKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focused) return undefined;
    const onDown = (e) => { const el = boxRef.current; if (el && !el.contains(e.target)) setFocused(false); };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [focused]);

  const query = q.trim();
  const results = useMemo(() => (query ? searchWords(idx.sources, query, 8) : []), [idx.sources, query]);
  // 뜻 카드는 누른 순간의 결과로 굳히지 않는다 — 책이 뒤늦게 도착하면(처음 받는 중) 그 책의 뜻도 카드에 이어 붙는다.
  const card = useMemo(() => (picked ? (searchWords(idx.sources, picked.w, 30).find((e) => e.key === picked.key) || picked) : null), [idx.sources, picked]);
  const loading = idx.status === "loading";
  const failedAll = idx.status === "error";

  const onFocus = () => {
    setFocused(true);
    begin();
    // 폰: 자판이 올라와도 결과가 보이게 검색 칸을 위 탭 줄 바로 아래로 올린다.
    try {
      const el = boxRef.current;
      if (el && el.getBoundingClientRect().top > TAB_BAR_H + 80) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - (TAB_BAR_H + 10)), behavior: "auto" });
    } catch (e) {}
  };
  const pick = (entry) => {
    setPicked(entry);
    setRecent(pushRecentWord(studentId, entry.w));
    setQ("");
    setFocused(false);
    try { inputRef.current && inputRef.current.blur(); } catch (e) {}
  };
  const clear = () => { setQ(""); setPicked(null); try { inputRef.current && inputRef.current.focus(); } catch (e) {} };
  const onKeyDown = (e) => {
    if (e.nativeEvent && (e.nativeEvent.isComposing || e.keyCode === 229)) return;   // 한글을 조합하는 중의 Enter는 글자 확정용 — 결과를 누르지 않는다
    if (e.key === "Enter" && results.length) { e.preventDefault(); pick(results[0]); }
    if (e.key === "Escape") { setQ(""); setPicked(null); setFocused(false); try { inputRef.current && inputRef.current.blur(); } catch (err) {} }
  };
  const openBook = (hit) => goTab("voca", { vocaTask: { book: hit.srcId, lecs: [hit.lec] } });
  const naverLink = (word, children, style) => (
    <a href={naverDictUrl(word)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", fontFamily: "inherit", ...style }}>{children}</a>
  );
  const recentRow = recent.length > 0 && (
    <div style={{ padding: "12px 14px 13px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, marginBottom: 8 }}>최근 찾은 단어</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {recent.map((w) => (
          <button key={w} type="button" onClick={() => { setPicked(null); setQ(w); begin(); }}
            style={{ border: `1px solid ${UI.line}`, background: "#fff", color: UI.text, borderRadius: 999, padding: "0 14px", minHeight: 44, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{w}</button>
        ))}
      </div>
    </div>
  );
  const showList = !!query;
  const showRecentOnly = !query && !picked && focused && recent.length > 0;
  const open = showList || !!picked || showRecentOnly;

  return (
    <div ref={boxRef} role="search" data-testid="word-search" style={{ background: UI.card, border: `1.5px solid ${focused || open ? GREEN : UI.line}`, borderRadius: 16, overflow: "hidden" }}>
      {/* 검색 칸 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px 0 14px", minHeight: 52 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={focused ? GREEN : UI.dim} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
        <input ref={inputRef} type="text" inputMode="search" enterKeyHint="search" value={q} aria-label="단어 검색"
          placeholder="단어 검색 (영어·한글 뜻)" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); if (picked) setPicked(null); }} onFocus={onFocus} onKeyDown={onKeyDown}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 17, fontWeight: 600, color: UI.text, fontFamily: "inherit", padding: "14px 0" }} />
        {(q || picked) && (
          <button type="button" onClick={clear} aria-label="검색어 지우기" style={{ flexShrink: 0, width: 44, height: 44, border: "none", background: "transparent", color: UI.dim, fontSize: 20, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        )}
      </div>

      {/* 글자를 치는 중 — 결과 목록 */}
      {showList && (
        <div data-testid="word-search-list" style={{ borderTop: `1px solid ${UI.line}` }}>
          {results.map((r) => {
            const mr = matchRange(r.w, query);
            return (
              <button key={r.key} type="button" onClick={() => pick(r)} data-testid="word-search-row"
                style={{ width: "100%", display: "block", textAlign: "left", border: "none", borderBottom: `1px solid ${UI.line}`, background: "transparent", padding: "11px 14px 12px", minHeight: 60, cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box" }}>
                <span style={{ display: "block", fontSize: 18, fontWeight: 800, color: UI.text, lineHeight: 1.3, wordBreak: "break-word" }}>
                  {mr ? <>{r.w.slice(0, mr[0])}<span style={{ color: GREEN }}>{r.w.slice(mr[0], mr[1])}</span>{r.w.slice(mr[1])}</> : r.w}
                </span>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 500, color: UI.sub, lineHeight: 1.45, marginTop: 2, wordBreak: "keep-all" }}>{r.hits[0].mean || "뜻이 아직 없어요"}</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                  {r.hits.slice(0, 3).map((h) => <span key={h.srcId + "-" + h.lec} style={chip(h.ns)}>{h.label}</span>)}
                  {r.hits.length > 3 && <span style={{ ...chip(false), background: "#EEF1F5", color: UI.sub }}>외 {r.hits.length - 3}곳</span>}
                </span>
              </button>
            );
          })}
          {loading && (
            <div role="status" style={{ padding: "12px 14px", fontSize: 14, fontWeight: 700, color: UI.sub, borderBottom: `1px solid ${UI.line}` }}>단어장을 불러오는 중이에요… ({idx.done}/{idx.total || "?"})</div>
          )}
          {failedAll && (
            <div role="alert" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${UI.line}` }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: UI.warnFg, wordBreak: "keep-all" }}>단어장을 불러오지 못했어요. 인터넷을 확인해 주세요.</span>
              <button type="button" onClick={() => begin(true)} style={{ flexShrink: 0, border: `1.5px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 10, padding: "0 14px", minHeight: 44, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>다시 시도</button>
            </div>
          )}
          {!loading && !failedAll && results.length === 0 && (
            <div style={{ padding: "14px 14px 4px", fontSize: 15, fontWeight: 700, color: UI.text, wordBreak: "keep-all" }}>우리 단어장에 없는 단어예요.</div>
          )}
          {!loading && !failedAll && (idx.failed > 0 || idx.nsMissed) && (
            <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: UI.sub, wordBreak: "keep-all" }}>{idx.failed > 0 ? `단어장 ${idx.failed}권은 불러오지 못해서 빼고 찾았어요.` : "내신 단어는 불러오지 못해서 빼고 찾았어요."}</span>
              <button type="button" onClick={() => begin(true)} style={{ flexShrink: 0, border: `1.5px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 10, padding: "0 12px", minHeight: 44, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>다시 시도</button>
            </div>
          )}
          {naverLink(query, <span>{results.length ? "여기에 없는 단어는 → " : ""}<b style={{ color: GREEN }}>네이버 사전에서 ‘{query}’ 찾기</b></span>,
            { display: "flex", alignItems: "center", minHeight: 48, padding: "6px 14px", fontSize: 14.5, fontWeight: 600, lineHeight: 1.45, color: UI.sub, boxSizing: "border-box", wordBreak: "break-word" })}
        </div>
      )}

      {/* 낱말을 눌렀을 때 — 뜻 카드 */}
      {card && !query && (
        <div data-testid="word-search-detail" style={{ borderTop: `1px solid ${UI.line}`, padding: "16px 14px 14px" }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: UI.text, letterSpacing: -0.3, lineHeight: 1.2, wordBreak: "break-word" }}>{card.w}</div>
          {/* [136차수] 같은 뜻은 한 번만 쓴다 — 뜻마다 한 칸, 그 아래에 책 이름표 + [단어장 열기] 줄(전에는 책마다 같은 뜻이 되풀이돼 카드가 길었음) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {groupHitsByMean(card.hits).map((g) => (
              <div key={g.mean} data-testid="word-search-mean" style={{ border: `1px solid ${UI.line}`, borderRadius: 12, padding: "11px 12px 5px" }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: UI.text, lineHeight: 1.45, wordBreak: "keep-all", paddingBottom: 6 }}>{g.mean || "뜻이 아직 없어요"}</div>
                {g.hits.map((h) => (
                  <div key={h.srcId + "-" + h.lec} style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${UI.line}`, padding: "6px 0", minHeight: TAP }}>
                    <div style={{ flex: 1, minWidth: 0 }}><span style={chip(h.ns)}>{h.label}</span></div>
                    {VOCA_TAB_ENABLED && (
                      <button type="button" onClick={() => openBook(h)} aria-label={`${h.label} 단어장 열기`}
                        style={{ flexShrink: 0, border: `1.5px solid ${GREEN}`, background: "#fff", color: GREEN, borderRadius: 10, padding: "0 13px", minHeight: TAP, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>단어장 열기</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {naverLink(card.w, "네이버 사전에서 더 보기",
            { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 46, marginTop: 10, border: `1.5px solid ${GREEN}`, borderRadius: 12, color: GREEN, fontSize: 15, fontWeight: 800, boxSizing: "border-box" })}
        </div>
      )}

      {/* 최근 찾은 단어 — 검색 칸을 눌렀는데 아직 아무것도 안 쳤을 때, 그리고 뜻 카드 아래 */}
      {(showRecentOnly || (picked && !query)) && recentRow && <div style={{ borderTop: `1px solid ${UI.line}` }}>{recentRow}</div>}
    </div>
  );
}
