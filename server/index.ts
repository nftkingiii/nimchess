import { createApp } from './app.js';
import {resolve} from 'node:path';
const port=Number(process.env.PORT||3001); const app=createApp({staticDir:resolve(process.env.DIST_DIR||'dist')}); app.listen(port,'0.0.0.0',()=>console.log(`NimChess server listening on ${port}`));
