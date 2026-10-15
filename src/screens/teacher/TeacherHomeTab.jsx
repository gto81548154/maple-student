import { computeTeacherDayRoster, teacherWorkOn } from "../../domain/teacher.jsx";
import { HOLIDAYS } from "../../data/holidays.jsx";
import { fmtDateKR, fmtDateShort, fmtTime, shiftYmd } from "../../domain/time.jsx";
import { fmtClock, parseToeicId, toeicDoneCount, toeicNextLc, toeicP5Stats } from "../../domain/toeic.jsx";
import { fmtLecRange } from "../../domain/voca.jsx";

// [122차수] 선생님 홈 탭 그리기(출근·오늘 할 일·단어 숙제·바로가기). TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherHomeTab(C) {
  const { cardBox, cardMain, cardSub, home, isWorkday, roster, session, setBriefDay, setDateStr, setTab, setToeicMode, setToeicPick, setVocaMode, setVocaTask, startTeacherHwTest, teacher, today, todoRow, toeic, setNsOpen } = C;
          // [135차수 f] 휴원일(공휴일 + 학원 휴원)은 출근일로 세지 않는다 — 오늘이 휴원이면 "휴원"으로, 다음 출근도 휴원일을 건너뛴다
          const allHol = { ...HOLIDAYS, ...((roster && roster.holidays) || {}) };
          const todayHolRaw = allHol[today];
          const todayHol = todayHolRaw ? (typeof todayHolRaw === "string" ? todayHolRaw : (todayHolRaw.name || "휴원")) : "";
          const workRaw = teacherWorkOn(teacher, today);
          const work = (todayHol && !(workRaw && workRaw.kind === "추가")) ? null : workRaw;   // 휴원일에 일부러 넣은 "추가 근무"는 살린다
          // 다음 출근일 — 오늘 이후 30일 안에서 처음 걸리는 날
          let nextWork = null;
          for (let i = 1; i <= 30 && !nextWork; i++) {
            const d = shiftYmd(today, i);
            const w = teacherWorkOn(teacher, d);
            if (allHol[d] && !(w && w.kind === "추가")) continue;
            if (w) nextWork = { date: d, ...w };
          }
          const todayRoll = computeTeacherDayRoster(roster?.students || [], roster?.makeups || [], today);
          const todos = [
            ...(session?.sections?.always || []).map(x => ({ ...x, sec: "always" })),
            ...(session?.sections?.today || []).map(x => ({ ...x, sec: "today" })),
          ];
          const doneCount = todos.filter(x => x.done).length;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* 출근 안내 띠 — 학생 홈의 등원 안내와 같은 자리·같은 모양 */}
              {work ? (
                <div style={{ background: "#e8f1fd", border: "1px solid #c5dcf6", borderRadius: 14, padding: "12px 15px" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0c447c", lineHeight: 1.4 }}>
                    오늘은 {work.time ? `${fmtTime(work.time)}까지 ` : ""}출근입니다
                    {work.kind === "추가" && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "#B45309", background: "#FEF3E7", borderRadius: 999, padding: "2px 8px" }}>추가 근무</span>}
                  </div>
                  {nextWork && (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#3a72b0", marginTop: 4 }}>
                      다음 출근 · {fmtDateShort(nextWork.date)} {nextWork.time ? fmtTime(nextWork.time) : ""}
                    </div>
                  )}
                </div>
              ) : nextWork ? (
                <div style={{ background: "#fff", border: "1px solid #e8eaef", borderRadius: 14, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "#5c6470", lineHeight: 1.4 }}>
                  {todayHol ? `오늘은 휴원일입니다(${todayHol})` : "오늘은 근무일이 아닙니다"} · 다음 출근은 {fmtDateShort(nextWork.date)} {nextWork.time ? fmtTime(nextWork.time) : ""}입니다
                </div>
              ) : null}

              {/* 1. 오늘 할일 — 홈에서 바로 체크한다 */}
              <div style={{ ...cardBox, cursor: "default" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: todos.length ? 10 : 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#e84393" }}>1. 오늘 할일</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9aa0ab", fontWeight: 600 }}>
                    {todos.length ? `${doneCount}/${todos.length} 완료` : fmtDateKR(today)}
                  </span>
                </div>
                {!isWorkday ? (
                  <div style={{ fontSize: 13, color: "#9aa0ab", lineHeight: 1.6, paddingTop: 8 }}>오늘은 근무일이 아니라 할일 카드가 없습니다.</div>
                ) : todos.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#9aa0ab", lineHeight: 1.6, paddingTop: 8 }}>아직 등록된 할일이 없습니다.</div>
                ) : (
                  <>
                    {todos.map(it => todoRow(it.sec, it))}
                    <div style={{ fontSize: 11, color: "#b6bcc6", fontWeight: 600, marginTop: 2 }}>할일은 원장님이 적습니다. 여기서는 다 한 것을 체크만 합니다.</div>
                  </>
                )}
              </div>

              {/* 2. 숙제단어 — [선별 78차수] 원장이 정한 방식에 따라 "단어 선별"이거나 "단어 시험"이다.
                   선별이 기본. 누르면 선별은 [단어 선별] 탭으로, 시험은 예전처럼 숙제 TEST로 간다. */}
              {home?.hw ? (() => {
                const hw = home.hw;
                const isPick = hw.mode === "pick";
                const goal = hw.pickGoal || 10;
                const units = Array.isArray(hw.range) ? hw.range : [];
                // [81차수 08-31] "칸 완료" = 그 칸에 선별본이 저장돼 있다(저장 자체가 목표를 다 채워야만 된다).
                //   10개 고정 기준이면 단어 10개 미만 유닛(min(10, 단어수)만 골라 저장)이 영영 미완료로 남았다.
                const doneCnt = units.filter(u => ((hw.picked || {})[String(u)] || 0) > 0).length;
                const stamp = hw.done ? (hw.done.late ? "늦게 완료" : "완료") : "";
                return (
                <button onClick={() => {
                  if (isPick) { setVocaTask(null); setVocaMode("pick"); setTab("voca"); }
                  else { startTeacherHwTest(); setVocaMode("study"); setTab("voca"); }
                }} style={cardBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>2. {isPick ? "단어 선별" : "단어 시험"}</span>
                    {stamp && <span style={{ fontSize: 11, fontWeight: 800, color: "#0f766e", background: "#ecfdf5", padding: "2px 8px", borderRadius: 999 }}>{stamp}</span>}
                    {hw.atEnd && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "#c2410c", background: "#fff7ed", padding: "2px 8px", borderRadius: 999 }}>책 끝</span>}
                  </div>
                  <div style={cardMain}>{hw.title}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#7c3aed", letterSpacing: -0.3, marginTop: 5 }}>{hw.unit} {fmtLecRange(units)}</div>
                  {isPick && (
                    <div style={{ marginTop: 7 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {units.map(u => {
                          const got = (hw.picked || {})[String(u)] || 0;
                          const full = got > 0;   // [81차수] 저장돼 있으면 다 고른 것(10개 미만 유닛 대응)
                          return <span key={u} title={hw.unit + " " + u + " · " + got + "개"}
                            style={{ flex: 1, height: 7, borderRadius: 999, background: full ? "#7c3aed" : (got ? "#ddd6fe" : "#eceef4") }} />;
                        })}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginTop: 6 }}>
                        {doneCnt}/{units.length}칸 완료 · 칸마다 {goal}개씩 고르기
                      </div>
                    </div>
                  )}
                  <div style={cardSub}>{isPick
                    ? (hw.pickDone ? "오늘 몫을 다 골랐어요 · 눌러서 확인 ›" : "눌러서 단어 고르기 ›")
                    : "눌러서 숙제 TEST 시작 ›"}</div>
                </button>);
              })() : (
                <div style={{ ...cardBox, cursor: "default" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>2. 숙제단어</div>
                  <div style={{ fontSize: 13, color: "#9aa0ab", marginTop: 7, lineHeight: 1.6 }}>지금은 받은 단어 숙제가 없습니다.<br />원장님이 계정관리에서 책을 정해 주시면 여기에 뜹니다.</div>
                </div>
              )}

              {/* 3. 오늘 수업 학생 — [16차수 원장 지시] 명단이 아니라 요약 화면으로 간다 */}
              <button onClick={() => { setDateStr(today); setBriefDay(today); }} style={cardBox}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#1C66A5" }}>3. 오늘 수업</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9aa0ab", fontWeight: 600 }}>{fmtDateKR(today)}</span>
                </div>
                <div style={{ ...cardMain, fontSize: 13.5, fontWeight: 700, lineHeight: 1.55 }}>
                  {todayRoll.length
                    ? todayRoll.slice(0, 6).map(r => r.student.name).join(" · ") + (todayRoll.length > 6 ? " …" : "")
                    : "오늘 수업하는 학생이 없습니다"}
                </div>
                {todayRoll.length > 0 && <div style={cardSub}>눌러서 오늘 수업 요약 보기 ›</div>}
              </button>

              {/* 4. 전 교재 강의 — [16차수 원장 지시] 제목을 바꾸고 개수 줄은 없앴다 */}
              <button onClick={() => setTab("videos")} style={cardBox}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#00997a" }}>4. 전 교재 강의</div>
                <div style={{ ...cardMain, fontSize: 13.5, fontWeight: 700 }}>학생들이 보는 강의 그대로 볼 수 있습니다 ›</div>
              </button>

              {/* 5. 내신 단어 올리기 — [127차수 원장 결정 10-12] 조교쌤·원장 모두. 앱용 단어 파일을 올리면 학생 앱에 바로 보인다 */}
              <button onClick={() => setNsOpen(true)} style={cardBox} data-testid="ns-upload-card">
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6a4bc4" }}>5. 내신 단어 올리기</div>
                <div style={{ ...cardMain, fontSize: 13.5, fontWeight: 700 }}>앱용 단어 파일을 올리면 학생 앱에 바로 보입니다 ›</div>
              </button>

              {/* 6. 토익 LC — [115차수] 원장만. 다음에 풀 회차를 누르면 토익 탭에서 바로 열린다. [127차수] 번호 5 → 6 */}
              {home?.isOwner && (() => {
                const nextId = toeicNextLc(toeic.tests);
                const p = parseToeicId(nextId) || { v: 3, nn: "01" };
                const r = toeic.tests[nextId] || {};
                const doneN = toeicDoneCount(toeic.tests, p.v, "lc");
                return (
                  <button onClick={() => { setToeicPick(nextId); setToeicMode("tests"); setTab("toeic"); }} style={cardBox}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#6b3fa0" }}>6. 토익 LC</div>
                    <div style={{ ...cardMain, fontSize: 14, fontWeight: 800 }}>다음에 풀 것: {p.v}권 TEST {p.nn}</div>
                    <div style={{ height: 6, background: "#eceef2", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ width: `${doneN * 10}%`, height: "100%", background: "#6b3fa0" }} />
                    </div>
                    <div style={cardSub}>{p.v}권 {doneN}/10회{Number(r.sec) > 5 ? ` · ${fmtClock(r.sec)}까지 들음` : ""} · 눌러서 바로 듣기 ›</div>
                  </button>
                );
              })()}

              {/* 7. 파트5 5문제 — [116차수] 원장만. 짬짬이 5문제. [127차수] 번호 6 → 7 */}
              {home?.isOwner && (() => {
                const st = toeicP5Stats(toeic.p5);
                return (
                  <button onClick={() => { setToeicMode("p5"); setTab("toeic"); }} style={cardBox}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#1f7a4d" }}>7. 토익 파트5</div>
                    <div style={{ ...cardMain, fontSize: 14, fontWeight: 800 }}>짬짬이 5문제 풀기</div>
                    <div style={cardSub}>푼 문제 {st.done} / 1200{st.wrongNow ? ` · 다시 볼 문제 ${st.wrongNow}개` : ""} · 눌러서 시작 ›</div>
                  </button>
                );
              })()}
            </div>
          );
}
