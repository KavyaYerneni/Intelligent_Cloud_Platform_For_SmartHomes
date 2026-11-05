import {defineConfig} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}
export default defineConfig({testDir:'./tests/e2e',use:{baseURL:process.env.API_URL||'http://127.0.0.1:3000',headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})},workers:1,reporter:'list'});
