// スコアボード関連の定数定義

export const TIMER_LIMITS = {
  WARMUP: 120000,    // 2分
  INTERVAL: 60000,   // 1分
  GAME: 300000,      // 5分
  FINAL_SHOT: 60000, // 1分
};

export const GAME_SECTIONS = [
  'standby',
  'warmup', 
  'end1',
  'interval',
  'end2',
  'matchFinished'
];

export const BALL_COUNTS = {
  FINAL_SHOT: 1
};

export const AUDIO_FILES = {
  ONE_MINUTE: '/sound/1_minute.m4a',
  THIRTY_SECONDS: '/sound/30_seconds.m4a',
  FIFTEEN_SECONDS: '/sound/15_seconds.m4a',
  TEN_SECONDS: '/sound/10_seconds.m4a',
  TIME_UP: '/sound/time.m4a'
};

export const TIMER_WARNINGS = {
  ONE_MINUTE: 60000,
  THIRTY_SECONDS: 30000,
  FIFTEEN_SECONDS: 15000,
  TEN_SECONDS: 10000,
  TIME_UP: 100
};

export const UI_CONSTANTS = {
  TIME_MODAL_DISPLAY_DURATION: 3000
};