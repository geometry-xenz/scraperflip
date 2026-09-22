module.exports = {
  queries: ['iphone'],
  category: 'phone',
  pages: 1,
  platform: 'both',
  headless: true,
  outputFolder: 'results',

  // Anti-rate-limit defaults
  minDelayMs: 3000,
  maxDelayMs: 7000,
  retries: 2,
  retryBackoffMs: 8000,
  blockBackoffMs: 30000,
  warmupHomepage: true,
};
