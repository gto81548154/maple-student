/* global __BUILD_ID__ */
// [142차수] 빌드 번호와 "캐시 비우고 새로고침" — vite.config.js 가 define 으로 박아 주는 빌드 시각(ISO).
//   같은 값이 /version.json 에도 있어, 둘이 다르면 "새 판이 올라왔다"는 뜻(useAppUpdate).
export const APP_BUILD_ID = (typeof __BUILD_ID__ === "string" && __BUILD_ID__) ? __BUILD_ID__ : "";

// 빌드 시각 → "2026-11-03 16:40 판" (폰 시간대 기준). 값이 없거나 이상하면 "".
export const fmtBuildLabel = (iso = APP_BUILD_ID) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} 판`;
};

// 브라우저 캐시 저장소(caches)를 전부 비운 뒤 새로고침. 캐시 API가 없거나 실패해도 새로고침은 한다.
//   (옛 index.html 이 캐시에 남아 옛 화면이 보이는 것을 학생이 스스로 풀 수 있게 — 더보기 > 앱 설정 [앱 새로고침], 띠의 [지금 적용])
export const clearCachesAndReload = async () => {
  try {
    if (typeof caches !== "undefined" && caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { /* 캐시를 못 비워도 새로고침은 한다 */ }
  try { window.location.reload(); } catch (e) {}
};
