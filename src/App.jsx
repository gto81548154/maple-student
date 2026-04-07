import { useState, useEffect } from "react";
import { createClient } from '@supabase/supabase-js';

// ─── Supabase 연결 (원장님 앱과 같은 DB) ───
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const db = {
  async get(k) {
    try {
      const { data, error } = await supabase
        .from("kv_store")
        .select("value")
        .eq("key", k)
        .maybeSingle();
      if (error || !data) return null;
      if (typeof data.value === 'string') {
        return JSON.parse(data.value);
      }
      return data.value;
    } catch (e) { console.error("DB get error:", e); return null; }
  },
  async set(k, v) {
    try {
      await supabase
        .from("kv_store")
        .upsert({ key: k, value: JSON.stringify(v) }, { onConflict: "key" });
    } catch (e) { console.error("DB set error:", e); }
  },
};

// ─── Helpers ───
const DK = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };
const fmtDateKR = (ds) => { const d = new Date(ds + "T00:00:00"); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DK[d.getDay()]}요일`; };
const fmtDateShort = (ds) => { const d = new Date(ds + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}(${DK[d.getDay()]})`; };
const isToday = (ds) => { const t = new Date(); return ds === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const getTodayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

// ─── stripLabels (원장님 앱과 동일) ───
const stripLabels = (v) => v.split('\n').filter(l => !/^\s*\[(숙제|학원|학원과제)\]\s*$/.test(l)).join('\n');

// ─── Main App ───
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [student, setStudent] = useState(null);
  const [todos, setTodos] = useState({});
  const [checklistData, setChecklistData] = useState({});
  const [records, setRecords] = useState({});
  const [videos, setVideos] = useState([]);
  const [tab, setTab] = useState("tasks");
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingVideo, setViewingVideo] = useState(null);
  const [viewStartTime, setViewStartTime] = useState(null);

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    const load = async () => {
      try {
        const [stuData, todoData, chkData, recData, vidData] = await Promise.all([
          db.get("stu3"), db.get("todo4"), db.get("chk3"), db.get("rec3"), db.get("student_videos"),
        ]);
        const found = (stuData || []).find(s => String(s.id) === String(studentId));
        if (!found) { setError("not_found"); setLoading(false); return; }
        setStudent(found);
        setTodos(todoData || {});
        setChecklistData(chkData || {});
        setRecords(recData || {});
        setVideos(vidData || []);
      } catch (e) {
        console.error("Load error:", e);
        setError("load_error");
      }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [studentId]);

  const openVideo = (video) => {
    setViewingVideo(video);
    setViewStartTime(Date.now());
  };

  const closeVideo = async () => {
    if (viewingVideo && viewStartTime) {
      const elapsed = Math.round((Date.now() - viewStartTime) / 1000);
      try {
        const key = `vtime_${studentId}`;
        const existing = await db.get(key) || [];
        existing.push({ videoId: viewingVideo.id, title: viewingVideo.title, seconds: elapsed, date: getTodayStr(), timestamp: new Date().toISOString() });
        await db.set(key, existing);
      } catch (e) { console.error("체류시간 저장 실패:", e); }
    }
    setViewingVideo(null);
    setViewStartTime(null);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (viewingVideo && viewStartTime) {
        const elapsed = Math.round((Date.now() - viewStartTime) / 1000);
        try {
          const pending = JSON.parse(localStorage.getItem("pending_vtime") || "[]");
          pending.push({ studentId, videoId: viewingVideo.id, title: viewingVideo.title, seconds: elapsed, date: getTodayStr(), timestamp: new Date().toISOString() });
          localStorage.setItem("pending_vtime", JSON.stringify(pending));
        } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [viewingVideo, viewStartTime, studentId]);

  useEffect(() => {
    const flush = async () => {
      try {
        const pending = JSON.parse(localStorage.getItem("pending_vtime") || "[]");
        if (pending.length === 0) return;
        for (const item of pending) {
          const key = `vtime_${item.studentId}`;
          const existing = await db.get(key) || [];
          existing.push(item);
          await db.set(key, existing);
        }
        localStorage.removeItem("pending_vtime");
      } catch (e) { /* ignore */ }
    };
    flush();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#4a6cf7", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 14, color: "#999" }}>불러오는 중...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>링크를 확인해주세요</div>
          <div style={{ fontSize: 14, color: "#999", lineHeight: 1.6 }}>선생님이 보내주신 링크로<br />접속해주세요</div>
        </div>
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>학생 정보를 찾을 수 없어요</div>
          <div style={{ fontSize: 14, color: "#999", lineHeight: 1.6 }}>링크가 올바른지 선생님께<br />다시 확인해주세요</div>
          <div style={{ fontSize: 12, color: "#ccc", marginTop: 16 }}>ID: {studentId}</div>
        </div>
      </div>
    );
  }

  if (error === "load_error") {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f7fb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>연결 오류</div>
          <div style={{ fontSize: 14, color: "#999", marginBottom: 20 }}>잠시 후 다시 시도해주세요</div>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#4a6cf7", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>다시 시도</button>
        </div>
      </div>
    );
  }

  if (!student) return null;

  const sRec = records[studentId] || records[Number(studentId)] || {};
  const pinnedMessages = Object.entries(sRec)
    .filter(([, v]) => v && v.pinned)
    .sort(([a], [b]) => b.localeCompare(a));

  const allDates = Object.keys(todos)
    .filter((d) => {
      const t = todos[d]?.[studentId] || todos[d]?.[Number(studentId)];
      if (!t) return false;
      const hw = stripLabels(t.homework || "").trim();
      const ac = stripLabels(t.academy || "").trim();
      return hw || ac;
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 20);

  const activeDate = selectedDate || allDates[0] || getTodayStr();
  const todo = todos[activeDate]?.[studentId] || todos[activeDate]?.[Number(studentId)] || {};
  const hwLines = stripLabels(todo.homework || "").split("\n").filter((l) => l.trim());
  const acLines = stripLabels(todo.academy || "").split("\n").filter((l) => l.trim());

  const chk = checklistData[activeDate]?.[studentId] || checklistData[activeDate]?.[Number(studentId)] || {};
  const isChecked = (type, idx) => !!chk[`${type}_${idx}`];

  const totalTasks = hwLines.length + acLines.length;
  const doneTasks = [
    ...hwLines.map((_, i) => isChecked("hw", i)),
    ...acLines.map((_, i) => isChecked("ac", i)),
  ].filter(Boolean).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const studentVideos = videos.filter(v => !v.studentId || v.studentId === studentId);

  if (viewingVideo) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", fontFamily: "'Pretendard Variable', -apple-system, sans-serif" }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={closeVideo} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{viewingVideo.title}</span>
        </div>
        <div style={{ padding: 20 }}>
          {viewingVideo.type === "playlist" && viewingVideo.playlistUrl ? (
            <div style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "16/9", marginBottom: 20 }}>
              <iframe
                src={`https://www.youtube.com/embed/videoseries?list=${extractPlaylistId(viewingVideo.playlistUrl)}&rel=0`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : viewingVideo.url && viewingVideo.url.includes("youtu") ? (
            <div style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "16/9", marginBottom: 20 }}>
              <iframe
                src={`https://www.youtube.com/embed/${extractYoutubeId(viewingVideo.url)}?rel=0`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 20 }}>
              <a href={viewingVideo.url} target="_blank" rel="noreferrer" style={{ background: "#ff0033", color: "#fff", padding: "12px 28px", borderRadius: 12, textDecoration: "none", fontSize: 15, fontWeight: 600 }}>▶ 영상 보기</a>
            </div>
          )}
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 16, border: "1px solid rgba(255,255,255,0.06)", fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            💡 이 페이지에서 영상을 시청하세요.<br />전체화면으로 보려면 영상 우측 하단 버튼을 누르세요.
          </div>
        </div>
      </div>
    );
  }

  const F = "'Pretendard Variable', -apple-system, sans-serif";
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb", fontFamily: F }}>
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", padding: "28px 24px 24px", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: pinnedMessages.length > 0 ? 16 : 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)" }}>
            {student.name?.[0] || "?"}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
              {student.name}
              <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>
                {student.school || ""} {student.grade || ""}
              </span>
            </div>
          </div>
        </div>
        {pinnedMessages.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pinnedMessages.map(([dateKey, rec]) => (
              <div key={dateKey} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", borderLeft: "3px solid #ffd43b" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>📌</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {fmtDateShort(dateKey)} · {rec.author || "선생님"}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rec.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalTasks > 0 && (
        <div style={{ padding: "14px 24px", background: "#fff", borderBottom: "1px solid #eee" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: "#999" }}>과제 진행률</span>
            <span style={{ color: pct === 100 ? "#00b894" : "#333", fontWeight: 700 }}>
              {doneTasks}/{totalTasks} ({pct}%){pct === 100 && " 🎉"}
            </span>
          </div>
          <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg, #00b894, #69f0ae)" : "linear-gradient(90deg, #4fc3f7, #7c4dff)", transition: "width 0.5s cubic-bezier(.4,0,.2,1)" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 10 }}>
        {[
          { key: "tasks", label: "📋 숙제/과제" },
          ...(studentVideos.length > 0 ? [{ key: "videos", label: "🎬 강의 영상" }] : []),
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "14px 0", border: "none", cursor: "pointer",
            background: "transparent", fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? "#1a1a2e" : "#999",
            borderBottom: tab === t.key ? "2.5px solid #1a1a2e" : "2.5px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        {tab === "tasks" && (
          <>
            {allDates.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
                {allDates.map((d) => (
                  <button key={d} onClick={() => setSelectedDate(d)} style={{
                    flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: d === activeDate ? "#1a1a2e" : "#fff",
                    color: d === activeDate ? "#fff" : "#666",
                    boxShadow: d === activeDate ? "0 2px 8px rgba(26,26,46,0.25)" : "0 1px 3px rgba(0,0,0,0.06)",
                    whiteSpace: "nowrap",
                  }}>{isToday(d) ? "📌 오늘" : fmtDateShort(d)}</button>
                ))}
              </div>
            )}
            {allDates.length > 0 && (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: "12px 0 16px" }}>
                {fmtDateKR(activeDate)}
                {isToday(activeDate) && <span style={{ fontSize: 12, color: "#7c4dff", marginLeft: 8, fontWeight: 600 }}>TODAY</span>}
              </div>
            )}
            <TaskSection label="숙제" color="#e84393" bg="#fdf2f8" lines={hwLines} type="hw" isChecked={isChecked} />
            <TaskSection label="학원과제" color="#4a6cf7" bg="#eef1ff" lines={acLines} type="ac" isChecked={isChecked} />
            {hwLines.length === 0 && acLines.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#999" }}>
                  {allDates.length === 0 ? "등록된 과제가 아직 없어요" : "이 날짜에 등록된 과제가 없어요"}
                </div>
              </div>
            )}
          </>
        )}
        {tab === "videos" && (
          <div>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>강의를 눌러 시청하세요.</div>
            {studentVideos.map((v) => (
              <div key={v.id} onClick={() => openVideo(v)} style={{
                background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: v.type === "playlist" ? "linear-gradient(135deg, #e74c3c, #e67e22)" : "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{v.type === "playlist" ? "📋" : "▶️"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>{v.title}</div>
                  <div style={{ fontSize: 12, color: "#bbb", marginTop: 3 }}>{v.type === "playlist" ? "재생목록 전체 보기" : (v.subject || "")}</div>
                </div>
                <div style={{ color: "#ccc", fontSize: 18 }}>›</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function extractYoutubeId(url) {
  if (!url) return "";
  let m = url.match(/youtu\.be\/([^?&]+)/);
  if (m) return m[1];
  m = url.match(/[?&]v=([^?&]+)/);
  if (m) return m[1];
  m = url.match(/embed\/([^?&]+)/);
  if (m) return m[1];
  return "";
}

function extractPlaylistId(url) {
  if (!url) return "";
  const m = url.match(/[?&]list=([^?&]+)/);
  return m ? m[1] : "";
}

function TaskSection({ label, color, bg, lines, type, isChecked }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, padding: "6px 12px", background: bg, borderRadius: "10px 10px 0 0", display: "inline-block", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ background: "#fff", borderRadius: "0 12px 12px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
        {lines.map((line, i) => {
          const done = isChecked(type, i);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              borderBottom: i < lines.length - 1 ? "1px solid #f5f5f5" : "none",
              background: done ? "#f0fdf4" : "#fff",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                border: done ? "none" : "2px solid #e0e0e0",
                background: done ? "linear-gradient(135deg, #00b894, #00cec9)" : "#f9f9f9",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: done ? "#999" : "#333", textDecoration: done ? "line-through" : "none" }}>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
