import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
// [175차수] 강의 시청 저장(useVideoSession)만 가짜 서버로 돌려 보는 틀. 서버 주소는 가짜(api.test.invalid) — 검사 쪽에서 가로챈다.
export default { plugins: [react()], root: here, cacheDir: path.resolve(here, "../../../node_modules/.vite-videoSession"),
  define: { "import.meta.env.VITE_VIDEO_WATCH_API_URL": JSON.stringify("https://api.test.invalid/video-watch"), "import.meta.env.VITE_VIDEO_WATCH_API_KEY": JSON.stringify("k") },
  server: { port: 5198, strictPort: true, fs: { allow: [path.resolve(here, "../../..")] } } };
