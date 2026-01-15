import './App.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Suspense, lazy } from 'react';

const Scoreboard = lazy(() => import('./components/scoreboard/Scoreboard'));

const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                {/* 大会モード（サーバー連携） */}
                <Route path="/event/:id/court/:court/scoreboard" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <Scoreboard />
                    </Suspense>
                } />
                
                {/* スタンドアロンモード（ローカルのみ） */}
                <Route path="/scoreboard" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <Scoreboard />
                    </Suspense>
                } />
                
                <Route path="*" element={<h1>Not Found Page</h1>} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;