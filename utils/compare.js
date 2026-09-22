// Match products across platforms by title similarity, then emit SKU rows:
//   sku | flipkart price | amazon price | flipkart link | amazon link

const { info, success } = require('./logger');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'with', 'for', 'of', 'to', 'in', 'on',
  'new', 'latest', 'phone', 'mobile', 'smartphone', 'cell',
]);

const COLOR_WORDS = new Set([
  'black', 'white', 'blue', 'red', 'green', 'yellow', 'silver', 'gold',
  'grey', 'gray', 'pink', 'purple', 'midnight', 'starlight', 'titanium',
]);

function parsePrice(text) {
  if (text === null || text === undefined) return null;
  const match = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numericValue = parseFloat(match[0]);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return numericValue;
}

function normalizeTitle(title) {
  if (!title) return '';
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractModelTokens(title, brand) {
  const norm = normalizeTitle(title);
  const tokens = norm.split(' ').filter(Boolean);
  const brandToken = String(brand || '').toLowerCase().trim();
  return tokens.filter((t) => {
    if (STOPWORDS.has(t)) return false;
    if (COLOR_WORDS.has(t)) return false;
    if (brandToken && (t === brandToken || t.startsWith(brandToken))) return true;
    if (/^[a-z]+\d/.test(t)) return true;
    if (/^\d/.test(t)) return true;
    return false;
  });
}

function tokenSet(tokens) {
  return new Set(tokens);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function matchSku(brand, aTitle, bTitle) {
  const aTokens = tokenSet(extractModelTokens(aTitle, brand));
  const bTokens = tokenSet(extractModelTokens(bTitle, brand));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  return jaccard(aTokens, bTokens);
}

function platformKey(product) {
  if (!product) return '';
  return String(product.platform || '').toLowerCase();
}

function lowestForPlatform(items) {
  let best = null;
  let bestPrice = null;
  for (const item of items) {
    const price = parsePrice(item.price);
    if (price === null) continue;
    if (bestPrice === null || price < bestPrice) {
      bestPrice = price;
      best = item;
    }
  }
  return best;
}

function comparePrices(products, brand) {
  if (!Array.isArray(products)) {
    return { pairs: [], matched: [], cheapest: null };
  }

  const byPlatform = new Map();
  for (const product of products) {
    if (!product) continue;
    const key = platformKey(product);
    if (!key) continue;
    if (!byPlatform.has(key)) byPlatform.set(key, []);
    byPlatform.get(key).push(product);
  }

  const amazonItems = byPlatform.get('amazon') ?? [];
  const flipkartItems = byPlatform.get('flipkart') ?? [];

  const pairs = [];
  const usedFlipkart = new Set();

  for (const amazonProduct of amazonItems) {
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < flipkartItems.length; i += 1) {
      if (usedFlipkart.has(i)) continue;
      const score = matchSku(brand, amazonProduct.title, flipkartItems[i].title);
      if (score > bestScore) {
        bestScore = score;
        best = { product: flipkartItems[i], index: i };
      }
    }
    if (best && bestScore >= 0.4) {
      usedFlipkart.add(best.index);
      pairs.push({
        sku: amazonProduct.title,
        amazon: amazonProduct,
        flipkart: best.product,
        score: bestScore,
      });
    } else {
      pairs.push({
        sku: amazonProduct.title,
        amazon: amazonProduct,
        flipkart: null,
        score: bestScore,
      });
    }
  }

  for (let i = 0; i < flipkartItems.length; i += 1) {
    if (usedFlipkart.has(i)) continue;
    pairs.push({
      sku: flipkartItems[i].title,
      amazon: null,
      flipkart: flipkartItems[i],
      score: 0,
    });
  }

  const matched = pairs.filter((p) => p.amazon && p.flipkart);
  let cheapest = null;
  for (const pair of matched) {
    const amazonPrice = parsePrice(pair.amazon.price);
    const flipkartPrice = parsePrice(pair.flipkart.price);
    if (amazonPrice === null || flipkartPrice === null) continue;
    const minPrice = Math.min(amazonPrice, flipkartPrice);
    if (!cheapest || minPrice < cheapest.price) {
      cheapest = { pair, price: minPrice };
    }
  }

  return {
    pairs,
    matched,
    cheapest: cheapest ? cheapest.pair : null,
  };
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function printPairRow(pair) {
  const amazonPrice = pair.amazon ? pair.amazon.price : '-';
  const flipkartPrice = pair.flipkart ? pair.flipkart.price : '-';
  const amazonLink = pair.amazon ? pair.amazon.productUrl : '-';
  const flipkartLink = pair.flipkart ? pair.flipkart.productUrl : '-';
  info(
    `${truncateText(pair.sku, 60)} | Flipkart: ${flipkartPrice} | Amazon: ${amazonPrice} | FK: ${truncateText(flipkartLink, 40)} | AZ: ${truncateText(amazonLink, 40)}`,
  );
}

function printComparison(result, query) {
  if (!result.pairs.length) {
    info(`No products found for "${query}" on either platform.`);
    return;
  }

  info(`SKU comparison for "${query}" (${result.matched.length} matched, ${result.pairs.length - result.matched.length} single-side):`);
  result.pairs.forEach(printPairRow);

  if (result.cheapest) {
    const winner = result.cheapest;
    const amazonPrice = parsePrice(winner.amazon.price);
    const flipkartPrice = parsePrice(winner.flipkart.price);
    const winnerPlatform = (amazonPrice !== null && amazonPrice <= flipkartPrice) ? 'Amazon' : 'Flipkart';
    success(
      `Cheapest for "${query}": ${winnerPlatform} at ${winnerPlatform === 'Amazon' ? winner.amazon.price : winner.flipkart.price} - "${truncateText(winner.sku, 60)}"`,
    );
  } else if (result.matched.length === 0) {
    info(`No matched SKUs across platforms for "${query}".`);
  }
}

module.exports = {
  parsePrice,
  comparePrices,
  printComparison,
  matchSku,
};
