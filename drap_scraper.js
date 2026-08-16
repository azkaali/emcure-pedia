/**
 * DRAP (Drug Regulatory Authority of Pakistan) E-App Scraper & Sync Engine
 * 
 * Source: https://eapp.dra.gov.pk/WebProductIndex.php
 * Backend API Endpoint: https://eapp.dra.gov.pk/productView.php
 * 
 * Usage CLI:
 *   node drap_scraper.js <search_term>             - Search brand names (e.g. node drap_scraper.js lefulin)
 *   node drap_scraper.js --generic <generic_term> - Search generic names (e.g. node drap_scraper.js --generic paracetamol)
 *   node drap_scraper.js --reg <reg_number>        - Fetch single drug by Registration No / ID
 *   node drap_scraper.js                           - Scan all drugs by iterating letters (A-Z)
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const querystring = require('querystring');

const EAPP_BASE_URL = 'https://eapp.dra.gov.pk/';
const PRODUCT_VIEW_URL = 'https://eapp.dra.gov.pk/productView.php';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'X-Requested-With': 'XMLHttpRequest'
};

/**
 * Perform HTTPS GET request
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: DEFAULT_HEADERS }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', err => reject(err));
  });
}

/**
 * Perform HTTPS POST request with URL-encoded form data
 */
function httpPost(url, postData) {
  return new Promise((resolve, reject) => {
    const payload = querystring.stringify(postData);
    const options = {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    });

    req.on('error', err => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Search Brand Names via Select2 API
 */
async function searchBrandNames(query) {
  const url = `${PRODUCT_VIEW_URL}?search=${encodeURIComponent(query)}&_type=brand%20name`;
  try {
    const rawData = await httpGet(url);
    const cleanData = rawData.replace(/^\uFEFF/, '');
    const parsed = JSON.parse(cleanData);
    return parsed.results || [];
  } catch (err) {
    console.error(`[!] Error searching brand name "${query}":`, err.message);
    return [];
  }
}

/**
 * Search Generic Names via Select2 API
 */
async function searchGenericNames(query) {
  const url = `${PRODUCT_VIEW_URL}?searchGeneric=${encodeURIComponent(query)}&_type=generic%20name`;
  try {
    const rawData = await httpGet(url);
    const cleanData = rawData.replace(/^\uFEFF/, '');
    const parsed = JSON.parse(cleanData);
    return parsed.results || [];
  } catch (err) {
    console.error(`[!] Error searching generic name "${query}":`, err.message);
    return [];
  }
}

/**
 * Fetch list of products associated with a master generic ID/Name
 */
async function fetchProductsByGeneric(genericName) {
  try {
    const rawData = await httpPost(PRODUCT_VIEW_URL, { masterID: genericName });
    const cleanData = rawData.replace(/^\uFEFF/, '');
    return JSON.parse(cleanData);
  } catch (err) {
    console.error(`[!] Error fetching generic products for "${genericName}":`, err.message);
    return [];
  }
}

/**
 * Parse HTML product details returned by POST productView.php
 */
function parseProductDetailHtml(html) {
  const record = {};
  
  const blockRegex = /<div class="col-md-4 col-sm-6 mb-2">[\s\S]*?<span class="d-block text-muted small fw-medium">([\s\S]*?)<\/span>[\s\S]*?<span class="fw-semibold">([\s\S]*?)<\/span>/gi;
  
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').trim();
    const val = match[2].replace(/<[^>]+>/g, '').trim();
    if (key) {
      record[key] = val;
    }
  }

  return {
    reg_num: record['Registration No'] || '',
    brand_name: record['Product Name'] || '',
    generic_name: record['Composition'] || record['Label Claim'] || '',
    label_claim: record['Label Claim'] || '',
    dosage_form: record['Dosage Form'] || '',
    route_of_admin: record['Route of Admin'] || '',
    company_name: record['Company Name'] || '',
    company_address: record['Company Address'] || '',
    status: record['Registration Status'] || 'Active',
    reg_date: record['Registration Date'] || '',
    product_specification: record['Product Specification'] || '',
    manufacturing_type: record['Manufacturing Type'] || '',
    used_for: record['Used For'] || 'Human',
    pack_sizes: record['Pack Size(s)'] || '',
    last_updated: new Date().toISOString()
  };
}

/**
 * Fetch product full details by Registration Number or ID
 */
async function fetchProductDetails(regNo) {
  try {
    const html = await httpPost(PRODUCT_VIEW_URL, { webRegNo: regNo });
    const parsed = parseProductDetailHtml(html);
    if (!parsed.reg_num) parsed.reg_num = String(regNo);
    return parsed;
  } catch (err) {
    console.error(`[!] Error fetching product detail for regNo "${regNo}":`, err.message);
    return null;
  }
}

/**
 * Helper to load current drugs dataset
 */
function loadDataset() {
  const jsonPath = path.join(__dirname, 'drap_drugs.json');
  if (!fs.existsSync(jsonPath)) return [];
  try {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
}

/**
 * Helper to save dataset to JSON and CSV
 */
function saveDataset(drugs) {
  const jsonPath = path.join(__dirname, 'drap_drugs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(drugs, null, 2), 'utf-8');

  if (drugs.length > 0) {
    const csvPath = path.join(__dirname, 'drap_drugs.csv');
    const headers = Object.keys(drugs[0]).join(',');
    const rows = drugs.map(d => 
      Object.values(d).map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',')
    );
    fs.writeFileSync(csvPath, [headers, ...rows].join('\n'), 'utf-8');
  }
}

/**
 * Merge new drugs array into existing dataset by reg_num
 */
function mergeDrugs(existingList, newDrugs) {
  const map = new Map();
  for (const item of existingList) {
    if (item.reg_num) map.set(String(item.reg_num).trim(), item);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const newItem of newDrugs) {
    if (!newItem || (!newItem.reg_num && !newItem.brand_name)) continue;
    const key = String(newItem.reg_num || newItem.brand_name).trim();
    if (map.has(key)) {
      const old = map.get(key);
      map.set(key, { ...old, ...newItem, last_updated: new Date().toISOString() });
      updatedCount++;
    } else {
      map.set(key, { ...newItem, last_updated: new Date().toISOString() });
      addedCount++;
    }
  }

  const updatedList = Array.from(map.values());
  saveDataset(updatedList);
  return { updatedList, addedCount, updatedCount };
}

/**
 * High-level sync function for Brand query
 */
async function syncBrandQuery(query, progressCallback = () => {}) {
  progressCallback(`Searching DRAP for brand query: "${query}"...`);
  const results = await searchBrandNames(query);
  progressCallback(`Found ${results.length} matches for "${query}". Fetching details...`);

  const fetched = [];
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const regNo = item.id;
    if (regNo) {
      const detail = await fetchProductDetails(regNo);
      if (detail && (detail.brand_name || detail.reg_num)) {
        if (!detail.brand_name && item.text) detail.brand_name = item.text;
        fetched.push(detail);
      }
      progressCallback(`Fetched [${i + 1}/${results.length}] ${item.text || regNo}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const currentData = loadDataset();
  const res = mergeDrugs(currentData, fetched);
  progressCallback(`Sync complete for "${query}": ${res.addedCount} new, ${res.updatedCount} updated.`);
  return { ...res, fetchedCount: fetched.length };
}

/**
 * High-level sync function for Generic query
 */
async function syncGenericQuery(query, progressCallback = () => {}) {
  progressCallback(`Searching DRAP for generic query: "${query}"...`);
  const generics = await searchGenericNames(query);
  progressCallback(`Found ${generics.length} matching generic terms.`);

  const fetched = [];
  for (const gen of generics) {
    progressCallback(`Fetching products for generic: "${gen.text}"...`);
    const products = await fetchProductsByGeneric(gen.id || gen.text);
    progressCallback(`Found ${products.length} products under generic "${gen.text}".`);

    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      const regNo = prod.registrationNo || prod.id;
      if (regNo) {
        const detail = await fetchProductDetails(regNo);
        if (detail && (detail.brand_name || detail.reg_num)) {
          fetched.push(detail);
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  const currentData = loadDataset();
  const res = mergeDrugs(currentData, fetched);
  progressCallback(`Sync complete for generic "${query}": ${res.addedCount} new, ${res.updatedCount} updated.`);
  return { ...res, fetchedCount: fetched.length };
}

/**
 * High-level sync function for single regNo
 */
async function syncRegNo(regNo) {
  const detail = await fetchProductDetails(regNo);
  if (!detail || (!detail.brand_name && !detail.reg_num)) {
    return { success: false, message: `No drug found for registration number ${regNo}` };
  }
  const currentData = loadDataset();
  const res = mergeDrugs(currentData, [detail]);
  return { success: true, drug: detail, ...res };
}

/**
 * CLI Execution Handler
 */
async function mainCLI() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args[0] === '--generic' && args[1]) {
      await syncGenericQuery(args.slice(1).join(' '), console.log);
    } else if (args[0] === '--reg' && args[1]) {
      const res = await syncRegNo(args[1]);
      console.log(`[✓] Reg Sync Result:`, res);
    } else {
      await syncBrandQuery(args.join(' '), console.log);
    }
  } else {
    console.log('[i] Starting full A-Z DRAP scan...');
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (const l of letters) {
      await syncBrandQuery(l, console.log);
    }
  }
}

if (require.main === module) {
  mainCLI().catch(err => {
    console.error('[!] CLI Error:', err);
    process.exit(1);
  });
}

module.exports = {
  searchBrandNames,
  searchGenericNames,
  fetchProductsByGeneric,
  fetchProductDetails,
  parseProductDetailHtml,
  loadDataset,
  saveDataset,
  mergeDrugs,
  syncBrandQuery,
  syncGenericQuery,
  syncRegNo
};
