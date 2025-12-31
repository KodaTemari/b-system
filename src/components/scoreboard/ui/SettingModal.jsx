import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';
import resetIcon from '../img/icon_reset.png';
import setting2Icon from '../img/icon_setting_2.png';

/**
 * 設定モーダルコンポーネント
 */
const SettingModal = ({
  sectionID,
  section,
  sections,
  totalEnds,
  handleReset,
  handleEndsSelect,
  handleTimeAdjust,
  getText,
  onClose,
  scoreAdjusting,
  onRestartEnd,
  onPenaltyClick,
  onTimeoutClick,
  gameData,
  onUpdateField
}) => {
  // セクションごとの表示制御
  const shouldShowRedBlueTimers = () => {
    // エンド、ファイナルショット、タイブレークの時は赤・青タイマーを表示
    if (section && section.startsWith('end')) return true;
    if (section === 'finalShot') return true;
    if (section === 'tieBreak') return true;
    return false;
  };

  const shouldShowWarmupTimer = () => {
    // ウォームアップの時のみウォームアップタイマーを表示
    return section === 'warmup';
  };

  const shouldShowIntervalTimer = () => {
    // インターバルの時のみインターバルタイマーを表示
    return section === 'interval';
  };

  const shouldShowPenaltyAndTimeout = () => {
    // スタンバイ、ウォームアップ、試合終了、結果確認のセクションでは表示しない
    if (section === 'standby') return false;
    if (section === 'warmup') return false;
    if (section === 'matchFinished') return false;
    if (section === 'resultCheck') return false;
    return true;
  };

  return (
    <dialog id="settingModal" onClose={onClose}>
      <div id="indexModal" className="modalBox">
        <button type="button" name="resetBtn" onClick={handleReset}>
          <img src={resetIcon} alt={getLocalizedText('buttons.reset', getCurrentLanguage())} />
        </button>

        <div 
          id="endsSetting" 
          role="progressbar" 
          aria-label="ゲーム進行状況"
          aria-valuenow={sectionID}
          aria-valuemin={0}
          aria-valuemax={sections ? sections.length - 1 : 0}
        >
          <ol className="step-list" data-current-step={sectionID}>
            {sections && sections.map((sectionName, index) => {
              // endsの数に基づいてボタンを制限
              const shouldShowButton = () => {
                // エンド関連のセクション（end1, end2, end3, end4など）の場合
                if (sectionName.startsWith('end')) {
                  const endNumber = parseInt(sectionName.replace('end', ''), 10);
                  return endNumber <= (totalEnds || 4); // totalEndsが未定義の場合はデフォルト4
                }
                // インターバルの場合、最後のエンドより前のインターバル、またはタイブレークの前のインターバルを表示
                if (sectionName === 'interval') {
                  // 前のセクションがエンドかどうかチェック
                  const prevSection = sections[index - 1];
                  if (prevSection && prevSection.startsWith('end')) {
                    const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
                    // 最後のエンドより前のインターバルは常に表示
                    if (prevEndNumber < (totalEnds || 4)) {
                      return true;
                    }
                    // 最後のエンドの後のインターバルで、次のセクションがタイブレークの場合
                    // sections配列にtieBreakが存在する場合のみ表示（タイブレークボタンを押したとき）
                    const nextSection = sections[index + 1];
                    if (nextSection === 'tieBreak') {
                      // sections配列にtieBreakが存在する場合のみ表示
                      return sections.includes('tieBreak');
                    }
                  }
                  return false; // エンドの前でない、かつタイブレークの前でもないインターバルは表示しない
                }
                // タイブレークセクションの場合、sections配列に存在する場合のみ表示（タイブレークボタンを押したとき）
                if (sectionName === 'tieBreak') {
                  // sections配列にtieBreakが存在する場合のみ表示
                  return sections.includes('tieBreak');
                }
                // エンド以外のセクション（standby, warmup, finalShot, matchFinished）は常に表示
                return true;
              };

              if (!shouldShowButton()) {
                return null;
              }

              // 表示されるステップのインデックスを計算（shouldShowButtonでフィルタリングされた後のインデックス）
              const visibleSteps = sections.filter((s, i) => {
                if (s.startsWith('end')) {
                  const endNumber = parseInt(s.replace('end', ''), 10);
                  return endNumber <= (totalEnds || 4);
                }
                if (s === 'interval') {
                  const prevSection = sections[i - 1];
                  if (prevSection && prevSection.startsWith('end')) {
                    const prevEndNumber = parseInt(prevSection.replace('end', ''), 10);
                    // 最後のエンドより前のインターバルは常に表示
                    if (prevEndNumber < (totalEnds || 4)) {
                      return true;
                    }
                    // 最後のエンドの後のインターバルで、次のセクションがタイブレークの場合
                    // sections配列にtieBreakが存在する場合のみ表示（タイブレークボタンを押したとき）
                    const nextSection = sections[i + 1];
                    if (nextSection === 'tieBreak') {
                      // sections配列にtieBreakが存在する場合のみ表示
                      return sections.includes('tieBreak');
                    }
                  }
                  return false;
                }
                // タイブレークセクションの場合、sections配列に存在する場合のみ表示（タイブレークボタンを押したとき）
                if (s === 'tieBreak') {
                  // sections配列にtieBreakが存在する場合のみ表示
                  return sections.includes('tieBreak');
                }
                return true;
              });
              
              const visibleIndex = visibleSteps.findIndex(s => s === sectionName);
              const isCompleted = index < sectionID;
              const isCurrent = index === sectionID;
              const isFuture = index > sectionID;
              const isLast = visibleIndex === visibleSteps.length - 1;
              // 最後のステップ以外は、すべて右側に線を表示
              const shouldShowLine = !isLast;

              return (
                <li 
                  key={index}
                  className={`step-item ${isCompleted ? 'step-completed' : ''} ${isCurrent ? 'step-current' : ''} ${isFuture ? 'step-future' : ''} ${shouldShowLine ? 'step-has-line' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  data-step-index={visibleIndex}
                >
                  <button 
                    type="button" 
                    name="endsSelectBtn" 
                    value={index} 
                    data-word={sectionName}
                    className="step-button"
                    onClick={handleEndsSelect}
                    aria-label={`${getText(`sections.${sectionName}`)} - ${isCurrent ? '現在のステップ' : isCompleted ? '完了済み' : '未完了'}`}
                  >
                    <span className="step-indicator" aria-hidden="true">
                      {(isCompleted || isCurrent) && <span className="step-indicator-fill"></span>}
                    </span>
                    <span className="step-label">{getText(`sections.${sectionName}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* スタンバイセクションの入力欄 */}
        {section === 'standby' && (
          <div id="standbySetting">
            <input
              id="classificationInput"
              type="text"
              placeholder={getLocalizedText('labels.classification', getCurrentLanguage()) || 'クラス'}
              value={gameData?.classification || ''}
              onChange={(e) => {
                if (onUpdateField) {
                  onUpdateField('classification', null, e.target.value);
                }
              }}
            />
            <input
              id="categoryInput"
              type="text"
              placeholder={getLocalizedText('labels.category', getCurrentLanguage()) || 'カテゴリー'}
              value={gameData?.category || ''}
              onChange={(e) => {
                if (onUpdateField) {
                  onUpdateField('category', null, e.target.value);
                }
              }}
            />
            <input
              id="matchNameInput"
              type="text"
              placeholder={getLocalizedText('labels.matchName', getCurrentLanguage()) || '試合名'}
              value={gameData?.matchName || ''}
              onChange={(e) => {
                if (onUpdateField) {
                  onUpdateField('matchName', null, e.target.value);
                }
              }}
            />
            <input
              id="redNameInput"
              type="text"
              placeholder={getLocalizedText('labels.redName', getCurrentLanguage()) || '赤の名前'}
              value={gameData?.red?.name || ''}
              onChange={(e) => {
                if (onUpdateField) {
                  onUpdateField('red', 'name', e.target.value);
                }
              }}
            />
            <input
              id="blueNameInput"
              type="text"
              placeholder={getLocalizedText('labels.blueName', getCurrentLanguage()) || '青の名前'}
              value={gameData?.blue?.name || ''}
              onChange={(e) => {
                if (onUpdateField) {
                  onUpdateField('blue', 'name', e.target.value);
                }
              }}
            />
          </div>
        )}

        {/* エンド再開ボタン（settingOpenかつscoreAdjustingかつエンドセクションの時のみ表示） */}
        {scoreAdjusting && section && section.startsWith('end') && (
          <div id="restartEndContainer">
            <button 
              type="button" 
              className="btn restartEnd" 
              onClick={() => {
                onRestartEnd();
                const dialog = document.getElementById('settingModal');
                if (dialog) {
                  dialog.close();
                }
                onClose();
              }}
            >
              {getLocalizedText('buttons.restartEnd', getCurrentLanguage())}
            </button>
          </div>
        )}

        {/* 反則・タイムアウトボタン */}
        {shouldShowPenaltyAndTimeout() && (
          <div id="penaltyTimeoutSetting">
          <div className="penaltyTimeoutGroup red">
            <button 
              type="button" 
              name="redPenaltyBtn" 
              className="btn penalty"
              onClick={() => onPenaltyClick && onPenaltyClick('red')}
            >
              {getLocalizedText('buttons.penalty', getCurrentLanguage()) || '反則'}
            </button>
            <button 
              type="button" 
              name="redTimeoutBtn" 
              className="btn timeout"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onTimeoutClick) {
                  onTimeoutClick('red');
                }
              }}
            >
              {getLocalizedText('buttons.timeout', getCurrentLanguage()) || 'タイムアウト'}
            </button>
          </div>
          <div className="penaltyTimeoutGroup blue">
            <button 
              type="button" 
              name="bluePenaltyBtn" 
              className="btn penalty"
              onClick={() => onPenaltyClick && onPenaltyClick('blue')}
            >
              {getLocalizedText('buttons.penalty', getCurrentLanguage()) || '反則'}
            </button>
            <button 
              type="button" 
              name="blueTimeoutBtn" 
              className="btn timeout"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onTimeoutClick) {
                  onTimeoutClick('blue');
                }
              }}
            >
              {getLocalizedText('buttons.timeout', getCurrentLanguage()) || 'タイムアウト'}
            </button>
          </div>
        </div>
        )}

        {/* タイマー設定（スタンバイセクションの時は非表示） */}
        {section !== 'standby' && (
          <div id="timeSetting">
            {/* 赤・青タイマー調整（エンド、ファイナルショット、タイブレークの時のみ表示） */}
            {shouldShowRedBlueTimers() && (
            <>
              <div className="btnList">
                <div>
                  <button type="button" name="redTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('red', '60000')}>＋</button>
                  <button type="button" name="redTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('red', '-60000')}>－</button>
                </div>
                <div>
                  <button type="button" name="redTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('red', '10000')}>＋</button>
                  <button type="button" name="redTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('red', '-10000')}>－</button>
                </div>
                <div>
                  <button type="button" name="redTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('red', '1000')}>＋</button>
                  <button type="button" name="redTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('red', '-1000')}>－</button>
                </div>
              </div>
              <div className="btnList">
                <div>
                  <button type="button" name="blueTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('blue', '60000')}>＋</button>
                  <button type="button" name="blueTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('blue', '-60000')}>－</button>
                </div>
                <div>
                  <button type="button" name="blueTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('blue', '10000')}>＋</button>
                  <button type="button" name="blueTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('blue', '-10000')}>－</button>
                </div>
                <div>
                  <button type="button" name="blueTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('blue', '1000')}>＋</button>
                  <button type="button" name="blueTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('blue', '-1000')}>－</button>
                </div>
              </div>
            </>
          )}
          {/* ウォームアップタイマー調整（ウォームアップの時のみ表示） */}
          {shouldShowWarmupTimer() && (
            <div className="btnList warmupTimer">
              <div>
                <button type="button" name="warmupTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('warmup', '60000')}>＋</button>
                <button type="button" name="warmupTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('warmup', '-60000')}>－</button>
              </div>
              <div>
                <button type="button" name="warmupTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('warmup', '10000')}>＋</button>
                <button type="button" name="warmupTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('warmup', '-10000')}>－</button>
              </div>
              <div>
                <button type="button" name="warmupTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('warmup', '1000')}>＋</button>
                <button type="button" name="warmupTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('warmup', '-1000')}>－</button>
              </div>
            </div>
          )}

          {/* インターバルタイマー調整（インターバルの時のみ表示） */}
          {shouldShowIntervalTimer() && (
            <div className="btnList intervalTimer">
              <div>
                <button type="button" name="intervalTimeAdjustBtn" value="60000" className="plus" onClick={() => handleTimeAdjust('interval', '60000')}>＋</button>
                <button type="button" name="intervalTimeAdjustBtn" value="-60000" className="minus" onClick={() => handleTimeAdjust('interval', '-60000')}>－</button>
              </div>
              <div>
                <button type="button" name="intervalTimeAdjustBtn" value="10000" className="plus" onClick={() => handleTimeAdjust('interval', '10000')}>＋</button>
                <button type="button" name="intervalTimeAdjustBtn" value="-10000" className="minus" onClick={() => handleTimeAdjust('interval', '-10000')}>－</button>
              </div>
              <div>
                <button type="button" name="intervalTimeAdjustBtn" value="1000" className="plus" onClick={() => handleTimeAdjust('interval', '1000')}>＋</button>
                <button type="button" name="intervalTimeAdjustBtn" value="-1000" className="minus" onClick={() => handleTimeAdjust('interval', '-1000')}>－</button>
              </div>
            </div>
          )}
          </div>
        )}
        
        <form method="dialog">
          <button className="settingModalCloseBtn">
            <img src={setting2Icon} alt={getLocalizedText('sections.ok', getCurrentLanguage())} />
          </button>
        </form>
      </div>
    </dialog>
  );
};

export default SettingModal;