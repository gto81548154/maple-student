import { getStudentGradeForDday, getStudentSchoolForDday } from "./dday.jsx";

// ─── 이번 내신 시험범위 카드 (examr3 학생 노출 — 워커가 본인 학교 항목만 내려줌) ───
// 슬롯 v2 호환: 구형 문자열 / 신형 {rows:[{bookLabel,bookKey,range,memo}],legacyText} 모두 텍스트로 변환해 표시.
export const normalizeExamRangeSlot = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const rows = (Array.isArray(v.rows) ? v.rows : []).filter(r => r && typeof r === "object");
    return { rows, legacyText: String(v.legacyText || "") };
  }
  return { rows: [], legacyText: v == null ? "" : String(v) };
};
const examRangeSlotToText = (v) => {
  const { rows, legacyText } = normalizeExamRangeSlot(v);
  const lines = rows.map(r => {
    const head = [String(r.bookLabel || r.bookKey || "").trim(), String(r.range || "").trim()].filter(Boolean).join(" ");
    const memo = String(r.memo || "").trim();
    return memo ? (head ? `${head} — ${memo}` : memo) : head;
  }).filter(Boolean);
  const legacy = legacyText.trim();
  return [...lines, ...(legacy ? [legacy] : [])].join("\n");
};
export const getStudentSchoolCodeForRange = (student = {}) => {
  const school = getStudentSchoolForDday(student);
  const grade = getStudentGradeForDday(student);
  return school && grade ? `${school}${grade}` : "";
};
// 시험(exam3 항목) → 시험범위 슬롯 라벨. 종류는 시험명(중간/기말), 학기는 시험 시작월(8월~=2학기)로 판정.
const getExamRangeSlotForExam = (exam = {}) => {
  // 구조화 필드(개편 2단계) 우선 — 시험 등록 시 선택한 값이라 추론이 필요 없다.
  const kindS = String(exam.kind || "");
  const semS = Number(exam.semester);
  if (/^(중간|기말)$/.test(kindS) && (semS === 1 || semS === 2)) return `${semS}학기 ${kindS}`;
  const name = String(exam.name || "");
  const kind = /^(중간|기말)$/.test(kindS) ? kindS : (/중간/.test(name) ? "중간" : /기말/.test(name) ? "기말" : null);
  const ds = String(exam.date || exam.start || "");
  const mm = Number(ds.slice(5, 7));
  if (!kind || !(mm >= 1 && mm <= 12)) return null;
  return `${mm >= 8 ? 2 : 1}학기 ${kind}`;
};
export const getExamRangeTextForStudent = (examRanges, schoolCode, exam = {}) => {
  const slot = getExamRangeSlotForExam(exam);
  if (!slot || !schoolCode) return null;
  const ds = String(exam.date || exam.start || "");
  const year = Number(ds.slice(0, 4));
  if (!year) return null;
  const byYear = examRanges?.data?.[schoolCode];
  const entry = byYear ? (byYear[year] || byYear[String(year)]) : null;
  const text = entry ? examRangeSlotToText(entry[slot]).trim() : "";
  return text ? { slot, year, text, value: entry[slot] } : null;
};
// [내신 4차수] 마플보카에 넘길 값 — 학교코드(sc)와 이번 시험범위 교과서 과 번호(nsl).
// nsl은 교과서 줄만 쓴다(부교재·외부지문 등은 선생님이 올린 묶음으로 따로 온다 — 126·128차수). 시험이 없거나 범위가 없으면 과 번호는 빈 배열.
const NAESIN_TEXTBOOK_AREA = "naesin_textbook";
export function getNaesinVocaParams(student, examRanges, items) {
  const sc = getStudentSchoolCodeForRange(student || {});
  if (!sc) return { sc: "", nsl: [] };
  const naesin = (items || []).find(x => x && x.type === "내신") || null;
  if (!naesin) return { sc, nsl: [] };
  // 범위 글자가 비어 있어도 번호(units)만 있으면 쓴다 — 그래서 슬롯 값을 직접 읽는다.
  const slot = getExamRangeSlotForExam({ name: naesin.name, date: naesin.start, kind: naesin.kind, semester: naesin.semester });
  const year = Number(String(naesin.start || "").slice(0, 4));
  if (!slot || !year) return { sc, nsl: [] };
  // [128차수] 지금 준비하는 시험(연도·이름)도 같이 준다 — 마플보카가 "올린 내신 단어" 중 이번 시험 것을 먼저 보여 주는 데 쓴다.
  const byYear = examRanges?.data?.[sc];
  const entry = byYear ? (byYear[year] || byYear[String(year)]) : null;
  if (!entry) return { sc, nsl: [], year, exam: slot };
  const out = [];
  for (const r of normalizeExamRangeSlot(entry[slot]).rows) {
    if (String(r?.area || "") !== NAESIN_TEXTBOOK_AREA) continue;
    (Array.isArray(r.units) ? r.units : []).forEach(v => { const k = Number(v); if (Number.isFinite(k)) out.push(k); });
  }
  return { sc, nsl: [...new Set(out)].sort((a, b) => a - b), year, exam: slot };
}
