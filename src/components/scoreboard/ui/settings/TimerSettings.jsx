import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';

const TimerSettings = ({
  selectedRedLimit,
  setSelectedRedLimit,
  selectedBlueLimit,
  setSelectedBlueLimit,
  selectedWarmup,
  setSelectedWarmup,
  selectedInterval,
  setSelectedInterval,
  setPendingChanges,
  scene
}) => {
  const currentLang = getCurrentLanguage();
  const isRecreation = scene === 'recreation';

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

  return (
    <>
      <div className="detailSettingItem">
        <label htmlFor="redLimitInput" className="detailSettingLabel">{getLocalizedText('labels.redTimer', currentLang)}</label>
        <select
          id="redLimitInput"
          className="settingSelect"
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
      <div className="detailSettingItem">
        <label htmlFor="blueLimitInput" className="detailSettingLabel">{getLocalizedText('labels.blueTimer', currentLang)}</label>
        <select
          id="blueLimitInput"
          className="settingSelect"
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
      {!isRecreation && (
        <>
          <div className="detailSettingItem">
            <label htmlFor="warmupInput" className="detailSettingLabel">{getLocalizedText('labels.warmup', currentLang)}</label>
            <select
              id="warmupInput"
              className="settingSelect"
              value={selectedWarmup}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedWarmup(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'match.warmup': value
                }));
              }}
            >
              <option value="simultaneous">{getLocalizedText('options.warmup.simultaneous', currentLang)}</option>
              <option value="separate">{getLocalizedText('options.warmup.separate', currentLang)}</option>
              <option value="none">{getLocalizedText('options.warmup.none', currentLang)}</option>
            </select>
          </div>
          <div className="detailSettingItem">
            <label htmlFor="intervalInput" className="detailSettingLabel">{getLocalizedText('labels.interval', currentLang)}</label>
            <select
              id="intervalInput"
              className="settingSelect"
              value={selectedInterval}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedInterval(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'match.interval': value
                }));
              }}
            >
              <option value="enabled">{getLocalizedText('options.interval.enabled', currentLang)}</option>
              <option value="none">{getLocalizedText('options.interval.none', currentLang)}</option>
            </select>
          </div>
        </>
      )}
    </>
  );
};

export default TimerSettings;
