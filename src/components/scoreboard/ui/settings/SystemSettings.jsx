import React, { useState, useMemo } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';
import { COUNTRIES } from '../../../../utils/scoreboard/countries';
import resetIcon from '../../img/icon_reset.png';
import wrenchIcon from '../../img/icon_wrench.png';

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
          {/* OKボタンをDOMの先頭に配置（初期フォーカス対策） */}
          <div className="confirmBtnBox">
            <button
              className="languageSelectBtn selected"
              onClick={() => setShowCustomModal(false)}
            >
              OK
            </button>
          </div>

          <div id="languageSetting" className="detailSettingItem">
            <label className="detailSettingLabel">{getLocalizedText('labels.language', lang)}</label>
            <div className="settingRadioGroup">
              {[
                { id: 'ja', label: '日本語' },
                { id: 'en', label: 'English' }
              ].map((l) => (
                <label key={l.id} className="radioLabel">
                  <input
                    type="radio"
                    name="language"
                    value={l.id}
                    checked={lang === l.id}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </div>

          <div id="sceneSetting" className="detailSettingItem">
            <label className="detailSettingLabel">{getLocalizedText('labels.scene', lang)}</label>
            <div className="settingRadioGroup">
              {['official', 'general', 'recreation'].map((s) => (
                <label key={s} className="radioLabel">
                  <input
                    type="radio"
                    name="scene"
                    value={s}
                    checked={scene === s}
                    onChange={(e) => {
                      const val = e.target.value;
                      // 即座にgameDataを更新してbody属性に反映させる
                      if (onUpdateField) {
                        onUpdateField('scene', null, val);
                      }
                    }}
                  />
                  {getLocalizedText(`options.scene.${s}`, lang)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default SystemSettings;
