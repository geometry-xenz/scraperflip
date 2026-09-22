const CATEGORIES = require('../categories');
const { randomDelay, sleep, getRandomInt, isTransientNetError } = require('../utils/delay');
const { warn, error } = require('../utils/logger');

const BASE_URL = 'https://www.amazon.in';
const HOMEPAGE_URL = 'https://www.amazon.in/';
const BLOCKED_TYPES = new Set(['image', 'font', 'media']);
const BLOCKED_DOMAINS = ['google-analytics.com', 'doubleclick.net', 'facebook.com'];

const SELECTORS = {
  item: '[data-component-type="s-search-result"]',
  title: 'h2 span',
  price: 'span.a-price span.a-offscreen',
  originalPrice: 'span.a-price.a-text-price span.a-offscreen',
  rating: 'span.a-icon-alt',
  reviewCount: 'span.a-size-base.s-underline-text, span.s-underline-text',
  productUrl: 'a.a-link-normal.s-no-outline[href*="/dp/"], a[href*="/dp/"]',
  imageUrl: 'img',
};

function isBlockedHost(url) {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

async function blockRequests(page) {
  if (page.__amazonIntercepted) return;
  // Mark synchronously before any await so two concurrent blockRequests(page)
  // calls cannot both pass the guard and double-attach listeners.
  page.__amazonIntercepted = true;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    try {
      if (BLOCKED_TYPES.has(req.resourceType()) || isBlockedHost(req.url())) req.abort();
      else req.continue();
    } catch (err) {
      warn(`Amazon request handler: ${err.message}`);
    }
  });
}

async function looksBlocked(page) {
  return page.evaluate(() => {
    const captchaForm = Boolean(document.querySelector('form[action*="validateCaptcha"]'));
    const text = document.body ? document.body.innerText : '';
    return captchaForm || text.includes('Enter the characters you see below');
  });
}

function getCategoryIndex(category) {
  return CATEGORIES[category]?.amazon ?? '';
}

function buildUrl(query, pageNo, category) {
  const params = new URLSearchParams({ k: query, page: String(pageNo) });
  const index = getCategoryIndex(category);
  if (index) params.set('i', index);
  return `${BASE_URL}/s?${params}`;
}

async function extractProducts(page, pageNo) {
  return page.evaluate((selectors, currentPage, baseUrl) => {
    const textOfFirst = (el, sel) => el.querySelector(sel)?.textContent.trim() ?? '';
    const textOfAll = (el, sel) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent.trim()).filter(Boolean).join(' ');
    const productUrl = (el, sel) => {
      const href = el.querySelector(sel)?.getAttribute('href') ?? '';
      return href ? (href.startsWith('http') ? href : `${baseUrl}${href}`) : '';
    };
    const imageUrl = (el, sel) => {
      const img = el.querySelector(sel);
      return img ? (img.getAttribute('data-old-hires') || img.getAttribute('src') || '') : '';
    };
    return Array.from(document.querySelectorAll(selectors.item)).map((card) => ({
      title: textOfFirst(card, selectors.title),
      price: textOfFirst(card, selectors.price),
      originalPrice: textOfFirst(card, selectors.originalPrice),
      rating: textOfFirst(card, selectors.rating),
      reviewCount: textOfAll(card, selectors.reviewCount),
      productUrl: productUrl(card, selectors.productUrl),
      imageUrl: imageUrl(card, selectors.imageUrl),
      pageNo: currentPage,
    })).filter((p) => p.title !== '');
  }, SELECTORS, pageNo, BASE_URL);
}

async function warmup(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(getRandomInt(1500, 3500));
  } catch (err) {
    warn(`warmup skipped (${err.message})`);
  }
}

async function gotoWithRetry(page, url, retries, backoffMs) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
      lastErr = err;
      if (!isTransientNetError(err) || attempt === retries) throw err;
      await sleep(backoffMs * (attempt + 1));
    }
  }
  throw lastErr;
}

async function scrapeAmazon(browser, config) {
  const query = config.query;
  if (!query) throw new Error('AmazonScraper: config.query is required');

  const products = [];
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-IN,en;q=0.9' });
    await blockRequests(page);
    if (config.warmupHomepage) await warmup(page, HOMEPAGE_URL);

    for (let pageNo = 1; pageNo <= config.pages; pageNo += 1) {
      try {
        await gotoWithRetry(page, buildUrl(query, pageNo, config.category ?? 'all'), config.retries, config.retryBackoffMs);

        if (await looksBlocked(page)) {
          error(`Amazon CAPTCHA detected. Sleeping ${config.blockBackoffMs}ms then stopping.`);
          await sleep(config.blockBackoffMs);
          break;
        }

        try {
          await page.waitForSelector(SELECTORS.item, { timeout: 15000 });
        } catch (err) {
          warn(`Amazon page ${pageNo}: items selector timeout (${err.message})`);
          break;
        }

        products.push(...await extractProducts(page, pageNo));

        if (pageNo < config.pages) {
          await randomDelay(config.minDelayMs, config.maxDelayMs);
        }
      } catch (err) {
        warn(`Amazon page ${pageNo} failed (${err.message}), continuing.`);
      }
    }
  } finally {
    await page.close();
  }

  return products;
}

module.exports = scrapeAmazon;
