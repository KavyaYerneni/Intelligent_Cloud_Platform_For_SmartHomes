import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
// UI unit tests only; backend tests use node:test (npm test).
export default defineConfig({plugins:[react()],test:{include:['tests/ui/**/*.test.{js,jsx}'],environment:'jsdom',setupFiles:['tests/ui/setup.js'],css:false}});
