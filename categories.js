// Add a category = add one line here, both scrapers pick it up automatically.

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const RAW_CATEGORIES = {
  all: { amazon: '', flipkart: '' },
  electronics: { amazon: 'electronics', flipkart: 'electronics' },
  mobiles: { amazon: 'electronics', flipkart: 'mobiles' },
  phone: { amazon: 'electronics', flipkart: 'mobiles' },
  phones: { amazon: 'electronics', flipkart: 'mobiles' },
  laptops: { amazon: 'computers', flipkart: 'laptops' },
  tablets: { amazon: 'computers', flipkart: 'tablets' },
  cameras: { amazon: 'electronics', flipkart: 'cameras' },
};

for (const [name, mapping] of Object.entries(RAW_CATEGORIES)) {
  if (name !== 'all') {
    for (const platform of ['amazon', 'flipkart']) {
      if (typeof mapping[platform] !== 'string' || mapping[platform].trim() === '') {
        throw new Error(`categories.js: "${name}" must declare a non-empty "${platform}" value`);
      }
    }
  }
}

const CATEGORIES = deepFreeze(RAW_CATEGORIES);

module.exports = CATEGORIES;
