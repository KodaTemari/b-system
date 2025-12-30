import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * 反則選択モーダルコンポーネント
 */
const PenaltyModal = ({
  teamColor, // 'red' or 'blue'
  onSelectPenalty,
  onClose,
  getText
}) => {
  // 反則のリスト
  const penalties = [
    { id: 'retraction', name: getLocalizedText('penalties.retraction', getCurrentLanguage()) || 'リトラクション', fullWidth: false },
    { id: 'penaltyBall', name: getLocalizedText('penalties.penaltyBall', getCurrentLanguage()) || 'ペナルティボール', fullWidth: false },
    { id: 'retractionAndPenaltyBall', name: getLocalizedText('penalties.retractionAndPenaltyBall', getCurrentLanguage()) || 'リトラクション および ペナルティボール', fullWidth: true },
    { id: 'penaltyBallAndYellowCard', name: getLocalizedText('penalties.penaltyBallAndYellowCard', getCurrentLanguage()) || 'ペナルティボール および イエローカード', fullWidth: true },
    { id: 'yellowCard', name: getLocalizedText('penalties.yellowCard', getCurrentLanguage()) || 'イエローカード', fullWidth: false },
    { id: 'redCard', name: getLocalizedText('penalties.redCard', getCurrentLanguage()) || 'レッドカード', fullWidth: false },
    { id: 'restartedEnd', name: getLocalizedText('penalties.restartedEnd', getCurrentLanguage()) || 'リスターテッドエンド', fullWidth: false },
    { id: 'forfeit', name: getLocalizedText('penalties.forfeit', getCurrentLanguage()) || '没収試合', fullWidth: false }
  ];

  const teamName = teamColor === 'red' 
    ? getLocalizedText('buttons.redPenalty', getCurrentLanguage()) || '赤の反則'
    : getLocalizedText('buttons.bluePenalty', getCurrentLanguage()) || '青の反則';

  const handlePenaltySelect = (penaltyId) => {
    // 確認が必要な反則かどうかを判定
    const requiresConfirmation = ['redCard', 'restartedEnd', 'forfeit'].includes(penaltyId);
    
    if (requiresConfirmation) {
      // 確認が必要な場合は、確認モーダルを表示するためにコールバックを呼ぶ
      if (onSelectPenalty) {
        onSelectPenalty(teamColor, penaltyId);
      }
    } else {
      // 確認が不要な場合は、直接処理を実行
      if (onSelectPenalty) {
        onSelectPenalty(teamColor, penaltyId);
      }
      // モーダルを閉じる
      const dialog = document.getElementById('penaltyModal');
      if (dialog) {
        dialog.close();
      }
      if (onClose) {
        onClose();
      }
    }
  };

  const handleDialogClick = (e) => {
    // クリックされた要素がdialog要素自体（背景）の場合のみ閉じる
    if (e.target === e.currentTarget) {
      const dialog = document.getElementById('penaltyModal');
      if (dialog) {
        dialog.close();
      }
      if (onClose) {
        onClose();
      }
    }
  };

  return (
    <dialog id="penaltyModal" onClose={onClose} onClick={handleDialogClick}>
      <div className="penaltyModalBox" data-team-color={teamColor}>
        <h2 className={`penaltyModalTitle ${teamColor}`}>
          {teamName}
        </h2>
        
        <div className="penaltyList">
          {penalties.map((penalty) => (
            <button
              key={penalty.id}
              type="button"
              name="penaltyItem"
              value={penalty.id}
              className={`btn penaltyItem ${penalty.fullWidth ? 'penaltyItem-fullWidth' : ''}`}
              onClick={() => handlePenaltySelect(penalty.id)}
            >
              {penalty.name}
            </button>
          ))}
        </div>

        <button type="button" className="penaltyModalCloseBtn" onClick={onClose}>
          ×
        </button>
      </div>
    </dialog>
  );
};

export default PenaltyModal;

