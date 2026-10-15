
// [0824 3차수] 배포 확인용 차수 표시 — 원장앱 APP_BUILD와 같은 장치. 학생 화면에는 안 띄우고
//   마스터 홈(원장 전용) 머리글에만 뜬다(원장 결정). 새 차수 파일을 만들 때마다 이 글자를 같이 바꿀 것.
export const STUDENT_APP_BUILD = "학생앱 138차수 · 2026-10-14 · 공휴일표 정정";
// ─── 학생앱 동기화 API ───
// Worker API(Turso 원본 DB) 단일 경로
// .env 예시: VITE_STUDENT_SYNC_API_URL=https://mapl-sync-worker.yourname.workers.dev/student-bundle
export const STUDENT_SYNC_API_URL =
  import.meta.env.VITE_STUDENT_SYNC_API_URL ||
  import.meta.env.VITE_STUDENT_BUNDLE_API_URL ||
  "";
if (!STUDENT_SYNC_API_URL) {
  console.error("[CONFIG ERROR] VITE_STUDENT_SYNC_API_URL이 설정되지 않았습니다. 학생앱은 maple-sync /student-bundle Worker URL이 필요합니다.");
}
// ─── [단어 TEST] 마플보카 연동 ───────────────────────
// 마플보카 HTML 파일을 학생앱 public/voca.html 로 넣으면 별도 설정 없이 열립니다.
// 다른 곳(R2 등)에 올렸다면 .env 로 주소를 지정하세요.
// .env 예시: VITE_VOCA_APP_URL=https://example.com/voca.html
export const VOCA_APP_URL = import.meta.env.VITE_VOCA_APP_URL || "/voca.html";
// [단어 TEST] 탭 스위치 — 마플보카 3단계 배포(워커 /voca/* + public/voca.html + R2 단어 데이터) 완료 후 true로 변경
export const VOCA_TAB_ENABLED = true;
export const WORKER_ORIGIN = (() => { try { return new URL(STUDENT_SYNC_API_URL).origin; } catch (e) { return ""; } })();
// ─── 영상 시청 기록 저장 API (Turso 원본 DB로 저장) ───
// .env 예시: VITE_VIDEO_WATCH_API_URL=https://mapl-sync-worker.yourname.workers.dev/video-watch
export const VIDEO_WATCH_API_URL =
  import.meta.env.VITE_VIDEO_WATCH_API_URL ||
  import.meta.env.VITE_MAPL_SYNC_URL ||
  "";
export const VIDEO_WATCH_API_KEY =
  import.meta.env.VITE_VIDEO_WATCH_API_KEY ||
  import.meta.env.VITE_MAPL_SYNC_API_KEY ||
  "";
