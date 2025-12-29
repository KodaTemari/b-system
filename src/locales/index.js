import ja from './ja.json';
import en from './en.json';

// 言語データの定義
const locales = {
  ja,
  en
};

// デフォルト言語（ブラウザの言語設定に基づく）
const getDefaultLanguage = () => {
  const browserLang = navigator.language || navigator.userLanguage;
  return browserLang.startsWith('ja') ? 'ja' : 'en';
};

// 現在の言語を管理する状態
let currentLanguage = getDefaultLanguage();

// 言語データを取得する関数
export const getText = (key, lang = currentLanguage) => {
  const keys = key.split('.');
  let value = locales[lang];
  
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      // フォールバック: 日本語から取得
      value = locales.ja;
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object') {
          value = value[fallbackKey];
        } else {
          return key; // キーが見つからない場合はキー自体を返す
        }
      }
      break;
    }
  }
  
  return value || key;
};

// 言語を変更する関数
export const setLanguage = (lang) => {
  if (locales[lang]) {
    currentLanguage = lang;
    // 必要に応じて、言語変更を通知するイベントを発火
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
  }
};

// 現在の言語を取得する関数
export const getCurrentLanguage = () => currentLanguage;

// 利用可能な言語のリストを取得する関数
export const getAvailableLanguages = () => Object.keys(locales);

// デフォルトエクスポート
export default {
  getText,
  setLanguage,
  getCurrentLanguage,
  getAvailableLanguages
};
