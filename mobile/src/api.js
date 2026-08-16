/**
 * API Client for Emcure Pedia Mobile App
 */

const API_BASE_URL = 'http://192.168.1.83:3000/api';

export async function fetchDrugs({ query = '', status = '', page = 1, limit = 20 } = {}) {
  try {
    const params = new URLSearchParams({ page, limit });
    if (query) params.append('q', query);
    if (status && status !== 'all') params.append('status', status);

    const res = await fetch(`${API_BASE_URL}/drugs?${params.toString()}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API fetchDrugs error:', err);
    throw err;
  }
}

export async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE_URL}/stats`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API fetchStats error:', err);
    throw err;
  }
}

export async function triggerLiveSync(query, type = 'brand') {
  try {
    const res = await fetch(`${API_BASE_URL}/sync/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, type })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API triggerLiveSync error:', err);
    throw err;
  }
}

export async function createDrug(drugData) {
  try {
    const res = await fetch(`${API_BASE_URL}/drugs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drugData)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API createDrug error:', err);
    throw err;
  }
}

export async function deleteDrug(regNum) {
  try {
    const res = await fetch(`${API_BASE_URL}/drugs/${encodeURIComponent(regNum)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('API deleteDrug error:', err);
    throw err;
  }
}
