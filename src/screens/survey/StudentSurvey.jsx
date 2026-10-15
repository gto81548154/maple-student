import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useState } from "react";
import { IS_STAFF_VIEW, IS_TEACHER_MODE } from "../../core/auth.jsx";
import { STUDENT_SYNC_API_URL, WORKER_ORIGIN } from "../../core/config.jsx";
import { VIDEO_WATCH_API_KEY } from "../../core/config.jsx";

// ─── [설문 이미지] 원장앱이 첨부한 사진(R2 키, 예: survey/svy_123.jpg)을 워커 /files/ 프록시로 받아 표시 ───
// 키가 없거나 로드에 실패하면 아무것도 그리지 않는다 — 구형 설문·네트워크 오류에도 카드가 깨지지 않게.
function StudentSurveyImage({ imageKey }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true; let objUrl = "";
    setSrc("");
    if (!imageKey || !WORKER_ORIGIN) return undefined;
    (async () => {
      try {
        const headers = {};
        if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
        const path = String(imageKey).split("/").map(encodeURIComponent).join("/");
        const r = await fetch(`${WORKER_ORIGIN}/files/${path}`, { headers });
        if (!r.ok) throw new Error(`이미지 요청 실패 (${r.status})`);
        const buf = await r.arrayBuffer();
        if (!alive) return;
        objUrl = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
        setSrc(objUrl);
      } catch (e) { console.warn("설문 이미지 로드 실패:", e?.message || e); }
    })();
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [imageKey]);
  if (!imageKey || !src) return null;
  return <img src={src} alt="설문 이미지" style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }} />;
}
// ─── 설문 응답 카드 ───
// 단일 선택: 선택지를 누르면 바로 제출. 복수 선택(maxChoices>1): 정확히 maxChoices개를 골라야 [제출하기]가 활성화된다.
export function StudentSurveyCard({ survey, myResponse, student, onSubmitted }) {
  const maxChoices = Math.max(1, Number(survey?.maxChoices) || 1);
  const savedChoices = Array.isArray(myResponse?.choices)
    ? myResponse.choices.map(Number)
    : (myResponse?.choice != null ? [Number(myResponse.choice)] : []);
  const savedKey = savedChoices.join(",");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState(savedChoices);
  useEffect(() => { setPicked(savedKey ? savedKey.split(",").map(Number) : []); setMsg(""); }, [survey.id, savedKey]);

  const post = async (choicesArr) => {
    // [마스터] 원장이 학생 화면에서 눌러도 그 학생 응답으로 제출되면 안 된다.
    if (IS_STAFF_VIEW) { setMsg(IS_TEACHER_MODE ? "선생님 화면에서는 설문이 제출되지 않습니다." : "마스터 모드에서는 설문이 제출되지 않습니다."); return; }
    setBusy(true); setMsg("");
    try {
      const t = new URLSearchParams(window.location.search).get("t") || "";
      const bodyObj = { surveyId: survey.id, studentId: String(student?.id || ""), t };
      if (maxChoices > 1) bodyObj.choices = choicesArr; else bodyObj.choice = choicesArr[0];
      const r = await fetch(new URL(STUDENT_SYNC_API_URL).origin + "/survey/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        const rec = { at: d.at || new Date().toISOString() };
        if (maxChoices > 1) rec.choices = choicesArr; else rec.choice = choicesArr[0];
        onSubmitted(survey.id, rec);
        setMsg("제출되었습니다. 마감 전까지 변경할 수 있어요.");
      } else setMsg(d?.error || "제출에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } catch (e) { setMsg("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요."); }
    setBusy(false);
  };

  const tap = (idx) => {
    if (busy) return;
    if (maxChoices <= 1) { if (idx !== savedChoices[0]) post([idx]); return; }
    setPicked((prev) => {
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      if (prev.length >= maxChoices) { setMsg(`${maxChoices}개만 선택할 수 있어요. 바꾸려면 먼저 하나를 눌러 해제하세요.`); return prev; }
      setMsg("");
      return [...prev, idx].sort((a, b) => a - b);
    });
  };
  const dirty = maxChoices > 1 && picked.join(",") !== savedKey;
  const submitted = savedChoices.length > 0;
  const activeSet = maxChoices > 1 ? picked : savedChoices;
  const needMore = maxChoices > 1 && picked.length < maxChoices; // 정확히 N개 골라야 제출 가능
  const submitDisabled = busy || needMore || !dirty;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E4E0D8", padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: "#2A6FDB", padding: "2px 9px", borderRadius: 999 }}>설문</span>
        {maxChoices > 1 && <span style={{ fontSize: 11, fontWeight: 800, color: "#8E44AD", background: "#F5EEF8", padding: "2px 9px", borderRadius: 999 }}>{maxChoices}개 선택</span>}
        {submitted && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#1B8A5A" }}>제출 완료</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#2A2A28", marginBottom: 10, lineHeight: 1.45 }}>{survey.title}</div>
      {(() => {
        // 여러 장(images 배열) 지원 — 구버전 설문의 단일 image 필드도 목록으로 취급
        const keys = Array.isArray(survey.images) && survey.images.length ? survey.images : (survey.image ? [survey.image] : []);
        return keys.length ? (
          // [설문 이미지] 2열 그리드 — 사진이 1장뿐이면 1열로 크게
          <div style={{ display: "grid", gridTemplateColumns: keys.length === 1 ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {keys.map((k, i) => <StudentSurveyImage key={i} imageKey={k} />)}
          </div>
        ) : null;
      })()}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(survey.options || []).map((op, idx) => {
          const on = activeSet.includes(idx);
          return (
            <button key={idx} disabled={busy} onClick={() => tap(idx)} style={{minHeight: TAP, 
              padding: "9px 14px", borderRadius: 10, cursor: busy ? "wait" : "pointer", fontSize: 13.5, fontWeight: 700,
              border: on ? "1.5px solid #2A6FDB" : "1.5px solid #E0DCD4",
              background: on ? "#EBF2FE" : "#fff", color: on ? "#2A6FDB" : "#555",
            }}>{op}</button>
          );
        })}
      </div>
      {maxChoices > 1 && (
        <button disabled={submitDisabled} onClick={() => post(picked)} style={{minHeight: TAP, 
          marginTop: 10, width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
          background: submitDisabled ? "#c9d6ea" : "#2A6FDB", color: "#fff",
          fontSize: 14, fontWeight: 800, cursor: submitDisabled ? "default" : "pointer",
        }}>{busy ? "제출 중..." : needMore ? `${maxChoices}개를 선택해주세요 (${picked.length}/${maxChoices})` : submitted ? (dirty ? "변경 저장" : "제출됨") : "제출하기"}</button>
      )}
      {/* [수정 07-30] 경고 색 조건이 "최대"를 찾는데 실제 문구엔 그 낱말이 없어 경고가 성공 초록으로 떴다. */}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.includes("실패") || msg.includes("오류") || msg.includes("유효") ? "#D2402E" : (msg.includes("개만 선택") || msg.includes("마스터")) ? "#B45309" : "#1B8A5A", fontWeight: 700 }}>{msg}</div>}
      {!submitted && !msg && <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>{maxChoices > 1 ? `원하는 항목을 꼭 ${maxChoices}개 고르고 [제출하기]를 눌러주세요.` : "선택지를 누르면 바로 제출됩니다."}</div>}
    </div>
  );
}
