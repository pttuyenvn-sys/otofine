import {
  syncProductCategories,
  syncProductCategoryMap
} from '../services/categorySync.service.js';

(async () => {
  try {
    await syncProductCategories();
    await syncProductCategoryMap();
    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();