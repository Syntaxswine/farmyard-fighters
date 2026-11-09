import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../../../',import.meta.url));
export default defineConfig({
  testDir:'.',testMatch:'window.spec.mjs',workers:1,retries:0,forbidOnly:true,
  timeout:360000,globalTimeout:540000,expect:{timeout:20000},
  outputDir:root+'artifacts/window-browser/results',
  reporter:[['list'],['html',{outputFolder:root+'artifacts/window-browser/report',open:'never'}]],
  webServer:{command:'node serve.mjs',url:'http://127.0.0.1:4178/window-yard.html',reuseExistingServer:false,timeout:15000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}},
});
