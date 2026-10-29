import { IS_STAFF_VIEW, IS_TEACHER_MODE } from "../../core/auth.jsx";
import { VOCA_TAB_ENABLED } from "../../core/config.jsx";
import { attTag, fmtAttDayParen } from "../../domain/attendance.jsx";
import { DK, fmtDateKR, fmtTime, isToday } from "../../domain/time.jsx";
import { stripBox } from "../../domain/todo.jsx";
import { TASK_VIDEO_DONE_PCT, watchPctOf } from "../../domain/videoMatch.jsx";
import { VOCA_UNIT_WORDS, fmtLecRange, guessVocaBooks, vocaFullLabel, vocaShortLabel } from "../../domain/voca.jsx";
import { UI, TAP } from "../../theme/tokens.jsx";
import { WordSearch } from "./WordSearch.jsx";

// [119차수 · 140차수 토스 스타일 2단계] 홈 탭 그리기 — 시안 C 모양(단, 오늘 숙제가 맨 위).
// 순서: ① 맨 위 큰 한 줄 요약 → ② 단어 검색 → ③ [오늘 숙제] → ④ [지금 폰으로 할 공부] → ⑤ [다음 수업] → ⑥ [시험 정보 · 공지]
export function renderHomeTab(C) {
  const { activeDate, activeSurveys, allDates, attNoticeAll, attWeek, calSub, getFailReason, goTab, hasVocabWrong, isCheckedView, isFailed, nearestExam, picker, pinnedMessages, progressTree, stepGroups, student, studentId, studentVideos, taskVoca, todayStrForTab, unansweredSurveys, videos, vocaHwRec, vocaPassLabel, vocabWarn, watchBySid, wrongCount } = C;
          const step1Items = (stepGroups.find(s => s.key === "step1")?.items) || [];
          // 카드 안 "검사 n/m" = 이 카드의 항목 기준(재시는 분모·분자에서 제외 — 숙제 탭 진행률과 같은 규칙). 5단계 전체 숫자와 섞지 않는다.
          const step1Countable = step1Items.filter(it => !isFailed(it));
          const step1Done = step1Countable.filter(it => isCheckedView(it)).length;
          const dateIsToday = isToday(activeDate);
          const dateIsPast = !dateIsToday && activeDate < todayStrForTab;
          const dateIsFuture = !dateIsToday && activeDate > todayStrForTab;
          const hwCardTitle = dateIsPast ? "지난 숙제" : dateIsFuture ? "다음 숙제" : "오늘 숙제";
          // [0814] 책 이름표는 위쪽 VOCA_BOOK_LABELS 한 곳에서만 가져온다(두 벌로 갈라지지 않게)
          const vocaIds = guessVocaBooks(progressTree, videos);
          // [0813] 단어 줄 제목 = 이 폰에서 마지막으로 연 책(누르면 실제로 열리는 책과 이름이 같게). 기록이 없으면 배정 첫 책, 그것도 없으면 "내 단어장".
          let vocaLastId = "";
          try { vocaLastId = localStorage.getItem("maplevoca_lastbook") || ""; } catch (e) { vocaLastId = ""; }
          const vocaLastName = vocaFullLabel(vocaLastId);
          const vocaTitle = vocaLastName || (vocaIds.length ? (vocaFullLabel(vocaIds[0]) || "내 단어장") : "내 단어장");
          // [94차수 09-05] 단어 줄 상태 3가지 — 학생: 숙제 남음(빨강)·통과(초록) / 선생님 화면: 판정 없음(흰색).
          const hwTodo = !!taskVoca && !vocaHwRec && !IS_STAFF_VIEW;   // [135차수 h] 마스터(원장) 화면에서도 빨간 "숙제" 표시·TEST 시작은 없음(도장은 학생 열쇠가 있어 그대로 보임)
          const hwDone = !!taskVoca && !!vocaHwRec && !IS_TEACHER_MODE;
          const hwStaff = !!taskVoca && !hwDone && IS_STAFF_VIEW;
          const hwRangeText = taskVoca
            ? (taskVoca.ns
                ? `내신 단어 ${fmtLecRange(taskVoca.lessons)}과`                          /* [내신 4차수] */
                : `${vocaShortLabel(taskVoca.book)} ${VOCA_UNIT_WORDS[taskVoca.book] || "DAY"} ${fmtLecRange(taskVoca.lecs)}`)
            : vocaTitle;
          // [106차수] 시작 강의(picker)·최근 강의(lastVideo)는 App 쪽에서 한 번 계산해 홈과 강의 탭이 같이 쓴다
          const openVideosFromRow = () => {
            // [0813-2 원장 지시] 고르기 창 없이 곧바로 강의 탭 — 시작 강의를 펼치고 그 자리까지 내려간다. 못 고르면 전체 목록만.
            if (picker.main) goTab("videos", { videoBook: null, playVideo: picker.main.video });
            else goTab("videos", { videoBook: null });
          };

          // ── [140차수] 맨 위 한 줄 요약 숫자 N 계산 (검사 전 숙제 수 + 폰으로 할 공부 중 안 끝난 수) ──
          const uncheckedHwCount = Math.max(0, step1Countable.length - step1Done);
          const vocaRemaining = (VOCA_TAB_ENABLED && hwTodo) ? 1 : 0;
          const taskVideosList = picker?.tasks || [];
          const videoRemaining = studentVideos.length > 0
            ? (taskVideosList.length > 1
                ? taskVideosList.filter(v => watchPctOf(watchBySid[v.id]) < TASK_VIDEO_DONE_PCT).length
                : (picker?.main?.kind === "task" && watchPctOf(watchBySid[picker.main.video.id]) < TASK_VIDEO_DONE_PCT ? 1 : 0))
            : 0;
          const vocabWrongRemaining = hasVocabWrong ? 1 : 0;
          const totalRemainingN = uncheckedHwCount + vocaRemaining + videoRemaining + vocabWrongRemaining;
          const hasAnyTodayWork = step1Items.length > 0 || !!(VOCA_TAB_ENABLED && taskVoca) || taskVideosList.length > 0 || picker?.main?.kind === "task" || hasVocabWrong;

          // ── 모양 (토스 스타일: 흰 둥근 카드 22px, 테두리·그림자 최소, 남색·초록·보라·회색·경고빨강만) ──
          const GREEN = UI.okFg, GREEN_BG = UI.okBg, PURPLE = "#5B3FB8", PURPLE_BG = "#EFEAFB";
          const card = { background: UI.card, borderRadius: 22, overflow: "hidden" };
          const rowBtn = (extra = {}) => ({ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", minHeight: 60, boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", ...extra });
          const rowIcon = (bg, fg = UI.text) => ({ width: 40, height: 40, borderRadius: 14, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 });
          const pill = (kind) => ({ flexShrink: 0, padding: "8px 14px", minHeight: TAP, borderRadius: 12, fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", boxSizing: "border-box",
            ...(kind === "greenfill" ? { background: GREEN, color: "#fff" }
              : kind === "purplefill" ? { background: PURPLE, color: "#fff" }
              : kind === "red" ? { background: "#fff", color: UI.warnFg, border: `1.5px solid ${UI.warnFg}` }
              : kind === "redfill" ? { background: UI.warnFg, color: "#fff" }
              : { background: UI.bg, color: UI.text }) });
          const statusChip = (st) => {
            const c = st === "done" ? { bg: GREEN_BG, fg: GREEN, t: "검사 완료" } : st === "fail" ? { bg: UI.warnBg, fg: UI.warnFg, t: "재시" } : { bg: UI.bg, fg: UI.sub, t: "검사 전" };
            return <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, padding: "5px 9px", borderRadius: 8, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>{c.t}</span>;
          };
          const docIcon = (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></svg>
          );
          const dateLabel = allDates.length > 0 ? fmtDateKR(activeDate) : fmtDateKR(todayStrForTab);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ① 맨 위 큰 한 줄 요약 (날짜 + "오늘 할 일 N개 남았어요" / 다 했으면 완료 문구) */}
              <div style={{ padding: "4px 4px 2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{dateLabel}</span>
                  {dateIsPast && <span style={{ fontSize: 12, fontWeight: 800, color: UI.warnFg, background: UI.warnBg, borderRadius: 6, padding: "2px 7px" }}>지난 숙제</span>}
                  {dateIsFuture && <span style={{ fontSize: 12, fontWeight: 800, color: PURPLE, background: PURPLE_BG, borderRadius: 6, padding: "2px 7px" }}>다음 숙제</span>}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, letterSpacing: -0.4, lineHeight: 1.3, marginTop: 4, wordBreak: "keep-all" }}>
                  {totalRemainingN > 0 ? (
                    <>오늘 할 일 <span style={{ color: GREEN }}>{totalRemainingN}개</span> 남았어요</>
                  ) : hasAnyTodayWork ? (
                    "오늘 할 일을 다 했어요"
                  ) : (
                    "오늘 등록된 할 일이 없어요"
                  )}
                </div>
              </div>

              {/* ② 단어 검색 */}
              <WordSearch student={student} studentId={studentId} examRanges={C.examRanges} examDdays={C.examDdays} progressTree={progressTree} studentVideos={studentVideos} goTab={goTab} />

              {/* ③ 카드 [오늘 숙제] — 오른쪽 "검사 n/m" 배지, 숙제 목록, [숙제 전체 보기 ›] */}
              <div style={card}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "18px 18px 10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: UI.text, letterSpacing: -0.3, lineHeight: 1.25 }}>{hwCardTitle}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: UI.sub, marginTop: 4 }}>학원에 해 오면 선생님이 검사하고 체크해요</div>
                  </div>
                  {step1Countable.length > 0 && (
                    <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, padding: "6px 11px", borderRadius: 10, background: step1Done === step1Countable.length ? GREEN_BG : PURPLE_BG, color: step1Done === step1Countable.length ? GREEN : PURPLE, whiteSpace: "nowrap" }}>
                      검사 {step1Done}/{step1Countable.length}
                    </span>
                  )}
                </div>
                {allDates.length === 0 ? (
                  <div style={{ padding: "6px 18px 16px", fontSize: 13.5, color: UI.dim, lineHeight: 1.6 }}>등록된 숙제가 아직 없어요<br /><span style={{ fontSize: 12.5 }}>선생님이 숙제를 적으면 여기에 보여요</span></div>
                ) : step1Items.length === 0 ? (
                  <div style={{ padding: "6px 18px 14px", fontSize: 13.5, color: UI.dim, lineHeight: 1.5 }}>이 날짜에 등록된 숙제가 없어요 — 단어 TEST·오늘 수업 등은 아래 [숙제 전체 보기]에서 확인해요</div>
                ) : (
                  <div style={{ padding: "0 18px" }}>
                    {step1Items.map((item, i) => {
                      const st = isFailed(item) ? "fail" : isCheckedView(item) ? "done" : "none";   // [0825 5차수] 앱 단어 자동 완료 포함
                      const reason = st === "fail" && getFailReason ? getFailReason(item) : "";
                      const parts = String(item.text || "").split(/\s*(?:->|→)\s*/);
                      const mainText = stripBox(parts[0] || item.text || "");
                      const badgeText = parts.length >= 2 ? parts.slice(1).join(" → ").trim() : "";
                      return (
                        <div key={item.key || i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${UI.bg}` : "none" }}>
                          <span aria-hidden="true" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: st === "done" ? GREEN_BG : st === "fail" ? UI.warnBg : UI.bg, color: st === "done" ? GREEN : st === "fail" ? UI.warnFg : UI.sub, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{docIcon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.45, color: st === "done" ? UI.dim : UI.text, textDecoration: st === "done" ? "line-through" : "none", wordBreak: "break-word" }}>{mainText}</div>
                            {badgeText && <span style={{ display: "inline-block", marginTop: 5, background: PURPLE_BG, color: PURPLE, fontSize: 12, padding: "3px 9px", borderRadius: 8, fontWeight: 700 }}>{badgeText}</span>}
                            {reason && <div style={{ marginTop: 4, fontSize: 12.5, color: UI.warnFg, lineHeight: 1.4 }}>{reason}</div>}
                          </div>
                          {statusChip(st)}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ padding: "8px 18px 18px" }}>
                  <button type="button" onClick={() => goTab("tasks")}
                    style={{ width: "100%", minHeight: 46, borderRadius: 14, border: "none", background: UI.bg, color: UI.text, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    숙제 전체 보기 ›
                  </button>
                </div>
              </div>

              {/* ④ 카드 [지금 폰으로 할 공부] — 단어 숙제, 숙제 강의 이어보기, 틀린 단어 복습 */}
              <div style={card}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "18px 18px 6px" }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: UI.text, letterSpacing: -0.3 }}>지금 폰으로 할 공부</span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: UI.sub }}>누르면 바로 시작해요</span>
                </div>

                {VOCA_TAB_ENABLED && (
                  <button type="button" onClick={() => goTab("voca")} style={rowBtn()}>
                    <span aria-hidden="true" style={rowIcon(hwTodo ? UI.warnBg : GREEN_BG, hwTodo ? UI.warnFg : GREEN)}>📘</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: hwTodo ? UI.warnFg : UI.text }}>
                        {hwTodo ? "단어 숙제" : hwDone ? "단어 공부" : hwStaff ? "단어 숙제" : "단어 공부"}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: hwTodo ? UI.warnFg : hwDone ? GREEN : UI.sub, fontWeight: (hwTodo || hwDone) ? 700 : 500, lineHeight: 1.4 }}>
                        {hwTodo ? `${hwRangeText} · 아직 안 봄`
                          : hwDone ? `${vocaPassLabel} ✓ · ${vocaTitle}`
                          : hwStaff ? `${hwRangeText} · 확인은 원장앱에서`
                          : vocaTitle}
                      </span>
                    </span>
                    {hwTodo ? (
                      <span style={pill("greenfill")}>숙제 TEST 시작</span>
                    ) : (
                      <span aria-hidden="true" style={{ color: UI.dim, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>
                    )}
                  </button>
                )}

                {studentVideos.length > 0 && (picker.tasks || []).length > 1 ? (
                  picker.tasks.map((v, i) => {
                    // [113차수] 숙제 강의 한 줄 — 시청 기록으로 상태·막대·단추 글자를 정한다. 누르면 그 강의를 강의 탭에서 바로 연다.
                    const pctRaw = watchPctOf(watchBySid[v.id]);
                    const pct = Math.floor(pctRaw);             // 보여 주는 숫자는 내림(79.6% → 79%, 0.4% → 아직 안 봄)
                    const done = pctRaw >= TASK_VIDEO_DONE_PCT;
                    const going = !done && pct >= 1;
                    const total = picker.tasks.length;
                    const title = v.title || v.subject || "강의";
                    const stateText = done ? "다 봤어요 ✓" : going ? `보는 중 ${pct}%` : "아직 안 봤어요";
                    const btnText = done ? "다시 보기" : going ? "이어 보기" : "강의 보기";
                    return (
                      <button key={v.id} type="button" data-task-video={i + 1} onClick={() => goTab("videos", { videoBook: null, playVideo: v })}
                        aria-label={`숙제 강의 ${i + 1}/${total} ${title} · ${stateText} · ${btnText}`}
                        style={rowBtn({ borderTop: (i > 0 || VOCA_TAB_ENABLED) ? `1px solid ${UI.bg}` : "none" })}>
                        <span aria-hidden="true" style={rowIcon(done ? GREEN_BG : PURPLE_BG, done ? GREEN : PURPLE)}>{done ? "✅" : "▶️"}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: done ? GREEN : UI.text }}>숙제 강의 {i + 1}/{total}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: done ? GREEN : going ? PURPLE : UI.sub }}>
                              {stateText}
                            </span>
                          </span>
                          <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: UI.sub, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                          <span aria-hidden="true" style={{ display: "block", height: 5, borderRadius: 3, background: UI.bg, marginTop: 7, overflow: "hidden" }}>
                            <span style={{ display: "block", width: `${pct}%`, height: "100%", borderRadius: 3, background: done ? GREEN : PURPLE }} />
                          </span>
                        </span>
                        <span aria-hidden="true" style={{ color: UI.dim, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>
                      </button>
                    );
                  })
                ) : studentVideos.length > 0 ? (
                  <button type="button" onClick={openVideosFromRow} style={rowBtn({ borderTop: VOCA_TAB_ENABLED ? `1px solid ${UI.bg}` : "none" })}>
                    <span aria-hidden="true" style={rowIcon(PURPLE_BG, PURPLE)}>▶️</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: UI.text }}>{picker.main ? (picker.main.kind === "task" ? "숙제 강의" : "보던 강의 이어보기") : "강의"}</span>
                      {/* [0814] 제목 = 눌렀을 때 실제로 열리는 강의(picker.main)와 같게 */}
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: UI.sub, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {picker.main ? (picker.main.video.title || picker.main.video.subject || "강의") : `강의 ${studentVideos.length}개`}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: UI.dim, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>
                  </button>
                ) : (
                  <div style={{ ...rowBtn({ borderTop: VOCA_TAB_ENABLED ? `1px solid ${UI.bg}` : "none" }), cursor: "default" }} aria-disabled="true">
                    <span aria-hidden="true" style={rowIcon(UI.bg, UI.dim)}>▶️</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: UI.dim }}>강의</span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: UI.dim }}>등록된 강의가 없어요</span>
                    </span>
                  </div>
                )}

                {hasVocabWrong && (
                  <button type="button" onClick={() => goTab("vocabWrong")}
                    style={rowBtn({ borderTop: `1px solid ${UI.bg}` })}>
                    <span aria-hidden="true" style={rowIcon(vocabWarn.overdue > 0 ? UI.warnBg : UI.bg, vocabWarn.overdue > 0 ? UI.warnFg : UI.text)}>{vocabWarn.overdue > 0 ? "❗" : "📝"}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: vocabWarn.overdue > 0 ? UI.warnFg : UI.text }}>
                        {vocabWarn.overdue > 0 ? `단어 시험 틀린 단어 ${vocabWarn.overdue}개 · 기한 지남` : vocabWarn.dueThisWeek > 0 ? `단어 시험 틀린 단어 ${vocabWarn.dueThisWeek}개` : "단어 시험 틀린 단어 복습"}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: vocabWarn.overdue > 0 ? UI.warnFg : UI.sub, fontWeight: (vocabWarn.overdue > 0 || vocabWarn.dueThisWeek > 0) ? 700 : 500, lineHeight: 1.4 }}>
                        {vocabWarn.overdue > 0
                          ? `틀린 단어 ${vocabWarn.overdue}개 · ${vocabWarn.overdueSundayLabel ? `${vocabWarn.overdueSundayLabel}까지였어요` : "기한이 지났어요"}`
                          : vocabWarn.dueThisWeek > 0
                            ? `틀린 단어 ${vocabWarn.dueThisWeek}개 · ${vocabWarn.sundayLabel}까지 (D-${vocabWarn.dday})`
                            : `틀린 단어 ${wrongCount}개`}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: UI.dim, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>
                  </button>
                )}
              </div>

              {/* ⑤ 카드 [다음 수업] — 다음 수업 날·시간 + 일주일 날짜 줄(수업 날 칸에 "수업" 글자) */}
              {(() => {
                const hasAtt = !!(attNoticeAll.today || attNoticeAll.next);
                const todayMonth = new Date().getMonth();
                return (
                  <div style={{ ...card, padding: "16px 18px" }}>
                    <button type="button" onClick={() => goTab("cal")}
                      style={{ width: "100%", minHeight: TAP, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: PURPLE }}>다음 수업 안내</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: UI.text, marginTop: 3, lineHeight: 1.35, wordBreak: "keep-all" }}>
                          {attNoticeAll.today
                            ? `오늘 ${fmtTime(attNoticeAll.today.time)}까지 등원입니다${attTag(attNoticeAll.today)}`
                            : attNoticeAll.next
                              ? `다음 수업은 ${fmtAttDayParen(attNoticeAll.next.dateObj)} ${fmtTime(attNoticeAll.next.time)}입니다${attTag(attNoticeAll.next)}`
                              : calSub}
                        </div>
                        {attNoticeAll.today && attNoticeAll.next && (
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: UI.sub, marginTop: 2 }}>
                            다음 수업 · {fmtAttDayParen(attNoticeAll.next.dateObj)} {fmtTime(attNoticeAll.next.time)}{attTag(attNoticeAll.next)}
                          </div>
                        )}
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: UI.sub, whiteSpace: "nowrap" }}>수업 일정 ›</span>
                    </button>

                    {(hasAtt || attWeek.some((d) => d.attMark?.type === "absent")) && attWeek.length > 0 && (
                      <button type="button" onClick={() => goTab("cal")} aria-label="이번 주 수업 일정 — 누르면 달력이 열려요" data-testid="home-att-week"
                        style={{ minHeight: TAP, width: "100%", display: "flex", alignItems: "stretch", gap: 4, padding: "12px 0 0", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "center", boxSizing: "border-box" }}>
                        {attWeek.map((d) => {
                          const absent = d.attMark?.type === "absent";
                          const cls = !!d.entry;
                          const otherMonth = d.dateObj.getMonth() !== todayMonth;
                          const dayBg = d.isToday ? UI.navy : absent ? UI.warnBg : cls ? PURPLE_BG : UI.bg;
                          const dayFg = d.isToday ? "#fff" : absent ? UI.warnFg : cls ? PURPLE : UI.text;
                          const subFg = d.isToday ? "rgba(255,255,255,0.8)" : absent ? UI.warnFg : cls ? PURPLE : UI.sub;
                          return (
                            <span key={d.date} data-att={cls ? "1" : "0"} data-today={d.isToday ? "1" : "0"}
                              style={{ flex: 1, minWidth: 0, borderRadius: 12, padding: "7px 2px", lineHeight: 1.2, boxSizing: "border-box", background: dayBg }}>
                              <span style={{ display: "block", fontSize: 12, fontWeight: d.isToday || cls ? 800 : 600, color: subFg, whiteSpace: "nowrap" }}>
                                {d.isToday ? "오늘" : DK[d.dateObj.getDay()]}
                              </span>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: dayFg, marginTop: 2, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                                {otherMonth ? `${d.dateObj.getMonth() + 1}/${d.dateObj.getDate()}` : d.dateObj.getDate()}
                              </span>
                              <span style={{ display: "block", fontSize: 12, fontWeight: 800, marginTop: 2, color: absent ? UI.warnFg : cls ? (d.isToday ? "#fff" : PURPLE) : UI.dim, whiteSpace: "nowrap" }}>
                                {absent ? "결석" : cls ? "수업" : "-"}
                              </span>
                            </span>
                          );
                        })}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ⑥ 카드 [시험 정보 · 공지] — 시험 D-day는 여기 한 곳에만. 공지·설문과 학습 진도도 여기 */}
              <div style={card}>
                {[
                  { key: "examInfo", icon: "📋", iconBg: GREEN_BG, label: "시험 정보", count: 0, sub: nearestExam ? `${nearestExam.name} ${nearestExam.ddayLabel}` : "다가오는 시험 없음", tone: nearestExam ? "green" : "" },
                  { key: "notices", icon: "📣", iconBg: UI.bg, label: "공지", count: pinnedMessages.length, sub: unansweredSurveys.length ? `응답할 설문 ${unansweredSurveys.length}개` : (activeSurveys.length ? `설문 ${activeSurveys.length}개 응답 완료` : "새 공지가 없어요"), tone: unansweredSurveys.length ? "warn" : "" },
                  ...((progressTree?.lanes || []).length ? [{ key: "progress", icon: "📈", iconBg: PURPLE_BG, label: "학습 진도", count: 0, sub: "교재별 진행 상황", tone: "" }] : []),
                ].map((r, i) => (
                  <button key={r.key} type="button" onClick={() => goTab(r.key)}
                    style={rowBtn({ minHeight: 56, padding: "12px 18px", borderTop: i ? `1px solid ${UI.bg}` : "none" })}>
                    <span aria-hidden="true" style={rowIcon(r.iconBg)}>{r.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: UI.text, flexShrink: 0 }}>{r.label}</span>
                    {r.count > 0 && <span style={{ flexShrink: 0, minWidth: 22, height: 22, padding: "0 7px", borderRadius: 7, background: PURPLE_BG, color: PURPLE, fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{r.count}</span>}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: r.tone === "warn" ? UI.warnFg : r.tone === "green" ? GREEN : UI.sub, fontWeight: r.tone ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>
                    <span aria-hidden="true" style={{ color: UI.dim, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          );
}
