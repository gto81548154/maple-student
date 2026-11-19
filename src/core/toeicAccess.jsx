import { IS_STAFF_VIEW, STAFF_AUTH, teacherUrl } from "./auth.jsx";
import { WORKER_ORIGIN } from "./config.jsx";

// [185차수 원장 결정 11-19] 토익을 쓰는 사람이 둘로 늘었다 — 선생님·원장(교사 문) + 원장이 켜 준 학생(학생 문).
//   토익 화면(OwnerToeicPanel 등)은 그대로 두고, "어느 문으로 나갈지"만 여기서 정한다.
//   · 선생님·원장 홈: /teacher/toeic · /files/toeic/…  (tid·tk)
//   · 학생 본인 화면: /student/toeic · /files/toeic/…  (id·t / sid·t) — 원장이 켜 준 학생만 서버가 열어 준다
//   · 원장·선생님이 학생 화면을 열어 본 경우(IS_STAFF_VIEW)에는 학생 토익을 쓰지 않는다(학생 기록에 손대지 않게. 서버도 학생 열쇠만 받는다).
// auth.jsx 를 먼저 불러오므로, 여기서 주소를 읽을 때는 이미 저장해 둔 학생 링크가 주소에 채워진 뒤다.
const TOEIC_STUDENT = (() => {
  try {
    const sp = new URLSearchParams(window.location.search);
    const sid = sp.get("id") || "", t = sp.get("t") || "";
    return (!IS_STAFF_VIEW && sid && t) ? { sid, t } : null;
  } catch (e) { return null; }
})();
export const IS_STUDENT_TOEIC = !!TOEIC_STUDENT;
const studentQs = (idName) => `${idName}=${encodeURIComponent(TOEIC_STUDENT.sid)}&t=${encodeURIComponent(TOEIC_STUDENT.t)}`;
// 토익 기록 문 주소
export const toeicApiUrl = () => TOEIC_STUDENT ? `${WORKER_ORIGIN}/student/toeic?${studentQs("id")}` : teacherUrl("/teacher/toeic");
// "켜져 있는지만" 묻는 주소(학생 전용)
export const toeicPeekUrl = () => TOEIC_STUDENT ? `${WORKER_ORIGIN}/student/toeic?${studentQs("id")}&peek=1` : "";
// 토익 파일 주소 — key 예: "toeic/p5.json"
export const toeicFile = (key) => TOEIC_STUDENT ? `${WORKER_ORIGIN}/files/${key}?${studentQs("sid")}` : teacherUrl("/files/" + key);
// 이 기기에 보관하는 답·저장 대기 기록의 이름표(열쇠는 넣지 않는다). 선생님·원장은 예전과 같은 이름(계정 번호)이라 보관해 둔 것이 그대로 이어진다.
export const toeicWho = () => TOEIC_STUDENT ? "s_" + TOEIC_STUDENT.sid : ((STAFF_AUTH && STAFF_AUTH.tid) || "");
export const TOEIC_STUDENT_ID = TOEIC_STUDENT ? TOEIC_STUDENT.sid : "";
