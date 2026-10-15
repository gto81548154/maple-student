import { readInitialRoute, replaceRoute } from "../../core/route.jsx";
import { useScreenRoute } from "../../state/useBackNav.jsx";
import { useEffect, useRef, useState } from "react";
import { MASTER_ID, clearMasterMk } from "../../core/auth.jsx";
import { STUDENT_APP_BUILD, VOCA_APP_URL, WORKER_ORIGIN } from "../../core/config.jsx";
import { extractPlaylistId, extractYoutubeId } from "../../domain/videoMatch.jsx";
import { VocaFrame } from "../voca/VocaFrame.jsx";
import { MAX_W, TAP } from "../../theme/tokens.jsx";

// ─── [마스터] 원장 전용 홈 ─────────────────────────────────────────
// 탭 3개 = 단어 TEST(원장 진도) · 강의 영상(커리큘럼 전체) · 학생(목록 → 그 학생 앱)
// 열쇠(mk)는 폰 저장소에서만 읽는다 — 주소창에는 ?master=1 만 있다.
const MASTER_ROUTE_IDS = ["voca", "pick", "videos", "book", "students"];

export function MasterHome({ mk }) {
  // [134차수] 마스터 홈 주소(#해시) — 탭 4개 + 강의 탭의 책(book). 새로고침해도 보던 탭 그대로.
  const [initialRoute] = useState(() => { let st = {}; try { st = window.history.state || {}; } catch (e) {} return { id: readInitialRoute(MASTER_ROUTE_IDS, "voca"), st }; });
  const [tab, setTab] = useState(() => initialRoute.id === "book" ? "videos" : initialRoute.id);
  const [students, setStudents] = useState([]);
  const [areas, setAreas] = useState([]);   // [{ areaId, areaLabel, books:[{bookId, name, videos:[...]}] }]
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [openBook, setOpenBook] = useState(null);
  const [playing, setPlaying] = useState(null);
  const bookRestoredRef = useRef(false);
  useEffect(() => {
    if (initialRoute.id !== "book" || bookRestoredRef.current || !areas.length) return;
    bookRestoredRef.current = true;
    const b = areas.flatMap((a) => a.books || []).find((x) => String(x.bookId) === String(initialRoute.st.b));
    if (b && tab === "videos" && !openBook) setOpenBook(b); else if (((window.history.state || {}).pg) === "book") replaceRoute("videos");
  }, [areas]);
  const screenId = (tab === "videos" && openBook) ? "book" : tab;
  useScreenRoute({
    ids: MASTER_ROUTE_IDS, parent: { book: "videos" }, screenId, extra: screenId === "book" ? { b: String(openBook.bookId) } : {},
    apply: (target, st) => {
      setTab(target === "book" ? "videos" : target);
      const b = target === "book" ? areas.flatMap((a) => a.books || []).find((x) => String(x.bookId) === String(st.b)) : null;
      setOpenBook(b || null); setPlaying(null);
    },
  });

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
  // [0818 4차수] 단어 선별 탭 — 같은 마플보카를 "선별 전용"(pick=1)으로 연다.
  // 책을 고르면 학습 홈을 건너뛰고 곧장 유닛 목록이 나온다.
  const vocaPickSrc = `${vocaSrc}&pick=1`;

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
            학생 {students.length}명 · 교재 {bookCount}권 · 강의 {videoCount}개 · {STUDENT_APP_BUILD}{/* [0824 3차수] 차수는 원장만 본다 */}
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
            { key: "voca", label: "단어장" },
            { key: "pick", label: "🎯 단어 선별" },
            { key: "videos", label: "강의 영상" },
            { key: "students", label: "👥 학생" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{minHeight: TAP, 
              flex: "1 0 auto", whiteSpace: "nowrap", padding: "14px 12px", border: "none", cursor: "pointer", background: "transparent",
              fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "#182848" : "#9aa0ab",
              borderBottom: tab === t.key ? "2.5px solid #182848" : "2.5px solid transparent",
              fontFamily: "inherit",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: 16 }}>
        {err && <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 12, fontWeight: 700 }}>⚠️ {err}</div>}

        {tab === "voca" && (
          <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #eceef2" }}>
            <VocaFrame title="원장 단어장" src={vocaSrc} />
          </div>
        )}

        {tab === "pick" && (
          <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #eceef2" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f3f7", fontSize: 12.5, color: "#7b8494", lineHeight: 1.6 }}>
              숙제 TEST에 낼 <b style={{ color: "#2A2A28" }}>어려운 단어</b>를 유닛마다 10개씩 골라둡니다. 안 고른 유닛은 그 유닛에서 아무 단어나 10개가 나갑니다.
            </div>
            <VocaFrame title="단어 선별" src={vocaPickSrc} />
          </div>
        )}

        {tab === "videos" && (loading ? busyBox : openBook ? (
          <div>
            <button onClick={() => { setOpenBook(null); setPlaying(null); }} style={{ minHeight: TAP, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", marginBottom: 12, borderRadius: 9, border: "1px solid #dfe3ef", background: "#fff", color: "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 교재 목록</button>
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
                        <a href={v.url || v.playlistUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", minHeight: TAP, boxSizing: "border-box", background: "#ff0033", color: "#fff", padding: "10px 20px", borderRadius: 9, textDecoration: "none", fontSize: 13.5, fontWeight: 700 }}>▶ 영상 보기</a>
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
