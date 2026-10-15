import { useState } from "react";
import { getExamRangeTextForStudent, getStudentSchoolCodeForRange, normalizeExamRangeSlot } from "../../domain/examRange.jsx";
import { TAP } from "../../theme/tokens.jsx";

export function StudentExamRangeCard({ student, items, examRanges, defaultOpen = null }) {
  // [수정 07-31] 평소에는 접어두고, 시험이 일주일 안으로 들어오면 저절로 펼쳐지게.
  // null = 학생이 아직 안 눌렀다는 뜻(위 StudentExamDdaySection과 같은 방식).
  // [103차수] defaultOpen — 더보기 → 시험 정보 화면처럼 학생이 일부러 들어온 곳에서는 처음부터 펼쳐 둔다(true).
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen === null ? (defaultOpen === null ? isExamSoon(items) : !!defaultOpen) : userOpen;
  const naesin = (items || []).find(x => x && x.type === "내신") || null;
  const code = getStudentSchoolCodeForRange(student || {});
  const info = naesin ? getExamRangeTextForStudent(examRanges, code, { name: naesin.name, date: naesin.start, kind: naesin.kind, semester: naesin.semester }) : null;
  if (!info) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 12, padding: "6px 14px", marginBottom: 12 }}>
      <button type="button" onClick={() => setUserOpen(!open)} aria-expanded={open} style={{ width: "100%", minHeight: TAP, border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: "inherit" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2 }}>📋 이번 시험 범위</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{code} · {info.slot}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#34d399", flexShrink: 0 }}>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (() => {
        const nv = normalizeExamRangeSlot(info.value);
        const rows = nv.rows.filter(r => String(r.bookLabel || r.bookKey || "").trim() || String(r.range || "").trim() || String(r.memo || "").trim());
        if (rows.length === 0 && !nv.legacyText.trim()) {
          // 방어: value가 비정상이어도 텍스트 fallback으로 항상 내용은 보인다
          return <div style={{ marginTop: 4, marginBottom: 6, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.75, color: "rgba(255,255,255,0.92)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{info.text}</div>;
        }
        return <div style={{ marginTop: 4, marginBottom: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r, i) => (
            <div key={r.id || i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "9px 12px", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#6ee7b7" }}>{String(r.bookLabel || r.bookKey || "교재")}</span>
              {String(r.range || "").trim() && <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>{r.range}</span>}
              {String(r.memo || "").trim() && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>— {r.memo}</span>}
            </div>
          ))}
          {nv.legacyText.trim() && <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "9px 12px", fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{nv.legacyText}</div>}
        </div>;
      })()}
    </div>
  );
}
// [수정 07-31] 앱을 켜면 위쪽에 배너·시험·경고·설문이 쌓여 정작 숙제가 첫 화면에 안 보였다.
// 그래서 이 칸을 평소에는 한 줄로 접어두고, 시험이 일주일 안으로 들어오면 자동으로 펼친다.
// ※ 시험이 하나도 없으면 예전처럼 칸 자체가 안 나온다(아래 return null).
//    단, useState는 "칸이 안 나오는 경우"보다 반드시 위에 있어야 한다.
//    (React 규칙 — 화면을 그리다 말고 중간에 useState 개수가 달라지면 앱이 하얗게 죽는다.
//     시험이 없다가 새로고침으로 생기는 경우가 실제로 있으므로 이 순서가 중요하다.)
const isExamSoon = (list) => (list || []).some(
  (x) => x && (x.ongoing || (typeof x.diff === "number" && x.diff >= 0 && x.diff <= 7))
);
export function StudentExamDdaySection({ items, defaultOpen = null }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const examSoon = isExamSoon(list);
  // null = 학생이 아직 한 번도 안 눌렀다는 뜻. 그동안은 시험이 가까운지에 따라 저절로 열린다.
  // 한 번 누른 뒤로는 학생이 고른 상태를 그대로 지킨다(앱이 멋대로 다시 펼치지 않는다).
  // [103차수] defaultOpen — 더보기 → 시험 정보 화면에서는 처음부터 펼쳐 둔다(true).
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen === null ? (defaultOpen === null ? examSoon : !!defaultOpen) : userOpen;
  if (list.length === 0) return null;

  // [수정 07-30] 예전에는 "내신 1 · 모의 1"이 글자로 박혀 있어 실제 개수와 무관하게 늘 같았다.
  const mockCnt = list.filter((x) => x.type === "모의고사").length;
  const naesinCnt = list.length - mockCnt;
  const countParts = [];
  if (naesinCnt > 0) countParts.push(`내신 ${naesinCnt}`);
  if (mockCnt > 0) countParts.push(`모의 ${mockCnt}`);
  const countText = countParts.join(" · ");

  // 접었을 때 한 줄 요약에 쓸 "가장 가까운 시험" (시험 기간 중이면 그게 0순위)
  const rank = (x) => (typeof x.diff === "number" ? Math.max(x.diff, 0) : 99999);
  const nearest = list.reduce((a, b) => (rank(b) < rank(a) ? b : a));
  const nearestAccent = nearest.type === "모의고사" ? "#a78bfa" : "#34d399";
  const nearestDdayColor = nearest.ddayLabel === "영어 끝"
    ? "rgba(255,255,255,0.45)" : nearest.ongoing ? "#fde68a" : nearestAccent;

  return (
    <div style={{
      background: "rgba(255,255,255,0.035)",
      borderRadius: 12,
      padding: "6px 14px",
      marginBottom: 12,
    }}>
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        style={{
          width: "100%", minHeight: TAP, border: "none", background: "transparent", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, textAlign: "left", fontFamily: "inherit",
          marginBottom: open ? 4 : 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2, flexShrink: 0 }}>
          다가오는 시험
        </span>
        {open ? (
          <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>{countText}</span>
        ) : (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nearest.name}
            <span style={{ color: nearestDdayColor, marginLeft: 6 }}>{nearest.ddayLabel}</span>
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#34d399", flexShrink: 0 }}>
          {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>
      {open && (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 6 }}>
        {list.map(item => {
          const isMock = item.type === "모의고사";
          const accent = isMock ? "#a78bfa" : "#34d399";
          const ddayColor = item.ddayLabel === "영어 끝" ? "rgba(255,255,255,0.45)" : item.ongoing ? "#fde68a" : accent;
          const showEngBadge = item.isEngTarget && item.ddayLabel !== "영어 끝";
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              borderLeft: `2px solid ${accent}`,
              padding: "8px 0 8px 11px",
              minWidth: 0,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: accent,
                flexShrink: 0, letterSpacing: 0.3,
              }}>
                {item.type}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#fff",
                flex: 1, minWidth: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                letterSpacing: -0.2,
              }}>
                {item.name}
              </span>
              {showEngBadge && (
                <span style={{
                  fontSize: 11, fontWeight: 800, color: accent,
                  border: `1px solid ${accent}55`, borderRadius: 6,
                  padding: "1px 5px", flexShrink: 0, letterSpacing: 0.3,
                }} title="영어시험일 기준 D-day">영어</span>
              )}
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,0.5)",
                flexShrink: 0,
              }}>
                {item.dateLabel}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 800, color: ddayColor,
                flexShrink: 0, minWidth: 48, textAlign: "right",
                letterSpacing: -0.3,
              }}>
                {item.ddayLabel}
              </span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
