// Prices come back as "₹64,999", clean before comparing.

const { info, success } = require('./logger');

function parsePrice(text) {
  if (!text) {
    return Infinity;
  }
  const cleanString = String(text).replace(/[^\d.]/g, '');
  if (!cleanString) {
    return Infinity;
  }
  const numericValue = parseFloat(cleanString);
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return Infinity;
  }
  return numericValue;
}

function comparePrices(products) {
  let lowestAmazon = null;
  let lowestFlipkart = null;
  let minAmazonPrice = Infinity;
  let minFlipkartPrice = Infinity;

  for (const product of products) {
    const currentPrice = parsePrice(product.price);
    if (currentPrice === Infinity) {
      continue;
    }

    const platformKey = String(product.platform || '').toLowerCase();
    if (platformKey === 'amazon' && currentPrice < minAmazonPrice) {
      minAmazonPrice = currentPrice;
      lowestAmazon = product;
    }

    if (platformKey === 'flipkart' && currentPrice < minFlipkartPrice) {
      minFlipkartPrice = currentPrice;
      lowestFlipkart = product;
    }
  }

  let cheapest = null;
  if (minAmazonPrice < minFlipkartPrice) {
    cheapest = lowestAmazon;
  }
  if (minFlipkartPrice < minAmazonPrice) {
    cheapest = lowestFlipkart;
  }

  return {
    cheapest,
    byPlatform: {
      amazon: lowestAmazon,
      flipkart: lowestFlipkart,
    },
  };
}

function truncateText(text, maxLength) {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function printPlatformBest(platformName, product) {
  if (!product) {
    info(`${platformName}: No products found.`);
    return;
  }
  const titleSnippet = truncateText(product.title, 50);
  info(`${platformName} lowest: "${titleSnippet}" at ${product.price}`);
}

function printComparison(result, query) {
  const amazonProduct = result.byPlatform.amazon;
  const flipkartProduct = result.byPlatform.flipkart;

  printPlatformBest('Amazon', amazonProduct);
  printPlatformBest('Flipkart', flipkartProduct);

  if (!amazonProduct && !flipkartProduct) {
    info(`No products found for "${query}" on either platform.`);
    return;
  }

  if (result.cheapest) {
    const winner = result.cheapest;
    const titleSnippet = truncateText(winner.title, 50);
    success(`Cheapest for "${query}": [${winner.platform}] "${titleSnippet}" at ${winner.price}`);
    return;
  }

  info(`Price tie for "${query}": both platforms match at ${amazonProduct.price}`);
}

module.exports = {
  parsePrice,
  comparePrices,
  printComparison,
};
