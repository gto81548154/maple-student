import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';

// [142차수] 빌드 번호 = 빌드(또는 dev 서버) 시작 시각(ISO 문자열).
//   · 앱 코드에는 __BUILD_ID__ 로 박히고(define) · 같은 값이 public/version.json 에도 쓰인다(buildStart — dev 때도 돈다).
//   · 학생앱은 켜질 때/다시 보일 때/30분마다 /version.json 을 읽어 자기 __BUILD_ID__ 와 다르면 "🆕 업데이트가 있어요" 띠를 띄운다(useAppUpdate).
//   · public/version.json 은 빌드마다 새로 만들어지는 파일이라 깃에 넣지 않는다(.gitignore).
const BUILD_ID = new Date().toISOString();
function versionJsonPlugin() {
  return {
    name: 'maple-version-json',
    buildStart() {
      mkdirSync('public', { recursive: true });
      writeFileSync('public/version.json', JSON.stringify({ build: BUILD_ID }) + '\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
});
