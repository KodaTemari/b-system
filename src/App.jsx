import './styles/tokens.css';
import './App.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Suspense, lazy } from 'react';

const Scoreboard = lazy(() => import('./components/scoreboard/Scoreboard'));
const PoolResults = lazy(() => import('./components/results/PoolResults'));
const PoolStandings = lazy(() => import('./components/pool/PoolStandings'));
const Tournament = lazy(() => import('./components/tournament/Tournament'));
const Schedule = lazy(() => import('./components/schedule/Schedule'));
const HqProgress = lazy(() => import('./components/hq/HqProgress'));

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
                
                {/* プール結果表示 */}
                <Route path="/event/:id/results/pool" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <PoolResults />
                    </Suspense>
                } />

                {/* プール順位表 */}
                <Route path="/event/:id/pool/standings" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <PoolStandings />
                    </Suspense>
                } />

                <Route path="/event/:id/pool/:poolId/standings" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <PoolStandings />
                    </Suspense>
                } />
                
                {/* スタンドアロンモード（ローカルのみ） */}
                <Route path="/scoreboard" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <Scoreboard />
                    </Suspense>
                } />

                <Route path="/tournament" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <Tournament />
                    </Suspense>
                } />

                <Route path="/event/:id/tournament" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <Tournament />
                    </Suspense>
                } />

                <Route path="/event/:id/schedule" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <Schedule />
                    </Suspense>
                } />

                {/* 本部・試合進行（のちほど認証をかける想定） */}
                <Route path="/event/:eventId/hq/progress" element={
                    <Suspense fallback={<div>Loading...</div>}>
                        <HqProgress />
                    </Suspense>
                } />
                
                <Route path="*" element={<h1>Not Found Page</h1>} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;