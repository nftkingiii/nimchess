import {Chess} from 'chess.js';
export type SavedPractice={mode:'bot'|'local';pgn:string;white:number;black:number;finished:string|null;savedAt:number};
export function readPractice(mode:string):SavedPractice|null{try{const s=JSON.parse(sessionStorage.getItem('nimchess.position')||'null');if(!s||s.mode!==mode||typeof s.pgn!=='string'||s.pgn.length>20000||!Number.isFinite(s.white)||!Number.isFinite(s.black)||!Number.isFinite(s.savedAt))return null;const c=new Chess();c.loadPgn(s.pgn);if(!s.finished){const elapsed=Math.max(0,Date.now()-s.savedAt);if(c.turn()==='w')s.white=Math.max(0,s.white-elapsed);else s.black=Math.max(0,s.black-elapsed)}return s}catch{return null}}
export function savePractice(s:SavedPractice){try{sessionStorage.setItem('nimchess.position',JSON.stringify(s))}catch{/* Private browser storage may be unavailable. */}}
export function clearPractice(){try{sessionStorage.removeItem('nimchess.position')}catch{}}
