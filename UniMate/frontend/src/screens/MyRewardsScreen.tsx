import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WHITE_LEAVE = require('../../assets/white_leave.png');

const COLORS = {
  bgTop: '#FBF5EC',
  gold1: '#EDC070',
  gold2: '#E5B160',
  panel: '#FFFFFF',
  card: '#F3D7A1',
  text: '#1B1B1B',
  sub: '#6F6F6F',
  purple: '#6533A3',
  white: '#FFFFFF',
  lilac: '#EAD9FF',
};

type Voucher = { id: string; provider: string; title: string; used?: boolean; price?: number | 'Free' };

const K = {
  vouchers: 'rm_vouchers',
  todayRedeems: 'rm_today_redeems',
};

export default function MyRewardsScreen() {
  const navigation = useNavigation<any>();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [active, setActive] = useState<Voucher | null>(null);
  const [todaysRedeems, setTodaysRedeems] = useState<number>(0);

  // load
  useEffect(() => {
    (async () => {
      const [rawV, rawTR] = await Promise.all([
        AsyncStorage.getItem(K.vouchers),
        AsyncStorage.getItem(K.todayRedeems),
      ]);
      const arr: Voucher[] = rawV ? JSON.parse(rawV) : [];
      setVouchers(arr);
      setTodaysRedeems(rawTR ? Number(rawTR) : 0);
    })();
  }, []);

  const saveVouchers = async (arr: Voucher[]) => {
    setVouchers(arr);
    await AsyncStorage.setItem(K.vouchers, JSON.stringify(arr));
  };
  const incTodayRedeems = async () => {
    const v = todaysRedeems + 1;
    setTodaysRedeems(v);
    await AsyncStorage.setItem(K.todayRedeems, String(v));
  };

  const markUsed = async (id: string) => {
    const next = vouchers.map(v => (v.id === id ? { ...v, used: true } : v));
    await saveVouchers(next);
    await incTodayRedeems();
    setActive(null);
  };

  const activeVouchers = vouchers.filter(v => !v.used);
  const total = activeVouchers.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bgTop }}>
      {/* GOLD HEADER */}
      <LinearGradient
        colors={[COLORS.gold1, COLORS.gold2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <View style={{ width: 28 }} />
          <Text style={styles.headerTitle}>My Rewards</Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Image source={WHITE_LEAVE} style={{ width: 22, height: 22 }} />
          </TouchableOpacity>
        </View>

        {/* Stats card inside gold header */}
        <View style={styles.stats}>
          <View>
            <Text style={styles.statsLabel}>Vouchers</Text>
            <Text style={styles.statsValue}>{total}</Text>
          </View>
          <Text style={{ color: '#6D5232', fontWeight: '600' }}>
            Today’s redeems {todaysRedeems}
          </Text>
        </View>
      </LinearGradient>

      {/* WHITE CONTENT PANEL */}
      <View style={styles.whitePanel}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {activeVouchers.map((v) => (
            <View key={v.id} style={styles.ticket}>
              <View style={{ flex: 1 }}>
                <Text style={styles.provider}>{v.provider}</Text>
                <Text style={styles.title}>{v.title}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setActive(v)}
                style={styles.useNow}
                activeOpacity={0.9}
              >
                <Text style={{ color: COLORS.purple, fontWeight: '800' }}>Use Now</Text>
              </TouchableOpacity>
            </View>
          ))}

          {activeVouchers.length === 0 && (
            <Text style={{ color: COLORS.sub, textAlign: 'center', marginTop: 10 }}>
              No active vouchers yet. Redeem some in Reward Market.
            </Text>
          )}
        </ScrollView>
      </View>

      {/* Use Now modal */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Use Now</Text>
            {active && (
              <View style={[styles.ticket, { marginBottom: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.provider}>{active.provider}</Text>
                  <Text style={styles.title}>{active.title}</Text>
                </View>
              </View>
            )}

            <Text style={{ color: COLORS.sub, marginTop: 4 }}>
              Show this to the counter to redeem.
            </Text>

            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                onPress={() => active && markUsed(active.id)}
              >
                <Text style={[styles.sheetBtnLabel, { color: '#3E2A5A' }]}>Use Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => setActive(null)}>
                <Text style={styles.sheetBtnLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    marginTop: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: '800',
  },

  stats: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statsLabel: { color: '#4E391C', fontWeight: '600' },
  statsValue: { color: '#1E1509', fontWeight: '800', fontSize: 28 },

  whitePanel: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 18,
  },

  ticket: {
    backgroundColor: COLORS.purple,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  provider: { color: COLORS.white, opacity: 0.9, fontWeight: '600' },
  title: { color: COLORS.white, fontWeight: '800', fontSize: 16, marginTop: 2 },
  useNow: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    padding: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F7EFE3',
    alignItems: 'center',
  },
  sheetBtnPrimary: { backgroundColor: COLORS.lilac },
  sheetBtnLabel: { fontWeight: '800', color: COLORS.sub },
});
