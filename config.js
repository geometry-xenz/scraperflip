// This is the only file to touch for changing what gets scraped.
// To switch brand, change ONLY the queries array below (one line per brand).
//   Apple   -> queries: ['iphone']
//   Samsung -> queries: ['samsung']
//   OnePlus -> queries: ['oneplus']

module.exports = {
  queries: ['iphone'],
  category: 'phone',
  pages: 1,
  platform: 'both',
  headless: true,
  outputFolder: 'results',

  // Anti-rate-limit defaults: keep these conservative. Lower them only if
  // your IP is whitelisted or you've solved enough CAPTCHAs to be trusted.
  minDelayMs: 3000,
  maxDelayMs: 7000,
  retries: 2,
  retryBackoffMs: 8000,
  blockBackoffMs: 30000,
  warmupHomepage: true,
};
