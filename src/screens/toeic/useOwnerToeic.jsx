import { useEffect, useState } from "react";
import { teacherUrl, TEACHER_AUTH } from "../../core/auth.jsx";
import { WORKER_ORIGIN } from "../../core/config.jsx";
import { createToeicSync } from "../../domain/toeicSync.mjs";

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
  };
}
