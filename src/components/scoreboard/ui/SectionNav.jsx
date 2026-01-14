import React, { useMemo } from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';
import { COUNTRIES } from '../../../utils/scoreboard/countries';
import colorIcon from '../img/icon_color.png';

/**
 * Section Selection Navigation Component
 */
const SectionNavigation = React.memo(({
  setColor: isColorSet,
  section,
  sectionID,
  totalEnds,
  tieBreak,
  sections,
  category,
  matchName,
  classification,
  warmup,
  warmupEnabled = true,
  warmupMode = 'simultaneous',
  interval,
  intervalEnabled = true,
  isTie,
  warmupTimer,
  intervalTimer,
  isCtrl,
  scoreAdjusting,
  redPenaltyBall = 0,
  bluePenaltyBall = 0,
  currentLang,
  onConfirmColorToggle,
  onStartWarmup,
  onWarmupTimerToggle,
  onNextSection,
  onIntervalTimerToggle,
  onTieBreak,
  onSwapTeamNames,
  redCountry,
  redProfilePic,
  blueCountry,
  blueProfilePic,
  scene,
  onRestartToStandby
}) => {
  // Get text (uses current language)
  const getText = (key) => {
    return getLocalizedText(`buttons.${key}`, currentLang || getCurrentLanguage());
  };

  // Format classification to display with multi-language support (Standard/English or Japanese)
  const formattedClassification = useMemo(() => {
    if (!classification) return '';

    const lang = currentLang || getCurrentLanguage();
    const parts = classification.split(' ');

    // Convert prefix to localized string (supports both English and Japanese origin)
    let prefix = '';
    let prefixIndex = 0;
    if (parts[0] === 'IND' || parts[0] === '個人') {
      prefix = lang === 'ja' ? '個人 ' : 'IND ';
      prefixIndex = 1;
    } else if (parts[0] === 'PAIR' || parts[0] === 'ペア') {
      prefix = lang === 'ja' ? 'ペア ' : 'PAIR ';
      prefixIndex = 1;
    } else if (parts[0] === 'TEAM' || parts[0] === 'チーム') {
      prefix = lang === 'ja' ? 'チーム ' : 'TEAM ';
      prefixIndex = 1;
    } else if (parts[0] === 'Recreation' || parts[0] === 'レクリエーション') {
      return getLocalizedText('classNames.Recreation', lang) || classification;
    }

    // Get class name part (after prefix, before gender)
    let className = '';
    let genderPart = '';

    if (parts.length > prefixIndex) {
      const lastPart = parts[parts.length - 1];
      // Check for gender (supports both English and Japanese)
      if (lastPart === 'Male' || lastPart === 'Female' || lastPart === '男子' || lastPart === '女子') {
        genderPart = lastPart;
        // Remove prefix
        if (prefixIndex > 0) {
          className = parts.slice(prefixIndex, -1).join(' ');
        } else {
          className = parts.slice(0, -1).join(' ');
        }
      } else {
        // No gender part
        if (prefixIndex > 0) {
          className = parts.slice(prefixIndex).join(' ');
        } else {
          className = parts.join(' ');
        }
      }
    } else {
      className = classification;
    }

    // Localize class name using classNames map
    let localizedClassName = className;
    const classNames = ['BC1', 'BC2', 'BC3', 'BC4',
      'PairBC3', 'PairBC4',
      'TeamsBC1BC2',
      'TeamFriendly', 'Friendly', 'OPSeated', 'OPStanding',
      'Recreation'];

    // Find matching key (check English name and Localized name)
    let found = false;
    for (const key of classNames) {
      const englishName = getLocalizedText(`classNames.${key}`, 'en') || key;
      const localizedName = getLocalizedText(`classNames.${key}`, lang);
      // Check against Localized, English, or Key itself
      if (localizedName === className || englishName === className || key === className) {
        localizedClassName = getLocalizedText(`classNames.${key}`, lang) || className;
        found = true;
        break;
      }
    }

    // If no match, use original className (fallback)
    if (!found) {
      localizedClassName = className;
    }

    // Localize gender
    let localizedGender = '';
    if (genderPart === 'Male' || genderPart === '男子') {
      localizedGender = lang === 'ja' ? '男子' : 'Male';
    } else if (genderPart === 'Female' || genderPart === '女子') {
      localizedGender = lang === 'ja' ? '女子' : 'Female';
    }

    return localizedGender ? `${prefix}${localizedClassName} ${localizedGender}` : `${prefix}${localizedClassName}`;
  }, [classification, currentLang]);


  // Display control per section
  const getCurrentSectionId = () => {
    if (section === 'standby') return 'secStandby';
    if (section === 'warmup' || section === 'warmup1' || section === 'warmup2') return 'secWarmup';
    if (section === 'interval') return 'secInterval';
    if (section === 'finalShot') return 'secFinalShot';
    if (section === 'tieBreak') return 'secTieBreak';
    if (section === 'matchFinished') return 'secMatchFinished';

    // End sections
    if (section && section.startsWith('end')) {
      const endNumber = parseInt(section.replace('end', ''), 10);
      if (endNumber === totalEnds) {
        return 'secLastEnd'; // Last end
      } else {
        return 'secEnd'; // Normal end
      }
    }

    return 'secStandby'; // Default
  };

  const currentSectionId = getCurrentSectionId();

  // Tag selection (nav for ctrl, div for view)
  const TagName = isCtrl ? 'nav' : 'div';

  return (
    <TagName id="sectionNav">
      {/* standby section */}
      {currentSectionId === 'secStandby' && section !== 'matchFinished' && section !== 'resultApproval' && (
        <div id="secStandby">
          {/* Display on both ctrl and view */}
          <div id="matchInfo">
            <p id="classification">{formattedClassification}</p>
            <div id="matchNameContainer">
              <h1 id="matchName">{matchName}</h1>
            </div>
          </div>

          {/* Display only on view mode */}
          {!isCtrl && (
            <div className="vs">vs</div>
          )}

          {/* Buttons for ctrl screen only */}
          {isCtrl && (
            <div id="setColorBox">
              <button
                type="button"
                className={`colorChangeBtn ${isColorSet ? 'isColorSet' : ''}`}
                name="colorChangeBtn"
                onClick={isColorSet ? onConfirmColorToggle : onSwapTeamNames}
              >
                <img src={colorIcon} alt={getText('changeColor')} />
              </button>
              {!isColorSet && (
                <button
                  type="button"
                  name="setColorBtn"
                  className="primaryBtn"
                  onClick={onConfirmColorToggle}
                >
                  {getText('setColor')}
                </button>
              )}
            </div>
          )}

          {/* Start Warmup / Start Match buttons for ctrl screen only */}
          {isCtrl && isColorSet && (
            <button
              type="button"
              name="startWarmupBtn"
              className="primaryBtn fadeIn"
              onClick={onStartWarmup}
            >
              {warmupEnabled ? getText('startWarmup') : getText('startMatch')}
            </button>
          )}
        </div>
      )}

      {/* warmup section */}
      {currentSectionId === 'secWarmup' && warmupEnabled && (
        <div id="secWarmup">
          {/* Label above timer */}
          <div className="warmupLabel">
            {section === 'warmup1'
              ? (getLocalizedText('sections.warmup1', currentLang || getCurrentLanguage()) || 'Red Warmup')
              : section === 'warmup2'
                ? (getLocalizedText('sections.warmup2', currentLang || getCurrentLanguage()) || 'Blue Warmup')
                : (getLocalizedText('sections.warmup', currentLang || getCurrentLanguage()) || 'Warmup')}
          </div>
          <button
            type="button"
            name="warmupTimerBtn"
            className="timer"
            data-running={warmup.isRunning}
            role={isCtrl ? undefined : "none"}
            onClick={isCtrl ? onWarmupTimerToggle : undefined}
          >
            <span>{warmupTimer?.displayTime}</span>
          </button>
          {isCtrl && (
            <>
              <br />
              {/* Controls for warmup2: Show "Start Warmup" if stopped, "Finish Warmup" if running */}
              {section === 'warmup2' ? (
                !warmup.isRunning ? (
                  <button
                    type="button"
                    className="primaryBtn finishWarmup"
                    onClick={onWarmupTimerToggle}
                  >
                    {getText('startWarmup')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primaryBtn finishWarmup fadeIn"
                    onClick={onNextSection}
                  >
                    {getText('finishWarmup')}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="primaryBtn finishWarmup"
                  onClick={onNextSection}
                >
                  {getText('finishWarmup')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Normal end section (ctrl screen only) */}
      {/* 
        Spec:
        - End section (not last end)
        - Score adjust active (scoreAdjusting=true)
        - Penalty balls are 0
        - Show "Start Interval" button
        Flow: Warmup -> End 1 -> Interval -> End 2 -> Interval -> ...
      */}
      {isCtrl &&
        currentSectionId === 'secEnd' &&
        scoreAdjusting &&
        redPenaltyBall === 0 &&
        bluePenaltyBall === 0 && (
          <div id="secEnd">
            {/* Show "Start Interval" or "Next End" button */}
            <button
              type="button"
              className="primaryBtn startInterval"
              onClick={onNextSection}
            >
              {intervalEnabled ? getText('startInterval') : getText('nextEnd')}
            </button>
          </div>
        )}

      {/* interval section */}
      {currentSectionId === 'secInterval' && intervalEnabled && (
        <div id="secInterval">
          <button
            type="button"
            name="intervalTimerBtn"
            className="timer"
            data-running={interval.isRunning}
            role={isCtrl ? undefined : "none"}
            onClick={isCtrl ? onIntervalTimerToggle : undefined}
          >
            <span>{intervalTimer?.displayTime}</span>
          </button>
          {isCtrl && (
            <>
              <br />
              <button
                type="button"
                className="primaryBtn finishInterval"
                onClick={onNextSection}
              >
                {getText('finishInterval')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Last end section (ctrl screen only) */}
      {/* 
        Spec:
        - Last end section
        - Score adjust active (scoreAdjusting=true)
        - If tie, show "Tie Break" or "Final Shot". If score diff, show "Match Finished".
      */}
      {isCtrl &&
        currentSectionId === 'secLastEnd' &&
        scoreAdjusting && (
          <div id="secLastEnd">
            {isTie ? (
              // If tie, show button based on tieBreak setting
              tieBreak === 'extraEnd' ? (
                <button
                  type="button"
                  className="primaryBtn tieBreak"
                  onClick={onTieBreak}
                >
                  {getLocalizedText('sections.tieBreak', currentLang || getCurrentLanguage())}
                </button>
              ) : tieBreak === 'finalShot' ? (
                <button
                  type="button"
                  className="primaryBtn tieBreak"
                  onClick={onTieBreak}
                >
                  {getLocalizedText('sections.finalShot', currentLang || getCurrentLanguage())}
                </button>
              ) : (
                // If tieBreak is "none" or empty, finish match as draw
                <button
                  type="button"
                  className="primaryBtn matchFinished"
                  onClick={onNextSection}
                >
                  {getLocalizedText('sections.matchFinished', currentLang || getCurrentLanguage())}
                </button>
              )
            ) : (
              // If score difference exists, finish match
              <button
                type="button"
                className="primaryBtn matchFinished"
                onClick={onNextSection}
              >
                {getLocalizedText('sections.matchFinished', currentLang || getCurrentLanguage())}
              </button>
            )}
          </div>
        )}

      {/* tieBreak section (ctrl screen only) */}
      {isCtrl && currentSectionId === 'secTieBreak' && (
        <div id="secTieBreak">
          {scoreAdjusting && (
            <button
              type="button"
              className="primaryBtn matchFinished"
              onClick={onNextSection}
            >
              {getLocalizedText('sections.matchFinished', currentLang || getCurrentLanguage())}
            </button>
          )}
        </div>
      )}

      {/* finalShot section (ctrl screen only) */}
      {isCtrl && currentSectionId === 'secFinalShot' && (
        <div id="secFinalShot">
          <button
            type="button"
            className="primaryBtn"
            onClick={onNextSection}
          >
            {getLocalizedText('sections.matchFinished', currentLang || getCurrentLanguage())}
          </button>
        </div>
      )}

      {/* matchFinished section (ctrl screen only) */}
      {isCtrl && currentSectionId === 'secMatchFinished' && (
        <div id="secMatchFinished">
          {(() => {
            // Check if data-scene is recreation
            const isRecreation = scene === 'recreation';
            
            // Show "もう一度！" button for recreation scene
            if (isRecreation && onRestartToStandby) {
              return (
                <button
                  type="button"
                  className="primaryBtn restart"
                  onClick={onRestartToStandby}
                >
                  {getText('restart')}
                </button>
              );
            }

            // Check if last section is resultApproval
            const lastSection = sections && sections.length > 0 ? sections[sections.length - 1] : null;
            const hasResultApproval = lastSection === 'resultApproval';

            // Show "Result Approval" button only if resultApproval is last
            if (hasResultApproval) {
              return (
                <button
                  type="button"
                  className="primaryBtn matchFinished"
                  onClick={onNextSection}
                >
                  {getLocalizedText('sections.resultApproval', currentLang || getCurrentLanguage())}
                </button>
              );
            }

            // Do not show anything if resultApproval is missing
            return null;
          })()}
        </div>
      )}

    </TagName>
  );
});

export default SectionNavigation;
