import { getExamRangeTextForStudent, getStudentSchoolCodeForRange } from "../../domain/examRange.jsx";
import { fmtDateShort } from "../../domain/time.jsx";
import { StudentExamDdaySection, StudentExamRangeCard } from "../exam/ExamCards.jsx";
import { StudentSurveyCard } from "../survey/StudentSurvey.jsx";
import { UI, TAP } from "../../theme/tokens.jsx";
import { PushSettingCard, PwaInstallCard, SETTING_BTN, SETTING_CARD, SETTING_DESC, SETTING_TITLE, SettingStatus } from "../../ui/settingCards.jsx";

// 더보기 → 공지·설문: 고정 공지(pinnedMessages)와 진행 중 설문(StudentSurveyCard)을 나눠서 보여준다.
//   "읽음/안 읽음"은 원본에 기록이 없으므로 새로 추정하지 않는다(계획서 6절). 설문 응답 규칙은 StudentSurveyCard 그대로.
export function NoticesScreen({ pinnedMessages, surveys, surveyResponses, student, onSurveySubmitted }) {
  const secHead = { fontSize: 13, fontWeight: 800, color: UI.sub, margin: "14px 2px 8px" };
  const empty = (t) => <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "18px 16px", fontSize: 13.5, color: UI.dim, textAlign: "center" }}>{t}</div>;
  return (
    <div>
      <div style={{ ...secHead, marginTop: 0 }}>공지</div>
      {pinnedMessages.length === 0 ? empty("지금 올라온 공지가 없어요") : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pinnedMessages.map(([dateKey, rec]) => (
            <div key={dateKey} style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>📌</span>
                <span style={{ fontSize: 11.5, color: UI.sub }}>{fmtDateShort(dateKey) ? `${fmtDateShort(dateKey)} · ` : ""}{rec.author || "선생님"}</span>
              </div>
              <div style={{ fontSize: 14.5, color: UI.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{rec.text}</div>
            </div>
          ))}
        </div>
      )}
      <div style={secHead}>설문</div>
      {surveys.length === 0 ? empty("진행 중인 설문이 없어요") : (
        <div>
          {surveys.map((sv) => (
            <StudentSurveyCard key={sv.id} survey={sv} myResponse={surveyResponses[sv.id]} student={student} onSubmitted={onSurveySubmitted} />
          ))}
        </div>
      )}
    </div>
  );
}
// 더보기 → 시험 정보: 기존 D-Day 칸과 시험 범위 칸을 그대로 쓴다(둘 다 남색 바탕용 글자색이라 남색 카드 안에 넣는다). 처음부터 펼쳐 둔다.
export function ExamInfoScreen({ student, items, examRanges }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const naesin = list.find((x) => x && x.type === "내신") || null;
  const code = getStudentSchoolCodeForRange(student || {});
  const rangeInfo = naesin ? getExamRangeTextForStudent(examRanges, code, { name: naesin.name, date: naesin.start, kind: naesin.kind, semester: naesin.semester }) : null;
  if (list.length === 0) {
    return <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 14, padding: "24px 16px", fontSize: 14, color: UI.dim, textAlign: "center", lineHeight: 1.6 }}>다가오는 시험이 없어요<br /><span style={{ fontSize: 12.5 }}>선생님이 시험 일정을 등록하면 여기에 보여요</span></div>;
  }
  return (
    <div>
      <div style={{ background: UI.navy, borderRadius: 16, padding: "14px 14px 2px", color: "#fff" }}>
        <StudentExamDdaySection items={list} defaultOpen />
        <StudentExamRangeCard student={student} items={list} examRanges={examRanges} defaultOpen />
      </div>
      {naesin && !rangeInfo && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: UI.sub, textAlign: "center" }}>이번 내신 시험 범위는 아직 등록되지 않았어요</div>
      )}
    </div>
  );
}
// 더보기 → 앱 설정: 알림 · 홈 화면 추가 · 앱 업데이트. 마플보카 학습 설정(초기화·캐시)은 단어 화면 안에 그대로 둔다(계획서 10절).
export function AppSettingsScreen({ student, swUpdate, onApplyUpdate }) {
  const st = swUpdate?.state || "";
  let updBody;
  if (!st) updBody = <SettingStatus tone="ok">지금 최신 화면이에요</SettingStatus>;
  else if (st === "failed") updBody = <SettingStatus tone="warn">업데이트를 적용하지 못했어요 — 이 앱의 다른 창을 모두 닫고 다시 열어 주세요</SettingStatus>;
  else updBody = (
    <>
      <SettingStatus tone="dim">{st === "applying" ? "업데이트 준비 중…" : "새 버전이 있어요"}</SettingStatus>
      {swUpdate.msg && <div style={{ ...SETTING_DESC, marginTop: 8, color: UI.warnFg, fontWeight: 700 }}>{swUpdate.msg}</div>}
      <div><button type="button" onClick={onApplyUpdate} disabled={st === "applying"} style={{ minHeight: TAP, ...SETTING_BTN, opacity: st === "applying" ? 0.6 : 1 }}>{st === "applying" ? "준비 중…" : "업데이트"}</button></div>
    </>
  );
  return (
    <div>
      <PushSettingCard student={student} />
      <PwaInstallCard />
      <div style={SETTING_CARD}>
        <div style={SETTING_TITLE}>🆕 앱 업데이트</div>
        <div style={SETTING_DESC}>새 버전이 나오면 여기와 위쪽 띠에 [업데이트] 단추가 나와요. 시험·영상 중에는 적용되지 않아요.</div>
        {updBody}
      </div>
    </div>
  );
}
