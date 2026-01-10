module.exports = {
  locales: ['en-US'],
  defaultLocale: 'en-US',
  loadLocaleFrom: (lang, ns) => import(`./src/locales/${lang}/${ns}.json`).then((m) => m.default),
  pages: {
    '*': ['common'],
    // '/[accountId]/dashboard': ['common'],
    // '/[accountId]/dashboard/bank-account/[bankAccountId]': ['common'],
    // '/account/signIn': ['common'],
    // '/[accountId]/dashboard/settings': ['common'],
    // '/[accountId]/dashboard/settings/categories': ['common'],
  },
}
