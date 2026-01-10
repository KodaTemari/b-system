import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';

export const MatchGeneralSettings = ({
  classificationOptions,
  selectedClassId,
  handleClassificationChange,
  selectedGender,
  handleGenderChange,
  pendingChanges,
  gameData,
  setPendingChanges
}) => {
  const currentLang = getCurrentLanguage();

  return (
    <>
      <select
        id="classificationInput"
        className="settingSelect"
        value={selectedClassId}
        onChange={(e) => handleClassificationChange(e.target.value)}
      >
        {classificationOptions.map((option, index) => (
          <option key={index} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        id="genderInput"
        className="settingSelect"
        value={selectedGender}
        onChange={(e) => handleGenderChange(e.target.value)}
        disabled={!selectedClassId || !classificationOptions.find(opt => opt.value === selectedClassId)?.hasGender}
      >
        <option value="M">{getLocalizedText('options.gender.male', currentLang)}</option>
        <option value="F">{getLocalizedText('options.gender.female', currentLang)}</option>
        <option value="">{getLocalizedText('options.gender.mixed', currentLang)}</option>
      </select>

      <input
        id="matchNameInput"
        type="text"
        placeholder={getLocalizedText('labels.matchName', currentLang) || 'Match Name'}
        value={pendingChanges['matchName'] !== undefined ? pendingChanges['matchName'] : (gameData?.matchName || '')}
        onChange={(e) => {
          setPendingChanges(prev => ({
            ...prev,
            'matchName': e.target.value
          }));
        }}
      />
    </>
  );
};

export const MatchRuleSettings = ({
  selectedEnds,
  setSelectedEnds,
  selectedTieBreak,
  setSelectedTieBreak,
  selectedRules,
  setSelectedRules,
  selectedResultApproval,
  setSelectedResultApproval,
  setPendingChanges,
  scene
}) => {
  const currentLang = getCurrentLanguage();
  const isRecreation = scene === 'recreation';

  return (
    <>
      <div className="detailSettingItem">
        <label htmlFor="endsInput" className="detailSettingLabel">{getLocalizedText('labels.numberOfEnds', currentLang)}</label>
        <select
          id="endsInput"
          className="settingSelect"
          value={selectedEnds || ''}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '') {
              setSelectedEnds('');
              return;
            }
            const newEnds = parseInt(value, 10);
            if (!isNaN(newEnds)) {
              setSelectedEnds(newEnds);
              setPendingChanges(prev => ({
                ...prev,
                'match.totalEnds': newEnds
              }));
            }
          }}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </select>
      </div>

      {!isRecreation && (
        <>
          <div className="detailSettingItem">
            <label htmlFor="tieBreakInput" className="detailSettingLabel">{getLocalizedText('labels.tieBreak', currentLang)}</label>
            <select
              id="tieBreakInput"
              className="settingSelect"
              value={selectedTieBreak}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedTieBreak(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'match.tieBreak': value
                }));
              }}
            >
              <option value="extraEnd">{getLocalizedText('options.tieBreak.extraEnd', currentLang)}</option>
              <option value="finalShot">{getLocalizedText('options.tieBreak.finalShot', currentLang)}</option>
              <option value="none">{getLocalizedText('options.tieBreak.none', currentLang)}</option>
            </select>
          </div>
          <div className="detailSettingItem">
            <label htmlFor="rulesInput" className="detailSettingLabel">{getLocalizedText('labels.rules', currentLang)}</label>
            <select
              id="rulesInput"
              className="settingSelect"
              value={selectedRules}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedRules(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'match.rules': value
                }));
              }}
            >
              <option value="worldBoccia">{getLocalizedText('options.rules.worldBoccia', currentLang)}</option>
              <option value="friendlyMatch">{getLocalizedText('options.rules.friendlyMatch', currentLang)}</option>
              <option value="recreation">{getLocalizedText('options.rules.recreation', currentLang)}</option>
            </select>
          </div>
          <div className="detailSettingItem">
            <label htmlFor="resultApprovalInput" className="detailSettingLabel">{getLocalizedText('labels.resultApproval', currentLang)}</label>
            <select
              id="resultApprovalInput"
              className="settingSelect"
              value={selectedResultApproval}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedResultApproval(value);
                setPendingChanges(prev => ({
                  ...prev,
                  'match.resultApproval': value
                }));
              }}
            >
              <option value="enabled">{getLocalizedText('options.resultApproval.enabled', currentLang)}</option>
              <option value="none">{getLocalizedText('options.resultApproval.none', currentLang)}</option>
            </select>
          </div>
        </>
      )}
    </>
  );
};
