const CATEGORIES = require('../categories');
const { randomDelay, sleep, getRandomInt, isTransientNetError } = require('../utils/delay');
const { warn, error } = require('../utils/logger');

const BASE_URL = 'https://www.flipkart.com';
const HOMEPAGE_URL = 'https://www.flipkart.com/';
const BLOCKED_TYPES = new Set(['image', 'font', 'media']);
const BLOCKED_DOMAINS = ['google-analytics.com', 'doubleclick.net', 'facebook.com'];

const SELECTORS = {
  item: 'div[data-id]',
  title: 'div.RG5Slk, div.KzDlHZ, a.wjcEIp, div._4rR01T, a.s1Q9rs, a[title]',
  price: 'div.hZ3P6w, div.Nx9bqj, div._30jeq3',
  originalPrice: 'div.yRaY8j, div._3I9_wc',
  rating: 'div.MKiFS6, div.XQDdHH, div._3LWZlK',
  reviewCount: 'span.PvbNMB, span.Wphh3L, span._2_R_DZ',
  productUrl: 'a[href*="/p/"]',
  imageUrl: 'img[src*="image/"], img.UCc1lI, img.DByuf4, img._396cs4',
  loginClose: 'button._2KpZ6l._2doB4z, span._30XB9F, button[class*="_2doB4z"]',
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
  if (page.__flipkartIntercepted) return;
  page.__flipkartIntercepted = true;
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    try {
      if (BLOCKED_TYPES.has(req.resourceType()) || isBlockedHost(req.url())) req.abort();
      else req.continue();
    } catch (err) {
      warn(`Flipkart request handler: ${err.message}`);
    }
  });
}

async function closeLoginPopup(page) {
  try {
    const btn = await page.$(SELECTORS.loginClose);
    if (btn) await btn.click();
  } catch (err) {
    warn(`Flipkart: login popup close skipped (${err.message})`);
  }
}

async function looksBlocked(page) {
  return page.evaluate(() => Boolean(document.querySelector('form[action*="validateCaptcha"]')));
}

function getSearchTerms(query, category) {
  const extra = CATEGORIES[category]?.flipkart ?? '';
  return extra ? `${query} ${extra}`.trim() : query.trim();
}

function buildUrl(query, pageNo, category) {
  const params = new URLSearchParams({ q: getSearchTerms(query, category), page: String(pageNo) });
  return `${BASE_URL}/search?${params}`;
}

function validateConfig(config) {
  if (!Number.isInteger(config.pages) || config.pages < 1) {
    throw new Error(`FlipkartScraper: config.pages must be a positive integer, received ${config.pages}`);
  }
  if (!Number.isFinite(config.minDelayMs) || !Number.isFinite(config.maxDelayMs)) {
    throw new Error('FlipkartScraper: config.minDelayMs and config.maxDelayMs must be finite numbers');
  }
  if (config.minDelayMs < 0 || config.maxDelayMs < 0) {
    throw new Error('FlipkartScraper: delays must be non-negative');
  }
}

async function extractProducts(page, pageNo, needle) {
  return page.evaluate((selectors, currentPage, baseUrl, brandNeedle) => {
    const textOf = (el, sel) => {
      const node = el.querySelector(sel);
      if (!node) return '';
      return node.getAttribute('title')?.trim() || node.textContent.trim();
    };
    const productUrl = (el, sel) => {
      const href = el.querySelector(sel)?.getAttribute('href') ?? '';
      if (!href) return '';
      // Path only: the query string is session-scoped tracking (iid, qH, ssid).
      const full = href.startsWith('http') ? href : `${baseUrl}${href}`;
      return full.split('?')[0];
    };
    const imageUrl = (el, sel) => {
      const img = el.querySelector(sel);
      if (!img) return '';
      return img.getAttribute('src') || img.getAttribute('data-src') || '';
    };
    // Bare brand tiles ("Samsung") or tiles without a model number fall back
    // to the img alt text, then the URL slug.
    const altTitle = (el) => el.querySelector('img[alt]')?.getAttribute('alt')?.trim() ?? '';
    const slugTitle = (url) => {
      const m = url.match(/\/([^/?#]+)\/p\//);
      return m ? decodeURIComponent(m[1]).replace(/-/g, ' ') : '';
    };
    const usableTitle = (t) => /\d/.test(t);
    // Both sites interleave "similar products" tiles from rival brands.
    // Match the URL path only — query params echo our own keyword back.
    const matchesBrand = (t, u) => `${t} ${u.split('?')[0]}`.toLowerCase().replace(/[^a-z0-9]/g, '').includes(brandNeedle);
    return Array.from(document.querySelectorAll(selectors.item)).map((card) => {
      const url = productUrl(card, selectors.productUrl);
      let title = textOf(card, selectors.title);
      if (!usableTitle(title)) title = altTitle(card) || slugTitle(url) || title;
      return {
        title,
        price: textOf(card, selectors.price),
        originalPrice: textOf(card, selectors.originalPrice),
        rating: textOf(card, selectors.rating),
        reviewCount: textOf(card, selectors.reviewCount),
        productUrl: url,
        imageUrl: imageUrl(card, selectors.imageUrl),
        pageNo: currentPage,
      };
    }).filter((p) => usableTitle(p.title) && p.productUrl.includes('/p/') && !/^sponsored/i.test(p.title) && matchesBrand(p.title, p.productUrl));
  }, SELECTORS, pageNo, BASE_URL, needle);
}

async function warmup(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await closeLoginPopup(page);
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

async function scrapeFlipkart(browser, config) {
  const query = config.query;
  if (!query) throw new Error('FlipkartScraper: config.query is required');
  validateConfig(config);

  const products = [];
  let emptyCount = 0;
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-IN,en;q=0.9' });
    await blockRequests(page);
    if (config.warmupHomepage) await warmup(page, HOMEPAGE_URL);

    for (let pageNo = 1; pageNo <= config.pages; pageNo += 1) {
      try {
        await gotoWithRetry(page, buildUrl(query, pageNo, config.category ?? 'all'), config.retries, config.retryBackoffMs);
        await closeLoginPopup(page);

        try {
          await page.waitForSelector(SELECTORS.item, { timeout: 10000 });
        } catch (err) {
          warn(`Flipkart page ${pageNo}: items selector timeout (${err.message})`);
        }

        if (await looksBlocked(page)) {
          error(`Flipkart CAPTCHA detected. Sleeping ${config.blockBackoffMs}ms then stopping.`);
          await sleep(config.blockBackoffMs);
          break;
        }

        const found = await extractProducts(page, pageNo, query.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (found.length === 0) {
          emptyCount += 1;
        } else {
          emptyCount = 0;
          products.push(...found);
        }
        if (emptyCount >= 2) break;
        if (pageNo < config.pages) await randomDelay(config.minDelayMs, config.maxDelayMs);
      } catch (err) {
        warn(`Flipkart page ${pageNo} failed (${err.message}), continuing.`);
      }
    }
  } finally {
    await page.close();
  }

  return products;
}

module.exports = scrapeFlipkart;
