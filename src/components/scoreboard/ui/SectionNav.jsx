import React, { useMemo } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';
import colorIcon from '../img/icon_color.png';

/**
 * セクション進行ナビゲーションコンポーネント
 */
const SectionNavigation = ({
  setColor: isColorSet,
  section,
  sectionID,
  totalEnds,
  tieBreak,
  sections,
  category,
  matchName,
  classification,
  warmup,
  warmupEnabled = true,
  warmupMode = 'simultaneous',
  interval,
  intervalEnabled = true,
  isTie,
  warmupTimer,
  intervalTimer,
  isCtrl,
  scoreAdjusting,
  redPenaltyBall = 0,
  bluePenaltyBall = 0,
  onConfirmColorToggle,
  onStartWarmup,
  onWarmupTimerToggle,
  onNextSection,
  onIntervalTimerToggle,
  onTieBreak,
  onSwapTeamNames
}) => {
  // テキスト取得関数（現在の言語を使用）
  const getText = (key) => {
    const currentLang = getCurrentLanguage();
    return getLocalizedText(`buttons.${key}`, currentLang);
  };

  // classificationを英語形式（または日本語形式）から多言語対応で表示する関数
  const formatClassification = React.useCallback((classification) => {
    if (!classification) return '';
    
    if (import.meta.env.DEV) {
      console.log('[SectionNav] formatClassification called with:', classification);
    }
    
    const currentLang = getCurrentLanguage();
    const parts = classification.split(' ');
    
    // プレフィックスを多言語対応に変換（英語形式と日本語形式の両方に対応）
    let prefix = '';
    let prefixIndex = 0;
    if (parts[0] === 'IND' || parts[0] === '個人') {
      prefix = currentLang === 'ja' ? '個人 ' : 'IND ';
      prefixIndex = 1;
    } else if (parts[0] === 'PAIR' || parts[0] === 'ペア') {
      prefix = currentLang === 'ja' ? 'ペア ' : 'PAIR ';
      prefixIndex = 1;
    } else if (parts[0] === 'TEAM' || parts[0] === 'チーム') {
      prefix = currentLang === 'ja' ? 'チーム ' : 'TEAM ';
      prefixIndex = 1;
    } else if (parts[0] === 'Recreation' || parts[0] === 'レクリエーション') {
      return getLocalizedText('classNames.Recreation', currentLang) || classification;
    }
    
    // クラス名部分を取得（プレフィックスの後、性別の前）
    let className = '';
    let genderPart = '';
    
    if (parts.length > prefixIndex) {
      const lastPart = parts[parts.length - 1];
      // 性別の判定（英語と日本語の両方に対応）
      if (lastPart === 'Male' || lastPart === 'Female' || lastPart === '男子' || lastPart === '女子') {
        genderPart = lastPart;
        // プレフィックスを除去
        if (prefixIndex > 0) {
          className = parts.slice(prefixIndex, -1).join(' ');
        } else {
          className = parts.slice(0, -1).join(' ');
        }
      } else {
        // 性別がない場合
        if (prefixIndex > 0) {
          className = parts.slice(prefixIndex).join(' ');
        } else {
          className = parts.join(' ');
        }
      }
    } else {
      className = classification;
    }
    
    // クラス名を多言語対応に変換（classNamesから取得）
    let localizedClassName = className;
    const classNames = ['BC1', 'BC2', 'BC3', 'BC4', 'OPStanding', 'OPSeated', 'Friendly', 
                        'PairBC3', 'PairBC4', 'PairFriendly', 'TeamsBC1BC2', 'TeamFriendly', 'Recreation'];
    
    // 完全一致するキーを探す（英語名とローカライズ名の両方をチェック）
    let found = false;
    for (const key of classNames) {
      const englishName = getLocalizedText(`classNames.${key}`, 'en') || key;
      const localizedName = getLocalizedText(`classNames.${key}`, currentLang);
      // 英語名、ローカライズ名、またはキー自体と一致するかチェック
      if (localizedName === className || englishName === className || key === className) {
        localizedClassName = getLocalizedText(`classNames.${key}`, currentLang) || className;
        found = true;
        break;
      }
    }
    
    // マッチしない場合は、そのままclassNameを使用（後方互換性のため）
    if (!found) {
      localizedClassName = className;
    }
    
    // 性別を多言語対応に変換
    let localizedGender = '';
    if (genderPart === 'Male' || genderPart === '男子') {
      localizedGender = currentLang === 'ja' ? '男子' : 'Male';
    } else if (genderPart === 'Female' || genderPart === '女子') {
      localizedGender = currentLang === 'ja' ? '女子' : 'Female';
    }
    
    return localizedGender ? `${prefix}${localizedClassName} ${localizedGender}` : `${prefix}${localizedClassName}`;
  }, []);


  // セクションごとの表示制御
  const getCurrentSectionId = () => {
    if (section === 'standby') return 'sec-standby';
    if (section === 'warmup' || section === 'warmup1' || section === 'warmup2') return 'sec-warmup';
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
      {currentSectionId === 'sec-standby' && section !== 'matchFinished' && section !== 'resultApproval' && (
        <div id="sec-standby">
          {/* ctrlとview両方に表示 */}
          <div id="matchInfo">
            <p id="classification">{formatClassification(classification)}</p>
            <p id="matchName">{matchName}</p>
          </div>
          
          {/* viewモードのみに表示 */}
          {!isCtrl && (
            <div className="vs">vs</div>
          )}
          
          {/* ctrl画面のみのボタン類 */}
          {isCtrl && (
            <div id="setColorBox">
              {!isColorSet && (
                <button type="button" name="colorChangeBtn" onClick={onSwapTeamNames}>
                  <img src={colorIcon} alt={getText('changeColor')} />
                </button>
              )}
              <button 
                type="button" 
                name={isColorSet ? "resetColorBtn" : "setColorBtn"}
                className="btn" 
                onClick={onConfirmColorToggle}
              >
                {isColorSet ? getText('resetColor') : getText('setColor')}
              </button>
            </div>
          )}
          
          {/* ctrl画面のみのウォームアップ開始/試合開始ボタン */}
          {isCtrl && isColorSet && (
            <button 
              type="button" 
              name="startWarmupBtn"
              className="btn" 
              onClick={onStartWarmup}
            >
              {warmupEnabled ? getText('startWarmup') : getText('startMatch')}
            </button>
          )}
        </div>
      )}

      {/* warmupセクション */}
      {currentSectionId === 'sec-warmup' && warmupEnabled && (
        <div id="sec-warmup">
          {/* タイマーの上に見出しを表示 */}
          <div className="warmupLabel">
            {section === 'warmup1' 
              ? (getLocalizedText('sections.warmup1', getCurrentLanguage()) || '赤 ウォームアップ')
              : section === 'warmup2'
              ? (getLocalizedText('sections.warmup2', getCurrentLanguage()) || '青 ウォームアップ')
              : (getLocalizedText('sections.warmup', getCurrentLanguage()) || 'ウォームアップ')}
          </div>
          <button 
            type="button" 
            name="warmupTimerBtn" 
            className="timer"
            data-running={warmup.isRunning}
            role={isCtrl ? undefined : "none"}
            onClick={isCtrl ? onWarmupTimerToggle : undefined}
          >
            {warmupTimer.displayTime}
          </button>
          {isCtrl && (
            <>
              <br />
              {/* warmup2セクションでは、タイマーが停止している時は「ウォームアップ開始」、動いている時は「ウォームアップ終了」を表示 */}
              {section === 'warmup2' ? (
                !warmup.isRunning ? (
                  <button 
                    type="button" 
                    className="btn finishWarmup" 
                    onClick={onWarmupTimerToggle}
                  >
                    {getText('startWarmup')}
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="btn finishWarmup" 
                    onClick={onNextSection}
                  >
                    {getText('finishWarmup')}
                  </button>
                )
              ) : (
                <button 
                  type="button" 
                  className="btn finishWarmup" 
                  onClick={onNextSection}
                >
                  {getText('finishWarmup')}
                </button>
              )}
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
          {/* 「インターバル開始」または「次のエンドへ」ボタンを表示 */}
          <button 
            type="button" 
            className="btn startInterval" 
            onClick={onNextSection}
          >
            {intervalEnabled ? getText('startInterval') : getText('nextEnd')}
          </button>
        </div>
      )}

      {/* intervalセクション */}
      {currentSectionId === 'sec-interval' && intervalEnabled && (
        <div id="sec-interval">
          <button 
            type="button" 
            name="intervalTimerBtn" 
            className="timer"
            data-running={interval.isRunning}
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
              // tieBreakが"none"または空文字の場合は引き分けとして試合終了
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
            // sections配列の最後がresultApprovalかどうかを確認
            const lastSection = sections && sections.length > 0 ? sections[sections.length - 1] : null;
            const hasResultApproval = lastSection === 'resultApproval';
            
            // resultApprovalが最後にある場合のみ「結果承認」ボタンを表示
            if (hasResultApproval) {
              return (
                <button 
                  type="button" 
                  className="btn matchFinished" 
                  onClick={onNextSection}
                >
                  {getLocalizedText('sections.resultApproval', getCurrentLanguage())}
                </button>
              );
            }
            
            // resultApprovalがない場合は何も表示しない
            return null;
          })()}
        </div>
      )}

    </TagName>
  );
};

export default SectionNavigation;
