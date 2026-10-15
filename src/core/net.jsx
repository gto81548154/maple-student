
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`학생 동기화 API 응답 지연: ${Math.round(timeoutMs / 1000)}초 초과`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
};
// [110차수 09-09] 위 함수는 "답이 시작될 때(헤더)"까지만 재고 타이머를 지웠다 — 본문을 받다가 멈추면 영영 기다릴 수 있었다(09-09 검토 3.2).
//   이 함수는 본문을 다 받을 때까지 같은 타이머 안에서 기다린다. 결과 = { resp, text }. 학생 자료 받기·시청 기록 저장이 쓴다.
export const fetchTextWithTimeout = async (url, options = {}, timeoutMs = 10000, label = "학생 동기화 API") => {
  const controller = new AbortController();
  let timer, timedOut = false;
  const timeoutError = () => new Error(label + " 응답 지연: " + Math.round(timeoutMs / 1000) + "초 초과");
  // 취소 신호가 처리되지 않는 환경에서도 화면 대기는 반드시 끝낸다.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(timeoutError()); controller.abort(); }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      return { resp, text: await resp.text() };
    })(), deadline]);
  } catch (e) {
    if (timedOut || e?.name === "AbortError") throw timeoutError();
    throw e;
  } finally { clearTimeout(timer); }
};
export const clampNum = (v, min = 0, max = 21600) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
};
