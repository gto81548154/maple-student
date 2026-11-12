import { useEffect, useState } from "react";
import { teacherUrl, TEACHER_AUTH } from "../../core/auth.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { createToeicSync } from "../../domain/toeicSync.mjs";

// [162] 답안지가 기기에 보관하는 답의 저장 이름. 답안지(ToeicAnswerSheet)와 버리기(discard)가 같은 이름을 쓴다.
export const toeicDraftKey = id => "mapl_toeic_draft_v1:" + WORKER_ORIGIN + ":" + (TEACHER_AUTH?.tid || "") + ":" + id;
export const TOEIC_DRAFT_EVENT = "mapl-toeic-draft";

// The key contains the account ID, never its secret link/token.
export function useOwnerToeic(enabled) {
  const [sync] = useState(() => createToeicSync({
    storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) },
    locks: navigator.locks,
    key: "mapl_toeic_outbox_v1:" + WORKER_ORIGIN + ":" + (TEACHER_AUTH?.tid || ""),
    url: () => teacherUrl("/teacher/toeic"),
  }));
  const [state, setState] = useState(() => sync.snapshot());
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = sync.subscribe(setState);
    void sync.retry();
    const online = () => { void sync.retry(); };
    const storage = event => { if (event.key?.startsWith("mapl_toeic_outbox_v1:")) sync.refresh(); };
    window.addEventListener("online", online);
    window.addEventListener("storage", storage);
    return () => { unsubscribe(); window.removeEventListener("online", online); window.removeEventListener("storage", storage); };
  }, [enabled, sync]);
  return { ...state,
    load: sync.retry, retry: sync.retry, reload: sync.load, current: sync.snapshot,
    save: (id, patch) => enabled ? sync.enqueue({ id, ...patch }) : Promise.resolve(false),
    saveP5: (id, ok) => enabled ? sync.enqueue({ p5: [{ id, ok }] }) : Promise.resolve(false),
    // [162] 서버가 거절한 맨 앞 기록 버리기. 답안·채점 기록이면 그 답을 기기 보관 답으로 되살려 두고 답안지에 알린다.
    discard: async () => {
      if (!enabled) return null;
      const body = await sync.discardHead();
      const answers = body && (body.submitAnswers || body.answerDraft);
      if (answers && body.id) {
        // [177차수] 버린 답을 기기 보관 답으로 되살리는 것은 "더 새 답이 없을 때"만 한다. 전에는 무조건 덮어써서,
        //   막힌 뒤에 새로 넣은 답(기기 보관 답이나 대기 중인 더 나중 저장)이 옛 답으로 바뀌었다.
        let hasNewer = !!body._superseded;
        try { if (window.localStorage.getItem(toeicDraftKey(body.id))) hasNewer = true; } catch { /* 못 읽으면 덮어쓰지 않는 쪽이 안전 */ hasNewer = true; }
        if (!hasNewer) {
          try { window.localStorage.setItem(toeicDraftKey(body.id), JSON.stringify(answers)); } catch { /* 보관 못 해도 버리기는 끝난 상태 */ }
          window.dispatchEvent(new CustomEvent(TOEIC_DRAFT_EVENT, { detail: { id: body.id } }));
        }
      }
      return body;
    },
  };
}
