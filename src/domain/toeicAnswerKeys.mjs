// Prepared answer keys live outside the public bundle. Drafts cannot be used for grading.
export const TOEIC_KEY_SCHEMA = 1;
const sha256 = /^[a-f0-9]{64}$/;
export const toeicQuestionNumbers = section => {
  if (!['lc', 'rc'].includes(section)) throw new Error('LC 또는 RC를 선택해 주세요.');
  return Array.from({ length: 100 }, (_, i) => (section === 'lc' ? 1 : 101) + i);
};
export const toeicChoices = (section, number) => {
  if (!toeicQuestionNumbers(section).includes(number)) throw new Error('문항 번호가 범위를 벗어났어요.');
  return section === 'lc' && number >= 7 && number <= 31 ? 'ABC' : 'ABCD';
};
export function validateToeicAnswerKey(key, { requireVerified = true, allowIncomplete = false, expectedId } = {}) {
  const errors = [];
  if (!key || typeof key !== 'object') return { ok: false, errors: ['정답 자료가 없어요.'] };
  const match = /^v([1-4])-(lc|rc)-(0[1-9]|10)$/.exec(key.id || '');
  if (!match || key.volume !== Number(match[1]) || key.section !== match[2] || key.test !== Number(match[3])) errors.push('권·영역·회차가 일치하지 않아요.');
  if (expectedId && key.id !== expectedId) errors.push('선택한 회차의 정답이 아니에요.');
  const section = key.section;
  if (key.firstQuestion !== (section === 'lc' ? 1 : 101)) errors.push('시작 문항 번호가 달라요.');
  if (!Array.isArray(key.answers) || key.answers.length !== 100) errors.push('정답은 정확히 100개여야 해요.');
  else if (['lc', 'rc'].includes(section)) key.answers.forEach((answer, i) => {
    if (allowIncomplete && !requireVerified && answer === null) return;
    const number = i + key.firstQuestion;
    const choices = section === 'lc' && number >= 7 && number <= 31 ? 'ABC' : 'ABCD';
    if (typeof answer !== 'string' || answer.length !== 1 || !choices.includes(answer)) errors.push(number + '번 정답이 올바르지 않아요.');
  });
  const source = key.source;
  if (!source || !sha256.test(source.sha256 || '') || typeof source.myboxPath !== 'string' || !source.myboxPath || !Number.isInteger(source.pdfPage) || source.pdfPage < 1 || !Number.isInteger(source.pageCount) || source.pdfPage > source.pageCount) errors.push('정답의 원본 위치·해시를 확인해 주세요.');
  if (match && source?.r2Key !== 'toeic/ets1000/v' + match[1] + '/' + match[2] + '/test' + match[3] + '-a.pdf') errors.push('앱 해설 파일과 회차가 달라요.');
  if (!['draft', 'verified'].includes(key.status)) errors.push('검토 상태가 올바르지 않아요.');
  if (!Array.isArray(key.issues)) errors.push('확인할 항목 목록이 없어요.');
  if (requireVerified || key.status === 'verified') {
    if (key.status !== 'verified') errors.push('원문 대조가 끝나지 않은 정답이에요.');
    if (key.issues?.length) errors.push('확인할 항목이 남아 있어요.');
    const review = key.review;
    if (!review || review.sourceSha256 !== source?.sha256 || !sha256.test(review.answersSha256 || '') || typeof review.method !== 'string' || !review.method.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt || '')) errors.push('원문 대조 기록이 없거나 맞지 않아요.');
  }
  return { ok: errors.length === 0, errors };
}
export function validateToeicAnswerKeySet(data, options = {}) {
  const errors = [];
  if (data?.schemaVersion !== TOEIC_KEY_SCHEMA || !Array.isArray(data?.records)) return { ok: false, errors: ['정답 묶음 형식이 달라요.'] };
  if (data.records.length !== 80) errors.push('LC·RC 80회차가 모두 있어야 해요.');
  if (!['draft', 'verified'].includes(data.status) || (options.requireVerified !== false && data.status !== 'verified')) errors.push('검토 완료된 정답 묶음이 아니에요.');
  const seen = new Set();
  for (const key of data.records) {
    if (seen.has(key?.id)) errors.push('중복 회차: ' + key?.id);
    seen.add(key?.id);
    errors.push(...validateToeicAnswerKey(key, { ...options, requireVerified: options.requireVerified !== false || data.status === "verified" }).errors.map(error => (key?.id || '?') + ': ' + error));
  }
  return { ok: errors.length === 0, errors };
}
// Check the reviewed answer fingerprint again at use time, so later edits cannot silently alter grading.
export async function requireVerifiedToeicAnswerKey(key, expectedId) {
  const result = validateToeicAnswerKey(key, { expectedId });
  if (!result.ok) throw new Error(result.errors.join(' '));
  const bytes = new TextEncoder().encode(JSON.stringify(key.answers));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== key.review.answersSha256) throw new Error('대조한 뒤 정답이 바뀌었어요. 다시 확인해 주세요.');
  return key;
}
