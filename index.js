const puppeteer = require('puppeteer');
const config = require('./config');
const CATEGORIES = require('./categories');
const scrapeAmazon = require('./scrapers/AmazonScraper');
const scrapeFlipkart = require('./scrapers/FlipkartScraper');
const { info, success, warn, error } = require('./utils/logger');
const saveToCsv = require('./utils/outputHandler');
const { comparePrices, printComparison } = require('./utils/compare');
const { randomDelay } = require('./utils/delay');

const PLATFORMS = [
  { key: 'amazon', label: 'Amazon', scrape: scrapeAmazon },
  { key: 'flipkart', label: 'Flipkart', scrape: scrapeFlipkart },
];

const VALID_PLATFORMS = new Set(['amazon', 'flipkart', 'both']);

function takeValue(args, i, flag) {
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) {
    error(`Missing value for ${flag}.`);
    process.exit(1);
  }
  return next;
}

function parseArgs(args) {
  const overrides = {};

  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];

    if (flag === '--list-categories') {
      info(`Available categories: ${Object.keys(CATEGORIES).join(', ')}`);
      process.exit(0);
    }
    if (flag === '--query') {
      overrides.queries ??= [];
      overrides.queries.push(takeValue(args, i, '--query'));
      i += 1;
      continue;
    }
    if (flag === '--category') {
      overrides.category = takeValue(args, i, '--category');
      i += 1;
      continue;
    }
    if (flag === '--platform') {
      overrides.platform = takeValue(args, i, '--platform').toLowerCase();
      i += 1;
      continue;
    }
    if (flag === '--pages') {
      const raw = takeValue(args, i, '--pages');
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        error(`--pages must be a positive integer, received "${raw}".`);
        process.exit(1);
      }
      overrides.pages = parsed;
      i += 1;
      continue;
    }
    if (flag === '--headless') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        overrides.headless = true;
      } else {
        overrides.headless = next !== 'false';
        i += 1;
      }
      continue;
    }
    if (flag.startsWith('--')) warn(`Unknown option "${flag}", ignoring.`);
  }

  return overrides;
}

function isPlatformEnabled(activePlatform, targetPlatform) {
  const chosen = (activePlatform ?? 'both').toLowerCase();
  return chosen === 'both' || chosen === targetPlatform.toLowerCase();
}

function validatePlatform(platform) {
  if (!platform) return;
  if (!VALID_PLATFORMS.has(platform.toLowerCase())) {
    error(`Invalid platform "${platform}". Valid platforms: ${[...VALID_PLATFORMS].join(', ')}`);
    process.exit(1);
  }
}

function validateCategory(category) {
  if (!category) {
    error('No category provided. Set "category" in config.js or pass --category <name>.');
    process.exit(1);
  }
  if (!CATEGORIES[category]) {
    error(`Invalid category "${category}". Valid categories: ${Object.keys(CATEGORIES).join(', ')}`);
    process.exit(1);
  }
}

function getQueries(activeConfig) {
  if (Array.isArray(activeConfig.queries) && activeConfig.queries.length) return activeConfig.queries;
  if (activeConfig.query) return [activeConfig.query];
  error('No queries provided. Set "queries" in config.js or pass --query <term>.');
  process.exit(1);
}

function tagProducts(items, label, query, category) {
  return items.map((item) => ({ ...item, platform: label, query, category }));
}

function printSummary(products, csvPath) {
  const amazonCount = products.filter((p) => p.platform === 'Amazon').length;
  const flipkartCount = products.filter((p) => p.platform === 'Flipkart').length;
  success(`Run complete. Total: ${products.length} (Amazon: ${amazonCount}, Flipkart: ${flipkartCount})`);
  info(`Results saved to: ${csvPath}`);
}

async function main() {
  const activeConfig = { ...config, ...parseArgs(process.argv.slice(2)) };

  validatePlatform(activeConfig.platform);
  validateCategory(activeConfig.category);
  const queries = getQueries(activeConfig);

  const browser = await puppeteer.launch({ headless: activeConfig.headless });
  const allProducts = [];

  try {
    for (const query of queries) {
      const queryConfig = { ...activeConfig, query };
      info(`Searching "${query}" in category "${activeConfig.category}"...`);

      // Sequential: one platform at a time, with a polite gap between them.
      // Parallel scraping doubles the request rate per origin and trips rate
      // limits faster than serial scraping with a small jitter.
      for (const p of PLATFORMS) {
        if (!isPlatformEnabled(activeConfig.platform, p.key)) continue;
        try {
          const items = await p.scrape(browser, queryConfig);
          const tagged = tagProducts(items, p.label, query, activeConfig.category);
          info(`[${p.label}] Scraped ${items.length} items for "${query}"`);
          allProducts.push(...tagged);
        } catch (err) {
          error(`[${p.label}] Scrape failed: ${err.stack || err.message || err}`);
        }
        await randomDelay(activeConfig.minDelayMs, activeConfig.maxDelayMs);
      }
    }

    const csvPath = saveToCsv(allProducts, activeConfig);
    const brand = activeConfig.queries?.[0] ?? '';
    for (const query of queries) {
      printComparison(comparePrices(allProducts.filter((p) => p.query === query), brand), query);
    }
    printSummary(allProducts, csvPath);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  error(err.stack || err.message);
  process.exit(1);
});
