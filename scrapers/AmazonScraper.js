// Amazon blocks non-browser requests, that is why Puppeteer is used.

const CATEGORIES = require('../categories');
const { randomDelay } = require('../utils/delay');
const { error } = require('../utils/logger');

const BASE_URL = 'https://www.amazon.in';
const BLOCKED_TYPES = new Set(['image', 'font', 'media']);
const BLOCKED_DOMAINS = ['google-analytics', 'doubleclick', 'facebook'];

const SELECTORS = {
  item: '[data-component-type="s-search-result"]',
  title: 'h2 span',
  price: 'span.a-price span.a-offscreen',
  originalPrice: 'span.a-price.a-text-price span.a-offscreen',
  rating: 'span.a-icon-alt',
  reviewCount: 'span.a-size-base.s-underline-text, span.s-underline-text',
  productUrl: 'h2 a[href]',
  imageUrl: 'img',
};

async function blockRequests(page) {
  await page.setRequestInterception(true);
  page.on('request', (interceptedRequest) => {
    const resourceType = interceptedRequest.resourceType();
    const url = interceptedRequest.url();
    const isBlockedDomain = BLOCKED_DOMAINS.some((domain) => url.includes(domain));
    if (BLOCKED_TYPES.has(resourceType) || isBlockedDomain) {
      interceptedRequest.abort();
      return;
    }
    interceptedRequest.continue();
  });
}

async function looksBlocked(page) {
  return page.evaluate(() => {
    const hasCaptchaForm = Boolean(document.querySelector('form[action*="validateCaptcha"]'));
    const bodyText = document.body ? document.body.innerText : '';
    const hasCaptchaText = bodyText.includes('Enter the characters you see below');
    return hasCaptchaForm || hasCaptchaText;
  });
}

function getCategoryIndex(category) {
  const categoryEntry = CATEGORIES[category] || CATEGORIES.all;
  return categoryEntry.amazon || '';
}

function buildUrl(query, pageNo, category) {
  const encodedQuery = encodeURIComponent(query);
  const baseUrl = `${BASE_URL}/s?k=${encodedQuery}&page=${pageNo}`;
  const categoryIndex = getCategoryIndex(category);
  if (!categoryIndex) {
    return baseUrl;
  }
  return `${baseUrl}&i=${categoryIndex}`;
}

async function extractProducts(page, pageNo) {
  return page.evaluate((selectors, currentPage, baseUrl) => {
    function textOf(el, sel) {
      const node = el.querySelector(sel);
      if (!node) {
        return '';
      }
      return node.textContent.trim();
    }

    function getProductUrl(el, sel) {
      const link = el.querySelector(sel);
      if (!link) {
        return '';
      }
      const href = link.getAttribute('href') || '';
      if (!href) {
        return '';
      }
      if (href.startsWith('http')) {
        return href;
      }
      return `${baseUrl}${href}`;
    }

    function getImageUrl(el, sel) {
      const image = el.querySelector(sel);
      if (!image) {
        return '';
      }
      const hires = image.getAttribute('data-old-hires');
      if (hires) {
        return hires;
      }
      return image.getAttribute('src') || '';
    }

    const cards = Array.from(document.querySelectorAll(selectors.item));
    return cards.map((card) => ({
      title: textOf(card, selectors.title),
      price: textOf(card, selectors.price),
      originalPrice: textOf(card, selectors.originalPrice),
      rating: textOf(card, selectors.rating),
      reviewCount: textOf(card, selectors.reviewCount),
      productUrl: getProductUrl(card, selectors.productUrl),
      imageUrl: getImageUrl(card, selectors.imageUrl),
      pageNo: currentPage,
    })).filter((product) => product.title !== '');
  }, SELECTORS, pageNo, BASE_URL);
}

async function scrapeAmazon(browser, config) {
  const query = config.query || config.queries[0];
  const targetCategory = config.category || 'all';
  const products = [];
  const page = await browser.newPage();

  try {
    await blockRequests(page);

    for (let pageNo = 1; pageNo <= config.pages; pageNo += 1) {
      const pageUrl = buildUrl(query, pageNo, targetCategory);
      await page.goto(pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const isBlocked = await looksBlocked(page);
      if (isBlocked) {
        error('Amazon blocked the request (CAPTCHA detected). Fix: wait a few minutes, lower --pages, or run with --headless false.');
        break;
      }

      try {
        await page.waitForSelector(SELECTORS.item, { timeout: 15000 });
      } catch {
        break;
      }

      const pageProducts = await extractProducts(page, pageNo);
      products.push(...pageProducts);

      if (pageNo < config.pages) {
        await randomDelay(config.minDelayMs, config.maxDelayMs);
      }
    }
  } finally {
    await page.close();
  }

  return products;
}

module.exports = scrapeAmazon;
module.exports.scrapeAmazon = scrapeAmazon;
