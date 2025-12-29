// ゲームロジック関連のユーティリティ関数

/**
 * プレイヤー名を安全に取得
 * @param {Object|string} player - プレイヤーオブジェクトまたは文字列
 * @returns {string} プレイヤー名
 */
export const getPlayerName = (player) => {
  if (typeof player?.name === 'string') {
    return player.name;
  } else if (typeof player?.name === 'object' && player?.name?.name) {
    return player.name.name;
  } else if (typeof player === 'string') {
    return player;
  }
  return '';
};

/**
 * エンド番号を取得
 * @param {string} sectionName - セクション名（例: "end1", "end2"）
 * @returns {number} エンド番号
 */
export const getEndNumber = (sectionName) => {
  if (sectionName && sectionName.startsWith('end')) {
    return parseInt(sectionName.replace('end', ''), 10);
  }
  return 0;
};

/**
 * エンド表示用のテキストを取得
 * @param {string} sectionName - セクション名
 * @returns {string} 表示用テキスト
 */
export const getEndsBoxText = (sectionName) => {
  if (sectionName && sectionName.startsWith('end')) {
    return sectionName.replace('end', '');
  }
  return sectionName || '';
};

/**
 * ボール数を計算（エンド番号に基づく）
 * @param {number} endNumber - エンド番号
 * @param {string} color - 色（'red' または 'blue'）
 * @returns {number} ボール数
 */
export const calculateBallCount = (endNumber, color) => {
  if (color === 'red') {
    return endNumber % 2 === 1 ? 7 : 6;
  } else if (color === 'blue') {
    return endNumber % 2 === 1 ? 6 : 7;
  }
  return 6;
};

/**
 * 勝敗を判定
 * @param {number} redScore - 赤のスコア
 * @param {number} blueScore - 青のスコア
 * @returns {Object} 勝敗情報
 */
export const determineWinner = (redScore, blueScore) => {
  if (redScore > blueScore) {
    return { winner: 'red', isTie: false };
  } else if (blueScore > redScore) {
    return { winner: 'blue', isTie: false };
  } else {
    return { winner: null, isTie: true };
  }
};

/**
 * セクションが最後のエンドかどうかを判定
 * @param {string} currentSection - 現在のセクション
 * @param {number} totalEnds - 総エンド数
 * @returns {boolean} 最後のエンドかどうか
 */
export const isLastEnd = (currentSection, totalEnds) => {
  if (!currentSection || !currentSection.startsWith('end')) {
    return false;
  }
  const endNumber = getEndNumber(currentSection);
  return endNumber === totalEnds;
};
