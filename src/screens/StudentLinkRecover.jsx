import { TAP } from "../theme/tokens.jsx";
import { useState } from "react";
import { LINK_STORE_KEY, MASTER_MK_KEY, saveTeacherLink } from "../core/auth.jsx";
import { QrBox } from "../ui/Qr.jsx";

// ─── Main App ───
// id 없이 (설치 앱이 쿼리를 잃은 채) 열렸을 때: 이름+전화 뒷4자리로 본인 확인
export function StudentLinkRecover({ apiBase }) {
  const [name, setName] = useState("");
  const [tail, setTail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [conflict, setConflict] = useState(false);
  // 마플영어 카톡 친구추가 QR. 원장 개인 연락처는 번들(공개 파일)에 넣지 않는다.
  // 이 주소는 스캔 전용이라 탭해도 카톡이 열리지 않으므로 링크가 아니라 QR로만 띄운다.
  const OWNER_KAKAO_QR = "http://qr.kakao.com/talk/2cbX2.v5KiS_mtOAbkXav4jlZC0-";
  const submit = async () => {
    const nm = name.trim();
    const tl = tail.replace(/[^0-9]/g, "").slice(-4);
    if (!nm || tl.length !== 4) { setMsg("이름과 전화 뒷 4자리를 정확히 입력해주세요."); return; }
    setBusy(true); setMsg(""); setConflict(false);
    try {
      const r = await fetch(new URL(apiBase).origin + "/student/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, tail: tl }),
      });
      const d = await r.json();
      // [마스터] 원장 진입 — 워커만이 판별값을 알고, 통과하면 열쇠(mk)를 내려준다.
      // 열쇠는 폰에만 보관하고 주소창에는 ?master=1 만 남긴다.
      if (d && d.success && d.master && d.mk) {
        try { localStorage.setItem(MASTER_MK_KEY, d.mk); } catch (e) {}
        window.location.href = window.location.pathname + "?master=1";
        return;
      }
      // [교사 08-27] 선생님 진입 — 계정관리의 이름 + 연락처 뒷 4자리가 맞으면 워커가 교사 링크를 내려준다.
      //   링크를 잃어버렸거나 폰을 바꾼 선생님이 원장님을 거치지 않고 다시 들어오는 길.
      if (d && d.success && d.teacher && d.tid && d.tk) {
        saveTeacherLink(d.tid, d.tk);
        const sp = new URLSearchParams();
        sp.set("tid", d.tid); sp.set("tk", d.tk);
        window.location.href = window.location.pathname + "?" + sp.toString();
        return;
      }
      if (d && d.success && d.id) {
        try { localStorage.setItem(LINK_STORE_KEY, JSON.stringify({ id: d.id, t: d.t || "" })); } catch (e) {}
        const sp = new URLSearchParams();
        sp.set("id", d.id); if (d.t) sp.set("t", d.t);
        window.location.href = window.location.pathname + "?" + sp.toString();
        return;
      }
      if (d && d.code === "conflict") setConflict(true);
      setMsg(d?.error || "확인에 실패했습니다.");
    } catch (e) {
      setMsg("네트워크 오류입니다. 잠시 후 다시 시도해주세요.");
    } finally { setBusy(false); }
  };
  const inp = { width: "100%", padding: "13px 14px", fontSize: 16, border: "1px solid #dfe3ef", borderRadius: 10, boxSizing: "border-box", background: "#fff", outline: "none" };
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#222", marginBottom: 6 }}>처음 한 번만 확인할게요</div>
        <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.6, marginBottom: 22 }}>이름과 전화번호 뒷 4자리를 입력하면<br />다음부터 바로 열려요<br /><span style={{ fontSize: 12.5, color: "#a8aeb8" }}>선생님도 같은 방법으로 들어옵니다</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#666", display: "block", marginBottom: 5 }}>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="본인 이름" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#666", display: "block", marginBottom: 5 }}>전화번호 뒷 4자리</label>
            <input value={tail} onChange={(e) => setTail(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} inputMode="numeric" placeholder="예: 5089" style={{ ...inp, letterSpacing: 4, fontWeight: 700 }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
        </div>
        {msg && <div style={{ fontSize: 12.5, color: conflict ? "#b45309" : "#dc2626", marginTop: 12, lineHeight: 1.5 }}>{msg}</div>}
        <button onClick={submit} disabled={busy} style={{ minHeight: TAP, width: "100%", marginTop: 18, padding: "14px 0", fontSize: 15.5, fontWeight: 800, color: "#fff", background: busy ? "#9bb4cc" : "#1C66A5", border: "none", borderRadius: 10, cursor: busy ? "default" : "pointer" }}>{busy ? "확인 중..." : "확인"}</button>
        {conflict && (
          <div style={{ marginTop: 12, padding: "16px 14px", background: "#FEF7E0", border: "1px solid #F3D97B", borderRadius: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#7A5A00", marginBottom: 10 }}>💬 마플영어 카톡으로 문의해주세요</div>
            <QrBox value={OWNER_KAKAO_QR} size={168} />
            <div style={{ fontSize: 11.5, color: "#8B7540", marginTop: 8, lineHeight: 1.5 }}>친구추가 QR입니다. 다른 폰의 카메라나 카톡 QR로 찍어주세요.</div>
          </div>
        )}
      </div>
    </div>
  );
}
