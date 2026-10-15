// [133차수] 화면 주소(#해시)와 폰 뒤로가기 — 원장앱 186·231차수와 같은 방식.
// - 화면마다 주소가 붙는다: …?id=…&t=…#tasks 처럼. 새로고침해도 보던 화면이 그대로 열린다.
// - 폰(브라우저) 뒤로가기·앞으로가기 = 앱 안 이전·다음 화면. 홈에서 뒤로가기는 지금처럼 앱을 나간다(쌓인 칸이 없으니).
// - 주소는 화면 이름만 담는다(학생 id·열쇠는 ?뒤 그대로). 모르는 주소는 기본 화면으로.
// - 브라우저 기록 칸마다 { pg: 화면, idx: 몇 번째 칸, …세부 } 를 적어 둔다. idx 는 "뒤로가기를 거절했을 때 몇 칸 되돌릴지"를 세는 데 쓴다.

export const routeFromHash = (ids, hash) => {
  const h = String(hash || "").replace(/^#\/?/, "").split(/[/?]/)[0].trim();
  return ids.includes(h) ? h : null;
};

export const readHistIdx = () => {
  try { const st = window.history.state; return st && typeof st.idx === "number" ? st.idx : 0; } catch (e) { return 0; }
};

// 처음 열 때: 주소에 화면이 있으면 그 화면, 없으면 기본 화면. 주소도 같이 맞춰 둔다(idx·세부는 있으면 그대로 — 새로고침 때 칸 번호와 열어 둔 책이 안 흐트러지게).
export const readInitialRoute = (ids, fallback) => {
  let pg = fallback;
  try {
    pg = routeFromHash(ids, window.location.hash) || fallback;
    const old = window.history.state || {};
    window.history.replaceState({ ...old, pg, idx: readHistIdx() }, "", "#" + pg);   // 세부(열어 둔 책·날짜 등)는 그대로 두고 화면 이름·칸 번호만 맞춘다
  } catch (e) {}
  return pg;
};

// 화면을 옮길 때 주소를 한 칸 쌓는다(뒤로가기로 돌아올 수 있게). extra = 세부(예: 열어 둔 강의 { v: id }).
export const pushRoute = (pg, extra) => {
  try { window.history.pushState({ ...(extra || {}), pg, idx: readHistIdx() + 1 }, "", "#" + pg); } catch (e) {}
};

// 지금 칸을 이 화면으로 바꿔 쓴다(쌓지 않고).
export const replaceRoute = (pg, extra) => {
  try { window.history.replaceState({ ...(extra || {}), pg, idx: readHistIdx() }, "", "#" + pg); } catch (e) {}
};

export const goBackRoute = () => { try { window.history.back(); } catch (e) {} };
