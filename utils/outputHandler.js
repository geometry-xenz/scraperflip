const fs = require('fs');
const path = require('path');
const { comparePrices } = require('./compare');
const { success, warn, error } = require('./logger');

const HEADER = 'sku,flipkart_price,amazon_price,flipkart_link,amazon_link';
const FORMULA_LEAD = /^[\s=+\-@\t\r]/;
const UNSAFE_FILENAME = /[<>:"/\\|?*\x00-\x1f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const BOM = '\uFEFF';

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_LEAD.test(text)) text = `'${text}`;
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function rowFrom(pair) {
  if (!pair || typeof pair !== 'object') return '';
  const cells = [
    pair.sku ?? '',
    pair.flipkart ? pair.flipkart.price : '',
    pair.amazon ? pair.amazon.price : '',
    pair.flipkart ? pair.flipkart.productUrl : '',
    pair.amazon ? pair.amazon.productUrl : '',
  ];
  return cells.map(escapeCell).join(',');
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function slugify(text) {
  const safe = String(text ?? '').trim().replace(/\s+/g, '-').replace(UNSAFE_FILENAME, '_').slice(0, 100) || 'products';
  const stem = safe.split('-')[0] || 'products';
  return WINDOWS_RESERVED.test(stem) ? `_${safe}` : safe;
}

function buildFilePath(config) {
  const outputDir = path.resolve(config.outputFolder);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    error(`outputHandler: failed to create ${outputDir} (${err.message})`);
    throw err;
  }
  const rawQuery = config.queries?.[0] || config.query || 'products';
  const base = path.join(outputDir, `${slugify(rawQuery)}-${formatTimestamp(new Date())}.csv`);
  // Append -N when two runs collide within the same second.
  if (fs.existsSync(base)) {
    let counter = 1;
    let candidate;
    do {
      candidate = base.replace(/\.csv$/, `-${counter}.csv`);
      counter += 1;
    } while (fs.existsSync(candidate));
    return candidate;
  }
  return base;
}

function saveToCsv(products, config) {
  let filePath;
  try {
    filePath = buildFilePath(config);
  } catch (err) {
    error(`outputHandler: cannot determine output path (${err.message})`);
    return null;
  }

  if (!Array.isArray(products) || products.length === 0) {
    warn('No products scraped. Writing empty CSV with headers.');
    try {
      fs.writeFileSync(filePath, `${BOM}${HEADER}\n`, 'utf-8');
    } catch (err) {
      error(`outputHandler: failed to write ${filePath} (${err.message})`);
    }
    return filePath;
  }

  const brand = config.queries?.[0] || config.brand || '';
  const byQuery = {};
  for (const product of products) {
    if (!product) continue;
    const key = product.query || '';
    (byQuery[key] ??= []).push(product);
  }

  const allRows = [];
  const seen = new Set();
  for (const query of Object.keys(byQuery)) {
    const result = comparePrices(byQuery[query], brand);
    result.pairs.forEach((pair) => {
      // Quality gate: a price-comparison row needs at least one price.
      const hasPrice = (pair.flipkart?.price || pair.amazon?.price);
      if (!hasPrice) return;
      const row = rowFrom(pair);
      if (row && !seen.has(row)) {
        seen.add(row);
        allRows.push(row);
      }
    });
  }

  const body = `${HEADER}\n${allRows.join('\n')}\n`;
  try {
    fs.writeFileSync(filePath, `${BOM}${body}`, 'utf-8');
    success(`Saved ${allRows.length} SKU rows to ${filePath}`);
  } catch (err) {
    error(`outputHandler: failed to write ${filePath} (${err.message})`);
  }

  return filePath;
}

module.exports = saveToCsv;
