import { useEffect, useRef, useState } from "react";
import { IS_STAFF_VIEW } from "../../core/auth.jsx";
import { getSelfAccessToken } from "../../core/bundle.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { fetchWithTimeout } from "../../core/net.jsx";
import { getStudentLevelForDday } from "../../domain/dday.jsx";
import { getTodayStr } from "../../domain/time.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";

// ═══ [146차수] 더보기 → 장학금·친구 소개 ═══
//   학생이 직접 신청하고, 원장이 원장앱에서 확인한 뒤 기프티콘을 준다(원장 결정 11-04).
//   · 성적 장학금: 중학생 = 학교 중간·기말 영어 95점 이상 → 1만원. 고등학생 = 중간·기말 둘 다 영어 1등급 → 1만원.
//     시험 뒤 한 달 안에만 신청. 성적표 사진이 꼭 있어야 한다.
//   · 친구 소개: 소개한 친구가 학원에 등록하면 소개한 학생·등록한 친구 둘 다 3만원.
//   워커 길(원장앱·워커 쪽은 따로 만든다 — 모양은 녹음 제출과 같게):
//     POST ${WORKER_ORIGIN}/student/reward-claim  body { studentId, t, kind:"score"|"referral", … }  → { success, id, at }
//       score:    level("middle"|"high"), semester("2026-1"), exam("mid"|"final"|"both"), score(중), midGrade·finalGrade(고), examDate, photoBase64, photoMime, amount
//       referral: friendName, friendSchool, friendGrade, friendPhone, amount
//     GET  ${WORKER_ORIGIN}/student/reward-claims?studentId=&t=  → { success, items:[{ id, kind, at, status, reason, …보낸 칸 그대로, photoKey }] }
//       status: "pending"(신청함) | "checking"(확인 중) | "paid"(지급 완료) | "rejected"(지급 안 됨, reason)
//   워커가 아직 없으면 404·연결 실패 → "지금은 신청할 수 없어요"로 조용히 처리.
const SCORE_MIN = 95;           // 중학생 점수 기준
const SCORE_AMOUNT = 10000;
const REFERRAL_AMOUNT = 30000;
const CLAIM_DAYS = 30;          // 시험 뒤 한 달
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_MAX_PX = 1600;
const fmtWon = (n) => `${Math.round(n / 10000)}만원`;
const fmtDate = (iso) => { const d = new Date(iso); if (isNaN(d.getTime())) return ""; return `${d.getMonth() + 1}/${d.getDate()}`; };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const semesterOptions = () => {
  const t = new Date(); const y = t.getFullYear(); const m = t.getMonth() + 1;
  const list = [];
  if (m <= 2) list.push({ v: `${y - 1}-2`, label: `${y - 1}년 2학기` });
  list.push({ v: `${y}-1`, label: `${y}년 1학기` });
  if (m >= 7) list.push({ v: `${y}-2`, label: `${y}년 2학기` });
  return list;
};
const defaultSemester = () => { const o = semesterOptions(); return o[o.length - 1].v; };
const semesterLabel = (v) => { const [y, s] = String(v || "").split("-"); return y && s ? `${y}년 ${s}학기` : String(v || ""); };
const examLabel = (e) => (e === "mid" ? "중간" : e === "final" ? "기말" : e === "both" ? "중간·기말" : "");
// 사진 → 1600px 이하 JPEG → base64(앞부분 뗌). 캔버스가 안 되면 원본이 2MB 이하일 때만 그대로.
const readAsDataURL = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onerror = () => reject(new Error("read")); fr.onload = () => resolve(String(fr.result || "")); fr.readAsDataURL(blob); });
const stripDataUrl = (s) => { const i = s.indexOf(","); return i >= 0 ? s.slice(i + 1) : s; };
const shrinkPhoto = async (file) => {
  const src = await readAsDataURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error("img")); im.src = src; });
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.width * scale)); cv.height = Math.max(1, Math.round(img.height * scale));
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const out = cv.toDataURL("image/jpeg", q);
      if (out.length * 0.75 <= PHOTO_MAX_BYTES) return { dataUrl: out, base64: stripDataUrl(out), mime: "image/jpeg" };
    }
    throw new Error("too_big");
  } catch (e) {
    if (e && e.message === "too_big") throw e;
    if (file.size <= PHOTO_MAX_BYTES) return { dataUrl: src, base64: stripDataUrl(src), mime: file.type || "image/jpeg" };
    throw new Error("too_big");
  }
};
const CARD = { background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, padding: "16px 16px" };
const LBL = { fontSize: 13, fontWeight: 800, color: UI.sub, margin: "14px 0 6px" };
const INPUT = { width: "100%", boxSizing: "border-box", minHeight: TAP, border: `1px solid ${UI.line}`, borderRadius: 12, padding: "10px 12px", fontSize: 15, color: UI.text, background: "#fff", fontFamily: "inherit", outline: "none" };
const BTN = { minHeight: TAP, border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const BTN_PRIMARY = { ...BTN, background: UI.navy, color: "#fff" };
const STATUS = {
  pending: { label: "신청함 · 확인 기다리는 중", bg: UI.blueBg, fg: UI.blue },
  checking: { label: "확인 중", bg: "#FFF4E5", fg: "#8A4B00" },
  paid: { label: "지급 완료 ✓", bg: UI.okBg, fg: UI.okFg },
  rejected: { label: "지급 안 됨", bg: UI.warnBg, fg: UI.warnFg },
};
// 알약 2개(성적 장학금 / 친구 소개)
const Pills = ({ value, onChange, items }) => (
  <div style={{ display: "flex", gap: 6, background: "#EEF0F4", borderRadius: 14, padding: 4 }}>
    {items.map((it) => (
      <button key={it.v} type="button" onClick={() => onChange(it.v)}
        style={{ ...BTN, flex: 1, padding: "8px 6px", borderRadius: 11, background: value === it.v ? "#fff" : "transparent", color: value === it.v ? UI.text : UI.sub, boxShadow: value === it.v ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>{it.label}</button>
    ))}
  </div>
);
export function RewardScreen({ student, studentId }) {
  const todayStr = getTodayStr();
  const guessedLevel = getStudentLevelForDday(student || {});
  const [kind, setKind] = useState("score");
  const [level, setLevel] = useState(guessedLevel);
  const [semester, setSemester] = useState(defaultSemester());
  const [exam, setExam] = useState("mid");           // 중학생: 중간/기말 중 하나. 고등학생: 둘 다(both)
  const [score, setScore] = useState("");
  const [midGrade, setMidGrade] = useState("");
  const [finalGrade, setFinalGrade] = useState("");
  const [examDate, setExamDate] = useState("");
  const [photo, setPhoto] = useState(null);          // { dataUrl, base64, mime, name }
  const [photoBusy, setPhotoBusy] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [friendSchool, setFriendSchool] = useState("");
  const [friendGrade, setFriendGrade] = useState("");
  const [friendPhone, setFriendPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [flash, setFlash] = useState("");
  const [items, setItems] = useState([]);
  const [listState, setListState] = useState("loading");
  const aliveRef = useRef(true);
  const fileRef = useRef(null);
  const loadList = async () => {
    if (!WORKER_ORIGIN) { setListState("fail"); return; }
    try {
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/student/reward-claims?studentId=${encodeURIComponent(studentId)}&t=${encodeURIComponent(getSelfAccessToken())}`, { method: "GET" }, 15000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error("list");
      if (!aliveRef.current) return;
      setItems(Array.isArray(data.items) ? data.items.filter((x) => x && x.id) : []);
      setListState("ok");
    } catch (e) { if (aliveRef.current) setListState("fail"); }
  };
  useEffect(() => { aliveRef.current = true; loadList(); return () => { aliveRef.current = false; }; }, [studentId]);
  // ─── 성적 장학금: 대상인지 미리 판정 ───
  const isMiddle = level === "middle";
  const scoreNum = Number(score);
  const midNum = Number(midGrade), finalNum = Number(finalGrade);
  const scoreFilled = isMiddle ? score !== "" : (midGrade !== "" && finalGrade !== "");
  const eligible = isMiddle ? (Number.isFinite(scoreNum) && scoreNum >= SCORE_MIN && scoreNum <= 100) : (midNum === 1 && finalNum === 1);
  const dayDiff = examDate ? daysBetween(examDate, todayStr) : null;   // 시험 뒤 며칠 지났는지
  const dateFuture = dayDiff != null && dayDiff < 0;
  const dateExpired = dayDiff != null && dayDiff > CLAIM_DAYS;
  const examKey = isMiddle ? exam : "both";
  const alive = items.filter((x) => x.status !== "rejected");
  const dupScore = alive.some((x) => x.kind === "score" && x.semester === semester && (x.exam || "") === examKey);
  const dupReferral = alive.some((x) => x.kind === "referral" && ((friendName.trim() && String(x.friendName || "").trim() === friendName.trim()) || (friendPhone.replace(/\D/g, "").length >= 8 && String(x.friendPhone || "").replace(/\D/g, "") === friendPhone.replace(/\D/g, ""))));
  let scoreBlock = "";   // 신청을 막는 이유(비어 있으면 신청 가능)
  if (!scoreFilled) scoreBlock = "";
  else if (!eligible) scoreBlock = isMiddle ? `${SCORE_MIN}점 이상만 신청할 수 있어요` : "중간·기말 둘 다 1등급일 때만 신청할 수 있어요";
  else if (!examDate) scoreBlock = "시험 본 날짜를 골라 주세요";
  else if (dateFuture) scoreBlock = "시험 날짜가 오늘보다 뒤예요";
  else if (dateExpired) scoreBlock = "신청 기한(시험 뒤 한 달)이 지났어요";
  else if (!photo) scoreBlock = "성적표 사진을 꼭 올려 주세요";
  else if (dupScore) scoreBlock = "이 시험은 이미 신청했어요";
  const scoreReady = scoreFilled && !scoreBlock;
  const referralFilled = friendName.trim().length >= 2 && friendPhone.replace(/\D/g, "").length >= 9;
  const referralBlock = !referralFilled ? "" : dupReferral ? "이 친구는 이미 신청했어요" : "";
  const referralReady = referralFilled && !referralBlock;
  // ─── 사진 고르기 ───
  const onPickPhoto = async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    setNotice(""); setPhotoBusy(true);
    try { const p = await shrinkPhoto(f); if (aliveRef.current) setPhoto({ ...p, name: f.name || "사진" }); }
    catch (e) { if (aliveRef.current) { setPhoto(null); setNotice(e && e.message === "too_big" ? "사진이 너무 커요. 다른 사진으로 다시 올려 주세요." : "사진을 읽지 못했어요. 다시 골라 주세요."); } }
    finally { if (aliveRef.current) setPhotoBusy(false); }
  };
  // ─── 보내기 ───
  const submit = async () => {
    if (sending) return;
    setNotice(""); setFlash("");
    if (IS_STAFF_VIEW) { setNotice("보기 전용 화면에서는 신청할 수 없어요"); return; }
    if (!WORKER_ORIGIN) { setNotice("지금은 신청할 수 없어요. 잠시 뒤 다시 해 주세요."); return; }
    const body = kind === "score"
      ? { studentId, t: getSelfAccessToken(), kind: "score", level, semester, exam: examKey, score: isMiddle ? scoreNum : null, midGrade: isMiddle ? null : midNum, finalGrade: isMiddle ? null : finalNum, examDate, photoBase64: photo.base64, photoMime: photo.mime, amount: SCORE_AMOUNT }
      : { studentId, t: getSelfAccessToken(), kind: "referral", friendName: friendName.trim().slice(0, 30), friendSchool: friendSchool.trim().slice(0, 40), friendGrade: friendGrade.trim().slice(0, 10), friendPhone: friendPhone.trim().slice(0, 20), amount: REFERRAL_AMOUNT };
    setSending(true);
    try {
      const resp = await fetchWithTimeout(`${WORKER_ORIGIN}/student/reward-claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 30000);
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 413) throw new Error("사진이 너무 커요. 다른 사진으로 다시 올려 주세요.");
      if (resp.status === 401 || resp.status === 403) throw new Error("앱을 새로고침한 뒤 다시 해 주세요");
      if (resp.status === 409) throw new Error(kind === "score" ? "이 시험은 이미 신청했어요" : "이 친구는 이미 신청했어요");
      if (!resp.ok || !data.success) throw new Error("지금은 신청할 수 없어요. 잠시 뒤 다시 해 주세요.");
      if (!aliveRef.current) return;
      const { t: _t, photoBase64: _p, ...rest } = body;
      const mine = { ...rest, id: data.id || `local_${Date.now()}`, at: data.at || new Date().toISOString(), status: "pending", reason: "" };
      setItems((prev) => [mine, ...prev.filter((x) => x.id !== mine.id)]);
      setListState("ok");
      if (kind === "score") { setScore(""); setMidGrade(""); setFinalGrade(""); setExamDate(""); setPhoto(null); }
      else { setFriendName(""); setFriendSchool(""); setFriendGrade(""); setFriendPhone(""); }
      setFlash("신청했어요 ✓ 학원에서 확인한 뒤 알려 드릴게요");
      setTimeout(() => { if (aliveRef.current) setFlash(""); }, 3000);
      loadList();
    } catch (e) {
      if (!aliveRef.current) return;
      const m = String(e?.message || "");
      setNotice(/^(사진이|앱을|이 시험|이 친구)/.test(m) ? m : "지금은 신청할 수 없어요. 잠시 뒤 다시 해 주세요.");
    } finally { if (aliveRef.current) setSending(false); }
  };
  const gradeSelect = (v, set) => (
    <select value={v} onChange={(e) => set(e.target.value)} style={INPUT}>
      <option value="">등급</option>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => <option key={g} value={g}>{g}등급</option>)}
    </select>
  );
  const itemTitle = (it) => it.kind === "referral"
    ? `친구 소개 · ${it.friendName || "이름 없음"}${it.friendSchool ? ` (${it.friendSchool}${it.friendGrade ? " " + it.friendGrade : ""})` : ""}`
    : `성적 장학금 · ${semesterLabel(it.semester)} ${examLabel(it.exam)} · ${it.level === "middle" || it.score != null ? `${it.score}점` : `${it.midGrade}·${it.finalGrade}등급`}`;
  return (
    <div>
      {/* 규칙 안내 */}
      <div style={{ background: UI.navy, borderRadius: 16, padding: "14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>🎁 이렇게 받아요</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.9)", wordBreak: "keep-all" }}>
          · 중학생: 학교 중간·기말 영어 <b>{SCORE_MIN}점 이상</b> → {fmtWon(SCORE_AMOUNT)} 기프티콘<br />
          · 고등학생: 중간·기말 <b>둘 다 영어 1등급</b> → {fmtWon(SCORE_AMOUNT)} 기프티콘<br />
          · 친구 소개: 친구가 학원에 등록하면 <b>둘 다</b> {fmtWon(REFERRAL_AMOUNT)} 기프티콘<br />
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>성적 장학금은 시험 뒤 한 달 안에, 성적표 사진과 함께 신청해요. 학원에서 확인한 뒤 드려요.</span>
        </div>
      </div>
      <div style={{ marginTop: 12 }}><Pills value={kind} onChange={(v) => { setKind(v); setNotice(""); setFlash(""); }} items={[{ v: "score", label: "성적 장학금" }, { v: "referral", label: "친구 소개" }]} /></div>
      <div style={{ ...CARD, marginTop: 10 }}>
        {kind === "score" ? (
          <>
            <div style={{ ...LBL, marginTop: 0 }}>나는</div>
            <Pills value={level} onChange={(v) => { setLevel(v); setExam(v === "middle" ? "mid" : "both"); }} items={[{ v: "middle", label: "중학생" }, { v: "high", label: "고등학생" }]} />
            <div style={LBL}>학기</div>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} style={INPUT}>{semesterOptions().map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
            {isMiddle ? (
              <>
                <div style={LBL}>시험</div>
                <Pills value={exam} onChange={setExam} items={[{ v: "mid", label: "중간고사" }, { v: "final", label: "기말고사" }]} />
                <div style={LBL}>영어 점수</div>
                <input type="number" inputMode="numeric" min={0} max={100} value={score} placeholder="예: 96" onChange={(e) => setScore(e.target.value.slice(0, 3))} style={INPUT} />
              </>
            ) : (
              <>
                <div style={LBL}>영어 등급 (중간 · 기말)</div>
                <div style={{ display: "flex", gap: 8 }}>{gradeSelect(midGrade, setMidGrade)}{gradeSelect(finalGrade, setFinalGrade)}</div>
              </>
            )}
            <div style={LBL}>시험 본 날 <span style={{ fontWeight: 600, color: UI.dim }}>{isMiddle ? "" : "(기말고사 날짜)"}</span></div>
            <input type="date" value={examDate} max={todayStr} onChange={(e) => setExamDate(e.target.value)} style={INPUT} />
            <div style={LBL}>성적표 사진 <span style={{ fontWeight: 600, color: UI.warnFg }}>(꼭 필요해요)</span></div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} style={{ display: "none" }} />
            {photo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src={photo.dataUrl} alt="성적표" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: `1px solid ${UI.line}` }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: UI.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.name}</div>
                <button type="button" onClick={() => fileRef.current && fileRef.current.click()} style={{ ...BTN, background: UI.blueBg, color: UI.blue, padding: "8px 12px", fontSize: 13 }}>바꾸기</button>
              </div>
            ) : (
              <button type="button" disabled={photoBusy} onClick={() => fileRef.current && fileRef.current.click()} style={{ ...BTN, width: "100%", background: UI.blueBg, color: UI.blue, opacity: photoBusy ? 0.6 : 1 }}>{photoBusy ? "사진 준비 중…" : "📷 성적표 사진 올리기"}</button>
            )}
            {scoreFilled && (
              <div style={{ marginTop: 14, borderRadius: 12, padding: "10px 12px", fontSize: 13.5, fontWeight: 800, textAlign: "center", background: scoreReady ? UI.okBg : UI.warnBg, color: scoreReady ? UI.okFg : UI.warnFg }}>
                {scoreReady ? `${fmtWon(SCORE_AMOUNT)} 기프티콘 대상이에요 🎉` : scoreBlock}
              </div>
            )}
            <button type="button" onClick={submit} disabled={!scoreReady || sending} style={{ ...BTN_PRIMARY, width: "100%", marginTop: 12, height: 52, borderRadius: 14, fontSize: 16, opacity: (!scoreReady || sending) ? 0.45 : 1, cursor: (!scoreReady || sending) ? "default" : "pointer" }}>{sending ? "보내는 중…" : "장학금 신청"}</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: UI.sub, lineHeight: 1.6 }}>내가 소개한 친구가 학원에 등록하면 나도, 친구도 {fmtWon(REFERRAL_AMOUNT)} 기프티콘을 받아요. 친구 정보를 적어 주세요.</div>
            <div style={LBL}>친구 이름</div>
            <input type="text" value={friendName} maxLength={30} placeholder="예: 김마플" onChange={(e) => setFriendName(e.target.value)} style={INPUT} />
            <div style={LBL}>학교 · 학년 <span style={{ fontWeight: 600, color: UI.dim }}>(아는 만큼만)</span></div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={friendSchool} maxLength={40} placeholder="학교" onChange={(e) => setFriendSchool(e.target.value)} style={{ ...INPUT, flex: 2 }} />
              <input type="text" value={friendGrade} maxLength={10} placeholder="예: 중2" onChange={(e) => setFriendGrade(e.target.value)} style={{ ...INPUT, flex: 1 }} />
            </div>
            <div style={LBL}>친구 또는 부모님 연락처</div>
            <input type="tel" inputMode="tel" value={friendPhone} maxLength={20} placeholder="010-0000-0000" onChange={(e) => setFriendPhone(e.target.value)} style={INPUT} />
            {referralFilled && referralBlock && <div style={{ marginTop: 14, borderRadius: 12, padding: "10px 12px", fontSize: 13.5, fontWeight: 800, textAlign: "center", background: UI.warnBg, color: UI.warnFg }}>{referralBlock}</div>}
            <button type="button" onClick={submit} disabled={!referralReady || sending} style={{ ...BTN_PRIMARY, width: "100%", marginTop: 12, height: 52, borderRadius: 14, fontSize: 16, opacity: (!referralReady || sending) ? 0.45 : 1, cursor: (!referralReady || sending) ? "default" : "pointer" }}>{sending ? "보내는 중…" : "친구 소개 신청"}</button>
          </>
        )}
        {notice && <div style={{ marginTop: 12, background: UI.warnBg, color: UI.warnFg, borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>{notice}</div>}
        {flash && <div role="status" style={{ marginTop: 12, background: UI.okBg, color: UI.okFg, borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 800, textAlign: "center" }}>{flash}</div>}
      </div>
      {/* 내 신청 */}
      <div style={{ fontSize: 13, fontWeight: 800, color: UI.sub, margin: "18px 2px 8px" }}>내 신청</div>
      {listState === "loading" && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5 }}>불러오는 중…</div>}
      {listState === "fail" && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>신청 목록을 아직 불러올 수 없어요<br /><span style={{ fontSize: 12.5 }}>잠시 뒤 다시 열어 주세요</span></div>}
      {listState === "ok" && items.length === 0 && <div style={{ ...CARD, textAlign: "center", color: UI.dim, fontSize: 13.5, lineHeight: 1.6 }}>아직 신청한 것이 없어요</div>}
      {listState === "ok" && items.length > 0 && (
        <div style={{ background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16, overflow: "hidden" }}>
          {items.map((it, i) => {
            const st = STATUS[it.status] || STATUS.pending;
            return (
              <div key={it.id} style={{ padding: "12px 14px", borderTop: i ? `1px solid ${UI.line}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: UI.dim }}>{fmtDate(it.at)}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: st.fg, background: st.bg, borderRadius: 8, padding: "2px 8px" }}>{st.label}</span>
                  {it.amount ? <span style={{ fontSize: 12, color: UI.sub, marginLeft: "auto" }}>{fmtWon(it.amount)}</span> : null}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: UI.text, marginTop: 4, lineHeight: 1.5, wordBreak: "break-word" }}>{itemTitle(it)}</div>
                {it.status === "rejected" && it.reason && <div style={{ fontSize: 12.5, color: UI.warnFg, marginTop: 3, lineHeight: 1.5 }}>이유: {it.reason}</div>}
                {it.status === "paid" && it.reason && <div style={{ fontSize: 12.5, color: UI.sub, marginTop: 3, lineHeight: 1.5 }}>💬 {it.reason}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
