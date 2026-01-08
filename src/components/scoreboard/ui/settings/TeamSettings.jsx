import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';

const TeamSettings = ({
  pendingChanges,
  gameData,
  setPendingChanges
}) => {
  const currentLang = getCurrentLanguage();

  return (
    <>
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
    </>
  );
};

export default TeamSettings;
