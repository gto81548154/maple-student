import { useState } from "react";
import { getVideoShortLabel, matchVideosForTask } from "../../domain/videoMatch.jsx";
import { TrackedYoutubePlayer } from "../video/TrackedYoutubePlayer.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";

// ─── HomeworkItem: 숙제 항목 한 줄 (영상 매칭 + 인라인 플레이어 + 폴백) ───
// [105차수 09-08 디자인 개편] 시안 images/02-homework.png — 체크박스 모양 대신 오른쪽 상태 배지(확인 완료 / 확인 전 / 재시).
//   · 원문은 그대로. "->" / "→" 뒤는 예전처럼 설명 배지(단추 아님 — 계획서 3·7절).
//   · 통과 도장은 "확인 완료" 배지 + 작은 "통과 M/D"로 정돈(뜻·날짜 유지). 재시는 배지 + 사유 줄.
//   · 강의는 실제 매칭(matchVideosForTask)된 것에만 "연결 강의 보기" 단추 — 여러 개면 전부. "다른 강의 보기" 폴백·인라인 플레이어는 그대로.
export function HomeworkItem({ item, stampDate, isLast, isCheckedFn, isFailedFn, getFailReasonFn, studentVideos, viewingVideo, toggleVideo }) {
  const [showAll, setShowAll] = useState(false);
  const done = isCheckedFn(item);
  const fail = isFailedFn ? isFailedFn(item) : false;
  const failReason = fail && getFailReasonFn ? getFailReasonFn(item) : "";

  const { hasKeyword, matched, bookCandidates } = matchVideosForTask(item.text, studentVideos);
  const hasMatch = matched.length > 0;
  const showFallback = hasKeyword && bookCandidates.length > 0 && !!toggleVideo;
  const showVideoButtons = hasMatch && !!toggleVideo;

  // 현재 펼쳐진 영상 (matched 또는 폴백 펼침 모두 포함)
  const openVideo = matched.find(v => viewingVideo?.id === v.id) || bookCandidates.find(v => viewingVideo?.id === v.id) || null;
  const isAnyOpen = !!openVideo;

  // 폴백 라벨용 책 이름 (보통 1개 책만 매칭됨)
  const bookSubject = bookCandidates[0]?.subject || matched[0]?.subject || "";

  // "->" 또는 "→" 화살표 뒤의 부분을 설명 배지로 분리 (예: "...채점·고치기 -> 틀린 문제 피드백")
  const arrowSplit = String(item.text || "").split(/\s*(?:->|→)\s*/);
  const hasBadge = arrowSplit.length >= 2 && arrowSplit[0].trim() && arrowSplit.slice(1).join("").trim();
  const mainText = hasBadge ? arrowSplit[0].trim() : item.text;
  const badgeText = hasBadge ? arrowSplit.slice(1).join(" → ").trim() : "";

  const st = fail ? "fail" : done ? "done" : "none";
  const chip = st === "done" ? { bg: UI.okBg, fg: UI.okFg, t: "확인 완료" } : st === "fail" ? { bg: UI.warnBg, fg: UI.warnFg, t: "재시" } : { bg: "#EEF1F5", fg: "#556072", t: "확인 전" };
  // [135차수 c] 같은 이름표가 둘 이상이면 "(1)·(2)"를 붙여 구별한다
  const labelOf = (() => {
    const seenId = new Set(); const all = [...matched, ...bookCandidates].filter((v) => !seenId.has(v.id) && seenId.add(v.id));   // 같은 강의가 두 목록에 다 있으니 id 로 한 번만
    const cnt = {}; const seen = {}; const map = {};
    all.forEach((v) => { const l = getVideoShortLabel(v); cnt[l] = (cnt[l] || 0) + 1; });
    all.forEach((v) => { if (map[v.id]) return; const l = getVideoShortLabel(v); if (cnt[l] > 1) { seen[l] = (seen[l] || 0) + 1; map[v.id] = `${l} (${seen[l]})`; } else map[v.id] = l; });
    return (v) => map[v.id] || getVideoShortLabel(v);
  })();
  const playBtn = (v, small = false) => {
    const isOpen = viewingVideo?.id === v.id;
    const isMatched = matched.some(m => m.id === v.id);
    return (
      <button key={v.id} type="button" onClick={(e) => { e.stopPropagation(); toggleVideo(v); }} aria-pressed={isOpen}
        style={{
          padding: small ? "8px 12px" : "9px 13px", minHeight: TAP, borderRadius: 10,
          border: isOpen ? `1.5px solid ${UI.blue}` : small && isMatched ? "1px solid #fde047" : `1.5px solid ${isMatched || !small ? "#C5DCF6" : UI.line}`,
          background: isOpen ? UI.blueBg : small && isMatched ? "#fef9c3" : "#fff",
          color: isOpen ? UI.blue : small && isMatched ? "#854d0e" : small ? UI.sub : UI.blue,
          fontSize: small ? 12 : 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
        }}>
        <span aria-hidden="true" style={{ fontSize: 11 }}>{isOpen ? "▼" : "▶"}</span>
        {!small && matched.length === 1 ? `연결 강의 보기 · ${labelOf(v)}` : labelOf(v)}
      </button>
    );
  };

  return (
    <div style={{ borderBottom: !isLast ? "1px solid #EEF1F5" : "none", background: "#fff" }}>
      {/* [136차수] 아래에 "다른 강의 보기"(높이 44)가 붙는 줄은 아래 여백을 줄인다 — 강의 단추와 그 글 사이가 한 줄쯤 떠 보였음 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: showFallback && hasMatch ? "13px 14px 3px" : "13px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.45, color: st === "done" ? "#5A6478" : UI.text, wordBreak: "break-word" }}>{mainText}</div>
          {badgeText && <span style={{ display: "inline-block", marginTop: 5, background: UI.blueBg, color: UI.blue, fontSize: 11.5, padding: "3px 9px", borderRadius: 8, fontWeight: 700 }}>{badgeText}</span>}
          {/* 미완료 사유 (fail이고 사유가 있을 때만) */}
          {fail && failReason && <div style={{ marginTop: 4, fontSize: 12.5, color: "#b3564c", lineHeight: 1.4 }}>{failReason}</div>}
          {/* 매칭된 영상 단추들: 실제 매칭이 있을 때만. 여러 개면 전부 고를 수 있다 */}
          {showVideoButtons && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {matched.map(v => playBtn(v))}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 800, padding: "5px 9px", borderRadius: 8, background: chip.bg, color: chip.fg, whiteSpace: "nowrap" }}>{chip.t}</span>
          {/* [도장] 조교가 원장앱에서 체크 완료한 항목 = "통과" 도장(날짜) — 학생은 직접 체크 불가, 도장은 조교 서명 */}
          {done && stampDate && <span aria-label={`통과 ${stampDate}`} style={{ fontSize: 11, fontWeight: 800, color: UI.okFg, letterSpacing: 0.3 }}>통과 {stampDate}</span>}
        </div>
      </div>

      {/* 폴백 안내/버튼: 매칭이 있어도 작은 링크로 항상 노출 (숫자 잘못 입력 안전망) */}
      {showFallback && (hasMatch ? (
        <div style={{ padding: "0 14px 4px", textAlign: "right" }}>
          <button type="button" onClick={() => setShowAll(s => !s)} aria-expanded={showAll} style={{ border: "none", background: "transparent", color: UI.dim, fontSize: 12.5, padding: "4px 0 4px 10px", minHeight: TAP, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
            다른 강의 보기 {showAll ? "▴" : "▾"}
          </button>
        </div>
      ) : (
        <div style={{ padding: "0 14px 12px" }}>
          <div style={{ fontSize: 12, color: UI.dim, marginBottom: 6 }}>매칭되는 강의를 못 찾았어요. 직접 찾아보세요:</div>
          <button type="button" onClick={() => setShowAll(s => !s)} aria-expanded={showAll} style={{ border: `1px solid ${UI.line}`, background: "#f9fafb", color: "#374151", fontSize: 12.5, padding: "8px 12px", minHeight: TAP, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
            {bookSubject} 전체 강의 {showAll ? "닫기 ▴" : `보기 ▾ (${bookCandidates.length})`}
          </button>
        </div>
      ))}

      {/* 폴백 펼침: 책의 모든 영상 단추 (매칭됐던 영상은 노란 배경으로 강조) */}
      {showFallback && showAll && (
        <div style={{ padding: "0 14px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {bookCandidates.map(v => playBtn(v, true))}
        </div>
      )}

      {/* 인라인 영상 플레이어 — 이 항목에서 고른 영상 하나만 */}
      {isAnyOpen && (() => {
        const v = openVideo;
        return (
          <div style={{ padding: "0 14px 14px", background: "#fafbff" }}>
            {v.type === "playlist" && v.playlistUrl ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                <TrackedYoutubePlayer video={v} />
              </div>
            ) : v.url && v.url.includes("youtu") ? (
              <div style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", background: "#000" }}>
                <TrackedYoutubePlayer video={v} />
              </div>
            ) : (
              <div style={{ background: "#f5f5f5", borderRadius: 10, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <a href={v.url} target="_blank" rel="noreferrer" style={{ background: "#ff0033", color: "#fff", padding: "10px 24px", minHeight: TAP, display: "inline-flex", alignItems: "center", boxSizing: "border-box", borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>▶ 영상 보기</a>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
