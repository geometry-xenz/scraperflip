// Flipkart regenerates these classes, update here when scraping breaks.

const CATEGORIES = require('../categories');
const { randomDelay } = require('../utils/delay');
const { warn } = require('../utils/logger');

const BASE_URL = 'https://www.flipkart.com';

const SELECTORS = {
  item: 'div[data-id]',
  title: 'div.KzDlHZ, a.wjcEIp, div._4rR01T, a.s1Q9rs, a[title]',
  price: 'div.Nx9bqj, div._30jeq3',
  originalPrice: 'div.yRaY8j, div._3I9_wc',
  rating: 'div.XQDdHH, div._3LWZlK',
  reviewCount: 'span.Wphh3L, span._2_R_DZ',
  productUrl: 'a[href*="/p/"], a[href]',
  imageUrl: 'img.DByuf4, img._396cs4, img',
  loginClose: 'button._2KpZ6l._2doB4z, span._30XB9F, button[class*="_2doB4z"]',
};

function getSearchTerms(query, category) {
  const categoryEntry = CATEGORIES[category] || CATEGORIES.all;
  const extraWords = categoryEntry.flipkart || '';
  if (!extraWords) {
    return query.trim();
  }
  return `${query} ${extraWords}`.trim();
}

function buildUrl(query, pageNo, category) {
  const searchTerms = getSearchTerms(query, category);
  const encodedQuery = encodeURIComponent(searchTerms);
  return `${BASE_URL}/search?q=${encodedQuery}&page=${pageNo}`;
}

async function closeLoginPopup(page) {
  try {
    const closeButton = await page.$(SELECTORS.loginClose);
    if (closeButton) {
      await closeButton.click();
    }
  } catch {
    // Popup was either absent or dismissed by navigation.
  }
}

async function extractProducts(page, pageNo) {
  return page.evaluate((selectors, currentPage, baseUrl) => {
    function textOf(el, sel) {
      const node = el.querySelector(sel);
      if (!node) {
        return '';
      }
      const titleAttr = node.getAttribute('title');
      if (titleAttr) {
        return titleAttr.trim();
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

async function scrapeFlipkart(browser, config) {
  const query = config.query || config.queries[0];
  const targetCategory = config.category || 'all';
  const products = [];
  let emptyCount = 0;
  const page = await browser.newPage();

  try {
    for (let pageNo = 1; pageNo <= config.pages; pageNo += 1) {
      try {
        const pageUrl = buildUrl(query, pageNo, targetCategory);
        await page.goto(pageUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await closeLoginPopup(page);

        try {
          await page.waitForSelector(SELECTORS.item, { timeout: 10000 });
        } catch {
          // Empty page or timed out card rendering
        }

        const pageProducts = await extractProducts(page, pageNo);
        if (pageProducts.length === 0) {
          emptyCount += 1;
        } else {
          emptyCount = 0;
          products.push(...pageProducts);
        }

        if (emptyCount >= 2) {
          break;
        }

        if (pageNo < config.pages) {
          await randomDelay(config.minDelayMs, config.maxDelayMs);
        }
      } catch {
        warn(`Flipkart page ${pageNo} failed, stopping early.`);
        break;
      }
    }
  } finally {
    await page.close();
  }

  return products;
}

module.exports = scrapeFlipkart;
module.exports.scrapeFlipkart = scrapeFlipkart;
