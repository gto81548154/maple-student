
// 배지 스타일 (조교: 그린, 강사: 블루)
export const BADGE_STYLES = {
  '조교': { bg: '#d1fae5', fg: '#065f46' },
  '강사': { bg: '#dbeafe', fg: '#1e40af' },
};
// ─── 학생 앱 가운데 정렬 폭 (PC 대응) ───
export const MAX_W = 600;
// ─── [103차수 09-08 디자인 개편] 학생 화면 공용 색·크기 (계획서 4절) ───
//   남색은 원본 #182848 그대로(계획서 허용), 페이지 배경·카드 테두리·파랑 단추·글자색은 계획서 값.
export const UI = {
  navy: "#182848", bg: "#F5F6FA", card: "#fff", line: "#E4E8EF", blue: "#2466D9",
  text: "#232B3B", sub: "#647084", dim: "#9AA3B2",
  okBg: "#E8F6EE", okFg: "#1B8A5A", warnBg: "#FDECEA", warnFg: "#B03A2E", blueBg: "#EEF3FC",
};
// 탭 줄의 실제 높이(px). [141차수] 탭 줄은 이제 화면 아래 붙박이(fixed) — 본문 아래 여백·VocaFrame 보이는 영역 보정이 이 값을 쓴다(아이폰 홈바 여백은 따로 safe-area-inset-bottom).
//   숫자를 여기 한 곳에서만 바꾼다(계획서 8.5).
export const TAB_BAR_H = 48;
// [131차수] 폰에서 손가락으로 누르는 단추의 최소 높이(px). 44 미만 단추는 쓰지 않는다(원장앱과 같은 규칙). 글자는 11 미만을 쓰지 않는다(숫자 11을 바로 적음).
export const TAP = 44;
