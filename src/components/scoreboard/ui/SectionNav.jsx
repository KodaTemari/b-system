import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';
import colorIcon from '../img/icon_color.png';

/**
 * セクション進行ナビゲーションコンポーネント
 */
const SectionNavigation = ({
  setColor,
  section,
  sectionID,
  totalEnds,
  tieBreak,
  sections,
  category,
  matchName,
  classification,
  warmup,
  interval,
  isLastEndSection,
  isTie,
  warmupTimer,
  intervalTimer,
  isCtrl,
  active,
  scoreAdjusting,
  redPenaltyBall = 0,
  bluePenaltyBall = 0,
  onConfirmColorToggle,
  onStartWarmup,
  onWarmupTimerToggle,
  onNextSection,
  onIntervalTimerToggle,
  onTieBreak,
  onFinalShot,
  onSwapTeamNames
}) => {
  // テキスト取得関数（現在の言語を使用）
  const getText = (key) => {
    const currentLang = getCurrentLanguage();
    return getLocalizedText(`buttons.${key}`, currentLang);
  };


  // セクションごとの表示制御
  const getCurrentSectionId = () => {
    if (section === 'standby') return 'sec-standby';
    if (section === 'warmup') return 'sec-warmup';
    if (section === 'interval') return 'sec-interval';
    if (section === 'finalShot') return 'sec-finalShot';
    if (section === 'tieBreak') return 'sec-tieBreak';
    if (section === 'matchFinished') return 'sec-matchFinished';
    
    // エンドセクションの場合
    if (section && section.startsWith('end')) {
      const endNumber = parseInt(section.replace('end', ''), 10);
      if (endNumber === totalEnds) {
        return 'sec-lastEnd'; // 最終エンド
      } else {
        return 'sec-end'; // 通常のエンド
      }
    }
    
    return 'sec-standby'; // デフォルト
  };

  const currentSectionId = getCurrentSectionId();

  // タグの選択（ctrl画面はnav、view画面はdiv）
  const TagName = isCtrl ? 'nav' : 'div';

  return (
    <TagName id="sectionNav">
      {/* standbyセクション */}
      {currentSectionId === 'sec-standby' && section !== 'matchFinished' && section !== 'resultCheck' && (
        <div id="sec-standby">
          {/* ctrlとview両方に表示 */}
          <div id="matchInfo">
            <p id="classification">{classification}</p>
            <p id="category">{category}</p>
            <p id="matchName">{matchName}</p>
          </div>
          
          {/* viewモードのみに表示 */}
          {!isCtrl && (
            <div className="vs">vs</div>
          )}
          
          {/* ctrl画面のみのボタン類 */}
          {isCtrl && (
            <div id="setColorBox">
              {!setColor && (
                <button type="button" name="colorChangeBtn" onClick={onSwapTeamNames}>
                  <img src={colorIcon} alt={getText('changeColor')} />
                </button>
              )}
              <button 
                type="button" 
                name={setColor ? "resetColorBtn" : "setColorBtn"}
                className="btn" 
                onClick={onConfirmColorToggle}
              >
                {setColor ? getText('resetColor') : getText('setColor')}
              </button>
            </div>
          )}
          
          {/* ctrl画面のみのウォームアップ開始ボタン */}
          {isCtrl && setColor && (
            <button 
              type="button" 
              name="startWarmupBtn"
              className="btn" 
              onClick={onStartWarmup}
            >
              {getText('startWarmup')}
            </button>
          )}
        </div>
      )}

      {/* warmupセクション */}
      {currentSectionId === 'sec-warmup' && (
        <div id="sec-warmup">
          {/* viewモードのみ「ウォームアップ」という文字を表示 */}
          {!isCtrl && (
            <div className="warmupLabel">
              {getLocalizedText('sections.warmup', getCurrentLanguage()) || 'ウォームアップ'}
            </div>
          )}
          <button 
            type="button" 
            name="warmupTimerBtn" 
            className="timer"
            data-running={warmup.isRun}
            role={isCtrl ? undefined : "none"}
            onClick={isCtrl ? onWarmupTimerToggle : undefined}
          >
            {warmupTimer.displayTime}
          </button>
          {isCtrl && (
            <>
              <br />
              <button 
                type="button" 
                className="btn finishWarmup" 
                onClick={onNextSection}
              >
                {getText('finishWarmup')}
              </button>
            </>
          )}
        </div>
      )}

      {/* 通常のエンドセクション（ctrl画面のみ） */}
      {/* 
        仕様：
        - エンドセクション（最終エンド以外）の場合
        - かつ、点数加算ボタンが押されたとき（scoreAdjusting=true）
        - かつ、ペナルティボールが0の場合
        - 「インターバル開始」ボタンを表示
        流れ：ウォームアップ → エンド1 → インターバル → エンド2 → インターバル → ...
      */}
      {isCtrl && 
       currentSectionId === 'sec-end' && 
       scoreAdjusting &&
       redPenaltyBall === 0 &&
       bluePenaltyBall === 0 && (
        <div id="sec-end">
          {/* 「インターバル開始」ボタンを表示 */}
          <button 
            type="button" 
            className="btn startInterval" 
            onClick={onNextSection}
          >
            {getText('startInterval')}
          </button>
        </div>
      )}

      {/* intervalセクション */}
      {currentSectionId === 'sec-interval' && (
        <div id="sec-interval">
          <button 
            type="button" 
            name="intervalTimerBtn" 
            className="timer"
            data-running={interval.isRun}
            role={isCtrl ? undefined : "none"}
            onClick={isCtrl ? onIntervalTimerToggle : undefined}
          >
            {intervalTimer.displayTime}
          </button>
          {isCtrl && (
            <>
              <br />
              <button 
                type="button" 
                className="btn finishInterval" 
                onClick={onNextSection}
              >
                {getText('finishInterval')}
              </button>
            </>
          )}
        </div>
      )}

      {/* 最終エンドセクション（ctrl画面のみ） */}
      {/* 
        仕様：
        - 最終エンドセクションの場合
        - かつ、点数加算ボタンが押されたとき（scoreAdjusting=true）
        - 同点なら「タイブレーク」または「ファイナルショット」、点差があれば「試合終了」ボタンを表示
      */}
      {isCtrl && 
       currentSectionId === 'sec-lastEnd' && 
       scoreAdjusting && (
        <div id="sec-lastEnd">
          {isTie ? (
            // 同点の場合、tieBreakの値に応じてボタンを表示
            tieBreak === 'extraEnd' ? (
              <button 
                type="button" 
                className="btn tieBreak" 
                onClick={onTieBreak}
              >
                {getLocalizedText('sections.tieBreak', getCurrentLanguage())}
              </button>
            ) : tieBreak === 'finalShot' ? (
              <button 
                type="button" 
                className="btn tieBreak" 
                onClick={onTieBreak}
              >
                {getLocalizedText('sections.finalShot', getCurrentLanguage())}
              </button>
            ) : (
              // tieBreakが空文字の場合は引き分けとして試合終了
              <button 
                type="button" 
                className="btn matchFinished" 
                onClick={onNextSection}
              >
                {getLocalizedText('sections.matchFinished', getCurrentLanguage())}
              </button>
            )
          ) : (
            // 点差がある場合は試合終了
            <button 
              type="button" 
              className="btn matchFinished" 
              onClick={onNextSection}
            >
              {getLocalizedText('sections.matchFinished', getCurrentLanguage())}
            </button>
          )}
        </div>
      )}

      {/* tieBreakセクション（ctrl画面のみ） */}
      {isCtrl && currentSectionId === 'sec-tieBreak' && (
        <div id="sec-tieBreak">
          {scoreAdjusting && (
            (() => {
              // 次のセクションを確認
              const nextSectionID = sectionID + 1;
              const nextSection = sections?.[nextSectionID];
              
              // 次のセクションがmatchFinishedの場合は「試合終了」ボタンを表示
              if (nextSection === 'matchFinished') {
                return (
                  <button 
                    type="button" 
                    className="btn matchFinished" 
                    onClick={onNextSection}
                  >
                    {getLocalizedText('sections.matchFinished', getCurrentLanguage())}
                  </button>
                );
              }
              
              // それ以外の場合は「インターバル開始」ボタンを表示（ペナルティボールが0の場合のみ）
              if (redPenaltyBall === 0 && bluePenaltyBall === 0) {
                return (
                  <button 
                    type="button" 
                    className="btn startInterval" 
                    onClick={onNextSection}
                  >
                    {getText('startInterval')}
                  </button>
                );
              }
              return null;
            })()
          )}
        </div>
      )}

      {/* finalShotセクション（ctrl画面のみ） */}
      {isCtrl && currentSectionId === 'sec-finalShot' && (
        <div id="sec-finalShot">
          <button 
            type="button" 
            className="btn" 
            onClick={onNextSection}
          >
            {getLocalizedText('sections.matchFinished', getCurrentLanguage())}
          </button>
        </div>
      )}

      {/* matchFinishedセクション（ctrl画面のみ） */}
      {isCtrl && currentSectionId === 'sec-matchFinished' && (
        <div id="sec-matchFinished">
          {(() => {
            // sections配列の最後がresultCheckかどうかを確認
            const lastSection = sections && sections.length > 0 ? sections[sections.length - 1] : null;
            const hasResultCheck = lastSection === 'resultCheck';
            
            // resultCheckが最後にある場合のみ「結果確認」ボタンを表示
            if (hasResultCheck) {
              return (
                <button 
                  type="button" 
                  className="btn matchFinished" 
                  onClick={onNextSection}
                >
                  {getLocalizedText('sections.resultCheck', getCurrentLanguage())}
                </button>
              );
            }
            
            // resultCheckがない場合は何も表示しない
            return null;
          })()}
        </div>
      )}

    </TagName>
  );
};

export default SectionNavigation;
