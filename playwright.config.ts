import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:45000,use:{channel:'msedge',baseURL:'http://localhost:5178',viewport:{width:390,height:844},headless:true},workers:1,reporter:'list'});
