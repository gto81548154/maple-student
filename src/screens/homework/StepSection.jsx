import { useState } from "react";
import { LESSON_SESSION_COLORS, groupTodoLessonSessionItems } from "../../domain/todo.jsx";
import { HomeworkItem } from "./HomeworkItem.jsx";
import { BADGE_STYLES, UI } from "../../theme/tokens.jsx";

// ─── StepSection: 단계별 카드 (번호 + 라벨 + 배지 + 접기 + notice + 항목) ───
// [105차수] 항목이 있으면 기본 펼침(학생이 접을 수 있고, 날짜가 바뀌면 부모가 key를 바꿔 다시 펼친다). 비어 있으면 "오늘 없음" 한 줄.
//   미완료 필수 항목을 자동으로 감추지 않는다(접힘은 학생이 직접 누를 때만).
export function StepSection({ step, displayNum, stampDate, isChecked, isFailed, getFailReason, studentVideos = [], viewingVideo, toggleVideo }) {
  const { label, badges = [], notice, items } = step;
  const [open, setOpen] = useState(true);
  const hasItems = items.length > 0;
  // [108차수 · 검토 2번] 확인 전·재시·완료를 따로 센다. 재시가 하나라도 있으면 "확인 완료"라고 쓰지 않는다.
  const failN = hasItems ? items.filter(it => isFailed && isFailed(it)).length : 0;
  const doneN = hasItems ? items.filter(it => !(isFailed && isFailed(it)) && isChecked(it)).length : 0;
  const pending = hasItems ? items.length - failN - doneN : 0;
  const foldSummary = [pending > 0 ? `확인할 항목 ${pending}개` : "", failN > 0 ? `재시 ${failN}개` : ""].filter(Boolean).join(" · ") || `${items.length}개 모두 확인 완료`;
  const headId = `step-head-${step.key}`;
  const bodyId = `step-body-${step.key}`;
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, marginBottom: 12, overflow: "hidden" }}>
      {/* 헤더: 번호 + 라벨 + 배지 + (오늘 없음 | 접기 화살표) */}
      <button type="button" id={headId} onClick={() => { if (hasItems) setOpen(o => !o); }} aria-expanded={hasItems ? open : undefined} aria-controls={hasItems ? bodyId : undefined} disabled={!hasItems}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", minHeight: 56, boxSizing: "border-box", border: "none", background: "transparent", cursor: hasItems ? "pointer" : "default", textAlign: "left", fontFamily: "inherit", color: UI.text }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: hasItems ? UI.blue : "#C9D2E0", color: "#fff", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{displayNum}</span>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, flexShrink: 0 }}>{label}</span>
        <span style={{ display: "flex", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
          {badges.map(b => {
            const bs = BADGE_STYLES[b] || { bg: "#eee", fg: "#666" };
            return <span key={b} style={{ background: bs.bg, color: bs.fg, fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap" }}>{b}</span>;
          })}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!hasItems && <span style={{ fontSize: 13, color: UI.dim, fontWeight: 600 }}>오늘 없음</span>}
          {hasItems && !open && <span style={{ fontSize: 12.5, color: UI.sub, fontWeight: 700 }}>{foldSummary}</span>}
          <span aria-hidden="true" style={{ color: hasItems ? UI.sub : "#C9D2E0", fontSize: 12, transform: hasItems && open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
        </span>
      </button>

      {/* 본문 */}
      {hasItems && open && (
        <div id={bodyId} role="region" aria-labelledby={headId} style={{ borderTop: "1px solid #EEF1F5" }}>
          {notice && (
            <div style={{ fontSize: 12.5, color: "#a16207", background: "#fffbeb", padding: "9px 14px", borderBottom: "1px solid #FDF0C8", lineHeight: 1.5 }}>
              <span aria-hidden="true">⚠️ </span>{notice.replace(/^→\s*/, "")}
            </div>
          )}
          {(() => {
            // [112차수] ③오늘 수업을 원장앱에서 1차·2차로 나눴으면 이름 줄을 넣어 칸별로 묶는다(보여 주는 순서만 바뀜, 체크는 그대로)
            const sessGroups = step.key === "step3" ? groupTodoLessonSessionItems(items) : null;
            const renderItem = (item, isLastRow) => (
              <HomeworkItem
                key={item.key || item.legacyKey || `${item.type}_${item.idx}`}
                item={item}
                stampDate={stampDate}
                isLast={isLastRow}
                isCheckedFn={isChecked}
                isFailedFn={isFailed}
                getFailReasonFn={getFailReason}
                studentVideos={studentVideos}
                viewingVideo={viewingVideo}
                toggleVideo={toggleVideo}
              />
            );
            if (!sessGroups) return items.map((item, i) => renderItem(item, i === items.length - 1));
            return sessGroups.map((g, gi) => {
              const col = LESSON_SESSION_COLORS[g.session] || LESSON_SESSION_COLORS[3];
              return (
                <div key={`sess-${g.session}`} role="group" aria-label={`${g.session}차 수업`} data-lesson-group={g.session}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: col.soft, borderLeft: `4px solid ${col.main}`, borderTop: gi ? "1px solid #EEF1F5" : "none" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: col.text }}>{g.session}차 수업</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: UI.sub }}>{g.entries.length}개</span>
                  </div>
                  {g.entries.map((e, k) => renderItem(e.item, k === g.entries.length - 1))}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
