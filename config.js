// This is the only file to touch for changing what gets scraped.

module.exports = {
  queries: ['iphone'],
  category: 'electronics',
  pages: 2,
  platform: 'both',
  headless: true,
  outputFolder: 'results',
  minDelayMs: 1500,
  maxDelayMs: 4000,
};
