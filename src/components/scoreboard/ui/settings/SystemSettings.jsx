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
  onUpdateField,
  onCustomModalChange
}) => {
  // Fallback if currentLang prop is not provided
  const lang = currentLang || getCurrentLanguage();

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

  // customModalはshowCustomModalの状態で制御される（divベースのため）

  // Handle Backdrop Click
  const handleDialogClick = (e, dialogId, setVisible) => {
    if (e.target === e.currentTarget) {
      setVisible();
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
          onClick={() => {
            if (onCustomModalChange) {
              onCustomModalChange(true);
            }
          }}
          title="Customization"
        >
          <img src={wrenchIcon} alt="Customization" className="btnIcon" />
        </button>
      )}

    </>
  );
};

export default SystemSettings;
