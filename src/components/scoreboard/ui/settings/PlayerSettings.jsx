import React, { useEffect, useMemo, useState } from 'react';
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
  setSelectedBlueLimit,
  playerOptions = [],
  selectedRedPlayerId = '',
  selectedBluePlayerId = ''
}) => {
  const currentLang = getCurrentLanguage();
  const isProfilePicEnabled = (pendingChanges.profilePic ?? gameData?.profilePic ?? 'enabled') !== 'none';
  const [showRedSelect, setShowRedSelect] = useState(false);
  const [showBlueSelect, setShowBlueSelect] = useState(false);
  const [showRedSuggestions, setShowRedSuggestions] = useState(false);
  const [showBlueSuggestions, setShowBlueSuggestions] = useState(false);

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
    const flagPath = country.id === 'none' || country.code === 'xx'
      ? ''
      : `/img/flags/${country.code}.svg`;

    setPendingChanges(prev => ({
      ...prev,
      [`${side}.country`]: flagName,
      [`${side}.profilePic`]: flagPath
    }));

    // 自動で閉じる
    if (side === 'red') setShowRedSelect(false);
    if (side === 'blue') setShowBlueSelect(false);
  };

  const renderPlayerOptionLabel = (player) => {
    return (
      <>
        <span className="playerSuggestionId" aria-hidden="true">{player.id || ''}</span>
        <span className="playerSuggestionContent">
          <span className="playerSuggestionName">{player.name}</span>
          {player.categoryLabel && (
            <span className="playerSuggestionMeta">（{player.categoryLabel}）</span>
          )}
        </span>
      </>
    );
  };

  const externalRedName = pendingChanges['red.name'] !== undefined ? pendingChanges['red.name'] : (gameData?.red?.name || '');
  const externalBlueName = pendingChanges['blue.name'] !== undefined ? pendingChanges['blue.name'] : (gameData?.blue?.name || '');
  const [redInputValue, setRedInputValue] = useState(externalRedName);
  const [blueInputValue, setBlueInputValue] = useState(externalBlueName);

  // 外部値変更時にローカル入力値を追従（編集中でない場合）
  useEffect(() => {
    if (!showRedSuggestions && redInputValue !== externalRedName) {
      setRedInputValue(externalRedName);
    }
  }, [externalRedName, showRedSuggestions]);
  useEffect(() => {
    if (!showBlueSuggestions && blueInputValue !== externalBlueName) {
      setBlueInputValue(externalBlueName);
    }
  }, [externalBlueName, showBlueSuggestions]);

  const redSuggestions = useMemo(
    () => (showRedSuggestions ? playerOptions : []),
    [showRedSuggestions, playerOptions]
  );
  const blueSuggestions = useMemo(
    () => (showBlueSuggestions ? playerOptions : []),
    [showBlueSuggestions, playerOptions]
  );

  const commitNameChange = (side, nameValue, selectedPlayerId) => {
    const value = nameValue || '';
    const selectedPlayer = playerOptions.find((p) => p.id === selectedPlayerId);
    const keepPlayerId = selectedPlayer && selectedPlayer.name === value ? selectedPlayerId : '';
    setPendingChanges((prev) => ({
      ...prev,
      [`${side}.name`]: value,
      [`${side}.playerID`]: keepPlayerId
    }));
  };

  const applyPlayerSelection = (side, player) => {
    setPendingChanges((prev) => ({
      ...prev,
      [`${side}.playerID`]: player?.id || '',
      [`${side}.name`]: player?.name || ''
    }));
    if (side === 'red') {
      setRedInputValue(player?.name || '');
      setShowRedSuggestions(false);
    } else {
      setBlueInputValue(player?.name || '');
      setShowBlueSuggestions(false);
    }
  };

  return (
    <div id="playerInput">
      {/* Red Player Settings */}
      <div id="redPlayerInput" className="playerSettingGroup">
        <div className="nameSetting">
          <div className="playerAutocomplete">
          <input
            id="redNameInput"
            type="text"
            placeholder={getLocalizedText('labels.redName', currentLang) || 'Red'}
            value={redInputValue}
            autoComplete="off"
            onFocus={() => setShowRedSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowRedSuggestions(false), 120);
              commitNameChange('red', redInputValue, selectedRedPlayerId);
            }}
            onChange={(e) => {
              const value = e.target.value;
              setRedInputValue(value);
              setShowRedSuggestions(true);
            }}
          />
          {showRedSuggestions && (
            <ul className="playerSuggestionList">
              {redSuggestions.length === 0 ? (
                <li className="playerSuggestionEmpty">候補がありません</li>
              ) : (
                redSuggestions.map((player) => (
                  <li
                    key={player.id}
                    className={`playerSuggestionItem ${selectedRedPlayerId === player.id ? 'isSelected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyPlayerSelection('red', player);
                    }}
                  >
                    {renderPlayerOptionLabel(player)}
                  </li>
                ))
              )}
            </ul>
          )}
          </div>
        </div>
        {isProfilePicEnabled && (
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
        )}
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
          <div className="playerAutocomplete">
          <input
            id="blueNameInput"
            type="text"
            placeholder={getLocalizedText('labels.blueName', currentLang) || 'Blue'}
            value={blueInputValue}
            autoComplete="off"
            onFocus={() => setShowBlueSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowBlueSuggestions(false), 120);
              commitNameChange('blue', blueInputValue, selectedBluePlayerId);
            }}
            onChange={(e) => {
              const value = e.target.value;
              setBlueInputValue(value);
              setShowBlueSuggestions(true);
            }}
          />
          {showBlueSuggestions && (
            <ul className="playerSuggestionList">
              {blueSuggestions.length === 0 ? (
                <li className="playerSuggestionEmpty">候補がありません</li>
              ) : (
                blueSuggestions.map((player) => (
                  <li
                    key={player.id}
                    className={`playerSuggestionItem ${selectedBluePlayerId === player.id ? 'isSelected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyPlayerSelection('blue', player);
                    }}
                  >
                    {renderPlayerOptionLabel(player)}
                  </li>
                ))
              )}
            </ul>
          )}
          </div>
        </div>
        {isProfilePicEnabled && (
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
        )}
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
