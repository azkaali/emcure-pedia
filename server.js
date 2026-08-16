const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const {
  loadDataset,
  saveDataset,
  mergeDrugs,
  syncBrandQuery,
  syncGenericQuery,
  syncRegNo
} = require('./drap_scraper.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory sync status tracking
let syncLog = [];
let isSyncing = false;
let currentSyncTask = null;

function addSyncLog(message) {
  const logEntry = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.log(logEntry);
  syncLog.unshift(logEntry);
  if (syncLog.length > 100) syncLog.pop();
}

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/drugs
 * Search, filter, sort, and paginate drug catalog
 */
app.get('/api/drugs', (req, res) => {
  try {
    let drugs = loadDataset();
    const { q, status, dosage_form, company, sort, page = 1, limit = 20 } = req.query;

    // Search query matching brand, generic, reg_num, company, or label claim
    if (q) {
      const term = String(q).toLowerCase().trim();
      drugs = drugs.filter(d => 
        (d.brand_name && d.brand_name.toLowerCase().includes(term)) ||
        (d.generic_name && d.generic_name.toLowerCase().includes(term)) ||
        (d.reg_num && String(d.reg_num).toLowerCase().includes(term)) ||
        (d.company_name && d.company_name.toLowerCase().includes(term)) ||
        (d.label_claim && d.label_claim.toLowerCase().includes(term))
      );
    }

    // Filter by status
    if (status) {
      drugs = drugs.filter(d => d.status && d.status.toLowerCase() === String(status).toLowerCase());
    }

    // Filter by dosage form
    if (dosage_form) {
      drugs = drugs.filter(d => d.dosage_form && d.dosage_form.toLowerCase() === String(dosage_form).toLowerCase());
    }

    // Filter by company
    if (company) {
      drugs = drugs.filter(d => d.company_name && d.company_name.toLowerCase().includes(String(company).toLowerCase()));
    }

    // Sorting
    if (sort === 'name_asc') {
      drugs.sort((a, b) => (a.brand_name || '').localeCompare(b.brand_name || ''));
    } else if (sort === 'name_desc') {
      drugs.sort((a, b) => (b.brand_name || '').localeCompare(a.brand_name || ''));
    } else if (sort === 'reg_asc') {
      drugs.sort((a, b) => (a.reg_num || '').localeCompare(b.reg_num || ''));
    } else if (sort === 'date_desc') {
      drugs.sort((a, b) => new Date(b.last_updated || 0) - new Date(a.last_updated || 0));
    }

    const total = drugs.length;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedDrugs = drugs.slice(startIndex, startIndex + limitNum);

    // Get filter option facets from full dataset
    const fullDataset = loadDataset();
    const statuses = Array.from(new Set(fullDataset.map(d => d.status).filter(Boolean)));
    const dosageForms = Array.from(new Set(fullDataset.map(d => d.dosage_form).filter(Boolean)));
    const companies = Array.from(new Set(fullDataset.map(d => d.company_name).filter(Boolean)));

    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
      drugs: paginatedDrugs,
      facets: {
        statuses,
        dosageForms,
        companiesCount: companies.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/drugs/:reg_num
 * Single drug lookup by reg_num
 */
app.get('/api/drugs/:reg_num', (req, res) => {
  try {
    const drugs = loadDataset();
    const drug = drugs.find(d => String(d.reg_num).trim() === String(req.params.reg_num).trim());
    if (!drug) {
      return res.status(404).json({ success: false, message: 'Medicine record not found' });
    }
    res.json({ success: true, drug });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/drugs
 * Create custom medicine record
 */
app.post('/api/drugs', (req, res) => {
  try {
    const newDrug = req.body;
    if (!newDrug.brand_name) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }
    if (!newDrug.reg_num) {
      newDrug.reg_num = 'CUSTOM-' + Date.now().toString().slice(-6);
    }

    const currentDrugs = loadDataset();
    const existingIndex = currentDrugs.findIndex(d => String(d.reg_num).trim() === String(newDrug.reg_num).trim());
    if (existingIndex !== -1) {
      return res.status(409).json({ success: false, message: `Drug with Registration No ${newDrug.reg_num} already exists` });
    }

    newDrug.last_updated = new Date().toISOString();
    newDrug.status = newDrug.status || 'Active';
    currentDrugs.unshift(newDrug);
    saveDataset(currentDrugs);

    addSyncLog(`[Manual Entry] Added new drug: "${newDrug.brand_name}" (${newDrug.reg_num})`);
    res.status(201).json({ success: true, message: 'Medicine record created successfully', drug: newDrug });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/drugs/:reg_num
 * Update existing drug record
 */
app.put('/api/drugs/:reg_num', (req, res) => {
  try {
    const regNum = String(req.params.reg_num).trim();
    const currentDrugs = loadDataset();
    const index = currentDrugs.findIndex(d => String(d.reg_num).trim() === regNum);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Medicine record not found' });
    }

    const updated = {
      ...currentDrugs[index],
      ...req.body,
      reg_num: regNum,
      last_updated: new Date().toISOString()
    };

    currentDrugs[index] = updated;
    saveDataset(currentDrugs);

    addSyncLog(`[Update] Modified drug record: "${updated.brand_name}" (${regNum})`);
    res.json({ success: true, message: 'Medicine record updated successfully', drug: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/drugs/:reg_num
 * Delete drug record
 */
app.delete('/api/drugs/:reg_num', (req, res) => {
  try {
    const regNum = String(req.params.reg_num).trim();
    let currentDrugs = loadDataset();
    const initialLen = currentDrugs.length;
    currentDrugs = currentDrugs.filter(d => String(d.reg_num).trim() !== regNum);

    if (currentDrugs.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Medicine record not found' });
    }

    saveDataset(currentDrugs);
    addSyncLog(`[Delete] Removed drug reg_num ${regNum}`);
    res.json({ success: true, message: 'Medicine record deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats
 * Dashboard summary statistics
 */
app.get('/api/stats', (req, res) => {
  try {
    const drugs = loadDataset();
    const total = drugs.length;

    const activeCount = drugs.filter(d => (d.status || '').toLowerCase().includes('active') && !(d.status || '').toLowerCase().includes('provisional')).length;
    const provisionalCount = drugs.filter(d => (d.status || '').toLowerCase().includes('provisional')).length;
    const otherStatusCount = total - activeCount - provisionalCount;

    // Count by dosage form
    const dosageMap = {};
    drugs.forEach(d => {
      const form = d.dosage_form || 'Unspecified';
      dosageMap[form] = (dosageMap[form] || 0) + 1;
    });

    // Count by company
    const companyMap = {};
    drugs.forEach(d => {
      const comp = d.company_name || 'Unspecified';
      companyMap[comp] = (companyMap[comp] || 0) + 1;
    });

    const topCompanies = Object.entries(companyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topDosageForms = Object.entries(dosageMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const recentlyUpdated = drugs
      .filter(d => d.last_updated)
      .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))
      .slice(0, 5);

    res.json({
      success: true,
      stats: {
        total,
        activeCount,
        provisionalCount,
        otherStatusCount,
        uniqueCompanies: Object.keys(companyMap).length,
        uniqueDosageForms: Object.keys(dosageMap).length,
        topCompanies,
        topDosageForms,
        recentlyUpdated
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sync/search
 * Trigger DRAP live search & update dataset
 */
app.post('/api/sync/search', async (req, res) => {
  const { query, type = 'brand' } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, message: 'Search query is required for live sync' });
  }

  if (isSyncing) {
    return res.status(409).json({ success: false, message: 'Another sync job is currently in progress', currentTask: currentSyncTask });
  }

  isSyncing = true;
  currentSyncTask = `Syncing ${type} query "${query}"`;
  addSyncLog(`[Sync Start] Initiated live DRAP sync for ${type}: "${query}"`);

  // Respond immediately or wait depending on scope
  try {
    let result;
    if (type === 'generic') {
      result = await syncGenericQuery(query, addSyncLog);
    } else if (type === 'reg') {
      result = await syncRegNo(query);
      if (result.success) {
        addSyncLog(`[Sync Result] Fetched reg_num ${query}: "${result.drug.brand_name}"`);
      }
    } else {
      result = await syncBrandQuery(query, addSyncLog);
    }

    isSyncing = false;
    currentSyncTask = null;
    addSyncLog(`[Sync Finished] Completed sync for "${query}". Total in DB: ${loadDataset().length}`);

    res.json({
      success: true,
      message: `Sync completed for "${query}"`,
      result,
      totalInDatabase: loadDataset().length
    });
  } catch (err) {
    isSyncing = false;
    currentSyncTask = null;
    addSyncLog(`[Sync Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sync/status
 * Get current sync status and logs
 */
app.get('/api/sync/status', (req, res) => {
  res.json({
    success: true,
    isSyncing,
    currentSyncTask,
    logs: syncLog
  });
});

/**
 * GET /api/export/json
 * Export dataset as JSON
 */
app.get('/api/export/json', (req, res) => {
  const jsonPath = path.join(__dirname, 'drap_drugs.json');
  res.download(jsonPath, 'drap_drugs_catalog.json');
});

/**
 * GET /api/export/csv
 * Export dataset as CSV
 */
app.get('/api/export/csv', (req, res) => {
  const csvPath = path.join(__dirname, 'drap_drugs.csv');
  res.download(csvPath, 'drap_drugs_catalog.csv');
});

// Fallback route to serve app shell
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` 💊 Emcure Pedia Mobile Server Running!`);
  console.log(` 💻 Local URL: http://localhost:${PORT}`);
  console.log(` 📱 Phone Access (Same Wi-Fi): http://192.168.1.83:${PORT}`);
  console.log(` 📂 Stored Dataset: ${loadDataset().length} medicine records`);
  console.log(`====================================================`);
});

