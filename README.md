# 마플영어 학생용 페이지

> 학생이 카톡 링크를 눌러서 자기 숙제/과제를 확인하고 강의를 보는 웹앱.
> 원장님 관리앱(`academy-mgmt`)과 같은 데이터를 보여줘서, 원장님이 입력한 내용이 자동으로 학생에게 표시됩니다.

---

## 📡 데이터 흐름 (어떻게 동기화되나)

```
[원장님 관리앱 academy-mgmt]
         ↓ 입력/저장
    [Turso DB]
         ↓ maple-sync Worker (Cloudflare cron, 자동)
    [Supabase DB]
         ↓ 읽기
[학생 앱 maple-student]  ← 지금 이 프로젝트
```

**핵심:** 학생 앱은 **Supabase**를 봅니다. (Turso 직접 X)
admin 앱이 Turso에 저장 → maple-sync Worker가 자동으로 Supabase로 복사 → 학생 앱이 읽음.

---

## 🌐 운영 도메인

```
https://maple-student.leel0727.workers.dev
```

학생에게 줄 링크 형식:

```
https://maple-student.leel0727.workers.dev/?id={학생ID}
```

---

## 📱 학생한테 링크 보내는 법

### 🆕 가장 편한 방법 (권장)

원장님 관리앱(`academy-mgmt`) → **학생관리 페이지** → 학생 옆 **🔗 링크** 버튼 클릭 → 자동 복사됨 → 카톡에 붙여넣기.

카톡 메시지 예시:

```
시현아, 숙제/과제 여기서 확인해!
👉 https://maple-student.leel0727.workers.dev/?id=1773755335464

사파리/크롬에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있어!
```

### 학생 ID 직접 확인이 필요할 때 (드물게)

Supabase 대시보드 → SQL Editor에서:

```sql
SELECT value FROM kv_store WHERE key = 'stu3';
```

→ 결과의 JSON에 학생들 `id`와 `name`이 들어있음.

---

## ⚙️ 환경변수 (Cloudflare Pages 설정)

학생 앱은 **Supabase**를 사용합니다.

| 키 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

확인 방법:
1. Cloudflare 대시보드 → Workers & Pages → **maple-student** 클릭
2. Settings → Environment variables
3. 위 두 키가 들어있는지 확인

> ⚠️ Turso 환경변수(`VITE_TURSO_*`)는 학생 앱에 **필요 없습니다.**
> Turso는 admin 앱(`academy-mgmt`)과 maple-sync Worker만 사용합니다.

---

## 🚀 처음부터 배포할 때 (참고용)

이미 배포된 상태라 평소엔 GitHub에 푸시만 하면 Cloudflare가 자동 빌드합니다.
새로 처음 셋업하는 경우만 아래 따라하세요.

### 1단계: GitHub에 코드 올리기

```bash
cd maple-student
git init
git add .
git commit -m "학생용 페이지"
git remote add origin https://github.com/원장님계정/maple-student.git
git branch -M main
git push -u origin main
```

### 2단계: Cloudflare Pages 연결

1. https://dash.cloudflare.com → **Workers & Pages** → **Create**
2. **Pages** 탭 → **Connect to Git** → maple-student 저장소 선택
3. 빌드 설정:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables**에 위 표의 두 키 추가
5. **Save and Deploy**

### 3단계: 평소 업데이트

GitHub `main` 브랜치에 푸시 → Cloudflare가 1~2분 안에 자동 빌드/배포.

---

## 📋 학생이 보는 화면 (5단계 시스템)

학생 앱은 admin이 입력한 5칸 입력(`steps5`)을 단계별로 표시합니다.

| 단계 | 학생 화면 라벨 | 검사 담당 |
|---|---|---|
| step1 | **숙제** | 조교 + 강사 |
| step2 | **단어 TEST** | 조교 |
| step3 | **오늘 수업** | 강사 (`→ 수업 준비되면 조교T 한테 말씀드리기` 안내 표시) |
| step4 | **마무리 TEST** | 조교 |
| step5 | **받을 자료** | 강사 |

**빈 단계는 자동으로 숨겨지고, 보이는 단계만 1, 2, 3... 으로 재번호됩니다.**

옛날 데이터(`homework`/`academy`만 있는 학생)는 자동으로:
- `homework` → step1(숙제)
- `academy` → step3(오늘 수업)
로 폴백 표시됩니다.

---

## 🎬 강의 영상 관리

영상 목록은 Supabase의 `kv_store` 테이블에 `student_videos` 키로 저장됩니다.

영상 데이터 형식:

```json
[
  { "id": 1, "title": "천일문 기본 1강", "url": "https://youtu.be/xxxxx", "subject": "천일문" },
  { "id": 2, "title": "천일문 기본 2강", "url": "https://youtu.be/yyyyy", "subject": "천일문" }
]
```

YouTube 단일 영상 + 재생목록(`playlistUrl` 필드 사용) 모두 지원.

---

## 📊 체류 시간 확인 (원장님용)

학생의 영상 체류 시간은 Supabase에 두 키로 저장됩니다:

- `vtime_{학생ID}` — 시청 세션 로그 (timestamp 단위)
- `video_watch` — 학생별 영상별 누적 집계

Supabase SQL Editor에서:

```sql
-- 특정 학생의 시청 로그
SELECT value FROM kv_store WHERE key = 'vtime_1773755335464';

-- 전체 영상 시청 집계
SELECT value FROM kv_store WHERE key = 'video_watch';
```

> 시청 시간 추적은 학생 앱이 Supabase에 직접 쓰는 데이터이므로,
> Turso의 `video_watch` 키는 비어있는 게 정상입니다 (maple-sync 응답에서 `missing: ["video_watch"]`로 표시됨).

---

## 🛠️ 관련 프로젝트

| 프로젝트 | 역할 | 기술 |
|---|---|---|
| **maple-student** (이 프로젝트) | 학생용 화면 | React + Vite, Supabase 읽기 |
| **academy-mgmt** | 원장님 관리앱 | React + Vite, Turso 읽기/쓰기 |
| **maple-sync** | Turso ↔ Supabase 동기화 Worker | Cloudflare Worker, cron |

---

## 📝 변경 이력 요약

| 시기 | 내용 |
|---|---|
| 초기 | Turso 직접 연결 (옛 README는 이 시점 기준이었음) |
| 이후 | Supabase로 전환 + maple-sync Worker로 자동 동기화 |
| 최근 | 5단계 시스템(step1~5) 표시 적용 |
| 최근 | admin 앱에 학생관리 🔗 링크 복사 버튼 추가 |
