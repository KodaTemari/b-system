import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';
import settingIcon from '../img/icon_setting.png';
import fullScreenIcon from '../img/icon_fullscreen.png';
import fullScreenIcon2 from '../img/icon_fullscreen_2.png';

/**
 * スコアボードのヘッダーコンポーネント
 */
const Header = ({
  section,
  sectionID,
  end,
  match,
  tieBreak,
  option,
  onSettingToggle,
  onFullscreenToggle,
  isCtrl = false,
  isFullscreen = false,
  isFullscreenSupported = true
}) => {
  return (
    <header>
      <h1 className="hide">ボッチャ・スコアボード</h1>
      <h2 className="hide">エンド</h2>
      <div id="ends">
        <div id="endsBox" className='number'>
          {(() => {
            if (section === 'tieBreak') {
              // タイブレークの時は、tieBreakの値に応じて「FS」または「TB」を表示
              return tieBreak === 'finalShot' ? 'FS' : 'TB';
            } else if (section === 'interval') {
              // インターバルの時は次のエンドの数字を表示
              // sectionIDから次のエンドを計算
              const sections = match?.sections || [];
              const nextSection = sections[sectionID + 1];
              // 次のセクションがタイブレークの場合は、tieBreakの値に応じて「FS」または「TB」を表示
              if (nextSection === 'tieBreak') {
                return tieBreak === 'finalShot' ? 'FS' : 'TB';
              }
              // 次のセクションがエンドの場合はそのエンド番号を表示
              if (nextSection && nextSection.startsWith('end')) {
                return parseInt(nextSection.replace('end', ''), 10);
              }
              return end + 1; // フォールバック
            } else if (end > 0) {
              // 通常のエンドの時は現在のエンドの数字を表示
              return end;
            }
            return '';
          })()}
        </div>
      </div>
      <nav id="setting">
        {isCtrl && onSettingToggle && (
          <button
            type="button"
            name="settingBtn"
            onClick={onSettingToggle}
          >
            <img src={settingIcon} alt={getLocalizedText('buttons.setting', getCurrentLanguage())} />
          </button>
        )}
        {isFullscreenSupported && (
          <button
            id="fullscreenBtn"
            onClick={onFullscreenToggle}
          >
            <img 
              src={isFullscreen ? fullScreenIcon2 : fullScreenIcon} 
              alt={getLocalizedText('buttons.fullscreen', getCurrentLanguage())} 
            />
          </button>
        )}
      </nav>
    </header>
  );
};

export default Header;
