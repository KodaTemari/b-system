import './App.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Suspense, lazy } from 'react';

const Scoreboard = lazy(() => import('./components/scoreboard/Scoreboard'));
const GroupResults = lazy(() => import('./components/results/GroupResults'));

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
                
                {/* グループリーグ結果表示 */}
                <Route path="/event/:id/results/group" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <GroupResults />
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