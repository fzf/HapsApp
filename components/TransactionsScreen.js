import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useAuth } from '../AuthContext';
import APIService from '../services/APIService';

function formatAmount(amount) {
  if (amount == null) return '—';
  return '$' + Number(amount).toFixed(2);
}

function formatTime(isoString, timezone) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
    });
  } catch (_) {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

function toLocalDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function confidenceColor(score) {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#d97706';
  return '#9ca3af';
}

const TransactionRow = ({ item, timezone }) => {
  const match = item.matched_visit;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.merchant} numberOfLines={1}>{item.merchant || item.name}</Text>
        {item.merchant && item.name && item.merchant !== item.name ? (
          <Text style={styles.txName} numberOfLines={1}>{item.name}</Text>
        ) : null}
        <Text style={styles.txTime}>{formatTime(item.purchased_at, timezone)}</Text>
        {item.category ? <Text style={styles.category}>{item.category}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.amount}>{formatAmount(item.amount)}</Text>
        {match ? (
          <View style={[styles.matchBadge, { borderColor: confidenceColor(match.confidence) }]}>
            <Text style={[styles.matchText, { color: confidenceColor(match.confidence) }]}>
              {match.verified ? '✓ Matched' : Math.round(match.confidence) + '%'}
            </Text>
          </View>
        ) : (
          <Text style={styles.unmatchedText}>unmatched</Text>
        )}
      </View>
    </View>
  );
};

const DaySelector = ({ date, onPrev, onNext }) => {
  const isToday = toLocalDateString(date) === toLocalDateString(new Date());
  const label = isToday
    ? 'Today'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={styles.daySelector}>
      <TouchableOpacity onPress={onPrev} style={styles.dayArrow}>
        <Text style={styles.dayArrowText}>&#8249;</Text>
      </TouchableOpacity>
      <Text style={styles.dayLabel}>{label}</Text>
      <TouchableOpacity onPress={onNext} style={styles.dayArrow} disabled={isToday}>
        <Text style={[styles.dayArrowText, isToday && styles.dayArrowDisabled]}>&#8250;</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function TransactionsScreen() {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (date, isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await APIService.getTransactions(toLocalDateString(date));
      setData(result);
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(selectedDate); }, [selectedDate, token]);

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setSelectedDate(d);
  };

  const transactions = data && data.transactions ? data.transactions : [];
  const timezone = (data && data.timezone) ? data.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const total = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const matchedCount = transactions.filter(function(t) { return t.matched_visit; }).length;

  return (
    <SafeAreaView style={styles.container}>
      <DaySelector date={selectedDate} onPrev={prevDay} onNext={nextDay} />

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={() => load(selectedDate)} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={function(item) { return String(item.id); }}
          renderItem={function({ item }) {
            return <TransactionRow item={item} timezone={timezone} />;
          }}
          ListHeaderComponent={transactions.length > 0 ? (
            <View style={styles.summaryBar}>
              <Text style={styles.summaryTotal}>{formatAmount(total)}</Text>
              <Text style={styles.summaryMeta}>
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                {matchedCount > 0 ? ' · ' + matchedCount + ' matched' : ''}
              </Text>
            </View>
          ) : null}
          ListEmptyComponent={!loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💳</Text>
              <Text style={styles.emptyText}>No transactions</Text>
              <Text style={styles.emptySubtext}>Nothing recorded for this day</Text>
            </View>
          ) : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={function() { load(selectedDate, true); }} />
          }
          contentContainerStyle={transactions.length === 0 ? styles.emptyContainer : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  daySelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  dayArrow: { paddingHorizontal: 12, paddingVertical: 4 },
  dayArrowText: { fontSize: 28, color: '#3b82f6', lineHeight: 34 },
  dayArrowDisabled: { color: '#d1d5db' },
  dayLabel: { fontSize: 17, fontWeight: '600', color: '#111827' },
  summaryBar: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  summaryTotal: { fontSize: 22, fontWeight: '700', color: '#111827' },
  summaryMeta: { fontSize: 13, color: '#6b7280' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#ffffff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  merchant: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txName: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  txTime: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  category: {
    fontSize: 11, color: '#6b7280', marginTop: 3,
    backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, alignSelf: 'flex-start',
  },
  rowRight: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '600', color: '#111827' },
  matchBadge: {
    marginTop: 4, borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  matchText: { fontSize: 11, fontWeight: '600' },
  unmatchedText: { fontSize: 11, color: '#d1d5db', marginTop: 4 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyContainer: { flex: 1 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
