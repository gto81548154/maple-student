# 마플영어 학생용 페이지 — 배포 가이드

## 📁 이 프로젝트가 뭐예요?
학생이 카톡 링크를 눌러서 자기 숙제/학원과제를 확인하는 웹앱이에요.
원장님 관리앱(maple)과 **같은 Turso DB**를 보기 때문에, 원장님이 적은 내용이 자동으로 학생에게 보여요.

---

## 🚀 배포 순서 (따라하면 됨)

### 1단계: 프로젝트 GitHub에 올리기

```bash
# 터미널에서 이 폴더로 이동
cd maple-student

# git 초기화
git init
git add .
git commit -m "학생용 페이지 v1"

# GitHub에 새 저장소 만들고 연결
# GitHub.com에서 "maple-student" 저장소를 새로 만드세요
git remote add origin https://github.com/원장님계정/maple-student.git
git branch -M main
git push -u origin main
```

### 2단계: Cloudflare Pages에 연결

1. https://dash.cloudflare.com 접속
2. 좌측 메뉴 → **Workers & Pages** → **Create**
3. **Pages** 탭 → **Connect to Git**
4. GitHub 계정 연결 → **maple-student** 저장소 선택
5. 빌드 설정:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
6. **Environment variables** (환경 변수) 추가:
   - `VITE_TURSO_URL` → 원장님 앱의 Turso URL (똑같은 거)
   - `VITE_TURSO_AUTH_TOKEN` → 원장님 앱의 Turso 토큰 (똑같은 거)
7. **Save and Deploy** 클릭!

### 3단계: 완료!

배포되면 주소가 나와요: `maple-student.pages.dev`

---

## 📱 학생한테 링크 보내는 법

카톡으로 이렇게 보내면 돼요:

```
시현아, 숙제/과제 여기서 확인해!
👉 https://maple-student.pages.dev?id=학생아이디

사파리/크롬에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있어!
```

### 학생 ID 확인하는 법
원장님 앱에서 학생을 등록할 때 자동으로 만들어지는 ID예요.
브라우저 개발자 도구(F12) → Console 에서 아래 입력하면 전체 목록 볼 수 있어요:

```javascript
turso.execute("SELECT value FROM kv_store WHERE key = 'stu3'").then(r => {
  JSON.parse(r.rows[0].value).forEach(s => console.log(s.id, s.name));
});
```

---

## ⚠️ 환경 변수(Turso 정보) 확인하는 법

원장님의 기존 앱 Cloudflare Pages 설정에 들어가면 환경 변수가 있어요:
1. Cloudflare 대시보드 → Workers & Pages → **maple** (기존 앱)
2. Settings → Environment variables
3. `VITE_TURSO_URL`과 `VITE_TURSO_AUTH_TOKEN` 값 복사
4. 새 프로젝트(maple-student)에도 동일하게 붙여넣기

---

## 🔧 나중에 강의 영상 추가하는 법

강의 영상 목록은 Turso에 `student_videos` 키로 저장하면 돼요.
나중에 관리앱에 "영상 관리" 기능을 추가하면 자동으로 연동됩니다.

영상 데이터 형식:
```json
[
  { "id": 1, "title": "천일문 기본 1강", "url": "https://youtu.be/xxxxx", "subject": "천일문" },
  { "id": 2, "title": "천일문 기본 2강", "url": "https://youtu.be/yyyyy", "subject": "천일문" }
]
```

---

## 📊 체류 시간 확인하는 법 (원장님용)

학생의 강의 체류 시간은 Turso에 `vtime_학생아이디` 키로 저장돼요.
원장님 관리앱에서 확인하는 기능은 추후 추가 예정이에요.

임시로 확인하려면 브라우저 콘솔에서:
```javascript
turso.execute("SELECT value FROM kv_store WHERE key = 'vtime_kim-sihyun'").then(r => {
  console.log(JSON.parse(r.rows[0].value));
});
```
