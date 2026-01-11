import React, { useMemo, useState } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';
import { COUNTRIES } from '../../../../utils/scoreboard/countries';

// Helper function to render time options
const renderTimeOptions = () => {
  const options = [];
  // 2:00 to 7:00 in 30s increments
  for (let minutes = 2; minutes <= 7; minutes++) {
    for (let seconds = 0; seconds < 60; seconds += 30) {
      // Skip 7:30
      if (minutes === 7 && seconds === 30) {
        continue;
      }
      const totalMs = minutes * 60000 + seconds * 1000;
      const displayTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      options.push(
        <option key={totalMs} value={totalMs}>
          {displayTime}
        </option>
      );
    }
  }
  return options;
};

const PlayerSettings = ({
  pendingChanges,
  gameData,
  setPendingChanges,
  selectedRedLimit,
  setSelectedRedLimit,
  selectedBlueLimit,
  setSelectedBlueLimit
}) => {
  const currentLang = getCurrentLanguage();
  const [showRedSelect, setShowRedSelect] = useState(false);
  const [showBlueSelect, setShowBlueSelect] = useState(false);

  // Sort country list based on language
  const sortedCountries = useMemo(() => {
    const noneItem = COUNTRIES.find(c => c.id === 'none');
    const restItems = COUNTRIES.filter(c => c.id !== 'none');

    return [
      noneItem,
      ...restItems.sort((a, b) => {
        const nameA = currentLang === 'ja' ? a.ja : a.en;
        const nameB = currentLang === 'ja' ? b.ja : b.en;
        return nameA.localeCompare(nameB, currentLang);
      })
    ];
  }, [currentLang]);

  // Handle Flag Update
  const handleFlagUpdate = (side, countryId) => {
    const country = COUNTRIES.find(c => c.id === countryId);
    if (!country) return;

    const flagName = country.en === 'None' ? '' : country.en;
    const flagPath = `/img/flags/${country.code}.svg`;

    setPendingChanges(prev => ({
      ...prev,
      [`${side}.country`]: flagName,
      [`${side}.profilePic`]: flagPath
    }));

    // 自動で閉じる
    if (side === 'red') setShowRedSelect(false);
    if (side === 'blue') setShowBlueSelect(false);
  };

  return (
    <div id="playerInput">
      {/* Red Player Settings */}
      <div id="redPlayerInput" className="playerSettingGroup">
        <div className="nameSetting">
          <input
            id="redNameInput"
            type="text"
            placeholder={getLocalizedText('labels.redName', currentLang) || 'Red Name'}
            value={pendingChanges['red.name'] !== undefined ? pendingChanges['red.name'] : (gameData?.red?.name || '')}
            onChange={(e) => {
              setPendingChanges(prev => ({
                ...prev,
                'red.name': e.target.value
              }));
            }}
          />
        </div>
        <div className="profilePic">
          <label 
            htmlFor="redCountrySelect"
            onClick={(e) => {
              e.preventDefault();
              setShowRedSelect(true);
              // 次のフレームでフォーカスを当てる
              setTimeout(() => {
                document.getElementById('redCountrySelect')?.focus();
              }, 0);
            }}
          >
            {(() => {
              const countryEn = pendingChanges['red.country'] !== undefined ? pendingChanges['red.country'] : (gameData?.red?.country || '');
              const country = COUNTRIES.find(c => (c.en === countryEn || (c.id === 'none' && countryEn === '')));
              const displayCountry = country || COUNTRIES.find(c => c.id === 'none');
              const labelText = currentLang === 'ja' ? '赤：国' : 'Red: Country';
              
              return (
                <img
                  src={`/img/flags/${displayCountry.code}.svg`}
                  alt={labelText}
                  className="flagPreview"
                />
              );
            })()}
          </label>
          <select
            id="redCountrySelect"
            className="settingSelect"
            style={{ display: showRedSelect ? 'block' : 'none' }}
            value={(() => {
              const countryEn = pendingChanges['red.country'] !== undefined ? pendingChanges['red.country'] : (gameData?.red?.country || '');
              return COUNTRIES.find(c => (c.en === countryEn || (c.id === 'none' && countryEn === '')))?.id || 'none';
            })()}
            onChange={(e) => handleFlagUpdate('red', e.target.value)}
            onBlur={() => setShowRedSelect(false)}
          >
            {sortedCountries.map(c => (
              <option key={c.id} value={c.id}>
                {currentLang === 'ja' ? c.ja : c.en}
              </option>
            ))}
          </select>
        </div>
        <div className="timerSetting">
          <select
            id="redLimitInput"
            className="settingSelect"
            aria-label={getLocalizedText('labels.redTimer', currentLang)}
            value={selectedRedLimit}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value)) {
                setSelectedRedLimit(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'red.limit': value
                }));
              }
            }}
          >
            {renderTimeOptions()}
          </select>
        </div>
      </div>

      {/* Blue Player Settings */}
      <div id="bluePlayerInput" className="playerSettingGroup">
        <div className="nameSetting">
          <input
            id="blueNameInput"
            type="text"
            placeholder={getLocalizedText('labels.blueName', currentLang) || 'Blue Name'}
            value={pendingChanges['blue.name'] !== undefined ? pendingChanges['blue.name'] : (gameData?.blue?.name || '')}
            onChange={(e) => {
              setPendingChanges(prev => ({
                ...prev,
                'blue.name': e.target.value
              }));
            }}
          />
        </div>
        <div className="profilePic">
          <label 
            htmlFor="blueCountrySelect"
            onClick={(e) => {
              e.preventDefault();
              setShowBlueSelect(true);
              // 次のフレームでフォーカスを当てる
              setTimeout(() => {
                document.getElementById('blueCountrySelect')?.focus();
              }, 0);
            }}
          >
            {(() => {
              const countryEn = pendingChanges['blue.country'] !== undefined ? pendingChanges['blue.country'] : (gameData?.blue?.country || '');
              const country = COUNTRIES.find(c => (c.en === countryEn || (c.id === 'none' && countryEn === '')));
              const displayCountry = country || COUNTRIES.find(c => c.id === 'none');
              const labelText = currentLang === 'ja' ? '青：国' : 'Blue: Country';
              
              return (
                <img
                  src={`/img/flags/${displayCountry.code}.svg`}
                  alt={labelText}
                  className="flagPreview"
                />
              );
            })()}
          </label>
          <select
            id="blueCountrySelect"
            className="settingSelect"
            style={{ display: showBlueSelect ? 'block' : 'none' }}
            value={(() => {
              const countryEn = pendingChanges['blue.country'] !== undefined ? pendingChanges['blue.country'] : (gameData?.blue?.country || '');
              return COUNTRIES.find(c => (c.en === countryEn || (c.id === 'none' && countryEn === '')))?.id || 'none';
            })()}
            onChange={(e) => handleFlagUpdate('blue', e.target.value)}
            onBlur={() => setShowBlueSelect(false)}
          >
            {sortedCountries.map(c => (
              <option key={c.id} value={c.id}>
                {currentLang === 'ja' ? c.ja : c.en}
              </option>
            ))}
          </select>
        </div>
        <div className="timerSetting">
          <select
            id="blueLimitInput"
            className="settingSelect"
            aria-label={getLocalizedText('labels.blueTimer', currentLang)}
            value={selectedBlueLimit}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value)) {
                setSelectedBlueLimit(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'blue.limit': value
                }));
              }
            }}
          >
            {renderTimeOptions()}
          </select>
        </div>
      </div>
    </div>
  );
};

export default PlayerSettings;
