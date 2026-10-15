import { TAP } from "../../theme/tokens.jsx";
import { useEffect, useRef, useState } from "react";
import { teacherLinkDead, teacherUrl } from "../../core/auth.jsx";
import { NS_FILE_MAX_BYTES, chunkNsSets, fmtNsWhen, nsLine, nsSetKey, readNsFile } from "../../domain/nsUpload.jsx";

// ─── [127차수 10-12] 선생님 홈·원장 홈 "내신 단어 올리기" (원장 결정 10-12, 화면 모형 "내신단어-올리기-화면모형-1012") ───
//   앱용 단어 파일(…앱단어.json)을 끌어다 놓거나 고르면 → 파일마다 "어느 학교 · 어느 시험 · 무슨 단어 · 몇 개" 한 줄 → [올리기]를 눌러야 올라간다.
//   올리면 학생 앱에 바로 보인다. 아래 "최근 올린 것"에서 되돌릴 수 있다(조교는 자기가 올린 것만, 원장은 전부 — 판정은 마플싱커가 한다).
const P = "#6a4bc4", P_BG = "#f6f2ff", LINE = "#e8eaef", SUB = "#6a7080";
const chip = { display: "inline-block", fontSize: 12, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "#eee9fb", color: "#55399f", marginRight: 6, whiteSpace: "nowrap" };
const row = { display: "flex", alignItems: "center", gap: 10, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", marginBottom: 7, background: "#fff" };
const smallBtn = (strong) => ({ flexShrink: 0, minHeight: 44, padding: "0 12px", borderRadius: 10, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  border: strong ? `1.5px solid ${P}` : "1px solid #d5d8e2", background: "#fff", color: strong ? "#55399f" : SUB });

const NET_FAIL = "서버에 닿지 못했습니다. 인터넷을 확인해 주세요.";
async function callTeacher(path, body) {
  let r;
  try { r = await fetch(teacherUrl(path), body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(NET_FAIL); }   // 아예 못 닿았을 때 — 브라우저의 영어 글자("Failed to fetch") 대신 쉬운 말
  if (r.status === 403 && path !== "/teacher/ns-undo") { teacherLinkDead(); throw new Error("선생님 링크가 유효하지 않습니다"); }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.success) throw new Error((j && j.error) || NET_FAIL);
  return j;
}

export function NsUpload({ onBack, refreshKey = 0 }) {   // [135차수 s] refreshKey 가 바뀌면(머리글 ↻) "최근 올린 것"을 다시 받는다
  const [picked, setPicked] = useState([]);       // 고른 파일들 [{ id, name, ok, set, key, line, error }]
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);           // { ok, text }
  const [rows, setRows] = useState(null);         // 최근 올린 것(null = 아직 못 받음)
  const [listErr, setListErr] = useState("");
  const [askUndo, setAskUndo] = useState(0);      // 되돌리기를 한 번 누른 묶음 번호(한 번 더 눌러야 실행)
  const [over, setOver] = useState(false);
  const seqRef = useRef(0);
  const inputRef = useRef(null);
  const topRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // 화면 맨 위(제목·안내 줄)가 보이게 올린다 — 열 때, 그리고 올리기·되돌리기 결과가 나왔을 때.
  const showTop = () => { try { const el = topRef.current; if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 64), behavior: "auto" }); } catch (e) {} };
  useEffect(() => { showTop(); }, []);
  // 이 화면이 열려 있는 동안에는 파일을 칸 밖에 떨어뜨려도 브라우저가 그 파일을 열어 버리지 않게 막는다(고른 줄이 날아가지 않게).
  useEffect(() => {
    const stop = (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", stop); window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, []);

  const loadList = async () => {
    try { const j = await callTeacher("/teacher/ns-list"); setRows(Array.isArray(j.rows) ? j.rows : []); setListErr(""); }
    catch (e) { setListErr(e.message || "목록을 불러오지 못했습니다"); }
  };
  useEffect(() => { loadList(); }, [refreshKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || busyRef.current) return;   // 올리는 중에 끌어다 놓은 것은 받지 않는다(말없이 사라지지 않게)
    const read = await Promise.all(files.map(async (f) => {
      const id = ++seqRef.current;
      if (!/\.json$/i.test(f.name || "")) return { id, name: f.name, ok: false, error: "앱용 단어 파일(…앱단어.json)이 아닙니다" };
      if (f.size > NS_FILE_MAX_BYTES) return { id, name: f.name, ok: false, error: "파일이 너무 큽니다" };
      let text = "";
      try { text = await f.text(); } catch (e) { return { id, name: f.name, ok: false, error: "파일을 읽지 못했습니다" }; }
      return { id, name: f.name, ...readNsFile(text) };
    }));
    setMsg(null);
    setPicked((prev) => {
      const seen = new Set(prev.filter((p) => p.ok).map((p) => p.key));
      return [...prev, ...read.map((r) => {
        if (!r.ok) return r;
        if (seen.has(r.key)) return { id: r.id, name: r.name, ok: false, error: "같은 묶음이 이미 아래에 있습니다" };
        seen.add(r.key); return r;
      })];
    });
  };
  const good = picked.filter((p) => p.ok);
  // 이미 올라가 있는 묶음(같은 학교·연도·시험·종류·이름)인지 — 확인 줄에 "새것으로 바뀝니다"를 알려 준다.
  const liveKeys = new Set((rows || []).map((r) => nsSetKey(r)));

  const upload = async () => {
    if (busy || !good.length) return;
    setBusy(true); setMsg(null);
    let done = 0; let failText = ""; const sentIds = new Set();
    try {
      for (const part of chunkNsSets(good.map((g) => g.set))) {
        const ids = good.filter((g) => part.includes(g.set)).map((g) => g.id);
        const j = await callTeacher("/teacher/ns-upload", { sets: part });
        done += Array.isArray(j.done) ? j.done.length : part.length;
        ids.forEach((id) => sentIds.add(id));
      }
    } catch (e) { failText = e.message || "올리지 못했습니다"; }
    // 올라간 것만 목록에서 뺀다(못 올린 것은 남겨 다시 누를 수 있게). 전부 잘 올라갔으면 "올릴 수 없는 파일" 줄도 같이 치운다.
    setPicked((prev) => prev.filter((p) => !sentIds.has(p.id) && (failText || p.ok)));
    setMsg(failText
      ? { ok: false, text: done ? `${done}개는 올렸고, 나머지는 올리지 못했습니다 — ${failText}` : `올리지 못했습니다 — ${failText}` }
      : { ok: true, text: `${done}개를 올렸어요. 학생 앱에 바로 보입니다.` });
    setBusy(false);
    showTop();
    loadList();
  };
  const undo = async (r) => {
    if (busy) return;
    if (askUndo !== r.no) { setAskUndo(r.no); return; }
    setBusy(true); setMsg(null); setAskUndo(0);
    try {
      const j = await callTeacher("/teacher/ns-undo", { no: r.no });
      setMsg({ ok: true, text: j.result === "prev" ? "바로 전 것으로 되돌렸어요." : "되돌렸어요. 학생 앱에서 이 묶음이 빠졌습니다." });
    } catch (e) { setMsg({ ok: false, text: `되돌리지 못했습니다 — ${e.message || ""}` }); }
    setBusy(false);
    showTop();
    loadList();
  };

  return (
    <div data-testid="ns-upload" ref={topRef}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={onBack} style={{ border: "none", background: "transparent", color: "#1C66A5", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 44, minWidth: 44, padding: "0 6px 0 0", textAlign: "left" }}>‹ 홈</button>
        <span style={{ fontSize: 17, fontWeight: 800, color: "#1a1a2e" }}>내신 단어 올리기</span>
      </div>

      {msg && <div role="status" style={{ marginBottom: 12, padding: "11px 13px", borderRadius: 12, fontSize: 14.5, fontWeight: 800, wordBreak: "keep-all",
        background: msg.ok ? "#e8f5ed" : "#fdecea", border: `1px solid ${msg.ok ? "#bfe5ce" : "#f3c1bb"}`, color: msg.ok ? "#1f6e3f" : "#b03a2e" }}>{msg.ok ? "✓ " : "⚠ "}{msg.text}</div>}

      {/* 끌어다 놓는 자리 + 파일 고르기(폰) */}
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); addFiles(e.dataTransfer && e.dataTransfer.files); }}
        style={{ border: `2.5px dashed ${P}`, borderRadius: 16, background: over ? "#ebe3ff" : P_BG, textAlign: "center", padding: "22px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#55399f", wordBreak: "keep-all" }}>여기에 앱용 단어 파일을 끌어다 놓으세요</div>
        <div style={{ fontSize: 13, color: SUB, marginTop: 6, wordBreak: "keep-all" }}>단어 답지와 같은 폴더에 있는 “…앱단어.json” 파일 · 여러 개를 한 번에 놓아도 됩니다</div>
        <input ref={inputRef} type="file" accept=".json,application/json" multiple aria-label="앱용 단어 파일 고르기" data-testid="ns-file-input"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
        <button type="button" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}
          style={{ marginTop: 12, minHeight: 44, padding: "0 18px", borderRadius: 10, border: `1.5px solid ${P}`, background: "#fff", color: P, fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>파일 고르기</button>
      </div>

      {/* 고른 파일 — 파일마다 한 줄 확인 */}
      {picked.map((p) => (
        <div key={p.id} data-testid="ns-picked-row" style={{ ...row, ...(p.ok ? {} : { background: "#f4f5f8", borderColor: "#cfd3dd" }) }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {p.ok ? (<>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{p.line.head}</div>
              <div style={{ fontSize: 13, color: SUB, marginTop: 3, lineHeight: 1.5, overflowWrap: "anywhere" }}><span style={chip}>{p.line.kind}</span>{p.line.detail}</div>
              {liveKeys.has(p.key) && <div style={{ fontSize: 12.5, color: "#55399f", fontWeight: 800, marginTop: 3, wordBreak: "keep-all" }}>이미 올린 묶음 — 올리면 새것으로 바뀝니다</div>}
            </>) : (<>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: SUB, wordBreak: "break-all" }}>{p.name} — 올릴 수 없는 파일</div>
              <div style={{ fontSize: 13, color: "#b03a2e", marginTop: 3, fontWeight: 700, wordBreak: "keep-all" }}>{p.error}</div>
            </>)}
          </div>
          <button type="button" onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))} disabled={busy} style={smallBtn(false)} aria-label={`${p.name} 빼기`}>빼기</button>
        </div>
      ))}
      {good.length > 0 && (
        <button type="button" onClick={upload} disabled={busy}
          style={{ width: "100%", minHeight: 50, marginTop: 4, marginBottom: 6, border: "none", borderRadius: 12, background: busy ? "#b9a8e6" : P, color: "#fff", fontSize: 16.5, fontWeight: 800, cursor: busy ? "wait" : "pointer", fontFamily: "inherit" }}>
          {busy ? "올리는 중…" : `${good.length}개 올리기`}</button>
      )}

      {/* 최근 올린 것 + 되돌리기 */}
      <div style={{ fontSize: 13.5, fontWeight: 800, color: SUB, margin: "16px 2px 8px" }}>최근 올린 것</div>
      {listErr && <div style={{ ...row, color: "#b03a2e", fontSize: 13.5, fontWeight: 700 }}><span style={{ flex: 1, wordBreak: "keep-all" }}>{listErr}</span><button type="button" onClick={loadList} style={smallBtn(true)}>다시 시도</button></div>}
      {!listErr && rows === null && <div style={{ padding: "14px 4px", fontSize: 13.5, color: "#9aa0ab", fontWeight: 600 }}>불러오는 중...</div>}
      {!listErr && rows && rows.length === 0 && <div style={{ padding: "14px 4px", fontSize: 13.5, color: "#9aa0ab", fontWeight: 600 }}>아직 올린 단어가 없습니다.</div>}
      {rows && rows.map((r) => {
        const line = nsLine(r, r.n);
        const asking = askUndo === r.no;
        return (
          <div key={r.no} data-testid="ns-recent-row" style={{ ...row, flexWrap: asking ? "wrap" : "nowrap" }}>
            <div style={{ flex: asking ? "1 1 100%" : 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "#1a1a2e", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{line.head} · {r.title}</div>
              <div style={{ fontSize: 12.5, color: SUB, marginTop: 3, lineHeight: 1.5, wordBreak: "keep-all", overflowWrap: "anywhere" }}><span style={chip}>{r.kind}</span>{r.n}개{Number(r.week) > 0 ? ` · ${r.week}주차` : ""} · {fmtNsWhen(r.at)}{r.byName ? ` · ${r.byName}` : ""}</div>
            </div>
            {r.canUndo ? (asking ? (<>
              <button type="button" onClick={() => undo(r)} disabled={busy} style={{ minHeight: TAP, ...smallBtn(true), background: P, color: "#fff" }}>{r.undoTo === "prev" ? "전 것으로 되돌리기" : "목록에서 빼기"}</button>
              <button type="button" onClick={() => setAskUndo(0)} disabled={busy} style={smallBtn(false)}>취소</button>
            </>) : (
              <button type="button" onClick={() => undo(r)} disabled={busy} style={smallBtn(true)} aria-label={`${r.title} 되돌리기`}>되돌리기</button>
            )) : (
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#9aa0ab", padding: "0 2px", textAlign: "right", lineHeight: 1.35 }}>되돌리기는<br />올린 사람·원장만</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
