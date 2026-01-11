import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';

const TimerSettings = ({
  selectedWarmup,
  setSelectedWarmup,
  selectedInterval,
  setSelectedInterval,
  setPendingChanges,
  scene
}) => {
  const currentLang = getCurrentLanguage();
  const isRecreation = scene === 'recreation';

  return (
    <>
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
