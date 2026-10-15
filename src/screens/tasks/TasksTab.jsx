import { fmtDateKR, isToday } from "../../domain/time.jsx";
import { UI } from "../../theme/tokens.jsx";
import { StepSection } from "../homework/StepSection.jsx";

// [119차수] 숙제 탭 그리기 — App.jsx의 `tab === "tasks"` 덩어리를 그대로 옮긴 것(동작·모양 그대로).
export function renderTasksTab(C) {
  const { activeDate, allDates, doneTasks, getFailReason, isCheckedView, isFailed, pct, setSelectedDate, stepGroups, studentVideos, todayStrForTab, todoRevealHeld, toggleVideo, totalTasks, viewingVideo } = C;
          const dateIsToday = isToday(activeDate);
          const dateIsPast = !dateIsToday && activeDate < todayStrForTab;
          const titleWord = allDates.length === 0 ? "숙제와 수업" : dateIsToday ? "오늘의 숙제와 수업" : dateIsPast ? "지난 숙제와 수업" : "다음 숙제와 수업";
          const pillLabel = (d) => { const q = String(d).split("-"); const md = q.length === 3 ? `${Number(q[1])}월 ${Number(q[2])}일` : d; return isToday(d) ? `${md} · 오늘` : md; };
          return (
            <>
              {allDates.length > 0 && (
                <div role="tablist" aria-label="숙제 날짜" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 12, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                  {allDates.map((d) => {
                    const on = d === activeDate;
                    return (
                      <button key={d} type="button" role="tab" aria-selected={on} onClick={() => setSelectedDate(d)} style={{
                        flex: "1 0 auto", minHeight: 44, padding: "9px 16px", borderRadius: 999, border: on ? `1.5px solid ${UI.navy}` : `1.5px solid ${UI.line}`,
                        cursor: "pointer", fontSize: 14, fontWeight: on ? 800 : 600, fontFamily: "inherit",
                        background: on ? UI.navy : "#fff", color: on ? "#fff" : UI.sub, whiteSpace: "nowrap",
                      }}>{pillLabel(d)}</button>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 20, fontWeight: 800, color: UI.text, letterSpacing: -0.3 }}>{titleWord}</div>
              {allDates.length > 0 && (
                <div style={{ fontSize: 14, color: UI.sub, marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{fmtDateKR(activeDate)}</span>
                  {/* [0813] 오늘이 아닌 날짜를 보여줄 때는 지난/다음 표시로 헷갈림 방지 — 원장 결정 */}
                  {dateIsPast && <span style={{ fontSize: 11, fontWeight: 800, color: UI.warnFg, background: UI.warnBg, borderRadius: 6, padding: "1px 6px" }}>지난 숙제</span>}
                  {!dateIsToday && !dateIsPast && <span style={{ fontSize: 11, fontWeight: 800, color: "#0c5a9e", background: "#e8f2fc", borderRadius: 6, padding: "1px 6px" }}>다음 숙제</span>}
                </div>
              )}
              {/* 선생님 확인 현황 — 원본 진행률(재시 항목은 분모·분자 제외, 앱 단어 자동 완료 포함). [추가 07-30] 학생은 체크할 수 없다는 안내 유지 */}
              {allDates.length > 0 && totalTasks > 0 && (
                <div style={{ margin: "14px 0 6px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: UI.text }}>선생님 확인 현황</span>
                    <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: pct === 100 ? UI.okFg : UI.text, fontVariantNumeric: "tabular-nums" }}>{doneTasks}/{totalTasks}</span>
                  </div>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={totalTasks} aria-valuenow={doneTasks} aria-label="선생님 확인 현황"
                    style={{ height: 8, borderRadius: 4, background: "#E4E8EF", overflow: "hidden", marginTop: 8 }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct === 100 ? "#00b894" : UI.blue, transition: "width .3s" }} />
                  </div>
                </div>
              )}
              {allDates.length > 0 && (
                <div style={{ fontSize: 12.5, color: UI.sub, margin: totalTasks > 0 ? "0 0 14px" : "8px 0 14px", lineHeight: 1.5 }}>체크와 통과 도장은 조교 선생님이 찍어줘요</div>
              )}

              {/* 5단계 카드. key에 날짜를 넣어 날짜를 바꾸면 접힘 상태가 새로 시작된다(새 날짜 내용을 바로 보게).
                  [94차수 09-05] 투두가 하나도 없는 학생(allDates 빈 목록)에게는 다섯 칸 대신 아래 안내만 */}
              {allDates.length > 0 && stepGroups.map((step, idx) => (
                <StepSection
                  key={`${step.key}:${activeDate}`}
                  step={step}
                  displayNum={idx + 1}
                  stampDate={(() => { const q = String(activeDate || "").split("-"); return q.length === 3 ? `${Number(q[1])}/${Number(q[2])}` : ""; })()}
                  isChecked={isCheckedView}
                  isFailed={isFailed}
                  getFailReason={getFailReason}
                  studentVideos={studentVideos}
                  viewingVideo={viewingVideo}
                  toggleVideo={toggleVideo}
                />
              ))}
              {/* [0825 4차수] 밤 10시 공개 안내 — 수업날 낮에는 다음 숙제가 안 보이는 이유를 알려준다 (시안대로 맨 아래 한 줄) */}
              {allDates.length > 0 && todoRevealHeld && (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: UI.sub, textAlign: "center", padding: "4px 0 8px" }}>다음 숙제는 오늘 밤 10시에 열려요</div>
              )}

              {allDates.length === 0 && (
                <div style={{ textAlign: "center", padding: "50px 20px", color: UI.dim }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: UI.sub }}>등록된 과제가 아직 없어요</div>
                  <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>선생님이 숙제를 적으면 여기에 보여요</div>
                </div>
              )}
            </>
          );
}
