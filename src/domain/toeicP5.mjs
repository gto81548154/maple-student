// Part 5 selection and statistics use the existing r/w/last records; no new server fields.
export const TOEIC_BOOKS = [3, 2, 1, 4];
export const TOEIC_P5_TYPES = ['전체', '어휘', '품사', '전치사·접속사', '동사 형태', '대명사', '기타 문법'];
const order = q => TOEIC_BOOKS.indexOf(q.v) * 10000 + q.t * 1000 + q.n;
const countOf = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const hasRecord = r => !!r && (r.last === 'O' || r.last === 'X' || countOf(r.r) + countOf(r.w) > 0);
const poolFor = (all, type) => (all || []).filter(q => type === '전체' || q.type === type);

// The default remains the original mix: up to two wrong answers, then fresh questions.
// In review mode, never fill a short set with unseen or already corrected questions.
export function pickToeicP5(all, rec = {}, type = '전체', count = 5, skip = [], mode = 'practice') {
  const limit = Math.max(0, Math.floor(count));
  const pool = poolFor(all, type).filter(q => !skip.includes(q.id));
  const wrong = pool.filter(q => rec[q.id]?.last === 'X').sort((a, b) => order(a) - order(b));
  if (mode === 'wrong') return wrong.slice(0, limit);
  const fresh = pool.filter(q => !hasRecord(rec[q.id])).sort((a, b) => order(a) - order(b));
  const seen = pool.filter(q => hasRecord(rec[q.id]) && rec[q.id].last !== 'X')
    .sort((a, b) => countOf(rec[a.id].r) - countOf(rec[b.id].r) || order(a) - order(b));
  return [...wrong.slice(0, 2), ...fresh, ...wrong.slice(2), ...seen].slice(0, limit);
}

// Optional question bank excludes removed/unknown IDs from this screen's totals.
// Without a bank this also preserves the teacher-home summary API.
export function toeicP5Stats(rec = {}, all, type = '전체') {
  const vals = (all ? poolFor(all, type).map(q => rec[q.id]) : Object.values(rec)).filter(hasRecord);
  const correct = vals.reduce((sum, r) => sum + countOf(r.r), 0);
  const attempts = correct + vals.reduce((sum, r) => sum + countOf(r.w), 0);
  return { done: vals.length, wrongNow: vals.filter(r => r.last === 'X').length,
    correct, attempts, accuracy: attempts ? Math.round(correct / attempts * 100) : null };
}
export function toeicP5TypeStats(all, rec) {
  return TOEIC_P5_TYPES.slice(1).map(type => ({ type, ...toeicP5Stats(rec, all, type) }));
}
