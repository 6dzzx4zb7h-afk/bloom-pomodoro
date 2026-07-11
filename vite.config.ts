import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev harnesses (e.g. an editor preview) assign a free port via $PORT;
// plain `npm run dev` keeps the familiar 5173 + auto-open behavior.
const envPort = Number(process.env.PORT);

export default defineConfig({
  plugins: [react()],
  server: envPort
    ? { port: envPort, open: false }
    : { port: 5173, open: true },
});
