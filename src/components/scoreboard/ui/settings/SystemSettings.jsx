import React, { useState } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../../locales';
import resetIcon from '../../img/icon_reset.png';
import languageIcon from '../../img/icon_language.png';

const SystemSettings = ({
  handleReset,
  handleLanguageChange,
  section,
  currentLang // Prop from parent to ensure reactivity
}) => {
  // Fallback if currentLang prop is not provided
  const lang = currentLang || getCurrentLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Toggle Language Modal
  const toggleLanguageModal = () => {
    setShowLanguageModal(!showLanguageModal);
  };

  // Handle Language Selection
  const onSelectLanguage = (l) => {
    handleLanguageChange(l);
    setShowLanguageModal(false);
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
          <img src={resetIcon} alt="Reset" style={{ width: '100%', height: 'auto' }} />
        </button>
      )}

      {/* Language Button (Always Visible, Top Right) */}
      <button
        className="languageBtn"
        onClick={toggleLanguageModal}
        title="Language"
      >
        <img src={languageIcon} alt="Language" style={{ width: '100%', height: 'auto' }} />
      </button>

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div
          className="customeModalOverlay"
          onClick={() => setShowLanguageModal(false)}
        >
          <div
            className="customeModalContent"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onSelectLanguage('ja')}
              className={`languageSelectBtn ${lang === 'ja' ? 'selected' : ''}`}
            >
              日本語
            </button>

            <button
              onClick={() => onSelectLanguage('en')}
              className={`languageSelectBtn ${lang === 'en' ? 'selected' : ''}`}
            >
              English
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SystemSettings;
