import React, { useState, useMemo } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';
import { COUNTRIES } from '../../../../utils/scoreboard/countries';
import resetIcon from '../../img/icon_reset.png';
import wrenchIcon from '../../img/icon_wrench.png';
import languageIcon from '../../img/icon_language.png';
import scene1Icon from '../../img/scene_1.png';
import scene2Icon from '../../img/scene_2.png';
import scene3Icon from '../../img/scene_3.png';

const SystemSettings = ({
  handleReset,
  handleLanguageChange,
  section,
  currentLang,
  setPendingChanges,
  pendingChanges,
  gameData,
  onUpdateField
}) => {
  // Fallback if currentLang prop is not provided
  const lang = currentLang || getCurrentLanguage();
  const [showCustomModal, setShowCustomModal] = useState(false);

  const scene = gameData?.scene || 'official';

  const scenes = [
    { id: 'official', icon: scene1Icon },
    { id: 'general', icon: scene2Icon },
    { id: 'recreation', icon: scene3Icon }
  ];

  // Sort country list based on language
  const sortedCountries = useMemo(() => {
    const noneItem = COUNTRIES.find(c => c.id === 'none');
    const restItems = COUNTRIES.filter(c => c.id !== 'none');

    return [
      noneItem,
      ...restItems.sort((a, b) => {
        const nameA = lang === 'ja' ? a.ja : a.en;
        const nameB = lang === 'ja' ? b.ja : b.en;
        return nameA.localeCompare(nameB, lang);
      })
    ];
  }, [lang]);

  // Setup Modal Control (showModal / close)
  React.useEffect(() => {
    const customDialog = document.getElementById('customModal');
    if (customDialog) {
      if (showCustomModal) {
        if (!customDialog.open) {
          customDialog.showModal();
        }
      } else {
        if (customDialog.open) customDialog.close();
      }
    }
  }, [showCustomModal]);

  // Handle Backdrop Click
  const handleDialogClick = (e, dialogId, setVisible) => {
    if (e.target === e.currentTarget) {
      const dialog = document.getElementById(dialogId);
      if (dialog) {
        dialog.close();
      }
      setVisible(false);
    }
  };

  // Handle Flag Update
  const handleFlagUpdate = (side, countryId) => {
    const country = COUNTRIES.find(c => c.id === countryId);
    if (!country) return;

    const flagName = country.en === 'None' ? '' : country.en;
    const flagPath = (country && country.code !== 'xx') ? `/img/flags/${country.code}.svg` : '';

    setPendingChanges(prev => ({
      ...prev,
      [`${side}.country`]: flagName,
      [`${side}.profilePic`]: flagPath // 旗を選んだらprofilePicにパスを設定
    }));
  };

  return (
    <>
      {/* Reset Button (Hidden in Standby) */}
      {section !== 'standby' && (
        <button
          className="resetBtn"
          onClick={handleReset}
          title={getLocalizedText('buttons.reset', lang)}
        >
          <img src={resetIcon} alt="Reset" className="btnIcon" />
        </button>
      )}

      {/* Customization Button (Only Visible in Standby) */}
      {section === 'standby' && (
        <button
          className="customBtn"
          onClick={() => setShowCustomModal(true)}
          title="Customization"
        >
          <img src={wrenchIcon} alt="Customization" className="btnIcon" />
        </button>
      )}

      {/* Customization Modal */}
      <dialog
        id="customModal"
        onClose={(e) => {
          e.stopPropagation();
          setShowCustomModal(false);
        }}
        onClick={(e) => handleDialogClick(e, 'customModal', setShowCustomModal)}
      >
        <div
          className="customModalBox"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 言語設定を一番上に配置 */}
          <div id="languageSetting" className="detailSettingItem">
            <div className="languageGroup" role="radiogroup" aria-label={getLocalizedText('labels.language', lang)}>
              <img src={languageIcon} alt="Language" className="languageIcon" />
              {[
                { id: 'ja', label: '日本語' },
                { id: 'en', label: 'English' }
              ].map((l) => (
                <div
                  key={l.id}
                  className={`radioButton ${lang === l.id ? 'selected' : ''}`}
                  onClick={() => handleLanguageChange(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleLanguageChange(l.id);
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
                  onClick={() => {
                    if (onUpdateField) {
                      onUpdateField('scene', null, s.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onUpdateField) {
                        onUpdateField('scene', null, s.id);
                      }
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
              onClick={() => setShowCustomModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default SystemSettings;
