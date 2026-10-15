import { collectTaskVideoIds } from "../../domain/videoMatch.jsx";
import { UI, TAP } from "../../theme/tokens.jsx";
import { TrackedYoutubePlayer } from "../video/TrackedYoutubePlayer.jsx";

// [119차수] 강의 탭 그리기 — App.jsx의 `tab === "videos"` 덩어리를 그대로 옮긴 것(동작·모양 그대로).
export function renderVideosTab(C) {
  const { allTaskItems, lastVideoSaveStatus, pendingVideoCount, scrollToVideoCard, selectedVideoBook, setSelectedVideoBook, studentVideos, toggleVideo, videosFeaturedId, viewingVideo } = C;
          // ─── 교재별 분류(원본 규칙) ───
          const videoGroups = {};
          studentVideos.forEach(v => {
            const key = v.subject || "기타";
            if (!videoGroups[key]) videoGroups[key] = [];
            videoGroups[key].push(v);
          });
          const bookNames = Object.keys(videoGroups);
          const hasMultipleBooks = bookNames.length >= 2;
          const ALL_KEY = "__all__";
          // 활성 책: 학생이 고른 책 우선(전체 포함). 선택값이 없을 때만 현재 재생 중인 영상의 책, 그것도 없으면 첫 책.
          let activeBook = null;
          if (hasMultipleBooks) {
            const viewingVideoBook = viewingVideo ? (viewingVideo.subject || "기타") : null;
            if (selectedVideoBook === ALL_KEY) activeBook = ALL_KEY;
            else if (selectedVideoBook && videoGroups[selectedVideoBook]) activeBook = selectedVideoBook;
            else if (viewingVideoBook && videoGroups[viewingVideoBook]) activeBook = viewingVideoBook;
            else activeBook = bookNames[0];
          }
          const visibleVideos = !hasMultipleBooks ? studentVideos : activeBook === ALL_KEY ? studentVideos : (videoGroups[activeBook] || []);
          // ─── 대표 강의 = 홈과 같은 규칙(buildVideoPickerV2: 오늘 숙제 "수강" 강의 → 없으면 최근 본 강의) ───
          // [108차수] 대표 강의 = 탭에 들어올 때 고정한 영상(videosFeaturedId). 시청 기록이 바뀌어도 여기서는 다시 계산하지 않는다.
          const taskIds = collectTaskVideoIds(allTaskItems, studentVideos);   // "오늘 숙제" 배지는 실제 매칭에만
          const featured = videosFeaturedId ? (studentVideos.find(v => v.id === videosFeaturedId) || null) : null;
          const featuredKind = featured ? (taskIds.has(featured.id) ? "task" : "resume") : "";
          const featuredOpen = !!featured && viewingVideo?.id === featured.id;
          const playerFor = (v) => (
            v.type === "playlist" && v.playlistUrl ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}><TrackedYoutubePlayer video={v} /></div>
            ) : v.url && v.url.includes("youtu") ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}><TrackedYoutubePlayer video={v} /></div>
            ) : (
              <div style={{ background: "#f5f5f5", borderRadius: 10, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <a href={v.url} target="_blank" rel="noreferrer" style={{ background: "#ff0033", color: "#fff", padding: "10px 24px", minHeight: TAP, display: "inline-flex", alignItems: "center", boxSizing: "border-box", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>▶ 영상 보기</a>
              </div>
            )
          );
          const card = { background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, overflow: "hidden" };
          const saveBox = (pendingVideoCount > 0 || lastVideoSaveStatus) ? (
            <div role="status" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: pendingVideoCount > 0 ? "#fff7ed" : UI.okBg, border: pendingVideoCount > 0 ? "1px solid #fed7aa" : "1px solid #BFE5CE", color: pendingVideoCount > 0 ? "#c2410c" : UI.okFg, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
              {pendingVideoCount > 0 ? `영상 기록 저장 대기 ${pendingVideoCount}개 · 인터넷 연결 후 자동 재전송됩니다.` : lastVideoSaveStatus}
            </div>
          ) : null;
          return (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: UI.text, letterSpacing: -0.3 }}>강의</div>
            <div style={{ fontSize: 13.5, color: UI.sub, marginTop: 4 }}>{featured ? "오늘 볼 강의부터 확인하세요" : "교재별 강의를 확인하세요"}</div>

            {/* 대표 강의 카드 */}
            {featured && (
              <div id={"video-card-" + featured.id} style={{ ...card, marginTop: 12, border: featuredOpen ? `2px solid ${UI.blue}` : card.border }}>
                <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  {featuredKind === "task"
                    ? <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 8, background: UI.blue, color: "#fff" }}>오늘 숙제</span>
                    : <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 8, background: UI.blueBg, color: UI.blue }}>이전에 보던 강의</span>}
                  {featured.subject && <span style={{ marginLeft: "auto", fontSize: 12.5, color: UI.sub, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{featured.subject}</span>}
                </div>
                <div style={{ padding: "10px 16px 0", fontSize: 19, fontWeight: 800, color: UI.text, lineHeight: 1.35, letterSpacing: -0.3, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{featured.title || "강의"}</div>
                <div style={{ padding: "12px 16px 0" }}>
                  {featuredOpen ? playerFor(featured) : (
                    <button type="button" onClick={() => toggleVideo(featured)} aria-label={`${featured.title || "강의"} 열기`}
                      style={{ minHeight: TAP, width: "100%", aspectRatio: "16/9", borderRadius: 12, border: "none", background: UI.navy, color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span aria-hidden="true" style={{ width: 58, height: 58, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>▶</span>
                      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{featured.type === "playlist" ? "재생목록 열기" : "강의 열기"}</span>
                    </button>
                  )}
                </div>
                <div style={{ padding: "10px 16px 14px", fontSize: 12.5, color: UI.sub, textAlign: "center" }}>
                  {featuredOpen ? "플레이어의 재생 버튼을 누르면 실제 재생시간만 기록돼요" : "열어서 재생 버튼을 누르면 시청 시간이 기록돼요"}
                </div>
              </div>
            )}
            {saveBox}

            {/* 교재별 강의 */}
            <div style={{ fontSize: 17, fontWeight: 800, color: UI.text, margin: "20px 0 10px" }}>교재별 강의</div>
            {hasMultipleBooks && (
              <div role="tablist" aria-label="교재" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 8, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                {[...bookNames, ALL_KEY].map(bn => {
                  const isActive = bn === activeBook;
                  const label = bn === ALL_KEY ? "전체" : bn;
                  const count = bn === ALL_KEY ? studentVideos.length : videoGroups[bn].length;
                  return (
                    <button key={bn} type="button" role="tab" aria-selected={isActive} onClick={() => setSelectedVideoBook(bn)} style={{
                      flexShrink: 0, minHeight: TAP, padding: "8px 14px", borderRadius: 999,
                      border: isActive ? `1.5px solid ${UI.navy}` : `1.5px solid ${UI.line}`,
                      background: isActive ? UI.navy : "#fff", color: isActive ? "#fff" : UI.sub,
                      fontSize: 13.5, fontWeight: isActive ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
                    }}>
                      {label} <span style={{ fontSize: 11.5, opacity: 0.85, marginLeft: 2 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={card}>
              {visibleVideos.map((v, i) => {
                const isOpen = viewingVideo?.id === v.id;
                const isFeatured = !!featured && v.id === featured.id;
                const inCardAbove = isOpen && isFeatured;                  // 위 대표 카드에서 재생 중 — 여기엔 플레이어를 또 만들지 않는다
                const isTask = taskIds.has(v.id);
                const isPl = v.type === "playlist";
                return (
                  <div key={v.id} id={isFeatured ? undefined : "video-card-" + v.id} style={{ borderTop: i ? "1px solid #EEF1F5" : "none", background: isOpen && !inCardAbove ? "#F7FAFF" : "transparent" }}>
                    <button type="button" aria-expanded={isOpen}
                      onClick={() => { if (inCardAbove) { scrollToVideoCard(v.id); return; } toggleVideo(v); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 64, boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: isOpen ? UI.navy : UI.blueBg, color: isOpen ? "#fff" : UI.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isPl ? 20 : 16 }}>{isPl ? "📋" : "▶"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15.5, fontWeight: 700, color: UI.text, lineHeight: 1.4, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{v.title}</span>
                          {isTask && <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: UI.blueBg, color: UI.blue, border: `1px solid #C5DCF6`, whiteSpace: "nowrap" }}>오늘 숙제</span>}
                        </span>
                        <span style={{ display: "block", fontSize: 12.5, color: UI.sub, marginTop: 3 }}>
                          {isPl ? "재생목록 전체 보기 · 교재의 강의를 순서대로 확인해요" : (v.subject || "")}
                          {inCardAbove && <span style={{ color: UI.blue, fontWeight: 700 }}> · 위 카드에서 재생 중</span>}
                        </span>
                      </span>
                      <span aria-hidden="true" style={{ color: isOpen ? UI.blue : "#B4BCC9", fontSize: 18, flexShrink: 0, transform: isOpen && !inCardAbove ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
                    </button>
                    {/* 펼쳐진 영상 (인라인) — 대표 카드에서 재생 중인 영상은 여기서 그리지 않는다 */}
                    {isOpen && !inCardAbove && (
                      <div style={{ padding: "0 14px 14px" }}>{playerFor(v)}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12.5, color: UI.dim, marginTop: 10, textAlign: "center" }}>강의를 누른 뒤 재생 버튼을 눌러야 실제 재생시간이 기록됩니다.{hasMultipleBooks && activeBook !== ALL_KEY ? ` (${activeBook}: ${visibleVideos.length}개)` : ""}</div>
          </div>
          );
}
