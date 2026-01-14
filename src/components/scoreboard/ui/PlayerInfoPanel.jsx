import React, { useState, useEffect, useRef } from 'react';
import winIcon from '../img/icon_win.png';

/**
 * プレイヤー情報パネルコンポーネント（赤・青）
 */
const PlayerInfoPanel = ({ 
  color, 
  playerName, 
  profilePic,
  score, 
  onSelect, 
  onAdjust, 
  dataBall, 
  time, 
  remainingMs: propRemainingMs,
  isRun, 
  otherIsRun, 
  onTimerToggle, 
  onBallChange, 
  onTieBreakSelect,
  penaltyBall = 0,
  yellowCard = 0,
  redCard = 0,
  onPenaltyRemove,
  isCtrl = false
}) => {
  const [showAdjust, setShowAdjust] = useState(false);
  const remainingMs = propRemainingMs || 0;
  const [textScale, setTextScale] = useState(1);
  const [showDeleteIcon, setShowDeleteIcon] = useState({ penaltyBall: false, yellowCard: false, redCard: false });
  const nameElementRef = useRef(null);
  const h2ElementRef = useRef(null);
  
  const ballButtonName = `${color}BallBtn`;
  const scoreBtnName = `${color}ScoreBtn`;
  const adjustBtnName = `${color}ScoreAdjustBtn`;
  const tieBreakBtnName = `${color}TieBreakBtnPanel`;
  const timerBtnName = `${color}TimerBtn`;


  // プレイヤー名の文字幅を自動調整
  useEffect(() => {
    const adjustTextWidth = () => {
      if (!nameElementRef.current || !h2ElementRef.current) return;

      const nameElement = nameElementRef.current;
      const h2Element = h2ElementRef.current;
      
      // 一時的にscaleXを1にリセットして実際の幅を測定
      nameElement.style.transform = 'scaleX(1)';
      
      // 次のフレームで幅を測定
      requestAnimationFrame(() => {
        const nameWidth = nameElement.scrollWidth;
        const h2Width = h2Element.clientWidth;
        
        if (nameWidth > h2Width) {
          const scale = h2Width / nameWidth;
          setTextScale(scale);
        } else {
          setTextScale(1);
        }
      });
    };

    // プレイヤー名が変更されたときに調整
    adjustTextWidth();
    
    // ウィンドウリサイズ時も調整
    window.addEventListener('resize', adjustTextWidth);
    
    return () => {
      window.removeEventListener('resize', adjustTextWidth);
    };
  }, [playerName]);

  const handleSelectLocal = (c) => {
    if (onSelect) {
      onSelect(c);
    }
    setShowAdjust(true);
  };

  const handleTimerToggle = () => {
    if (!isRun && otherIsRun) {
      return;
    }

    if (onTimerToggle) {
      onTimerToggle(!isRun, remainingMs);
    }
  };

  const handleAdjustClick = (color, event) => {
    const delta = parseInt(event.target.value);
    if (onAdjust) {
      onAdjust(color, delta);
    }
  };

  const handleBallClick = (ballValue) => {
    if (onBallChange) {
      // 現在のボール数と比較して挙動を変更
      if (ballValue > dataBall) {
        // 投球済みボール（透明度0.1）を押した場合：そのボール数まで復活
        onBallChange(ballValue);
      } else {
        // 残っているボール（透明度1）を押した場合：そのボール数-1
        onBallChange(ballValue - 1);
      }
    }
  };

  const handlePenaltyIconClick = (penaltyType) => {
    if (!isCtrl) return;
    setShowDeleteIcon(prev => {
      // 他のアイコンの削除モードを解除し、クリックしたアイコンの削除モードをトグル
      const newState = {
        penaltyBall: false,
        yellowCard: false,
        redCard: false
      };
      // 現在のアイコンが削除モードでない場合のみ、削除モードを有効にする
      if (!prev[penaltyType]) {
        newState[penaltyType] = true;
      }
      return newState;
    });
  };

  const handlePenaltyDelete = (e, penaltyType) => {
    e.stopPropagation();
    if (onPenaltyRemove) {
      onPenaltyRemove(color, penaltyType);
    }
    setShowDeleteIcon(prev => ({
      ...prev,
      [penaltyType]: false
    }));
  };

  return (
    <section id={color}>
      <h2 ref={h2ElementRef}>
        <span className="profilePic">
          {profilePic && (
            <img src={profilePic} alt="" />
          )}
        </span>
        <span 
          className="name" 
          ref={nameElementRef} 
          style={{ '--textScale': textScale }}
        >
          {playerName}
        </span>
      </h2>
      <div className="score">
        <div className="penaltyIcons">
          {penaltyBall > 0 && (
            <span 
              className={`penaltyIcon penaltyBall ${isCtrl ? 'penaltyIconClickable' : ''} ${showDeleteIcon.penaltyBall ? 'penaltyIconDeleteMode' : ''}`}
              data-count={penaltyBall}
              onClick={() => isCtrl && handlePenaltyIconClick('penaltyBall')}
            >
              {isCtrl && showDeleteIcon.penaltyBall && (
                <span 
                  className="penaltyIconDelete"
                  onClick={(e) => handlePenaltyDelete(e, 'penaltyBall')}
                >
                  ×
                </span>
              )}
            </span>
          )}
          {yellowCard > 0 && (
            <span 
              className={`penaltyIcon yellowCard ${isCtrl ? 'penaltyIconClickable' : ''} ${showDeleteIcon.yellowCard ? 'penaltyIconDeleteMode' : ''}`}
              data-count={yellowCard}
              onClick={() => isCtrl && handlePenaltyIconClick('yellowCard')}
            >
              {isCtrl && showDeleteIcon.yellowCard && (
                <span 
                  className="penaltyIconDelete"
                  onClick={(e) => handlePenaltyDelete(e, 'yellowCard')}
                >
                  ×
                </span>
              )}
            </span>
          )}
          {redCard > 0 && (
            <span 
              className={`penaltyIcon redCard ${isCtrl ? 'penaltyIconClickable' : ''} ${showDeleteIcon.redCard ? 'penaltyIconDeleteMode' : ''}`}
              data-count={redCard}
              onClick={() => isCtrl && handlePenaltyIconClick('redCard')}
            >
              {isCtrl && showDeleteIcon.redCard && (
                <span 
                  className="penaltyIconDelete"
                  onClick={(e) => handlePenaltyDelete(e, 'redCard')}
                >
                  ×
                </span>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          name={scoreBtnName}
          onClick={() => handleSelectLocal(color)}
        >
          <span>{score}</span>
        </button>
        {showAdjust && (
          <>
            <button 
              type="button"
              name={adjustBtnName} 
              className="plus" 
              value="1"
              onClick={(event) => handleAdjustClick(color, event)}
            >
              ＋
            </button>
            <button 
              type="button"
              name={adjustBtnName} 
              className="minus" 
              value="-1"
              onClick={(event) => handleAdjustClick(color, event)}
            >
              －
            </button>
          </>
        )}
        <button 
          type="button" 
          name={tieBreakBtnName} 
          value="false" 
          className="tieBreak" 
          onClick={onTieBreakSelect}
        >
          〇
        </button>
        <span className="winMark"></span>
      </div>
      <div className="time">
        <button 
          type="button" 
          name={timerBtnName} 
          className="timer"
          onClick={handleTimerToggle}
          disabled={isRun ? false : (remainingMs <= 0 || dataBall === 0)}
        >
          <span>{time}</span>
        </button>
      </div>
      <ul className="ball" data-ball={dataBall}>
        <li><button type="button" name={ballButtonName} value="1" aria-label='1' onClick={() => handleBallClick(1)}></button></li>
        <li><button type="button" name={ballButtonName} value="2" aria-label='2' onClick={() => handleBallClick(2)}></button></li>
        <li><button type="button" name={ballButtonName} value="3" aria-label='3' onClick={() => handleBallClick(3)}></button></li>
        <li><button type="button" name={ballButtonName} value="4" aria-label='4' onClick={() => handleBallClick(4)}></button></li>
        <li><button type="button" name={ballButtonName} value="5" aria-label='5' onClick={() => handleBallClick(5)}></button></li>
        <li><button type="button" name={ballButtonName} value="6" aria-label='6' onClick={() => handleBallClick(6)}></button></li>
        <li className="jack"><button type="button" name={ballButtonName} value="7" aria-label='7' onClick={() => handleBallClick(7)}></button></li>
      </ul>
      <div className="win"><img src={winIcon} alt="Win!" /></div>
    </section>
  );
};

export default PlayerInfoPanel;
