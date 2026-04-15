const zh_Hant = require('../locales/zh_Hant');
const zh_Hans = require('../locales/zh_Hans');
const ja = require('../locales/ja');
const en = require('../locales/en');

const locales = { zh_Hant, zh_Hans, ja, en };

const SUPPORTED_LANGUAGES = ['zh_Hant', 'zh_Hans', 'ja', 'en'];

const LANGUAGE_LABELS = {
    zh_Hant: '繁體中文',
    zh_Hans: '简体中文',
    ja: '日本語',
    en: 'English',
};

// Map bot language to API sk-language header value
const SK_LANGUAGE_MAP = {
    zh_Hant: 'zh_Hant',
    zh_Hans: 'zh_Hans',
    ja: 'ja',
    en: 'en',
};

/**
 * Get a translation string for the given language and key.
 * Falls back to zh_Hant if the key is missing in the requested locale.
 *
 * @param {string} lang  Language code (zh_Hant | zh_Hans | ja | en)
 * @param {string} key   Locale string key
 * @returns {string|Function} The translated string or template function
 */
function t(lang, key) {
    const locale = locales[lang] || locales.zh_Hant;
    return locale[key] ?? locales.zh_Hant[key] ?? key;
}

/**
 * Get the sk-language header value for a given bot language.
 *
 * @param {string} lang  Language code
 * @returns {string} API header value
 */
function getSkLanguage(lang) {
    return SK_LANGUAGE_MAP[lang] || 'zh_Hant';
}

module.exports = { t, getSkLanguage, SUPPORTED_LANGUAGES, LANGUAGE_LABELS };
