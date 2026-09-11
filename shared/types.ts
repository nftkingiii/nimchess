export type Profile={id:string;name:string;avatar:string;bio:string;rating:number;xp:number;wins:number;losses:number;draws:number;games:number;streak:number;puzzlesSolved:number;walletAddress?:string;createdAt:number;theme:string};
export type Player={id:string;name:string;avatar:string;rating:number;walletAddress?:string};
export type Match={id:string;white:Player;black:Player|null;fen:string;pgn:string;moves:string[];status:'waiting'|'active'|'finished';result:string|null;reason:string|null;whiteMs:number;blackMs:number;increment:number;lastMoveAt:number;createdAt:number;drawOffer:string|null;reactions:{playerId:string;emoji:string;at:number}[];rated:boolean};
export type Puzzle={id:string;title:string;theme:string;difficulty:string;fen:string;solution:string[];explanation:string};
