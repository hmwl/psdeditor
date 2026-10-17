




























export const LANGUAGE_BY_CODE = {
  0: 'englishLanguage',
  1: 'finnishLanguage',
  2: 'standardFrenchLanguage',
  3: 'canadianFrenchLanguage',
  4: 'germanLanguageReformed1996',
  5: 'oldGermanLanguage',
  6: 'swissGermanLanguageOldRules',
  7: 'italianLanguage',
  8: 'bokmalNorwegianLanguage',
  9: 'nynorskNorwegianLanguage',
  10: 'standardPortugueseLanguage',
  11: 'brazilianPortugueseLanguage',
  12: 'spanishLanguage',
  13: 'swedishLanguage',
  14: 'ukenglishLanguage',
  15: 'kdutchLanguageOldRules',
  16: 'danishLanguage',
  17: 'catalanLanguage',
  18: 'russianLanguage',
  19: 'ukranianLanguage',
  20: 'bulgarianLanguage',
  21: 'serbianLanguage',
  22: 'czechLanguage',
  23: 'polishLanguage',
  24: 'romanianLanguage',
  25: 'greekLanguage',
  26: 'turkishLanguage',
  27: 'icelandicLanguage',
  28: 'hungarianLanguage',
  29: 'croatianLanguage',
  30: 'hebrewLanguage',
  31: 'slovenianLanguage',
  34: 'lithuanianLanguage',
  35: 'latvianLanguage',
  36: 'slovakLanguage',
  37: 'arabicLanguage',
};


export const LANGUAGE_CODE = Object.fromEntries(
  Object.entries(LANGUAGE_BY_CODE).map(([code, name]) => [name, Number(code)]),
);


export const LANGUAGE_LABELS = {
  englishLanguage: '英语（美国）',
  ukenglishLanguage: '英语（英国）',
  finnishLanguage: '芬兰语',
  standardFrenchLanguage: '法语（标准）',
  canadianFrenchLanguage: '法语（加拿大）',
  standardGermanLanguage: '德语（标准）',
  germanLanguageReformed1996: '德语（1996 正字法）',
  oldGermanLanguage: '德语（旧正字法）',
  swissGermanLanguage: '德语（瑞士）',
  swissGermanLanguageOldRules: '德语（瑞士·旧规则）',
  italianLanguage: '意大利语',
  bokmalNorwegianLanguage: '挪威语（博克马尔）',
  nynorskNorwegianLanguage: '挪威语（尼诺斯克）',
  standardPortugueseLanguage: '葡萄牙语（标准）',
  brazilianPortugueseLanguage: '葡萄牙语（巴西）',
  spanishLanguage: '西班牙语',
  swedishLanguage: '瑞典语',
  dutchLanguage: '荷兰语',
  kdutchLanguageOldRules: '荷兰语（旧规则）',
  danishLanguage: '丹麦语',
  russianLanguage: '俄语',
  serbianLanguage: '塞尔维亚语',
  czechLanguage: '捷克语',
  polishLanguage: '波兰语',
  greekLanguage: '希腊语',
  turkishLanguage: '土耳其语',
  icelandicLanguage: '冰岛语',
  hungarianLanguage: '匈牙利语',
  catalanLanguage: '加泰罗尼亚语',
  croatianLanguage: '克罗地亚语',
  romanianLanguage: '罗马尼亚语',
  ukranianLanguage: '乌克兰语',
  slovenianLanguage: '斯洛文尼亚语',
  bulgarianLanguage: '保加利亚语',
  latvianLanguage: '拉脱维亚语',
  lithuanianLanguage: '立陶宛语',
  estonianLanguage: '爱沙尼亚语',
  slovakLanguage: '斯洛伐克语',
  chineseLanguage: '中文',
  japaneseLanguage: '日语',
  arabicLanguage: '阿拉伯语',
  hebrewLanguage: '希伯来语',
  hindiLanguage: '印地语',
};


export function languageNameOf(code) {
  const n = Number(code);
  return Number.isFinite(n) ? (LANGUAGE_BY_CODE[n] || null) : null;
}


export function languageLabelOf(code) {
  const name = languageNameOf(code);
  return name ? (LANGUAGE_LABELS[name] || name) : null;
}


export function languageCodeOf(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return LANGUAGE_BY_CODE[v] ? v : null;
  if (typeof v === 'string') {
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_CODE, v)) return LANGUAGE_CODE[v];
    const n = Number(v);
    if (Number.isFinite(n)) return LANGUAGE_BY_CODE[n] ? n : null;
  }
  return null;
}


export const LANGUAGE_OPTIONS = Object.keys(LANGUAGE_BY_CODE)
  .map(Number).sort((a, b) => a - b)
  .map(code => ({ code, name: LANGUAGE_BY_CODE[code], label: LANGUAGE_LABELS[LANGUAGE_BY_CODE[code]] || LANGUAGE_BY_CODE[code] }));

export default { LANGUAGE_BY_CODE, LANGUAGE_CODE, LANGUAGE_LABELS, LANGUAGE_OPTIONS, languageNameOf, languageLabelOf, languageCodeOf };
