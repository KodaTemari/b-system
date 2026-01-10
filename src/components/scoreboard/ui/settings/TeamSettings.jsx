import React, { useMemo, useState } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';
import { COUNTRIES } from '../../../../utils/scoreboard/countries';

const TeamSettings = ({
  pendingChanges,
  gameData,
  setPendingChanges
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
      <div id="redPlayerInput">
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
        <div>
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
      </div>
      <div id="bluePlayerInput">
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
        <div>
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
      </div>
    </div>
  );
};

export default TeamSettings;
