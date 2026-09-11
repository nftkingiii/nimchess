import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { z } from 'zod';

type Db = InstanceType<typeof DatabaseSync>;
const initialFen = new Chess().fen();
const ProfileInput = z.object({ name: z.string().trim().min(1).max(32).optional(), avatar: z.enum(['knight','spark','nova','orbit','flame']).optional(), bio: z.string().trim().max(240).optional(), theme: z.enum(['sage','midnight','sand']).optional() }).strict();
const CreateMatch = z.object({ minutes: z.union([z.literal(3),z.literal(5),z.literal(10)]), increment: z.union([z.literal(0),z.literal(2),z.literal(5)]), rated: z.boolean().default(false) }).strict();
const MoveInput = z.object({ from: z.string().regex(/^[a-h][1-8]$/), to: z.string().regex(/^[a-h][1-8]$/), promotion: z.enum(['q','r','b','n']).optional() }).strict();
const ReactionInput = z.object({ emoji: z.string().trim().min(1).max(8) }).strict();
const DrawInput = z.object({ action: z.enum(['offer','accept']) }).strict();
const PracticeInput = z.object({ pgn: z.string().max(20000), result: z.string().max(32).optional(), opponent: z.string().max(64).optional() }).strict();
const stringHex=(bytes:number)=>z.string().regex(new RegExp(`^[0-9a-f]{${bytes*2}}$`,'i'));

type InternalMatch = { id:string; whiteId:string; blackId:string|null; fen:string; pgn:string; moves:string[]; status:'waiting'|'active'|'finished'; result:string|null; reason:string|null; whiteMs:number; blackMs:number; increment:number; lastMoveAt:number; createdAt:number; drawOffer:string|null; reactions:{playerId:string;emoji:string;at:number}[]; rated:boolean; ratedSettled:number; minutes:number };
type InternalProfile = { id:string; name:string; avatar:string; bio:string; rating:number; xp:number; wins:number; losses:number; draws:number; games:number; streak:number; puzzlesSolved:number; createdAt:number; theme:string; lastPuzzleDate?:string };

function hash(v:string){ return createHash('sha256').update(v).digest('hex'); }
function now(){ return Date.now(); }
function json(v:unknown){ return JSON.stringify(v); }
function parse<T>(v:string):T { return JSON.parse(v) as T; }

export function createDb(dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')): Db {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive:true });
  const db = new DatabaseSync(join(dataDir, 'nimchess.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS puzzle_solves (profile_id TEXT NOT NULL, puzzle_id TEXT NOT NULL, solved_at INTEGER NOT NULL, PRIMARY KEY(profile_id,puzzle_id));`);
  return db;
}
function getProfile(db:Db,id:string):InternalProfile|undefined { const r=db.prepare('SELECT data FROM profiles WHERE id=?').get(id) as {data:string}|undefined; return r ? parse<InternalProfile>(r.data) : undefined; }
function findProfileByWallet(db:Db,address:string):InternalProfile|undefined { const rows=db.prepare('SELECT data FROM profiles').all() as {data:string}[]; return rows.map(row=>parse<InternalProfile & {walletAddress?:string}>(row.data)).find(profile=>profile.walletAddress===address); }
function saveProfile(db:Db,p:InternalProfile){ db.prepare('INSERT INTO profiles(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(p.id,json(p)); }
function getMatch(db:Db,id:string):InternalMatch|undefined { const r=db.prepare('SELECT data FROM matches WHERE id=?').get(id) as {data:string}|undefined; return r ? parse<InternalMatch>(r.data) : undefined; }
function saveMatch(db:Db,m:InternalMatch){ db.prepare('INSERT INTO matches(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(m.id,json(m)); }
function publicProfile(p:InternalProfile){ const {lastPuzzleDate,...publicData}=p; const day=new Date().toISOString().slice(0,10),previous=new Date(Date.now()-86400000).toISOString().slice(0,10); return {...publicData,streak:lastPuzzleDate===day||lastPuzzleDate===previous?p.streak:0}; }
function player(db:Db,id:string){ const p=getProfile(db,id); return p ? {id:p.id,name:p.name,avatar:p.avatar,rating:p.rating,walletAddress:(p as any).walletAddress} : {id,name:'Guest',avatar:'knight',rating:1200}; }
function settle(db:Db,m:InternalMatch){
 db.exec('BEGIN IMMEDIATE');
 try{settleInside(db,m);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
function settleInside(db:Db,m:InternalMatch){
  if(m.status!=='finished'||!m.blackId) return;
  const full=publicMatch(db,m);
  db.prepare('INSERT OR IGNORE INTO history VALUES(?,?,?,?)').run(`${m.id}:${m.whiteId}`,m.whiteId,json(full),m.createdAt);
  db.prepare('INSERT OR IGNORE INTO history VALUES(?,?,?,?)').run(`${m.id}:${m.blackId}`,m.blackId,json(full),m.createdAt);
  if(!m.rated||m.ratedSettled||m.moves.length<4) return;
  const w=getProfile(db,m.whiteId), b=getProfile(db,m.blackId); if(!w||!b) return;
  w.games++; b.games++; const draw=m.result==='1/2-1/2';
  if(draw){ w.draws++;b.draws++; } else if(m.result==='1-0'){w.wins++;b.losses++;w.rating+=10;b.rating=Math.max(100,b.rating-10);} else {b.wins++;w.losses++;b.rating+=10;w.rating=Math.max(100,w.rating-10);}
  w.xp+=draw?10:m.result==='1-0'?20:0; b.xp+=draw?10:m.result==='0-1'?20:0; saveProfile(db,w); saveProfile(db,b); m.ratedSettled=1; saveMatch(db,m);
}
function publicMatch(db:Db,m:InternalMatch){
  const out:any={id:m.id,white:player(db,m.whiteId),black:m.blackId?player(db,m.blackId):null,fen:m.fen,pgn:m.pgn,moves:m.moves,status:m.status,result:m.result,reason:m.reason,whiteMs:m.whiteMs,blackMs:m.blackMs,increment:m.increment,lastMoveAt:m.lastMoveAt,createdAt:m.createdAt,drawOffer:m.drawOffer?player(db,m.drawOffer).id:null,reactions:m.reactions,rated:m.rated};
  if(m.status==='active'&&m.blackId){ const elapsed=Math.max(0,now()-m.lastMoveAt); const chess=new Chess(m.fen); const side=chess.turn(); if(side==='w') out.whiteMs=Math.max(0,m.whiteMs-elapsed); else out.blackMs=Math.max(0,m.blackMs-elapsed); }
  return out;
}
function expireClock(m:InternalMatch){if(m.status!=='active'||!m.blackId)return;const c=boardFor(m);const elapsed=Math.max(0,now()-m.lastMoveAt);if(c.turn()==='w')m.whiteMs=Math.max(0,m.whiteMs-elapsed);else m.blackMs=Math.max(0,m.blackMs-elapsed);if((c.turn()==='w'?m.whiteMs:m.blackMs)<=0){m.status='finished';m.result=c.turn()==='w'?'0-1':'1-0';m.reason='timeout';}m.lastMoveAt=now();}
function boardFor(m:InternalMatch){const c=new Chess();if(m.pgn)c.loadPgn(m.pgn);return c;}
const puzzleFen='7k/5Q2/7K/8/8/8/8/8 w - - 0 1';
const puzzleData=[['7k/5Q2/7K/8/8/8/8/8 w - - 0 1','f7g7','Queen net'],['k7/2Q5/K7/8/8/8/8/8 w - - 0 1','c7b7','Queen net'],['6k1/5ppp/8/8/8/8/R7/6K1 w - - 0 1','a2a8','Back-rank mate'],['1k6/ppp5/8/8/8/8/7R/1K6 w - - 0 1','h2h8','Back-rank mate'],['6rk/6pp/3N4/8/8/8/8/K7 w - - 0 1','d6f7','Smothered mate'],['kr6/pp6/4N3/8/8/8/8/7K w - - 0 1','e6c7','Smothered mate'],['8/8/8/8/8/7k/5q2/7K b - - 0 1','f2g2','Black to finish'],['8/8/8/8/8/k7/2q5/K7 b - - 0 1','c2b2','Black to finish']];
export const PUZZLES = puzzleData.map(([fen,solution,theme],i)=>({id:`daily-${i+1}`,title:['A royal squeeze','The other corner','No escape','Across the rank','Knight night','A perfect jump','Turn the tables','The final square'][i],theme,difficulty:i===4||i===5?'intermediate':'beginner',fen,solution:[solution],explanation:i===4||i===5?'The knight jumps into a checking square. The king cannot capture it, and its own pieces block every escape.':i===2||i===3?'The rook controls the back rank while the king’s own pawns block its escape.':'The queen checks next to the king, covers every escape, and is protected by her own king.'}));

export function createApp(opts:{db?:Db; staticDir?:string}={}){
  const db=opts.db||createDb(); const app=express();
  app.get('/api/health',(_,res)=>res.json({status:'ok',app:'nimchess'}));
  app.disable('x-powered-by'); if(process.env.NODE_ENV==='production')app.set('trust proxy',1); app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],workerSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],fontSrc:["'self'","https:","data:"]}}})); app.use(express.json({limit:'32kb'}));
  app.use('/api/',rateLimit({windowMs:60_000,max:180,standardHeaders:true,legacyHeaders:false}));
  const sameOrigin=(req:Request,res:Response,next:NextFunction)=>{ const origin=req.get('origin'); const allowed=process.env.PUBLIC_ORIGIN||`${req.protocol}://${req.get('host')}`; if(origin && origin!==allowed && !(process.env.NODE_ENV!=='production' && ['http://localhost:5178','http://localhost:5173'].includes(origin))) return res.status(403).json({error:'cross-origin request denied'}); next(); }; app.use('/api/',sameOrigin);
  function auth(req:Request,res:Response,next:NextFunction){ const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('nim_session='))?.slice(12); if(!raw) return res.status(401).json({error:'session required'}); const row=db.prepare('SELECT profile_id,expires_at FROM sessions WHERE token_hash=?').get(hash(raw)) as {profile_id:string;expires_at:number}|undefined; if(!row||row.expires_at<now()) return res.status(401).json({error:'session expired'}); (req as any).profileId=row.profile_id; next(); }
  const error=(res:Response,msg='invalid request')=>res.status(400).json({error:msg});
  app.get('/api/session',(req,res)=>{ let pid:any; const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('nim_session='))?.slice(12); if(raw){const row=db.prepare('SELECT profile_id,expires_at FROM sessions WHERE token_hash=?').get(hash(raw)) as any; if(row&&row.expires_at>now()) pid=row.profile_id;} if(!pid){ pid=randomUUID(); saveProfile(db,{id:pid,name:'Guest',avatar:'knight',bio:'',rating:1200,xp:0,wins:0,losses:0,draws:0,games:0,streak:0,puzzlesSolved:0,createdAt:now(),theme:'sage'}); const token=randomBytes(32).toString('base64url'); db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),pid,now(),now()+1000*60*60*24*30); res.cookie('nim_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*30,path:'/'}); } const p=getProfile(db,pid)!; res.json({profile:publicProfile(p)}); });
  app.patch('/api/profile',auth,(req,res)=>{ const p=getProfile(db,(req as any).profileId)!; const x=ProfileInput.safeParse(req.body); if(!x.success)return error(res,'invalid profile'); Object.assign(p,x.data); saveProfile(db,p); res.json({profile:publicProfile(p)}); });
  const walletChallenges=new Map<string,{value:string;expires:number}>();
  app.post('/api/wallet/challenge',auth,(req,res)=>{const value=`nimchess:${(req as any).profileId}:${randomBytes(16).toString('hex')}`;walletChallenges.set((req as any).profileId,{value,expires:now()+300000});res.json({challenge:value});});
  app.post('/api/wallet',auth,async(req,res)=>{const x=z.object({challenge:z.string().min(16).max(256),publicKey:stringHex(32),signature:stringHex(64),address:z.string().min(20).max(128)}).safeParse(req.body);if(!x.success)return error(res,'invalid wallet proof');const pid=(req as any).profileId,c=walletChallenges.get(pid);if(!c||c.value!==x.data.challenge||c.expires<now())return res.status(422).json({error:'challenge expired'});try{const {verifyWalletSignature}=await import('./wallet-verification.js');if(!verifyWalletSignature(c.value,x.data.publicKey,x.data.signature,x.data.address))return res.status(422).json({error:'wallet proof rejected'});}catch{return res.status(503).json({error:'wallet verification unavailable'});}const existing=findProfileByWallet(db,x.data.address);const p=existing&&existing.id!==pid?existing:getProfile(db,pid)!;if(!existing||existing.id===pid){(p as any).walletAddress=x.data.address;saveProfile(db,p);}else{const raw=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('nim_session='))?.slice(12);if(raw)db.prepare('UPDATE sessions SET profile_id=? WHERE token_hash=?').run(existing.id,hash(raw));}walletChallenges.delete(pid);res.json({profile:publicProfile(p)});});
  app.delete('/api/wallet',auth,(req,res)=>{const p=getProfile(db,(req as any).profileId)!;delete (p as any).walletAddress;saveProfile(db,p);res.json({profile:publicProfile(p)});});
  app.get('/api/leaderboard',(_,res)=>{const rows=db.prepare('SELECT data FROM profiles').all() as any[]; const profiles=rows.map(r=>parse<InternalProfile>(r.data)).filter(p=>p.games>0).sort((a,b)=>b.rating-a.rating).slice(0,100).map(publicProfile);res.json({profiles});});
  app.get('/api/history',auth,(req,res)=>{const rows=db.prepare('SELECT data FROM history WHERE profile_id=? ORDER BY created_at DESC LIMIT 100').all((req as any).profileId) as any[];res.json({matches:rows.map(r=>parse(r.data))});});
  app.post('/api/matches',auth,(req,res)=>{const x=CreateMatch.safeParse(req.body);if(!x.success)return error(res,'invalid match settings'); const id=randomUUID(); const m:InternalMatch={id,whiteId:(req as any).profileId,blackId:null,fen:initialFen,pgn:'',moves:[],status:'waiting',result:null,reason:null,whiteMs:x.data.minutes*60_000,blackMs:x.data.minutes*60_000,increment:x.data.increment*1000,lastMoveAt:now(),createdAt:now(),drawOffer:null,reactions:[],rated:x.data.rated,ratedSettled:0,minutes:x.data.minutes};saveMatch(db,m);res.status(201).json({match:publicMatch(db,m)});});
  function matchRoute(req:Request,res:Response):InternalMatch|null{const m=getMatch(db,String(req.params.id));if(!m){res.status(404).json({error:'match not found'});return null;}return m;}
  app.get('/api/matches/:id',auth,(req,res)=>{const m=matchRoute(req,res);if(!m)return;expireClock(m);saveMatch(db,m);if(m.status==='finished')settle(db,m);res.json({match:publicMatch(db,m)});});
  app.post('/api/matches/:id/join',auth,(req,res)=>{const m=matchRoute(req,res);if(!m)return;const pid=(req as any).profileId;if(m.whiteId===pid)return res.json({match:publicMatch(db,m)});if(m.blackId&&m.blackId!==pid)return res.status(409).json({error:'match is full'});if(m.status!=='waiting')return res.status(409).json({error:'match unavailable'});m.blackId=pid;m.status='active';m.lastMoveAt=now();saveMatch(db,m);res.json({match:publicMatch(db,m)});});
  app.post('/api/matches/:id/move',auth,(req,res)=>{const m=matchRoute(req,res);if(!m)return;const pid=(req as any).profileId;if(!m.blackId||m.status!=='active'||![m.whiteId,m.blackId].includes(pid))return res.status(403).json({error:'not an active player'});expireClock(m);if(m.status!=='active'){saveMatch(db,m);settle(db,m);return res.status(409).json({error:'clock expired'});}const chess=boardFor(m);if((chess.turn()==='w'?m.whiteId:m.blackId)!==pid)return res.status(409).json({error:'not your turn'});const x=MoveInput.safeParse(req.body);if(!x.success)return error(res,'invalid move');try{const mover=chess.turn();const move=chess.move(x.data);m.moves.push(move.san);m.fen=chess.fen();m.pgn=chess.pgn();if(mover==='w')m.whiteMs+=m.increment;else m.blackMs+=m.increment;m.lastMoveAt=now();if(chess.isGameOver()){m.status='finished';m.result=chess.isCheckmate()?(chess.turn()==='w'?'0-1':'1-0'):'1/2-1/2';m.reason=chess.isCheckmate()?'checkmate':chess.isStalemate()?'stalemate':'draw';}saveMatch(db,m);if(m.status==='finished')settle(db,m);res.json({match:publicMatch(db,m)});}catch{return error(res,'illegal move');}});
  app.post('/api/matches/:id/resign',auth,(req,res)=>{const m=matchRoute(req,res);if(!m)return;expireClock(m);if(m.status==='finished'){saveMatch(db,m);settle(db,m);return res.json({match:publicMatch(db,m)});}const pid=(req as any).profileId;if(m.status!=='active'||![m.whiteId,m.blackId].includes(pid))return res.status(403).json({error:'not an active player'});m.status='finished';m.result=pid===m.whiteId?'0-1':'1-0';m.reason='resignation';saveMatch(db,m);settle(db,m);res.json({match:publicMatch(db,m)});});
  app.post('/api/matches/:id/draw',auth,(req,res)=>{const m=matchRoute(req,res);if(!m)return;expireClock(m);if(m.status==='finished'){saveMatch(db,m);settle(db,m);return res.json({match:publicMatch(db,m)});}const pid=(req as any).profileId;if(m.status!=='active'||![m.whiteId,m.blackId].includes(pid))return res.status(403).json({error:'not an active player'});const x=DrawInput.safeParse(req.body);if(!x.success)return error(res,'invalid draw action');if(x.data.action==='offer'){m.drawOffer=pid;}else if(m.drawOffer&&m.drawOffer!==pid){m.status='finished';m.result='1/2-1/2';m.reason='agreement';m.drawOffer=null;settle(db,m);}saveMatch(db,m);res.json({match:publicMatch(db,m)});});
  app.post('/api/matches/:id/reaction',auth,(req,res)=>{const m=matchRoute(req,res);if(!m)return;const pid=(req as any).profileId;if(!m.blackId||![m.whiteId,m.blackId].includes(pid))return res.status(403).json({error:'not a player'});const x=z.object({emoji:z.enum(['👍','👏','😂','😮','🔥','gg'])}).safeParse(req.body);if(!x.success)return error(res,'invalid reaction');m.reactions.push({playerId:pid,emoji:x.data.emoji,at:now()});m.reactions=m.reactions.slice(-50);saveMatch(db,m);res.json({match:publicMatch(db,m)});});
  app.post('/api/matches/:id/rematch',auth,(req,res)=>{const m=matchRoute(req,res);const pid=(req as any).profileId;if(!m||m.status!=='finished'||![m.whiteId,m.blackId].includes(pid))return res.status(403).json({error:'rematch unavailable'});const n:InternalMatch={...m,id:randomUUID(),whiteId:pid,blackId:null,status:'waiting',fen:initialFen,pgn:'',moves:[],result:null,reason:null,whiteMs:m.minutes*60000,blackMs:m.minutes*60000,lastMoveAt:now(),createdAt:now(),drawOffer:null,reactions:[],rated:m.rated,ratedSettled:0};saveMatch(db,n);res.status(201).json({match:publicMatch(db,n)});});
  app.get('/api/puzzles',(_,res)=>res.json({puzzles:PUZZLES}));
  app.post('/api/puzzles/:id/solve',auth,(req,res)=>{const p=PUZZLES.find(x=>x.id===String(req.params.id));if(!p)return res.status(404).json({error:'puzzle not found'});const x=z.object({moves:z.array(z.string().min(2).max(8)).max(20)}).safeParse(req.body);if(!x.success)return error(res,'invalid solution');const chess=new Chess(p.fen);const canonical:string[]=[];try{for(const mv of x.data.moves){const m=/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv)?{from:mv.slice(0,2),to:mv.slice(2,4),promotion:mv[4] as any}:mv;const made=chess.move(m as any);canonical.push(`${made.from}${made.to}${made.promotion||''}`);}}catch{return res.status(422).json({correct:false});}const correct=canonical.length===p.solution.length&&canonical.every((v,i)=>v===p.solution[i]);if(!correct)return res.status(422).json({correct:false});const pid=(req as any).profileId;const ins=db.prepare('INSERT OR IGNORE INTO puzzle_solves VALUES(?,?,?)').run(pid,p.id,now());if(Number(ins.changes)>0){const prof=getProfile(db,pid)!;prof.puzzlesSolved++;prof.xp+=25;const day=new Date().toISOString().slice(0,10);if(prof.lastPuzzleDate!==day){const prev=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);prof.streak=prof.lastPuzzleDate===prev?prof.streak+1:1;prof.lastPuzzleDate=day;}saveProfile(db,prof);}res.json({correct:true});});
  app.post('/api/practice',auth,(req,res)=>{const x=PracticeInput.extend({mode:z.enum(['bot','local']).default('local')}).safeParse(req.body);if(!x.success)return error(res,'invalid practice replay');const c=new Chess();try{c.loadPgn(x.data.pgn);}catch{return res.status(422).json({error:'invalid PGN'});}const pid=(req as any).profileId;const item:any={id:randomUUID(),white:player(db,pid),black:{id:'practice',name:x.data.opponent||'Practice',avatar:'knight',rating:0},fen:c.fen(),pgn:x.data.pgn,moves:c.history(),status:'finished',result:x.data.result||null,reason:'practice',whiteMs:0,blackMs:0,increment:0,lastMoveAt:now(),createdAt:now(),drawOffer:null,reactions:[],rated:false};db.prepare('INSERT INTO history VALUES(?,?,?,?)').run(item.id,pid,json(item),now());res.status(201).json({match:item});});
  app.use('/api',(_,res)=>res.status(404).json({error:'API route not found'}));
  if(opts.staticDir){app.use(express.static(opts.staticDir));app.get('/{*path}',(_,res)=>res.sendFile(join(opts.staticDir!,'index.html')));}
  app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{const status=(err as {status?:number})?.status;res.status(status===400||status===413?status:500).json({error:status===400?'Invalid request body':status===413?'Request is too large':'The request could not be completed. Please try again.'});});
  return app;
}
