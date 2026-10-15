import { TAP } from "../../theme/tokens.jsx";
import { extractPlaylistId, extractYoutubeId } from "../../domain/videoMatch.jsx";

// [122차수] 선생님 강의 탭 그리기(교재 목록·강의 목록·재생). TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherVideosTab(C) {
  const { areas, busyBox, card, loading, openBook, openVideo, playing, setOpenBook } = C;
  return (
      loading ? busyBox : openBook ? (
          <div>
            <button onClick={() => { openVideo(null); setOpenBook(null); }} style={{ minHeight: TAP, display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", marginBottom: 12, borderRadius: 9, border: "1px solid #dfe3ef", background: "#fff", color: "#555", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 교재 목록</button>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#2A2A28", marginBottom: 3 }}>{openBook.name}</div>
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 14 }}>{openBook.areaLabel}</div>
            {(openBook.videos || []).map((v) => {
              const isOpen = playing === v.id;
              const ytId = v.type === "playlist" ? "" : extractYoutubeId(v.url || "");
              const plId = v.type === "playlist" ? extractPlaylistId(v.playlistUrl || v.url || "") : "";
              return (
                <div key={v.id} style={{ background: "#fff", borderRadius: 14, marginBottom: 10, border: isOpen ? "2px solid #1C66A5" : "2px solid transparent", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                  <div onClick={() => openVideo(v)} style={{ padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
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
            <div style={{ fontSize: 12.5, color: "#999", marginBottom: 12 }}>교재를 누르면 그 안의 강의가 나옵니다. 배정과 상관없이 전 교재가 보입니다.</div>
            {areas.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 13.5 }}>등록된 강의가 없습니다.</div>}
            {areas.map((a) => (
              <div key={a.areaId} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#8b909a", marginBottom: 8, letterSpacing: 0.3 }}>{a.areaLabel}</div>
                {(a.books || []).map((b) => (
                  <button key={b.bookId} onClick={() => { openVideo(null); setOpenBook(b); }} style={card}>
                    <span style={{ fontSize: 17 }}>📘</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: "#2A2A28" }}>{b.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "#1C66A5", background: "#eaf2fb", padding: "3px 8px", borderRadius: 8 }}>{(b.videos || []).length}</span>
                    <span style={{ flexShrink: 0, color: "#c8cdd8", fontSize: 15 }}>›</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )
  );
}
