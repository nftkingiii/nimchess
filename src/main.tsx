import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import App from './App';
import './styles.css';
class ErrorBoundary extends React.Component<React.PropsWithChildren,{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true}}render(){return this.state.error?<main className="fatal"><h1>Let’s reset the board.</h1><p>Something interrupted the app. Your saved club progress is safe.</p><button onClick={()=>location.reload()}>Reload NimChess</button></main>:this.props.children}}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
