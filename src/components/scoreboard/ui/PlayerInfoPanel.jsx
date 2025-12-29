import React, { useState, useEffect, useRef } from 'react';
import winIcon from '../img/icon_win.png';

/**
 * プレイヤー情報パネルコンポーネント（赤・青）
 */
const PlayerInfoPanel = ({ 
  color, 
  playerName, 
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
  onTieBreakSelect
}) => {
  const [showAdjust, setShowAdjust] = useState(false);
  const remainingMs = propRemainingMs || 0;
  const [textScale, setTextScale] = useState(1);
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
      onBallChange(ballValue);
    }
  };

  return (
    <section id={color}>
      <h2 ref={h2ElementRef}>
        <span className="profilePic"></span>
        <span 
          className="name" 
          ref={nameElementRef} 
          style={{ transform: `scaleX(${textScale})` }}
        >
          {playerName}
        </span>
      </h2>
      <div className="score">
        <button
          type="button"
          name={scoreBtnName}
          onClick={() => handleSelectLocal(color)}
        >
          {score}
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
          disabled={(otherIsRun && !isRun) || remainingMs === 0 || dataBall === 0}
        >
          {time}
        </button>
      </div>
      <ul className="ball" data-ball={dataBall}>
        <li><button type="button" name={ballButtonName} value="0" aria-label='0' onClick={() => handleBallClick(0)}></button></li>
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
