import { IS_TEACHER_MODE } from "../../core/auth.jsx";
import { VOCA_APP_URL, WORKER_ORIGIN } from "../../core/config.jsx";
import { getNaesinVocaParams } from "../../domain/examRange.jsx";
import { guessVocaBooks } from "../../domain/voca.jsx";
import { TAB_BAR_H, UI } from "../../theme/tokens.jsx";
import { VocaFrame } from "./VocaFrame.jsx";

// [119차수] 단어 탭 그리기 — App.jsx의 `tab === "voca"` 덩어리를 그대로 옮긴 것(동작·모양 그대로).
export function renderVocaTab(C) {
  const { examDdays, examRanges, progressTree, setVocaHwTask, setVocaOpenLast, setVocaOpenTask, student, studentId, studentVideos, taskVoca, vocaExtraBook, vocaHwBusyRef, vocaHwRec, vocaHwTask, vocaOpenLast, vocaOpenTask, vocaPassLabel } = C;
          // ─── [단어 TEST] 마플보카 임베드 ───
          // 학생 링크의 id/t 를 그대로 넘겨 이름표(학생 식별)와 학원 서버 저장을 자동 연결한다.
          // books= 는 진도/영상 교재명에서 추정한 이 학생의 단어장 목록 (없으면 전체 표시).
          const sp = new URLSearchParams(window.location.search);
          const books = guessVocaBooks(progressTree, studentVideos);
          // [0813] 숙제에 적힌 단어장이 추정 목록에 없으면 책장에 같이 보여준다(범위 열기가 막히지 않게)
          // [135차수 n] 추정 목록이 비어 있으면(= 전체 표시) 건드리지 않는다 — 전에는 숙제 책 한 권만 남아 책장이 그 한 권이 됐다
          if (taskVoca && taskVoca.book && books.length && !books.includes(taskVoca.book)) books.push(taskVoca.book);   // [내신 4차수] 내신은 책 id가 없다
          // [125차수] 홈 단어 검색으로 연 책도 책장에 같이 보여 준다. 목록이 비어 있으면(=전체 표시) 건드리지 않는다. 내신 책은 마플보카가 학교표로 따로 올린다.
          if (vocaExtraBook && books.length && !books.includes(vocaExtraBook) && !/^nsx?_/.test(vocaExtraBook)) books.push(vocaExtraBook);
          const q = new URLSearchParams();
          q.set("id", String(studentId || sp.get("id") || ""));
          if (sp.get("t")) q.set("t", sp.get("t"));
          if (student?.name) q.set("n", student.name);
          if (WORKER_ORIGIN) q.set("api", WORKER_ORIGIN);
          if (books.length) q.set("books", books.join(","));
          const nsp = getNaesinVocaParams(student, examRanges, examDdays);   // [내신 4차수] 내 학교·이번 시험범위
          if (nsp.sc) q.set("sc", nsp.sc);
          if (nsp.nsl.length) q.set("nsl", nsp.nsl.join(","));
          if (nsp.year && nsp.exam) { q.set("nsy", String(nsp.year)); q.set("nse", nsp.exam); }   // [128차수] 지금 준비하는 시험 — 올린 내신 단어 중 이 시험 것을 먼저 보여 준다
          const src = `${VOCA_APP_URL}?${q.toString()}`;
          // [107차수 09-08] 통과 안내 = 부모가 이미 아는 확실한 도장(vocaHwRec)으로만 표시(계획서 8.5 — 새 판정 문·저장소 없음).
          //   확인 중(null)·조회 실패·선생님 화면(IS_TEACHER_MODE)은 통과로 취급하지 않는다. 숙제가 없는 날은 아무 말도 안 한다.
          const hwPassed = !!taskVoca && !!vocaHwRec && !IS_TEACHER_MODE;
          return (
            <div>
              {hwPassed && (
                <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, background: UI.okBg, border: "1px solid #BFE5CE", borderRadius: 12, padding: "11px 14px", marginBottom: 12, fontSize: 14, fontWeight: 800, color: UI.okFg }}>
                  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: UI.okFg, color: "#fff", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</span>
                  {vocaPassLabel}
                </div>
              )}
              {/* [107차수] 마플보카가 학생앱 안에서는 같은 배경색(새 디자인)을 쓰므로 흰 테두리 상자를 없애고 그대로 이어 붙인다 */}
              <div style={{ margin: "0 -16px" }}>
                <VocaFrame title="단어장" src={src} topOffset={TAB_BAR_H + 12} openLast={vocaOpenLast} onOpenLastDone={() => setVocaOpenLast(false)}
                onHwState={(busy) => { vocaHwBusyRef.current = !!busy; }}
                  openTask={vocaOpenTask} onOpenTaskDone={() => setVocaOpenTask(null)}
                  hwTask={vocaHwTask} onHwTaskDone={() => setVocaHwTask(null)} />
              </div>
            </div>
          );
}
