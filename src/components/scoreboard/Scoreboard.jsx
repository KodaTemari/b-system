import React, { useEffect, useRef } from 'react';
import { useScoreboard } from '../../hooks/scoreboard/useScoreboard';
import Header from './ui/Header';
import PlayerInfoPanel from './ui/PlayerInfoPanel';
import SectionNav from './ui/SectionNav';
import SettingModal from './ui/SettingModal';
import ResultTable from './ui/ResultTable';
import './Scoreboard.css';

/**
 * メインのスコアボードコンポーネント
 */
const Scoreboard = () => {
  // 統合されたスコアボードロジック
  const {
    // URL パラメータ
    isCtrl,
    
    // 状態
    active,
    scoreAdjusting,
    showTimeModal,
    settingOpen,
    setSettingOpen,
    currentLang,
    
    // データ
    gameData,
    isLoading,
    error,
    
    // URL パラメータ
    id,
    court,
    
    // ゲーム情報
    match,
    section,
    sectionID,
    end,
    tieBreak,
    warmup,
    interval,
    red,
    blue,
    setColor,
    redName,
    blueName,
    category,
    matchName,
    classification,
    
    // タイマー
    redTimer,
    blueTimer,
    warmupTimer,
    intervalTimer,
    
    // 判定
    isTie,
    isLastEndSection,
    
    // ハンドラー
    handleSelect,
    scoreAdjust,
    handleTimerToggle,
    handleBallChange,
    handleNextSection,
    handleStartWarmup,
    handleWarmupTimerToggle,
    handleIntervalTimerToggle,
    handleTieBreak,
    handleTieBreakSelect,
    handleRestartEnd,
    handleFinalShot,
    handleReset,
    handleEndsSelect,
    handleTimeAdjust,
    handleSwapTeamNames,
    getText,
    updateConfirmColor,
    saveData
  } = useScoreboard();

  // 設定モーダル開閉ハンドラー
  const handleSettingModalOpen = () => {
    setSettingOpen(true);
    document.getElementById('settingModal').showModal();
  };

  const handleSettingModalClose = () => {
    setSettingOpen(false);
  };

  // matchFinishedセクションとresultCheckセクションの時に勝敗判定を行う
  const prevScoresRef = useRef({ red: null, blue: null });
  const prevTieBreaksRef = useRef({ red: null, blue: null });
  const hasProcessedRef = useRef(false);
  
  useEffect(() => {
    if (section === 'matchFinished' || section === 'resultCheck') {
      const scoreboardElement = document.getElementById('scoreboard');
      if (!scoreboardElement) return;

      const redScore = red?.score || 0;
      const blueScore = blue?.score || 0;
      const redTieBreak = red?.tieBreak || false;
      const blueTieBreak = blue?.tieBreak || false;
      
      // スコアまたはタイブレークが変更された場合のみ処理
      const scoresChanged = prevScoresRef.current.red !== redScore || prevScoresRef.current.blue !== blueScore;
      const tieBreaksChanged = prevTieBreaksRef.current.red !== redTieBreak || prevTieBreaksRef.current.blue !== blueTieBreak;
      
      if (!scoresChanged && !tieBreaksChanged && hasProcessedRef.current) {
        return; // 変更がない場合は処理をスキップ
      }
      
      let winner = null;

      // まずスコアを比較（スコアが高い方が勝者を優先）
      if (redScore > blueScore) {
        winner = 'red';
        // スコアに差がある場合、タイブレーク関連をリセット
        scoreboardElement.removeAttribute('data-tieBreak');
        // 前回の値と比較して、変更がある場合のみ保存（無限ループを防ぐため非同期で実行）
        if (isCtrl && saveData && (redTieBreak !== false || blueTieBreak !== false) && scoresChanged) {
          setTimeout(() => {
            if (id && court) {
              const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
              if (storedData) {
                try {
                  const currentGameData = JSON.parse(storedData);
                  const updatedGameData = {
                    ...currentGameData,
                    red: {
                      ...currentGameData.red,
                      tieBreak: false
                    },
                    blue: {
                      ...currentGameData.blue,
                      tieBreak: false
                    }
                  };
                  saveData(updatedGameData);
                } catch (err) {
                  console.error('データ更新エラー:', err);
                }
              }
            }
          }, 0);
        }
      } else if (blueScore > redScore) {
        winner = 'blue';
        // スコアに差がある場合、タイブレーク関連をリセット
        scoreboardElement.removeAttribute('data-tieBreak');
        // 前回の値と比較して、変更がある場合のみ保存（無限ループを防ぐため非同期で実行）
        if (isCtrl && saveData && (redTieBreak !== false || blueTieBreak !== false) && scoresChanged) {
          setTimeout(() => {
            if (id && court) {
              const storedData = localStorage.getItem(`scoreboard_${id}_${court}_data`);
              if (storedData) {
                try {
                  const currentGameData = JSON.parse(storedData);
                  const updatedGameData = {
                    ...currentGameData,
                    red: {
                      ...currentGameData.red,
                      tieBreak: false
                    },
                    blue: {
                      ...currentGameData.blue,
                      tieBreak: false
                    }
                  };
                  saveData(updatedGameData);
                } catch (err) {
                  console.error('データ更新エラー:', err);
                }
              }
            }
          }, 0);
        }
      } else {
        // 同点の場合、タイブレークで勝敗を判断
        const tieBreakColor = scoreboardElement.getAttribute('data-tieBreak');
        if (tieBreakColor === 'red') {
          winner = 'red';
        } else if (tieBreakColor === 'blue') {
          winner = 'blue';
        } else {
          // data-tieBreak属性がない場合、gameDataのtieBreakフィールドを確認
          if (redTieBreak === true) {
            winner = 'red';
            // data-tieBreak属性を設定（winMark表示のため）
            scoreboardElement.setAttribute('data-tieBreak', 'red');
          } else if (blueTieBreak === true) {
            winner = 'blue';
            // data-tieBreak属性を設定（winMark表示のため）
            scoreboardElement.setAttribute('data-tieBreak', 'blue');
          }
          // タイブレークもない場合は引き分け（winner = null）
        }
      }

      // data-win属性を設定
      const currentWin = scoreboardElement.getAttribute('data-win');
      if (winner === 'red' && currentWin !== 'red') {
        scoreboardElement.setAttribute('data-win', 'red');
      } else if (winner === 'blue' && currentWin !== 'blue') {
        scoreboardElement.setAttribute('data-win', 'blue');
      } else if (winner === null && currentWin !== 'draw') {
        scoreboardElement.setAttribute('data-win', 'draw');
      }

      // 前回の値を更新
      prevScoresRef.current = { red: redScore, blue: blueScore };
      prevTieBreaksRef.current = { red: redTieBreak, blue: blueTieBreak };
      hasProcessedRef.current = true;
    } else {
      // sectionがmatchFinishedまたはresultCheckでない場合はリセット
      hasProcessedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, red?.score, blue?.score, red?.tieBreak, blue?.tieBreak, isCtrl, id, court]);

  // ローディング表示
  if (isLoading) {
    return (
      <div className="loading">
        <div>データを読み込み中...</div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="error">
        <div>エラーが発生しました: {error}</div>
      </div>
    );
  }

  return (
    <div id="scoreboard" data-section={section} data-setcolor={setColor} data-active={active} data-scoreadjust={scoreAdjusting ? 'true' : 'false'} className={settingOpen ? 'settingOpen' : ''}>
      <Header
        section={section}
        sectionID={sectionID}
        end={end}
        match={match}
        tieBreak={tieBreak}
        option=""
        onSettingToggle={isCtrl ? handleSettingModalOpen : null}
        onFullscreenToggle={() => {}}
        isCtrl={isCtrl}
      />
      
      <main data-active={active}>
        <PlayerInfoPanel
          color="red"
          playerName={redName}
          score={red.score}
          time={redTimer.displayTime}
          remainingMs={redTimer.remainingMs}
          isRun={redTimer.isRunning}
          otherIsRun={blueTimer.isRunning}
          dataBall={red.ball}
          onScoreChange={(delta) => scoreAdjust('red', delta)}
          onAdjust={(color, delta) => scoreAdjust(color, delta)}
          onTimerToggle={(isRunning) => handleTimerToggle('red', isRunning, redTimer.remainingMs)}
          onBallChange={(newBallValue) => handleBallChange('red', newBallValue)}
          onSelect={handleSelect}
          onTieBreakSelect={handleTieBreakSelect}
        />
        
        <PlayerInfoPanel
          color="blue"
          playerName={blueName}
          score={blue.score}
          time={blueTimer.displayTime}
          remainingMs={blueTimer.remainingMs}
          isRun={blueTimer.isRunning}
          otherIsRun={redTimer.isRunning}
          dataBall={blue.ball}
          onScoreChange={(delta) => scoreAdjust('blue', delta)}
          onAdjust={(color, delta) => scoreAdjust(color, delta)}
          onTimerToggle={(isRunning) => handleTimerToggle('blue', isRunning, blueTimer.remainingMs)}
          onBallChange={(newBallValue) => handleBallChange('blue', newBallValue)}
          onSelect={handleSelect}
          onTieBreakSelect={handleTieBreakSelect}
        />
      </main>

      {/* 結果表 - resultCheckセクションの時のみ表示 */}
      {section === 'resultCheck' && (
        <ResultTable
          redScores={red?.scores || []}
          blueScores={blue?.scores || []}
        />
      )}

      {/* セクション進行ナビゲーション */}
      <SectionNav
        setColor={setColor}
        section={section}
        sectionID={sectionID}
        totalEnds={match?.totalEnds}
        tieBreak={tieBreak}
        sections={match?.sections}
        category={category}
        matchName={matchName}
        classification={classification}
        warmup={warmup}
        interval={interval}
        isLastEndSection={isLastEndSection}
        isTie={isTie}
        warmupTimer={warmupTimer}
        intervalTimer={intervalTimer}
        isCtrl={isCtrl}
        active={active}
        scoreAdjusting={scoreAdjusting}
        onConfirmColorToggle={() => updateConfirmColor(!setColor, saveData)}
        onStartWarmup={handleStartWarmup}
        onWarmupTimerToggle={handleWarmupTimerToggle}
        onNextSection={handleNextSection}
        onIntervalTimerToggle={handleIntervalTimerToggle}
        onTieBreak={handleTieBreak}
        onFinalShot={handleFinalShot}
        onSwapTeamNames={handleSwapTeamNames}
        key={currentLang}
      />

      {/* タイムモーダル */}
      {showTimeModal && (
        <div className="timeModal">
          <div className="timeModalContent">
            <p>タイム！</p>
          </div>
        </div>
      )}

        {/* 設定モーダル - ctrl画面の時のみ表示 */}
        {isCtrl && (
          <SettingModal
            sectionID={sectionID}
            section={section}
            sections={gameData.match?.sections}
            totalEnds={match?.totalEnds}
            handleReset={handleReset}
            handleEndsSelect={handleEndsSelect}
            handleTimeAdjust={handleTimeAdjust}
            getText={getText}
            onClose={handleSettingModalClose}
            scoreAdjusting={scoreAdjusting}
            onRestartEnd={handleRestartEnd}
          />
        )}
    </div>
  );
};

export default Scoreboard;