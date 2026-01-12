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
    const dialog = document.getElementById('confirmModal');
    if (dialog) {
      // フェードアウトクラスを追加
      dialog.classList.add('closing');
      
      // アニメーション完了後にモーダルを閉じる
      setTimeout(() => {
        if (onConfirm) {
          onConfirm();
        }
        if (dialog) {
          dialog.close();
          dialog.classList.remove('closing');
        }
      }, 200);
    } else {
      if (onConfirm) {
        onConfirm();
      }
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
            className="primaryBtn"
            onClick={handleConfirm}
          >
            {getLocalizedText('buttons.ok', getCurrentLanguage()) || 'OK'}
          </button>
          <button
            type="button"
            className="primaryBtn"
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

