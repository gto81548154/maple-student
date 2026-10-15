import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { MAX_W, TAB_BAR_H, TAP, UI } from "../theme/tokens.jsx";

// ═══ [103차수 09-08 디자인 개편] 학생 화면 공통 틀 — 머리글 · 위 탭 5개 · 더보기 ═══
// 계획서(01_IMPLEMENTATION_PLAN.md) 4·5·10절. 선생님 홈(TeacherHome)·마스터 홈(MasterHome)은 이 틀을 쓰지 않는다.
// 머리글: 1행 = MP 마플영어 / 출석 QR, 2행 = 이름 / 학교·학년 / 새로고침(↻)+동기화 시각. 아바타·시험·공지·설문은 더보기로 이사.
export function StudentHeader({ innerRef, student, attToken, onQr, refreshing, onRefresh, lastLoadedAt, syncSource }) {
  const schoolLine = [student?.school, student?.grade].filter(Boolean).join(" ");
  return (
    <div ref={innerRef} style={{ background: UI.navy, padding: "14px 16px 12px", color: "#fff" }}>
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 20, border: "2px solid rgba(255,255,255,0.65)", borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: -0.5, flexShrink: 0 }}>MP</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>마플영어</span>
          {/* [마스터·교사] 남의 화면에서 출석 QR을 띄워 잘못 찍히는 일이 없도록 숨긴다(원본 규칙 그대로). */}
          {IS_STAFF_VIEW ? (
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>출석 QR 숨김</span>
          ) : !attToken ? (
            <span style={{ marginLeft: "auto", flexShrink: 0, whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, color: "rgba(255,214,120,0.95)" }}>QR 없음 — 선생님께 문의</span>
          ) : (
            <button type="button" onClick={onQr} aria-label="출석 QR 열기"
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px", minHeight: TAP, borderRadius: 10, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block" }}><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h3v3h-3v-3zm5 0h3v3h-3v-3zm-5 5h3v3h-3v-3zm5 0h3v3h-3v-3z"/></svg> 출석 QR
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 8, rowGap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.25, wordBreak: "keep-all" }}>{student?.name || ""}</span>
            {schoolLine && <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", lineHeight: 1.3, wordBreak: "keep-all" }}>{schoolLine}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="다시 받기"
              title={lastLoadedAt ? `마지막 동기화: ${lastLoadedAt.toLocaleTimeString()}${syncSource ? ` · ${syncSource}` : ""}` : "새로고침"}
              style={{ width: TAP, height: TAP, borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: refreshing ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)", color: "#fff", cursor: refreshing ? "default" : "pointer", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: refreshing ? 0.65 : 1, fontFamily: "inherit" }}>
              {refreshing ? "…" : "↻"}
            </button>
            {lastLoadedAt && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 3, whiteSpace: "nowrap" }}>
                {syncSource === "local-backup"
                  ? <span style={{ color: "#ffd678" }}>옛 저장본</span>   /* [98차수] 서버에서 못 받고 폰 저장본을 쓰는 중 */
                  : `${lastLoadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 동기화`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// 위 탭 5개(홈·숙제·단어·강의·더보기) — 같은 폭, 붙박이(sticky). 옆으로 미는 방식은 없앴다(계획서 4절).
//   alert = 단어 숙제가 남아 있을 때 "단어" 칸을 빨갛게(0825 8차수 원장 결정 그대로).
export function StudentTabBar({ tabs, activeKey, onPick }) {
  return (
    <div style={{ background: "#fff", borderBottom: `1px solid ${UI.line}`, position: "sticky", top: 0, zIndex: 10 }}>
      <div role="tablist" aria-label="메뉴" style={{ maxWidth: MAX_W, margin: "0 auto", display: "flex", height: TAB_BAR_H, boxSizing: "border-box" }}>
        {tabs.map((t) => {
          const on = activeKey === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onPick(t.key)}
              style={{
                flex: "1 1 0", minWidth: 0, whiteSpace: "nowrap", textAlign: "center", padding: "0 2px", border: "none", cursor: "pointer", fontFamily: "inherit",
                background: t.alert ? UI.warnBg : "transparent", fontSize: 15,
                fontWeight: t.alert ? 800 : on ? 800 : 600,
                color: t.alert ? UI.warnFg : on ? UI.navy : UI.dim,
                borderBottom: on ? (t.alert ? `2.5px solid ${UI.warnFg}` : `2.5px solid ${UI.navy}`) : "2.5px solid transparent",
                boxSizing: "border-box", lineHeight: 1,
              }}>{t.label}</button>
          );
        })}
      </div>
    </div>
  );
}
// 더보기 목록 — 작은 아이콘 + 제목 + 짧은 설명 + 오른쪽 화살표 (계획서 10절). 항목 내용은 App이 실제 데이터로 만들어 넘긴다.
export function MoreMenu({ groups, onPick }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: UI.text, margin: "2px 0 8px" }}>더보기</div>
      {groups.map((g) => (
        <div key={g.title}>
          <div style={{ fontSize: 12, fontWeight: 800, color: UI.sub, margin: "14px 2px 6px" }}>{g.title}</div>
          <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, overflow: "hidden" }}>
            {g.items.map((it, i) => (
              <button key={it.key} type="button" onClick={() => onPick(it.key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 52, boxSizing: "border-box", border: "none", borderTop: i ? "1px solid #EEF1F5" : "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: UI.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{it.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: UI.text }}>{it.title}</span>
                  {it.sub && <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: it.subTone === "warn" ? UI.warnFg : it.subTone === "ok" ? UI.okFg : UI.sub, fontWeight: it.subTone ? 700 : 500, lineHeight: 1.4 }}>{it.sub}</span>}
                </span>
                <span aria-hidden="true" style={{ color: "#B4BCC9", fontSize: 18, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
// 더보기 하위 화면의 공용 틀 — 위에 "‹ 더보기" 되돌아가기 + 제목. 안에는 기존 화면(달력·오답·모의고사·진도 등)을 그대로 넣는다.
export function MoreSubFrame({ title, onBack, children }) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: "4px 6px 4px 2px", minHeight: TAP, fontSize: 14, fontWeight: 700, color: UI.blue, cursor: "pointer", fontFamily: "inherit" }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>‹</span> 더보기
      </button>
      {title && <div style={{ fontSize: 20, fontWeight: 800, color: UI.text, margin: "2px 0 12px" }}>{title}</div>}
      {children}
    </div>
  );
}
