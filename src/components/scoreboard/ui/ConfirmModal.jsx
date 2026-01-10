import React from 'react';
import { getText as getLocalizedText, getCurrentLanguage } from '../../../locales';

/**
 * 確認モーダルコンポーネント
 */
const ConfirmModal = ({
  message,
  onConfirm,
  onCancel
}) => {
  const handleDialogClick = (e) => {
    // クリックされた要素がdialog要素自体（背景）の場合のみ閉じる
    if (e.target === e.currentTarget) {
      const dialog = document.getElementById('confirmModal');
      if (dialog) {
        dialog.close();
      }
      if (onCancel) {
        onCancel();
      }
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    const dialog = document.getElementById('confirmModal');
    if (dialog) {
      dialog.close();
    }
  };

  const handleCancel = () => {
    const dialog = document.getElementById('confirmModal');
    if (dialog) {
      dialog.close();
    }
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <dialog id="confirmModal" onClick={handleDialogClick}>
      <div className="confirmModalBox">
        <p className="confirmModalMessage">{message}</p>
        
        <div className="confirmModalButtons">
          <button
            type="button"
            className="btn confirmModalBtn confirmModalBtnOk"
            onClick={handleConfirm}
          >
            {getLocalizedText('buttons.ok', getCurrentLanguage()) || 'OK'}
          </button>
          <button
            type="button"
            className="btn confirmModalBtn confirmModalBtnCancel"
            onClick={handleCancel}
          >
            {getLocalizedText('buttons.cancel', getCurrentLanguage()) || 'キャンセル'}
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default ConfirmModal;

