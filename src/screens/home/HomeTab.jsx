import { IS_STAFF_VIEW, IS_TEACHER_MODE } from "../../core/auth.jsx";
import { VOCA_TAB_ENABLED } from "../../core/config.jsx";
import { attTag, fmtAttDayParen } from "../../domain/attendance.jsx";
import { DK, fmtDateKR, fmtTime, isToday } from "../../domain/time.jsx";
import { stripBox } from "../../domain/todo.jsx";
import { TASK_VIDEO_DONE_PCT, watchPctOf } from "../../domain/videoMatch.jsx";
import { VOCA_UNIT_WORDS, fmtLecRange, guessVocaBooks, vocaFullLabel, vocaShortLabel } from "../../domain/voca.jsx";
import { UI, TAP } from "../../theme/tokens.jsx";
import { WordSearch } from "./WordSearch.jsx";

// [119차수] 홈 탭 그리기 — App.jsx의 `tab === "home"` 덩어리를 그대로 옮긴 것. 값은 App이 묶어 주는 C에서 꺼낸다(동작·모양 그대로).
export function renderHomeTab(C) {
  const { activeDate, activeSurveys, allDates, attNoticeAll, attWeek, calSub, getFailReason, goTab, hasVocabWrong, isCheckedView, isFailed, nearestExam, picker, pinnedMessages, progressTree, stepGroups, student, studentId, studentVideos, taskVoca, todayStrForTab, unansweredSurveys, videos, vocaHwRec, vocaPassLabel, vocabWarn, watchBySid, wrongCount } = C;
          const step1Items = (stepGroups.find(s => s.key === "step1")?.items) || [];
          // 카드 안 "확인 n/m" = 이 카드의 항목 기준(재시는 분모·분자에서 제외 — 숙제 탭 진행률과 같은 규칙). 5단계 전체 숫자와 섞지 않는다.
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
          // ── 모양 ──
          const card = { background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, overflow: "hidden" };
          const secTitle = { fontSize: 19, fontWeight: 800, color: UI.text, letterSpacing: -0.3 };
          const rowBtn = (extra = {}) => ({ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", minHeight: 60, boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", ...extra });
          const rowIcon = (bg) => ({ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 });
          const pill = (kind) => ({ flexShrink: 0, padding: "9px 14px", minHeight: 38, borderRadius: 10, fontSize: 13.5, fontWeight: 800, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
            ...(kind === "fill" ? { background: UI.blue, color: "#fff" }
              : kind === "red" ? { background: "#fff", color: UI.warnFg, border: `1.5px solid ${UI.warnFg}` }
              : kind === "redfill" ? { background: "#C0392B", color: "#fff" }
              : { background: "#fff", color: UI.blue, border: `1.5px solid ${UI.blue}` }) });
          const statusChip = (st) => {
            const c = st === "done" ? { bg: UI.okBg, fg: UI.okFg, t: "확인 완료" } : st === "fail" ? { bg: UI.warnBg, fg: UI.warnFg, t: "재시" } : { bg: "#EEF1F5", fg: "#556072", t: "확인 전" };
            return <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, padding: "5px 9px", borderRadius: 8, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>{c.t}</span>;
          };
          const docIcon = (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></svg>
          );
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* [125차수] 단어 검색 — 홈 맨 위(원장 결정 10-07). 검색 칸 아래는 예전 홈 그대로 */}
              <WordSearch student={student} studentId={studentId} examRanges={C.examRanges} examDdays={C.examDdays} progressTree={progressTree} studentVideos={studentVideos} goTab={goTab} />
              {/* ① 등원 안내 + 가장 가까운 시험 D-Day (둘 다 없으면 이 칸 자체가 없다. 일정이 없으면 시간을 만들어 내지 않는다)
                  [109차수 09-08 · 원장 결정] 칸 하나를 위·아래 둘로: 위 = 연한 파란 줄("다음 수업은 … 5시입니다" / "오늘 5시까지 등원입니다" + D-Day 알약),
                  아래 = 하얀 바탕에 오늘부터 7일 칸(오늘이 늘 맨 왼쪽, 등원하는 날만 연한 파란 칸, 오늘은 "오늘" 글자 + 남색 테두리) + "달력 ›".
                  이유: 캘린더 탭이 없어진 뒤 학생이 이 칸을 눌러야 달력이 열린다는 걸 모를 것 같아서 — 달력이 홈에 조금 보이게 하고 누르는 곳을 글자로 알린다.
                  위 줄 글자와 아래 7일 줄이 각각 goTab("cal")(달력), D-Day 알약은 goTab("examInfo")(시험 정보) — 목적지는 108차수와 같다. */}
              {(attNoticeAll.today || attNoticeAll.next || nearestExam || attWeek.some(d=>d.attMark?.type==="absent")) && (() => {
                const hasAtt = !!(attNoticeAll.today || attNoticeAll.next);
                const todayMonth = new Date().getMonth();
                return (
                  <div style={{ border: "1px solid #C5DCF6", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    {(hasAtt || nearestExam) && (
                    <div style={{ background: "#E8F1FD", padding: hasAtt ? "9px 12px" : "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      {hasAtt ? (
                        <button type="button" onClick={() => goTab("cal")} style={{ minHeight: TAP, flex: 1, minWidth: 0, border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7 }}>
                          <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>📅</span>
                          <span style={{ minWidth: 0 }}>
                            {/* [109차수] "입니다"를 붙인 완성 문장(원장 결정). 보충 꼬리표 " (보충)"는 문장 뒤에 그대로 */}
                            <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#0c447c", lineHeight: 1.35, wordBreak: "keep-all" }}>
                              {attNoticeAll.today
                                ? `오늘 ${fmtTime(attNoticeAll.today.time)}까지 등원입니다${attTag(attNoticeAll.today)}`
                                : `다음 수업은 ${fmtAttDayParen(attNoticeAll.next.dateObj)} ${fmtTime(attNoticeAll.next.time)}입니다${attTag(attNoticeAll.next)}`}
                            </span>
                            {attNoticeAll.today && attNoticeAll.next && (
                              <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#3a72b0", marginTop: 2 }}>다음 수업 · {fmtAttDayParen(attNoticeAll.next.dateObj)} {fmtTime(attNoticeAll.next.time)}{attTag(attNoticeAll.next)}</span>
                            )}
                          </span>
                        </button>
                      ) : <span style={{ flex: 1 }} />}
                      {nearestExam && (
                        <button type="button" onClick={() => goTab("examInfo")} title={`${nearestExam.name} ${nearestExam.ddayLabel}`}
                          style={{ flexShrink: 0, maxWidth: "48%", border: "none", borderRadius: 8, background: "#D6E6FA", color: "#1C4F8A", padding: "6px 10px", minHeight: TAP, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{nearestExam.name}</span>
                          <span style={{ flexShrink: 0, color: nearestExam.ongoing ? "#B8860B" : "#1C4F8A" }}>{nearestExam.ddayLabel}</span>
                        </button>
                      )}
                    </div>
                    )}
                    {/* 아래: 오늘부터 7일. 줄 전체가 단추 하나(달력 열기). 시간표가 아예 없는 학생(hasAtt=false)에게는 이 줄이 없다 */}
                    {(hasAtt || attWeek.some((d) => d.attMark?.type === "absent")) && attWeek.length > 0 && (   /* [124차수] 시간표가 없는 학생에게는 예전처럼 이 줄이 없다(결석이 찍힌 주만 예외) */
                      <button type="button" onClick={() => goTab("cal")} aria-label="이번 주 수업 일정 — 누르면 달력이 열려요" data-testid="home-att-week"
                        style={{ minHeight: TAP, width: "100%", display: "flex", alignItems: "center", gap: 4, padding: "7px 10px 8px", border: "none", borderTop: "1px solid #DCE7F5", background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "center", boxSizing: "border-box" }}>
                        {attWeek.map((d) => {
                          const absent=d.attMark?.type==="absent";
                          const cls = !!d.entry;   // 그날 등원(정규·보충·방학 시간표) — 공휴일·등원 취소는 attEntryForDay가 이미 뺐다
                          const otherMonth = d.dateObj.getMonth() !== todayMonth;   // 달이 바뀌면 "10/1"처럼 달을 같이 적는다
                          return (
                            <span key={d.date} data-att={cls ? "1" : "0"} data-today={d.isToday ? "1" : "0"}
                              style={{ flex: 1, minWidth: 0, borderRadius: 8, padding: "3px 0 4px", lineHeight: 1.15, boxSizing: "border-box",
                                background: absent?"#FDF0EE":cls ? "#E8F1FD" : "#fff", border: `1.5px solid ${d.isToday ? UI.navy : cls ? "#C5DCF6" : UI.line}` }}>
                              <span style={{ display: "block", fontSize: 11, fontWeight: d.isToday ? 800 : 700, color: d.isToday ? UI.navy : cls ? "#3a72b0" : UI.sub, whiteSpace: "nowrap" }}>{d.isToday ? "오늘" : DK[d.dateObj.getDay()]}</span>
                              <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: cls ? "#0c447c" : UI.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{otherMonth ? `${d.dateObj.getMonth() + 1}/${d.dateObj.getDate()}` : d.dateObj.getDate()}</span>
                              {absent&&<span style={{display:"block",fontSize:11,fontWeight:800,color:"#C32E46",marginTop:3}}>결석</span>}
                            </span>
                          );
                        })}
                        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: UI.blue, paddingLeft: 5, whiteSpace: "nowrap" }}>달력 ›</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ② 오늘 할 일 + 지금 보여주는 숙제 날짜 (오늘이 아니면 지난/다음 표시 — 원장 결정 0813 유지) */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                <span style={secTitle}>오늘 할 일</span>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: UI.sub, whiteSpace: "nowrap" }}>
                  {allDates.length > 0 ? fmtDateKR(activeDate) : fmtDateKR(todayStrForTab)}
                  {dateIsPast && <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 800, color: UI.warnFg, background: UI.warnBg, borderRadius: 6, padding: "1px 6px" }}>지난 숙제</span>}
                  {dateIsFuture && <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 800, color: "#0c5a9e", background: "#e8f2fc", borderRadius: 6, padding: "1px 6px" }}>다음 숙제</span>}
                </span>
              </div>

              {/* ③ 숙제 카드 — 1단계 항목을 원래 순서대로 전부. 항목 텍스트는 원문 그대로(화살표 뒤는 설명 배지, 단추 아님) */}
              <div style={card}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px 10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: UI.text, letterSpacing: -0.3, lineHeight: 1.2 }}>{hwCardTitle}</div>
                    <div style={{ fontSize: 12.5, color: UI.sub, marginTop: 4 }}>선생님 확인 기준</div>
                  </div>
                  {step1Countable.length > 0 && (
                    <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800, padding: "7px 11px", borderRadius: 9, background: step1Done === step1Countable.length ? UI.okBg : UI.blueBg, color: step1Done === step1Countable.length ? UI.okFg : "#1C4F8A", whiteSpace: "nowrap" }}>
                      확인 {step1Done}/{step1Countable.length}
                    </span>
                  )}
                </div>
                {allDates.length === 0 ? (
                  <div style={{ padding: "6px 16px 18px", fontSize: 13.5, color: UI.dim, lineHeight: 1.6 }}>등록된 숙제가 아직 없어요<br /><span style={{ fontSize: 12.5 }}>선생님이 숙제를 적으면 여기에 보여요</span></div>
                ) : step1Items.length === 0 ? (
                  <div style={{ padding: "6px 16px 14px", fontSize: 13.5, color: UI.dim }}>이 날짜에 등록된 숙제가 없어요 — 단어 TEST·오늘 수업 등은 아래 [숙제 전체 보기]에서</div>
                ) : (
                  <div style={{ padding: "0 16px" }}>
                    {step1Items.map((item, i) => {
                      const st = isFailed(item) ? "fail" : isCheckedView(item) ? "done" : "none";   // [0825 5차수] 앱 단어 자동 완료 포함
                      const reason = st === "fail" && getFailReason ? getFailReason(item) : "";
                      const parts = String(item.text || "").split(/\s*(?:->|→)\s*/);
                      const mainText = stripBox(parts[0] || item.text || "");
                      const badgeText = parts.length >= 2 ? parts.slice(1).join(" → ").trim() : "";
                      return (
                        <div key={item.key || i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderTop: i ? "1px solid #EEF1F5" : "none" }}>
                          <span aria-hidden="true" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: st === "done" ? UI.okBg : st === "fail" ? UI.warnBg : "#F1F3F7", color: st === "done" ? UI.okFg : st === "fail" ? UI.warnFg : "#5A6478", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{docIcon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.45, color: st === "done" ? "#5A6478" : UI.text, wordBreak: "break-word" }}>{mainText}</div>
                            {badgeText && <span style={{ display: "inline-block", marginTop: 5, background: UI.blueBg, color: UI.blue, fontSize: 11.5, padding: "3px 9px", borderRadius: 8, fontWeight: 700 }}>{badgeText}</span>}
                            {reason && <div style={{ marginTop: 4, fontSize: 12.5, color: "#b3564c", lineHeight: 1.4 }}>{reason}</div>}
                          </div>
                          {statusChip(st)}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ padding: "6px 16px 16px" }}>
                  <button type="button" onClick={() => goTab("tasks")}
                    style={{ width: "100%", minHeight: 48, borderRadius: 12, border: "1.5px solid #C5DCF6", background: "#EEF3FC", color: "#1C4F8A", fontSize: 15.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    숙제 전체 보기 →
                  </button>
                </div>
              </div>

              {/* ④ 이어서 할 공부 — 단어 / 강의 / 오답 세 줄. 줄 전체가 단추 하나(단추 안에 단추 없음). 오답 경고는 여기 한 번만
                  [113차수] 숙제 강의가 2개 이상이면 강의 줄을 강의마다 한 줄씩(1/3·2/3·3/3 + 본 만큼 막대). 1개거나 없으면 예전 한 줄 그대로 */}
              <div style={{ ...secTitle, marginTop: 4 }}>이어서 할 공부</div>
              <div style={card}>
                {VOCA_TAB_ENABLED && (
                  <button type="button" onClick={() => goTab("voca")}
                    style={rowBtn({ background: hwTodo ? UI.warnBg : hwDone ? UI.okBg : "transparent" })}>
                    <span aria-hidden="true" style={rowIcon(hwTodo ? "#FBD5D0" : hwDone ? "#CDEBD9" : UI.blueBg)}>📘</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: hwTodo ? UI.warnFg : hwDone ? "#14603f" : UI.text }}>
                        {hwTodo ? "단어 숙제" : hwDone ? "단어 공부" : hwStaff ? "단어 숙제" : "단어 공부"}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: hwTodo ? "#c0655c" : hwDone ? "#3e8f66" : UI.sub, fontWeight: (hwTodo || hwDone) ? 700 : 500, lineHeight: 1.4 }}>
                        {hwTodo ? `${hwRangeText} · 아직 안 봄`
                          : hwDone ? `${vocaPassLabel} ✓ · ${vocaTitle}`
                          : hwStaff ? `${hwRangeText} · 확인은 원장앱에서`
                          : vocaTitle}
                      </span>
                    </span>
                    <span style={pill(hwTodo ? "redfill" : hwDone ? "outline" : "fill")}>{hwTodo ? "숙제 TEST 시작" : hwDone ? "단어 공부" : hwStaff ? "단어장" : "공부하기"}</span>
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
                        style={rowBtn({ borderTop: (i > 0 || VOCA_TAB_ENABLED) ? "1px solid #EEF1F5" : "none", background: done ? UI.okBg : "transparent" })}>
                        <span aria-hidden="true" style={rowIcon(done ? "#D3EEDD" : UI.blueBg)}>{done ? "✅" : "▶️"}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 15.5, fontWeight: 800, color: done ? "#14603f" : UI.text }}>숙제 강의 {i + 1}/{total}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
                              background: done ? "#D3EEDD" : going ? UI.blueBg : "#EEF1F5", color: done ? UI.okFg : going ? UI.blue : "#556072" }}>
                              {stateText}
                            </span>
                          </span>
                          <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: done ? UI.okFg : UI.sub, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                          <span aria-hidden="true" style={{ display: "block", height: 5, borderRadius: 3, background: "#E4E8EF", marginTop: 7, overflow: "hidden" }}>
                            <span style={{ display: "block", width: `${pct}%`, height: "100%", borderRadius: 3, background: done ? UI.okFg : UI.blue }} />
                          </span>
                        </span>
                        <span style={pill(going ? "fill" : "outline")}>{btnText}</span>
                      </button>
                    );
                  })
                ) : studentVideos.length > 0 ? (
                  <button type="button" onClick={openVideosFromRow} style={rowBtn({ borderTop: VOCA_TAB_ENABLED ? "1px solid #EEF1F5" : "none" })}>
                    <span aria-hidden="true" style={rowIcon(UI.blueBg)}>▶️</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: UI.text }}>{picker.main ? (picker.main.kind === "task" ? "숙제 강의" : "보던 강의 이어보기") : "강의"}</span>
                      {/* [0814] 제목 = 눌렀을 때 실제로 열리는 강의(picker.main)와 같게 */}
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: UI.sub, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {picker.main ? (picker.main.video.title || picker.main.video.subject || "강의") : `강의 ${studentVideos.length}개`}
                      </span>
                    </span>
                    <span style={pill("outline")}>강의 보기</span>
                  </button>
                ) : (
                  <div style={{ ...rowBtn({ borderTop: VOCA_TAB_ENABLED ? "1px solid #EEF1F5" : "none" }), cursor: "default" }} aria-disabled="true">
                    <span aria-hidden="true" style={rowIcon("#F1F3F7")}>▶️</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: UI.dim }}>강의</span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: UI.dim }}>등록된 강의가 없어요</span>
                    </span>
                  </div>
                )}
                {hasVocabWrong && (
                  <button type="button" onClick={() => goTab("vocabWrong")}
                    style={rowBtn({ borderTop: "1px solid #EEF1F5", background: vocabWarn.overdue > 0 ? UI.warnBg : "transparent" })}>
                    <span aria-hidden="true" style={rowIcon(vocabWarn.overdue > 0 ? "#FBD5D0" : "#FFF3D6")}>{vocabWarn.overdue > 0 ? "❗" : "📝"}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: vocabWarn.overdue > 0 ? UI.warnFg : UI.text }}>
                        {vocabWarn.overdue > 0 ? `기한 지난 오답 ${vocabWarn.overdue}개` : vocabWarn.dueThisWeek > 0 ? `이번 주 복습 단어 ${vocabWarn.dueThisWeek}개` : "오답 복습"}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, marginTop: 2, color: vocabWarn.overdue > 0 ? "#c0655c" : UI.sub, fontWeight: vocabWarn.overdue > 0 ? 700 : 500, lineHeight: 1.4 }}>
                        {vocabWarn.overdue > 0 ? `남은 단어 ${wrongCount}개를 복습해요${vocabWarn.dueThisWeek > 0 ? ` · 이번 주 마감 ${vocabWarn.dueThisWeek}개` : ""}`
                          : vocabWarn.dueThisWeek > 0 ? `${vocabWarn.sundayLabel}까지 (D-${vocabWarn.dday}) · 남은 단어 ${wrongCount}개`
                          : `남은 단어 ${wrongCount}개`}
                      </span>
                    </span>
                    <span style={pill(vocabWarn.overdue > 0 ? "red" : "outline")}>복습하기</span>
                  </button>
                )}
              </div>

              {/* ⑤ 공지·설문 / 시험 정보 / 수업 일정(109차수) / 학습 진도 — 서로 다른 목적지는 따로 한 줄씩(계획서 6절) */}
              <div style={card}>
                {[
                  { key: "notices", icon: "📣", label: "공지", count: pinnedMessages.length, sub: unansweredSurveys.length ? `응답할 설문 ${unansweredSurveys.length}개` : (activeSurveys.length ? `설문 ${activeSurveys.length}개 응답 완료` : ""), tone: unansweredSurveys.length ? "warn" : "" },
                  { key: "examInfo", icon: "📋", label: "시험 정보", count: 0, sub: nearestExam ? `${nearestExam.name} ${nearestExam.ddayLabel}` : "다가오는 시험 없음", tone: "" },
                  // [109차수 09-08 · 원장 결정] 달력 가는 길을 하나 더 — 더보기 → 수업 일정과 같은 곳. 설명 줄(calSub)도 더보기와 같은 글자
                  { key: "cal", icon: "📅", label: "수업 일정", count: 0, sub: calSub, tone: "" },
                  ...((progressTree?.lanes || []).length ? [{ key: "progress", icon: "📈", label: "학습 진도", count: 0, sub: "교재별 진행 상황", tone: "" }] : []),
                ].map((r, i) => (
                  <button key={r.key} type="button" onClick={() => goTab(r.key)}
                    style={rowBtn({ minHeight: 52, padding: "11px 14px", borderTop: i ? "1px solid #EEF1F5" : "none" })}>
                    <span aria-hidden="true" style={{ fontSize: 18, width: 26, textAlign: "center", flexShrink: 0 }}>{r.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: UI.text, flexShrink: 0 }}>{r.label}</span>
                    {r.count > 0 && <span style={{ flexShrink: 0, minWidth: 22, height: 22, padding: "0 7px", borderRadius: 7, background: UI.blueBg, color: UI.blue, fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{r.count}</span>}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: r.tone === "warn" ? UI.warnFg : UI.sub, fontWeight: r.tone ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>
                    <span aria-hidden="true" style={{ color: "#B4BCC9", fontSize: 18, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          );
}
