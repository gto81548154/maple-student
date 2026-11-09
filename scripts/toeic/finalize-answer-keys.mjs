// Offline release preparation only. Never infer approval from the OCR score alone.
import { createHash } from 'node:crypto';
import { validateToeicAnswerKeySet } from '../../src/domain/toeicAnswerKeys.mjs';
export const answerHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error(message); };
export function finalizeAnswerKeys(draft, comparisons, manual, visualTables, imageHashes, date) {
  const shape = validateToeicAnswerKeySet(draft, { requireVerified: false });
  if (!shape.ok || draft.status !== 'draft') fail('초안 형식을 확인해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('검토 날짜가 필요해요.');
  const unique = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); if (m.has(k)) fail('중복 검토 기록: ' + k); m.set(k, r); } return m; };
  const comparisonById = unique(comparisons, r => r.id);
  const manualByQuestion = unique(manual, r => r.id + ':' + r.number);
  const visualById = unique(visualTables, r => r.id);
  if (comparisonById.size !== 80) fail('80회차 대조 근거가 필요해요.');
  const usedManual = new Set();
  const output = structuredClone(draft); let manualCount = 0, resolvedIssues = 0;
  for (const key of output.records) {
    const evidence = comparisonById.get(key.id);
    if (!evidence || evidence.splitSourceSha256 !== key.source.sha256 || !/^[a-f0-9]{64}$/.test(evidence.wholeSha256 || '') || !Number.isInteger(evidence.wholePage) || evidence.wholePage < 1 || !evidence.wholeSource || !evidence.mapping) fail(key.id + ': 원본 매핑이 맞지 않아요.');
    if (evidence.testLabels?.length !== 1 || Number(evidence.testLabels[0]) !== key.test) fail(key.id + ': 원문 회차 표기가 달라요.');
    const imageHash = imageHashes[key.id];
    if (!/^[a-f0-9]{64}$/.test(imageHash || '')) fail(key.id + ': 원본 이미지 해시가 없어요.');
    if (key.volume === 4) {
      const visual = visualById.get(key.id);
      if (!visual || visual.sourceImageSha256 !== imageHash || visual.answersSha256 !== answerHash(key.answers) || !visual.method) fail(key.id + ': 4권 정답표 전체 화면 검토가 필요해요.');
    }
    if (!Array.isArray(evidence.rows) || evidence.rows.length !== 100) fail(key.id + ': 대조 문항 수가 달라요.');
    const byNumber = unique(evidence.rows, r => r.number);
    const decisions = [];
    for (let i = 0; i < 100; i++) {
      const n = key.firstQuestion + i, row = byNumber.get(n), mKey = key.id + ':' + n;
      if (!row || row.draft !== key.answers[i]) fail(mKey + ': 대조 뒤 초안이 바뀌었어요.');
      const human = manualByQuestion.get(mKey);
      const readings = row.readings || [];
      const agrees = readings.length === 1 && readings[0].answer === key.answers[i] && readings[0].confidence >= 0.8;
      if (human) {
        if (human.sourceImageSha256 !== imageHash || !human.evidence || !human.method || !'ABCD'.includes(human.answer) || human.answer.length !== 1) fail(mKey + ': 육안 검토 근거가 맞지 않아요.');
        key.answers[i] = human.answer; usedManual.add(mKey); manualCount++;
        decisions.push({ number: n, method: 'visual', evidence: human.evidence });
      } else if (agrees) {
        decisions.push({ number: n, method: key.volume === 4 ? 'image-reread-and-full-table-visual' : 'pdf-text-and-image-agreement' });
      } else fail(mKey + ': 원문 직접 확인이 필요해요.');
    }
    resolvedIssues += key.issues.length;
    key.review = { reviewedAt: date, method: 'full-source mapping; 8000 image comparisons; exceptions visual; volume4 full tables visual',
      sourceSha256: key.source.sha256, answersSha256: answerHash(key.answers), sourceImageSha256: imageHash,
      wholeSource: evidence.wholeSource, wholeSha256: evidence.wholeSha256, wholePage: evidence.wholePage,
      comparisonSha256: answerHash(evidence), previousIssues: key.issues, decisions };
    key.issues = []; key.status = 'verified';
  }
  if (usedManual.size !== manualByQuestion.size) fail('초안에 없는 문항의 검토 기록이 있어요.');
  if (visualById.size !== 20) fail('4권 20회차 전체 정답표를 확인해 주세요.');
  output.status = 'verified';
  output.reviewSummary = { reviewedAt: date, records: 80, questions: 8000, manualExceptions: manualCount, volume4VisualQuestions: 2000, resolvedIssues,
    remoteAssetMatch: 'not-checked; verify before deployment' };
  const result = validateToeicAnswerKeySet(output);
  if (!result.ok) fail(result.errors.join(' '));
  return output;
}
