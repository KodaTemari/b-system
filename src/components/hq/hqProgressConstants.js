/** 試合ID列の表示（将来トグルで復活） */
export const SHOW_MATCH_ID = false;

/** 本部承認（hqApprovedAt）から CM ボタンを出すまでの待ち時間 */
export const CM_SHOW_DELAY_MS = 3 * 60 * 1000;

/** 紙結果入力: init.json の match.totalEnds に合わせた行数（未取得時の既定・上限） */
export const MANUAL_PAPER_DEFAULT_TOTAL_ENDS = 6;
export const MANUAL_PAPER_MAX_TOTAL_ENDS = 50;
export const MANUAL_PAPER_DEFAULT_REFEREE_NAME = '主審';

/** TD（本部承認）モードの承認者名デフォルト */
export const DEFAULT_HQ_TD_APPROVER_NAME = 'TD';

export const statusLabelMap = {
  scheduled: '待機',
  announced: '配信済み',
  in_progress: '試合中',
  match_finished: '試合終了',
  court_approved: 'コート承認済み',
  hq_approved: '本部承認済み',
};

export const statusClassMap = {
  scheduled: 'isScheduled',
  announced: 'isAnnounced',
  in_progress: 'isInProgress',
  match_finished: 'isMatchFinished',
  court_approved: 'isCourtApproved',
  hq_approved: 'isHqApproved',
};
