import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export default { plugins: [react()], root: here, cacheDir: path.resolve(here, "../../../node_modules/.vite-labPopup"), server: { port: 5196, strictPort: true, fs: { allow: [path.resolve(here, "../../..")] } } };
