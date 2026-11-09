import { toeicChoices, toeicQuestionNumbers } from './toeicAnswerKeys.mjs';

export function validateToeicAnswers(id, answers) {
  const match = /^v[1-4]-(lc|rc)-(0[1-9]|10)$/.exec(id || '');
  if (!match || !Array.isArray(answers) || answers.length !== 100) throw new Error('회차와 답안 100개를 확인해 주세요.');
  const section = match[1], numbers = toeicQuestionNumbers(section);
  for (let i = 0; i < 100; i++) {
    if (answers[i] !== null && (typeof answers[i] !== 'string' || answers[i].length !== 1 || !toeicChoices(section, numbers[i]).includes(answers[i]))) throw new Error(numbers[i] + '번 답을 확인해 주세요.');
  }
  return answers.slice();
}

export function gradeToeicAnswers(id, answers, key, at) {
  const checked = validateToeicAnswers(id, answers);
  if (key.id !== id) throw new Error('선택한 회차의 정답이 아니에요.');
  const correct = checked.map((a, i) => a !== null && a === key.answers[i]);
  const ranges = key.section === 'lc' ? [[1,0,6],[2,6,31],[3,31,70],[4,70,100]] : [[5,0,30],[6,30,46],[7,46,100]];
  return { answers: checked, correct, correctAnswers: key.answers.slice(), score: correct.filter(Boolean).length,
    unanswered: checked.filter(a => a === null).length,
    parts: ranges.map(([part,start,end]) => ({part, correct:correct.slice(start,end).filter(Boolean).length,total:end-start})),
    keyHash:key.review.answersSha256, at };
}
