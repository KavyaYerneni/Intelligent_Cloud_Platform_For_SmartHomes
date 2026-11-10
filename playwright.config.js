import {defineConfig} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}
// PLAYWRIGHT_EXECUTABLE_PATH lets the suite run against an already installed
// Chromium when `npx playwright install` can't download one.
export default defineConfig({
  testDir:'./tests/e2e',
  timeout:90000,
  use:{
    baseURL:process.env.API_URL||'http://127.0.0.1:3000',
    headless:true,
    viewport:{width:1440,height:900},
    ...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']}}:{}),
  },
  workers:1,
  reporter:'list',
});
