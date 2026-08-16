import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar
} from 'react-native';

import { fetchDrugs, fetchStats, triggerLiveSync, createDrug, deleteDrug } from './src/api';

export default function App() {
  const [currentTab, setCurrentTab] = useState('catalog'); // catalog, updater, insights, saved, add
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drugs, setDrugs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Sync state
  const [syncQuery, setSyncQuery] = useState('');
  const [syncType, setSyncType] = useState('brand');
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState(['> Terminal ready for live DRAP sync...']);

  // Analytics state
  const [stats, setStats] = useState(null);

  // Bookmarks & Notes state
  const [bookmarks, setBookmarks] = useState([]);
  const [notes, setNotes] = useState({});

  // Add Form state
  const [addForm, setAddForm] = useState({
    brand_name: '',
    reg_num: '',
    generic_name: '',
    dosage_form: 'Tablet',
    status: 'Active',
    company_name: '',
    label_claim: ''
  });

  useEffect(() => {
    loadCatalog();
    loadAnalytics();
  }, [searchQuery, statusFilter]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetchDrugs({ query: searchQuery, status: statusFilter, limit: 30 });
      if (res.success) {
        setDrugs(res.drugs);
        setTotalCount(res.total);
      }
    } catch (e) {
      console.log('Error loading catalog:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetchStats();
      if (res.success) {
        setStats(res.stats);
      }
    } catch (e) {
      console.log('Error loading stats:', e.message);
    }
  };

  const handleStartSync = async (term = syncQuery) => {
    const q = term.trim();
    if (!q) {
      Alert.alert('Required', 'Please enter a brand name or reg number to sync.');
      return;
    }

    setSyncing(true);
    appendSyncLog(`> Initiating DRAP scraper fetch for [${syncType.toUpperCase()}] "${q}"...`);

    try {
      const res = await triggerLiveSync(q, syncType);
      if (res.success) {
        appendSyncLog(`> [✓] SUCCESS: Sync completed for "${q}"`);
        if (res.result) {
          appendSyncLog(`> Added ${res.result.addedCount || 0} new medicines, updated ${res.result.updatedCount || 0}.`);
        }
        Alert.alert('Sync Complete', `Added ${res.result ? res.result.addedCount : 0} new medicines to database!`);
        loadCatalog();
        loadAnalytics();
      } else {
        appendSyncLog(`> [!] Error: ${res.message || res.error}`);
      }
    } catch (err) {
      appendSyncLog(`> [!] Sync failed: ${err.message}`);
      Alert.alert('Sync Error', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const appendSyncLog = (msg) => {
    setSyncLogs(prev => [msg, ...prev.slice(0, 40)]);
  };

  const handleAddDrugSubmit = async () => {
    if (!addForm.brand_name || !addForm.generic_name) {
      Alert.alert('Required Fields', 'Brand Name and Generic Composition are required.');
      return;
    }

    try {
      const res = await createDrug(addForm);
      if (res.success) {
        Alert.alert('Success', `Registered "${addForm.brand_name}" in database!`);
        setAddForm({ brand_name: '', reg_num: '', generic_name: '', dosage_form: 'Tablet', status: 'Active', company_name: '', label_claim: '' });
        setCurrentTab('catalog');
        loadCatalog();
        loadAnalytics();
      } else {
        Alert.alert('Error', res.message || 'Creation failed');
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const toggleBookmark = (regNum) => {
    if (bookmarks.includes(regNum)) {
      setBookmarks(bookmarks.filter(b => b !== regNum));
    } else {
      setBookmarks([...bookmarks, regNum]);
    }
  };

  const openDrugDetail = (drug) => {
    setSelectedDrug(drug);
    setModalVisible(true);
  };

  const handleDeleteDrug = async () => {
    if (!selectedDrug) return;
    try {
      const res = await deleteDrug(selectedDrug.reg_num);
      if (res.success) {
        Alert.alert('Deleted', `Removed ${selectedDrug.brand_name}`);
        setModalVisible(false);
        loadCatalog();
        loadAnalytics();
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />

      {/* TOP HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>💊</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Emcure Pedia</Text>
            <Text style={styles.headerSub}>DRAP Drug Directory & Live Sync</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btnRefresh} onPress={() => { loadCatalog(); loadAnalytics(); }}>
          <Text style={styles.btnRefreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT VIEWPORT */}
      <View style={styles.viewport}>
        
        {/* TAB 1: CATALOG */}
        {currentTab === 'catalog' && (
          <View style={styles.viewContent}>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search brand, generic name or reg #..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Filter Chips */}
            <View style={styles.chipRow}>
              {['all', 'Active', 'Provisionally Active'].map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.chip, statusFilter === st && styles.chipActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.chipText, statusFilter === st && styles.chipTextActive]}>
                    {st === 'all' ? 'All Status' : st}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.resultsText}>Showing {drugs.length} of {totalCount} records</Text>

            {loading ? (
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={drugs}
                keyExtractor={item => item.reg_num || Math.random().toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.card} onPress={() => openDrugDetail(item)}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardBrand}>{item.brand_name}</Text>
                      <Text style={styles.cardReg}>Reg: {item.reg_num}</Text>
                    </View>
                    <Text style={styles.cardGeneric}>{item.generic_name}</Text>
                    <View style={styles.cardMetaRow}>
                      <View style={[styles.badge, item.status?.includes('Provisional') ? styles.badgeWarning : styles.badgeSuccess]}>
                        <Text style={styles.badgeText}>{item.status || 'Active'}</Text>
                      </View>
                      {item.dosage_form && (
                        <View style={styles.badgeOutline}>
                          <Text style={styles.badgeOutlineText}>{item.dosage_form}</Text>
                        </View>
                      )}
                    </View>
                    {item.company_name ? (
                      <Text style={styles.cardCompany}>🏢 {item.company_name}</Text>
                    ) : null}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* TAB 2: LIVE UPDATER */}
        {currentTab === 'updater' && (
          <ScrollView style={styles.viewContent}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>⚡ Live DRAP Scraper Sync</Text>
              <Text style={styles.panelDesc}>Fetch and merge newly registered DRAP medicines directly into your local database.</Text>

              {/* Segment Buttons */}
              <View style={styles.segmentRow}>
                {['brand', 'generic', 'reg'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.segmentBtn, syncType === t && styles.segmentBtnActive]}
                    onPress={() => setSyncType(t)}
                  >
                    <Text style={[styles.segmentText, syncType === t && styles.segmentTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.syncInput}
                placeholder="Enter medicine query (e.g. Paracetamol)..."
                placeholderTextColor="#64748b"
                value={syncQuery}
                onChangeText={setSyncQuery}
              />

              <TouchableOpacity
                style={[styles.btnPrimary, syncing && { opacity: 0.6 }]}
                disabled={syncing}
                onPress={() => handleStartSync()}
              >
                <Text style={styles.btnPrimaryText}>{syncing ? '⏳ Syncing DRAP...' : '🔄 Fetch & Sync DRAP'}</Text>
              </TouchableOpacity>

              <Text style={styles.presetLabel}>Quick Scans:</Text>
              <View style={styles.presetRow}>
                {['Paracetamol', 'Amoxicillin', 'Omeprazole', 'Leflunomide'].map(p => (
                  <TouchableOpacity key={p} style={styles.presetBtn} onPress={() => { setSyncQuery(p); handleStartSync(p); }}>
                    <Text style={styles.presetText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.terminalTitle}>Live Sync Activity Log:</Text>
              <View style={styles.terminal}>
                {syncLogs.map((log, index) => (
                  <Text key={index} style={styles.terminalText}>{log}</Text>
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {/* TAB 3: INSIGHTS */}
        {currentTab === 'insights' && (
          <ScrollView style={styles.viewContent}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>📊 Database Insights</Text>

              <View style={styles.grid2}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{stats?.total || 0}</Text>
                  <Text style={styles.metricLabel}>Total Medicines</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{stats?.activeCount || 0}</Text>
                  <Text style={styles.metricLabel}>Active Status</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{stats?.provisionalCount || 0}</Text>
                  <Text style={styles.metricLabel}>Provisional</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricVal}>{stats?.uniqueCompanies || 0}</Text>
                  <Text style={styles.metricLabel}>Pharma Companies</Text>
                </View>
              </View>

              <Text style={styles.sectionHeading}>Top Dosage Forms</Text>
              {stats?.topDosageForms?.map(item => (
                <View key={item.name} style={styles.barItem}>
                  <View style={styles.barLabelRow}>
                    <Text style={styles.barLabel}>{item.name}</Text>
                    <Text style={styles.barVal}>{item.count}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.min(100, (item.count / (stats.total || 1)) * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* TAB 4: SAVED */}
        {currentTab === 'saved' && (
          <View style={styles.viewContent}>
            <Text style={styles.panelTitle}>⭐ Saved Favorites ({bookmarks.length})</Text>
            {bookmarks.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 32 }}>⭐</Text>
                <Text style={{ color: '#94a3b8', marginTop: 10 }}>No bookmarked medicines yet.</Text>
              </View>
            ) : (
              <FlatList
                data={drugs.filter(d => bookmarks.includes(d.reg_num))}
                keyExtractor={item => item.reg_num}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.card} onPress={() => openDrugDetail(item)}>
                    <Text style={styles.cardBrand}>⭐ {item.brand_name}</Text>
                    <Text style={styles.cardGeneric}>{item.generic_name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* TAB 5: ADD DRUG */}
        {currentTab === 'add' && (
          <ScrollView style={styles.viewContent}>
            <View style={styles.panelCard}>
              <Text style={styles.panelTitle}>➕ Register New Medicine</Text>

              <Text style={styles.inputLabel}>Brand Name *</Text>
              <TextInput style={styles.syncInput} placeholder="e.g. Lefulin 20mg" placeholderTextColor="#64748b" value={addForm.brand_name} onChangeText={t => setAddForm({ ...addForm, brand_name: t })} />

              <Text style={styles.inputLabel}>Registration No *</Text>
              <TextInput style={styles.syncInput} placeholder="e.g. 119420" placeholderTextColor="#64748b" value={addForm.reg_num} onChangeText={t => setAddForm({ ...addForm, reg_num: t })} />

              <Text style={styles.inputLabel}>Generic Composition *</Text>
              <TextInput style={styles.syncInput} placeholder="e.g. Leflunomide 20mg" placeholderTextColor="#64748b" value={addForm.generic_name} onChangeText={t => setAddForm({ ...addForm, generic_name: t })} />

              <Text style={styles.inputLabel}>Manufacturer / Company</Text>
              <TextInput style={styles.syncInput} placeholder="e.g. Getz Pharma" placeholderTextColor="#64748b" value={addForm.company_name} onChangeText={t => setAddForm({ ...addForm, company_name: t })} />

              <TouchableOpacity style={styles.btnPrimary} onPress={handleAddDrugSubmit}>
                <Text style={styles.btnPrimaryText}>💾 Save Entry</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* BOTTOM NAV BAR */}
      <View style={styles.bottomNav}>
        {[
          { id: 'catalog', label: 'Catalog', icon: '📖' },
          { id: 'updater', label: 'Updater', icon: '⚡' },
          { id: 'insights', label: 'Insights', icon: '📊' },
          { id: 'saved', label: 'Saved', icon: '⭐' },
          { id: 'add', label: 'Add', icon: '➕' }
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.navItem, currentTab === tab.id && styles.navItemActive]}
            onPress={() => setCurrentTab(tab.id)}
          >
            <Text style={styles.navIcon}>{tab.icon}</Text>
            <Text style={[styles.navLabel, currentTab === tab.id && styles.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* DETAIL MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedDrug?.brand_name}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              <Text style={styles.detailItem}><Text style={styles.bold}>Generic:</Text> {selectedDrug?.generic_name}</Text>
              <Text style={styles.detailItem}><Text style={styles.bold}>Registration #:</Text> {selectedDrug?.reg_num}</Text>
              <Text style={styles.detailItem}><Text style={styles.bold}>Status:</Text> {selectedDrug?.status}</Text>
              <Text style={styles.detailItem}><Text style={styles.bold}>Dosage Form:</Text> {selectedDrug?.dosage_form}</Text>
              <Text style={styles.detailItem}><Text style={styles.bold}>Company:</Text> {selectedDrug?.company_name}</Text>
              <Text style={styles.detailItem}><Text style={styles.bold}>Label Claim:</Text> {selectedDrug?.label_claim}</Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => toggleBookmark(selectedDrug?.reg_num)}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                  {bookmarks.includes(selectedDrug?.reg_num) ? '⭐ Bookmarked' : '☆ Bookmark'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnDanger} onPress={handleDeleteDrug}>
                <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f19' },
  header: { height: 60, backgroundColor: '#0f172a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 20 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerSub: { color: '#94a3b8', fontSize: 10 },
  btnRefresh: { padding: 8, backgroundColor: '#1e293b', borderRadius: 8 },
  btnRefreshText: { fontSize: 16 },
  viewport: { flex: 1, padding: 12 },
  viewContent: { flex: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  searchIcon: { marginRight: 8, color: '#64748b' },
  searchInput: { flex: 1, height: 42, color: '#fff', fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold' },
  chipTextActive: { color: '#fff' },
  resultsText: { color: '#64748b', fontSize: 11, marginBottom: 10 },
  card: { backgroundColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardBrand: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  cardReg: { color: '#06b6d4', fontSize: 11, fontWeight: 'bold' },
  cardGeneric: { color: '#60a5fa', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  cardMetaRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4 },
  badgeSuccess: { backgroundColor: 'rgba(16,185,129,0.2)' },
  badgeWarning: { backgroundColor: 'rgba(245,158,11,0.2)' },
  badgeText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  badgeOutline: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  badgeOutlineText: { color: '#94a3b8', fontSize: 10 },
  cardCompany: { color: '#64748b', fontSize: 11, marginTop: 6 },
  bottomNav: { height: 60, backgroundColor: '#0f172a', flexDirection: 'row', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navItemActive: { backgroundColor: 'rgba(59,130,246,0.1)' },
  navIcon: { fontSize: 18 },
  navLabel: { color: '#64748b', fontSize: 10, marginTop: 2, fontWeight: 'bold' },
  navLabelActive: { color: '#3b82f6' },
  panelCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 16, marginBottom: 20 },
  panelTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 6 },
  panelDesc: { color: '#94a3b8', fontSize: 12, marginBottom: 14 },
  segmentRow: { flexDirection: 'row', backgroundColor: '#0b0f19', borderRadius: 8, padding: 4, marginBottom: 12 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  segmentBtnActive: { backgroundColor: '#3b82f6' },
  segmentText: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold' },
  segmentTextActive: { color: '#fff' },
  syncInput: { backgroundColor: '#0b0f19', borderRadius: 8, padding: 12, color: '#fff', fontSize: 13, marginBottom: 12 },
  btnPrimary: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  presetLabel: { color: '#94a3b8', fontSize: 11, marginTop: 14, marginBottom: 6, fontWeight: 'bold' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  presetBtn: { backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  presetText: { color: '#06b6d4', fontSize: 11 },
  terminalTitle: { color: '#94a3b8', fontSize: 11, marginBottom: 6, fontWeight: 'bold' },
  terminal: { backgroundColor: '#060913', padding: 10, borderRadius: 8, height: 140 },
  terminalText: { color: '#38bdf8', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 10 },
  metricCard: { width: '48%', backgroundColor: '#0b0f19', padding: 12, borderRadius: 10 },
  metricVal: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  metricLabel: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  sectionHeading: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold', marginTop: 14, marginBottom: 8 },
  barItem: { marginBottom: 8 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { color: '#fff', fontSize: 11 },
  barVal: { color: '#3b82f6', fontSize: 11, fontWeight: 'bold' },
  barTrack: { height: 6, backgroundColor: '#0b0f19', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#3b82f6' },
  inputLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginBottom: 4, marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0f172a', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  detailItem: { color: '#cbd5e1', fontSize: 13, marginBottom: 8 },
  bold: { color: '#fff', fontWeight: 'bold' },
  modalFooter: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 10 },
  btnSecondary: { flex: 1, backgroundColor: '#1e293b', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnDanger: { padding: 12, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center' }
});
