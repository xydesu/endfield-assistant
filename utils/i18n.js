const zh_tw = require('../locales/zh_tw');
const zh_cn = require('../locales/zh_cn');
const ja = require('../locales/ja');
const en = require('../locales/en');

const locales = { zh_tw, zh_cn, ja, en };

const SUPPORTED_LANGUAGES = ['zh_tw', 'zh_cn', 'ja', 'en'];

const LANGUAGE_LABELS = {
    zh_tw: '繁體中文',
    zh_cn: '简体中文',
    ja: '日本語',
    en: 'English',
};

// Map bot language to API sk-language header value
const SK_LANGUAGE_MAP = {
    zh_tw: 'zh_Hant',
    zh_cn: 'zh_Hans',
    ja: 'ja',
    en: 'en',
};

/**
 * Get a translation string for the given language and key.
 * Falls back to zh_tw if the key is missing in the requested locale.
 *
 * @param {string} lang  Language code (zh_tw | zh_cn | ja | en)
 * @param {string} key   Locale string key
 * @returns {string|Function} The translated string or template function
 */
function t(lang, key) {
    const locale = locales[lang] || locales.zh_tw;
    return locale[key] ?? locales.zh_tw[key] ?? key;
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
