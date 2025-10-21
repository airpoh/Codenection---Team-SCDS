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
const MYREWARDS_IMG = require('../../assets/ui/myrewards.png');
const COIN = require('../../assets/ui/coin.png');

const COLORS = {
  bgTop: '#FBF5EC',
  gold1: '#EDC070',
  gold2: '#E5B160',
  panel: '#FFFFFF',
  text: '#1B1B1B',
  sub: '#6F6F6F',
  white: '#FFFFFF',
  lilac: '#EAD9FF',
  purple: '#6533A3',
  // Ticket palette (aligned with RewardMarketScreen)
  ticket: '#EDC070',
  ticketGlow: '#E5B160',
  goldenText: '#1E1509',
  goldenSub: '#6D5232',
};

type Voucher = {
  id: string;
  provider: string;
  title: string;
  used?: boolean;
  price?: number | 'Free';
};

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

  // load persisted data
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
    const next = vouchers.map((v) => (v.id === id ? { ...v, used: true } : v));
    await saveVouchers(next);
    await incTodayRedeems();
    setActive(null);
  };

  const activeVouchers = vouchers.filter((v) => !v.used);
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

        {/* Golden wallet–style stats card (matches RewardMarket) */}
        <LinearGradient
          colors={[COLORS.gold1, COLORS.gold2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.goldCard}
        >
          {/* Glowy image block (left) */}
          <View style={styles.imageStack}>
            <Image source={MYREWARDS_IMG} style={{ width: 200, height: 200, marginRight: 6 }} />
          </View>

          {/* Figures (right) */}
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.subLine}>Vouchers</Text>
            <Text style={styles.bigValue}>{total}</Text>
            <Text style={{color: '#6D5232', marginTop: 4 }}>Today's redeems {todaysRedeems}</Text>
          </View>
        </LinearGradient>
      </LinearGradient>

      {/* WHITE CONTENT PANEL */}
      <View style={styles.whitePanel}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {activeVouchers.map((v) => (
            <View key={v.id} style={styles.ticketCard}>
              {/* perforation decorations */}
              <View style={styles.tickHoleLeft} />
              <View style={styles.tickHoleRight} />
              <View style={styles.tickDotted} />

              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.ticketProvider}>{v.provider}</Text>
                <Text style={styles.ticketTitle}>{v.title}</Text>
              </View>

              <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <PricePill price={v.price} />
                <TouchableOpacity
                  onPress={() => setActive(v)}
                  style={styles.useNowBtn}
                  activeOpacity={0.95}
                >
                  <Text style={{ color: COLORS.ticket, fontWeight: '800' }}>Use Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {activeVouchers.length === 0 && (
            <Text style={{ color: COLORS.sub, textAlign: 'center', marginTop: 10 }}>
              No active vouchers yet. Redeem some in Reward Market.
            </Text>
          )}
        </ScrollView>
      </View>

      {/* Use Now modal (unchanged logic) */}
      <Modal
        visible={!!active}
        transparent
        animationType="slide"
        onRequestClose={() => setActive(null)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Use Now</Text>
            {active && (
              <View style={[styles.ticketCard, { marginBottom: 10 }]}>
                <View style={styles.tickHoleLeft} />
                <View style={styles.tickHoleRight} />
                <View style={styles.tickDotted} />
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.ticketProvider}>{active.provider}</Text>
                  <Text style={styles.ticketTitle}>{active.title}</Text>
                </View>
                <PricePill price={active.price} />
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

/* -------------------- Small sub-UI: Price pill (same vibe as RewardMarket) -------------------- */
function PricePill({ price }: { price?: number | 'Free' }) {
  if (price === undefined) return null;
  return (
    <LinearGradient
      colors={[COLORS.ticketGlow, COLORS.ticket]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.pricePill}
    >
      <Image source={COIN} style={{ width: 16, height: 16, marginRight: 6 }} />
      <Text style={{ color: COLORS.white, fontWeight: '800' }}>
        {price === 'Free' ? 'Free' : price}
      </Text>
    </LinearGradient>
  );
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingBottom: 24,
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

  // Golden wallet–style card (matches RewardMarket)
  goldCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  imageStack: { alignItems: 'center', justifyContent: 'center' },
  imageGlow: {
    position: 'absolute',
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.38)',
    // @ts-ignore (web-only blur hint; native ignores)
    filter: 'blur(10px)',
  },
  imageIcon: { width: 54, height: 54, marginBottom: 6 },
  imageLabel: { color: '#4E391C', fontWeight: '800', fontSize: 13 },

  bigValue: {
    fontSize: 30,
    color: COLORS.goldenText,
    fontWeight: '900',
    lineHeight: 32,
    textAlign: 'right',
  },
  subLine: { fontWeight: '800', color: '#7A5C2A' },

  whitePanel: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 18,
  },

  /* ------- Ticket card (now mirrors RewardMarket) ------- */
  ticketCard: {
    backgroundColor: COLORS.ticket,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  tickHoleLeft: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    left: -11,
    top: '70%',
    marginTop: -11,
  },
  tickHoleRight: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    right: -11,
    top: '70%',
    marginTop: -11,
  },
  tickDotted: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: '70%',
    width: 2,
    borderStyle: 'dashed',
    borderRightWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ticketProvider: { color: COLORS.white, opacity: 0.9, fontWeight: '700' },
  ticketTitle: { color: COLORS.white, fontWeight: '900', fontSize: 16, marginTop: 2 },

  pricePill: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  useNowBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },

  // Bottom sheet (unchanged)
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    padding: 30,
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
