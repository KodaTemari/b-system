import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';
import languageIcon from '../img/icon_language.png';
import scene1Icon from '../img/scene_1.png';
import scene2Icon from '../img/scene_2.png';
import scene3Icon from '../img/scene_3.png';

const CustomModal = ({
  currentLang,
  scene,
  onLanguageChange,
  onSceneChange,
  onClose
}) => {
  const lang = currentLang || getCurrentLanguage();

  const scenes = [
    { id: 'official', icon: scene1Icon },
    { id: 'general', icon: scene2Icon },
    { id: 'recreation', icon: scene3Icon }
  ];

  return (
    <div
      id="customModal"
      className="modalOpen"
    >
      <div
        className="customModalBox"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 言語設定を一番上に配置 */}
        <div id="languageSetting" className="detailSettingItem">
          <div className="languageGroup" role="radiogroup" aria-label={getLocalizedText('labels.language', lang)}>
            <img 
              src={languageIcon} 
              alt="Language" 
              className="languageIcon" 
              onClick={() => {
                // 現在の言語に応じて次の言語を選択
                const languages = ['ja', 'en'];
                const currentIndex = languages.indexOf(lang);
                const nextIndex = (currentIndex + 1) % languages.length;
                onLanguageChange(languages[nextIndex]);
              }}
              style={{ cursor: 'pointer' }}
            />
            {[
              { id: 'ja', label: '日本語' },
              { id: 'en', label: 'English' }
            ].map((l) => (
              <div
                key={l.id}
                className={`radioButton ${lang === l.id ? 'selected' : ''}`}
                onClick={() => onLanguageChange(l.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onLanguageChange(l.id);
                  }
                }}
                tabIndex="0"
                role="radio"
                aria-checked={lang === l.id}
              >
                {l.label}
              </div>
            ))}
          </div>
        </div>

        <div id="sceneSetting" className="detailSettingItem">
          <h2>{getLocalizedText('labels.scene', lang)}</h2>
          <div className="radioButtonGroup" role="radiogroup" aria-label={getLocalizedText('labels.scene', lang)}>
            {scenes.map((s) => (
              <div
                key={s.id}
                className={`radioButton ${scene === s.id ? 'selected' : ''}`}
                onClick={() => onSceneChange(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSceneChange(s.id);
                  }
                }}
                tabIndex="0"
                role="radio"
                aria-checked={scene === s.id}
              >
                <h3>{getLocalizedText(`options.scene.${s.id}`, lang)}</h3>
                <div className="radioButtonImgBox">
                  <img src={s.icon} alt={getLocalizedText(`options.scene.${s.id}`, lang)} className="radioButtonImg" />
                </div>
                <p className="radioButtonDesc">{getLocalizedText(`options.scene.${s.id}Desc`, lang)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* OKボタンを最後に配置 */}
        <div className="confirmBtnBox">
          <button
            className="confirmBtn primaryBtn"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomModal;
