import React, { useState, useMemo } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';
import { COUNTRIES } from '../../../../utils/scoreboard/countries';
import resetIcon from '../../img/icon_reset.png';
import languageIcon from '../../img/icon_language.png';
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
  const [showLanguageModal, setShowLanguageModal] = useState(false);
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

  // Toggle Language Modal
  const toggleLanguageModal = () => {
    setShowLanguageModal(!showLanguageModal);
  };

  // Handle Language Selection
  const onSelectLanguage = (l) => {
    handleLanguageChange(l);
    setShowLanguageModal(false);
  };

  // Setup Modal Control (showModal / close)
  React.useEffect(() => {
    const langDialog = document.getElementById('languageModal');
    if (langDialog) {
      if (showLanguageModal) {
        if (!langDialog.open) langDialog.showModal();
      } else {
        if (langDialog.open) langDialog.close();
      }
    }
  }, [showLanguageModal]);

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

      {/* Language Button (Only Visible in Standby, Top Right) */}
      {section === 'standby' && (
        <>
          <button
            className="customBtn"
            onClick={() => setShowCustomModal(true)}
            title="Customization"
          >
            <img src={wrenchIcon} alt="Customization" className="btnIcon" />
          </button>

          <button
            className="languageBtn"
            onClick={toggleLanguageModal}
            title="Language"
          >
            <img src={languageIcon} alt="Language" className="btnIcon" />
          </button>
        </>
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

          <div id="countrySetting">
            {/* RED Side */}
            <div>
              <label htmlFor="redCountrySelect">
                <span>{lang === 'ja' ? '赤：国' : 'Red: Country'}</span>
                {(() => {
                  const country = COUNTRIES.find(c => c.en === (pendingChanges['red.country'] !== undefined ? pendingChanges['red.country'] : (gameData?.red?.country || '')));
                  return (country && country.code !== 'xx') ? (
                    <span>
                      <img
                        src={`/img/flags/${country.code}.svg`}
                        alt="Red Flag"
                        className="flagPreview"
                      />
                    </span>
                  ) : null;
                })()}
              </label>
              <select
                id="redCountrySelect"
                className="settingSelect"
                value={COUNTRIES.find(c => c.en === (pendingChanges['red.country'] !== undefined ? pendingChanges['red.country'] : (gameData?.red?.country || '')))?.id || 'none'}
                onChange={(e) => handleFlagUpdate('red', e.target.value)}
              >
                {sortedCountries.map(c => (
                  <option key={c.id} value={c.id}>
                    {lang === 'ja' ? c.ja : c.en}
                  </option>
                ))}
              </select>
            </div>

            {/* BLUE Side */}
            <div>
              <label htmlFor="blueCountrySelect">
                <span>{lang === 'ja' ? '青：国' : 'Blue: Country'}</span>
                {(() => {
                  const country = COUNTRIES.find(c => c.en === (pendingChanges['blue.country'] !== undefined ? pendingChanges['blue.country'] : (gameData?.blue?.country || '')));
                  return (country && country.code !== 'xx') ? (
                    <span>
                      <img
                        src={`/img/flags/${country.code}.svg`}
                        alt="Blue Flag"
                        className="flagPreview"
                      />
                    </span>
                  ) : null;
                })()}
              </label>
              <select
                id="blueCountrySelect"
                className="settingSelect"
                value={COUNTRIES.find(c => c.en === (pendingChanges['blue.country'] !== undefined ? pendingChanges['blue.country'] : (gameData?.blue?.country || '')))?.id || 'none'}
                onChange={(e) => handleFlagUpdate('blue', e.target.value)}
              >
                {sortedCountries.map(c => (
                  <option key={c.id} value={c.id}>
                    {lang === 'ja' ? c.ja : c.en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div id="sceneSetting" className="detailSettingItem">
            <label className="detailSettingLabel">{getLocalizedText('labels.scene', lang)}</label>
            <div className="settingRadioGroup">
              {['official', 'recreation', 'general'].map((s) => (
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

      {/* Language Selection Modal */}
      <dialog
        id="languageModal"
        onClose={(e) => {
          e.stopPropagation();
          setShowLanguageModal(false);
        }}
        onClick={(e) => handleDialogClick(e, 'languageModal', setShowLanguageModal)}
      >
        <div
          className="languageModalBox"
          onClick={(e) => e.stopPropagation()}
        >

          <button
            onClick={() => onSelectLanguage('ja')}
            className={`languageSelectBtn ${lang === 'ja' ? 'isSelected' : ''}`}
          >
            日本語
          </button>

          <button
            onClick={() => onSelectLanguage('en')}
            className={`languageSelectBtn ${lang === 'en' ? 'isSelected' : ''}`}
          >
            English
          </button>


        </div>
      </dialog>
    </>
  );
};

export default SystemSettings;
