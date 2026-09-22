const puppeteer = require('puppeteer');
const config = require('./config');
const CATEGORIES = require('./categories');
const scrapeAmazon = require('./scrapers/AmazonScraper');
const scrapeFlipkart = require('./scrapers/FlipkartScraper');
const { info, success, warn, error } = require('./utils/logger');
const saveToCsv = require('./utils/outputHandler');
const { comparePrices, printComparison } = require('./utils/compare');

function parseArgs(args) {
  const overrides = {};

  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];

    if (flag === '--list-categories') {
      const categoryNames = Object.keys(CATEGORIES).join(', ');
      info(`Available categories: ${categoryNames}`);
      process.exit(0);
    }

    if (flag === '--query') {
      if (!overrides.queries) {
        overrides.queries = [];
      }
      overrides.queries.push(args[i + 1]);
      i += 1;
      continue;
    }

    if (flag === '--category') {
      overrides.category = args[i + 1];
      i += 1;
      continue;
    }

    if (flag === '--platform') {
      overrides.platform = args[i + 1];
      i += 1;
      continue;
    }

    if (flag === '--pages') {
      overrides.pages = parseInt(args[i + 1], 10);
      i += 1;
      continue;
    }

    if (flag === '--headless') {
      overrides.headless = args[i + 1] !== 'false';
      i += 1;
      continue;
    }

    if (flag.startsWith('--')) {
      warn(`Unknown option "${flag}", ignoring.`);
    }
  }

  return overrides;
}

function mergeConfig(baseConfig, overrides) {
  return {
    ...baseConfig,
    ...overrides,
  };
}

function validateCategory(category) {
  if (CATEGORIES[category]) {
    return;
  }
  const validNames = Object.keys(CATEGORIES).join(', ');
  error(`Invalid category "${category}". Valid categories: ${validNames}`);
  process.exit(1);
}

function isPlatformEnabled(activePlatform, targetPlatform) {
  const chosen = (activePlatform || 'both').toLowerCase();
  if (chosen === 'both') {
    return true;
  }
  return chosen === targetPlatform.toLowerCase();
}

function tagProducts(items, platform, query, category) {
  return items.map((item) => ({
    ...item,
    platform,
    query,
    category,
  }));
}

function printSummary(products, csvPath) {
  let amazonCount = 0;
  let flipkartCount = 0;

  for (const product of products) {
    if (product.platform === 'Amazon') {
      amazonCount += 1;
    }
    if (product.platform === 'Flipkart') {
      flipkartCount += 1;
    }
  }

  success(`Run complete. Total: ${products.length} (Amazon: ${amazonCount}, Flipkart: ${flipkartCount})`);
  info(`Results saved to: ${csvPath}`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const overrides = parseArgs(rawArgs);
  const activeConfig = mergeConfig(config, overrides);

  validateCategory(activeConfig.category);

  const browser = await puppeteer.launch({
    headless: activeConfig.headless,
  });

  const allProducts = [];

  try {
    for (const query of activeConfig.queries) {
      const queryConfig = { ...activeConfig, query };

      if (isPlatformEnabled(activeConfig.platform, 'amazon')) {
        const items = await scrapeAmazon(browser, queryConfig);
        const tagged = tagProducts(items, 'Amazon', query, activeConfig.category);
        allProducts.push(...tagged);
        info(`[Amazon] Scraped ${items.length} items for "${query}" (total: ${allProducts.length})`);
      }

      if (isPlatformEnabled(activeConfig.platform, 'flipkart')) {
        const items = await scrapeFlipkart(browser, queryConfig);
        const tagged = tagProducts(items, 'Flipkart', query, activeConfig.category);
        allProducts.push(...tagged);
        info(`[Flipkart] Scraped ${items.length} items for "${query}" (total: ${allProducts.length})`);
      }
    }

    const csvPath = saveToCsv(allProducts, activeConfig);

    for (const query of activeConfig.queries) {
      const queryProducts = allProducts.filter((product) => product.query === query);
      const comparison = comparePrices(queryProducts);
      printComparison(comparison, query);
    }

    printSummary(allProducts, csvPath);
  } finally {
    await browser.close();
  }
}

main();
