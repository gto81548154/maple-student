// ─── 마플영어 학생앱 서비스 워커 — 푸시 알림 수신 전용 (2026-07-23) ───
// 역할: 워커(마플싱커)가 보낸 "빈 푸시"를 받아 알림을 띄우고 앱 아이콘에 배지(1)를 붙인다.
// 알림 문구는 도착 순간 /push/pending으로 조회한다 (페이로드 암호화가 필요 없어 구조가 단순하다).
// 주의: 캐시 기능은 일부러 넣지 않았다 — 앱 로딩·배포 방식에 영향을 주지 않기 위해서다.

const SYNC_ORIGIN = "https://maple-sync.leel0727.workers.dev";
const APP_ICON = SYNC_ORIGIN + "/pwa/icon-192.png";

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let title = "마플영어";
    let body = "새 소식이 도착했어요. 앱에서 확인해 주세요!";
    // 1) 이 기기 구독의 endpoint로 알림 문구 조회 (실패해도 기본 문구로 알림은 뜬다)
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(SYNC_ORIGIN + "/push/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        const d = await r.json().catch(() => null);
        if (d && d.title) { title = String(d.title); body = String(d.body || ""); }
      }
    } catch (e) { /* 조회 실패 시 기본 문구 사용 */ }
    // 2) 앱 아이콘 배지 (지원 기기: 설치된 PWA — 안드로이드/아이폰 16.4+)
    try {
      if (self.registration.setAppBadge) await self.registration.setAppBadge(1);
      else if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge(1);
    } catch (e) { /* 배지 미지원 기기는 무시 */ }
    // 3) 알림 표시 — 푸시를 받았으면 알림을 반드시 띄워야 브라우저가 구독을 유지해 준다
    await self.registration.showNotification(title, {
      body,
      icon: APP_ICON,
      badge: APP_ICON,
      tag: "mapl-latest", // 같은 태그면 최신 알림으로 교체 (알림이 쌓이지 않게)
      data: { url: "/" },
    });
  })());
});

// 알림을 누르면 학생앱을 연다 (이미 열려 있으면 그 창으로 포커스)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    try {
      if (self.registration.clearAppBadge) await self.registration.clearAppBadge();
      else if (self.navigator && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
    } catch (e) { /* 무시 */ }
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) return c.focus();
    }
    return self.clients.openWindow("/");
  })());
});
