export default function LaunchScreen({failed=false}:{failed?:boolean}) {
 return <main className="launch-screen" aria-busy={!failed}>
  <img src="/favicon.svg" alt="" width="88" height="88"/>
  <h1>NimChess<span style={{color:'#f4d35e'}}>.</span></h1>
  <p role={failed?'alert':'status'}>{failed?'We couldn’t open your player profile. Check your connection and try again.':'Your move.'}</p>
  {failed?<button onClick={()=>location.reload()}>Retry</button>:<div className="launch-progress" aria-hidden="true"/>}
 </main>;
}
