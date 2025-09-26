import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/api';
import { authService } from '../services/auth';

const COIN = require('../../assets/ui/coin.png');
const LEAVE = require('../../assets/leave.png');

type TabKey = 'earn' | 'redeem';

const COLORS = {
  bgTop: '#FBF5EC',
  white: '#FFFFFF',
  text: '#1B1B1B',
  sub: '#6F6F6F',
  gold1: '#EDC070',
  gold2: '#E5B160',
  lilac: '#EAD9FF',       // completed task
  lilacText: '#3E2A5A',
  purple: '#6533A3',      // normal task (not completed)
  pillBg: '#F7EFE3',
  pillActive: '#F2D999',
  ticketPurple: '#6533A3',
};

type EarnTask = { id: string; label: string; points: number };
type Reward = { id: string; title: string; provider: string; price: number | 'Free' };
type Section<T> = { title: string; data: T[] };

// -------- Persistent keys (per-day stamping) --------
const K = {
  coins: 'rm_coins_total',
  todayEarned: 'rm_today_earned',
  todayRedeems: 'rm_today_redeems',
  vouchers: 'rm_vouchers',
  taskDates: 'rm_task_dates', // actionId -> "YYYY-MM-DD"
};

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// -------- Earn lists (read-only here; updated by other screens) --------
const EARN_SECTIONS: Section<EarnTask>[] = [
  {
    title: 'Daily Habits',
    data: [
      { id: 'login', label: 'Login the app', points: 5 },
      { id: 'add_task', label: 'Add a task', points: 5 },
      { id: 'add_reminder', label: 'Add a reminder', points: 10 },
    ],
  },
  {
    title: 'Island Actions',
    data: [
      { id: 'complete_1_challenge', label: 'Complete a daily challenge', points: 5 },
      { id: 'complete_3_challenges', label: 'Complete 3 daily challenges', points: 10 },
      { id: 'set_mood_today', label: 'Set the mood today', points: 5 },
    ],
  },
];

// -------- Redeem lists --------
const REDEEM_SECTIONS: Section<Reward>[] = [
  {
    title: 'Wellness',
    data: [
      { id: 'r1', title: 'Free Consultation', provider: 'Counselling Centre', price: 'Free' },
      { id: 'r2', title: 'Yoga Class Drop-in', provider: 'Yoga Room', price: 420 },
    ],
  },
  {
    title: 'Campus Perks',
    data: [
      { id: 'r3', title: 'Printing Credits (20 pages)', provider: 'Minimart', price: 100 },
      { id: 'r4', title: 'Laundry Credits (40 minutes)', provider: 'Dorm', price: 120 },
      { id: 'r5', title: 'Campus Cap Merchandise', provider: 'Student Council', price: 3200 },
    ],
  },
  {
    title: 'Food & Drink',
    data: [
      { id: 'r6', title: 'Café Voucher RM5', provider: 'Warriors Café', price: 300 },
      { id: 'r7', title: 'Lunch Set Voucher RM10', provider: 'Mamak', price: 520 },
      { id: 'r8', title: 'Free Hot/Ice Coffee (1 cup)', provider: 'Nice Coffee', price: 450 },
    ],
  },
];

type Voucher = { id: string; provider: string; title: string; used?: boolean; price: number | 'Free' };

export default function RewardMarketScreen() {
  const navigation = useNavigation<any>();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [active, setActive] = useState<TabKey>('earn');

  // persisted state
  const [coins, setCoins] = useState<number>(1026);
  const [todayEarned, setTodayEarned] = useState<number>(30);
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});

  // modals
  const [confirmModal, setConfirmModal] = useState<Reward | null>(null);
  const [justRedeemed, setJustRedeemed] = useState<Reward | null>(null);

  // ---------- load & refresh persisted (per-day) ----------
  const loadState = async () => {
    // Try to load points from backend first
    const token = await authService.getAccessToken();
    if (token) {
      try {
        const response = await apiService.getUserPoints(token);
        if (response.success && response.points !== undefined) {
          setCoins(response.points);
          await AsyncStorage.setItem(K.coins, String(response.points));
        }
      } catch (error) {
        console.log('Failed to load points from backend:', error);
      }
    }

    // Load local data (with backend data as fallback)
    const [c, te, datesStr] = await Promise.all([
      AsyncStorage.getItem(K.coins),
      AsyncStorage.getItem(K.todayEarned),
      AsyncStorage.getItem(K.taskDates),
    ]);

    if (c !== null && !token) setCoins(Number(c)); // Only use local if no backend data
    else if (c !== null && token) {
      // If we have both backend and local data, prioritize backend but keep local as fallback
      const localCoins = Number(c);
      if (coins === 1026) { // Only override if still using default value
        setCoins(localCoins);
      }
    }
    if (te !== null) setTodayEarned(Number(te));

    const dates: Record<string, string> = datesStr ? JSON.parse(datesStr) : {};
    const today = todayKey();

    const ids = [
      'login',
      'add_task',
      'add_reminder',
      'complete_1_challenge',
      'complete_3_challenges',
      'set_mood_today',
    ];
    const map: Record<string, boolean> = {};
    ids.forEach((id) => (map[id] = dates[id] === today));
    setTaskDone(map);
  };

  useEffect(() => {
    loadState();
  }, []);

  // refresh when screen regains focus
  useFocusEffect(
    React.useCallback(() => {
      loadState();
    }, [])
  );

  // helpers to persist
  const persistCoins = async (v: number) => {
    setCoins(v);
    await AsyncStorage.setItem(K.coins, String(v));
  };

  // ---------- redeem confirm ----------
  const finishRedeem = async (reward: Reward | null) => {
    if (!reward) return;
    if (typeof reward.price === 'number' && coins < reward.price) {
      Alert.alert('Not enough coins', 'Earn more coins to redeem this reward.');
      return;
    }

    if (typeof reward.price === 'number') {
      await persistCoins(coins - reward.price);
    }

    const raw = await AsyncStorage.getItem(K.vouchers);
    const list: Voucher[] = raw ? JSON.parse(raw) : [];
    list.push({
      id: `${reward.id}_${Date.now()}`,
      provider: reward.provider,
      title: reward.title,
      used: false,
      price: reward.price,
    });
    await AsyncStorage.setItem(K.vouchers, JSON.stringify(list));

    setJustRedeemed(reward);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bgTop }}>
      {/* Top bar (leave icon) */}
      <View style={styles.topBar}>
        <View style={{ width: 28 }} />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        >
          <Image source={LEAVE} style={{ width: 22, height: 22 }} />
        </TouchableOpacity>
      </View>

      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={{ alignItems: 'center', paddingHorizontal: 20, marginTop: 18 }}>
          <Text style={styles.welcome}>Welcome to</Text>
          <Text style={styles.title}>Reward Market</Text>
        </View>

        {/* Gold card + floating pill */}
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <View style={styles.goldWrap}>
            <LinearGradient
              colors={[COLORS.gold1, COLORS.gold2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.goldCard}
            >
              {/* LEFT: coin icon + Coins label */}
              <View style={styles.coinStack}>
                <Image source={COIN} style={styles.coin} />
                <Text style={styles.coinLabel}>Coins</Text>
              </View>

              {/* RIGHT: balance + today's earnings */}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.balance}>{coins.toLocaleString()}</Text>
                <Text style={styles.earnings}>Today’s earnings {todayEarned}</Text>
              </View>
            </LinearGradient>

            {/* Floating Earn/Redeem pill */}
            <View style={styles.segmentFloatAbs}>
              <View style={styles.segmentWrap}>
                <TouchableOpacity
                  style={[styles.segmentBtn, active === 'earn' && styles.segmentActive]}
                  onPress={() => setActive('earn')}
                >
                  <Text style={[styles.segmentText, active === 'earn' && styles.segmentTextActive]}>
                    Earn
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, active === 'redeem' && styles.segmentActive]}
                  onPress={() => setActive('redeem')}
                >
                  <Text style={[styles.segmentText, active === 'redeem' && styles.segmentTextActive]}>
                    Redeem
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* White content panel */}
        <View style={styles.whitePanel}>
          {active === 'redeem' && (
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('MyRewards')}
                style={styles.viewMyRewards}
                activeOpacity={0.85}
              >
                <Text style={styles.viewMyRewardsText}>View My Rewards</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ paddingHorizontal: 20, paddingTop: active === 'redeem' ? 6 : 0 }}>
            {active === 'earn' ? (
              <EarnList taskDone={taskDone} />
            ) : (
              <RedeemList onRedeem={(r) => setConfirmModal(r)} />
            )}
          </View>
        </View>
      </ScrollView>

      {/* Confirm modal */}
      <Modal visible={!!confirmModal} transparent animationType="slide" onRequestClose={() => setConfirmModal(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Redeem</Text>
            {confirmModal && <TicketRow r={confirmModal} />}
            <Text style={styles.sheetBody}>Are you sure you want to redeem?</Text>
            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                onPress={async () => {
                  const r = confirmModal;
                  setConfirmModal(null);
                  await finishRedeem(r);
                }}
              >
                <Text style={[styles.sheetBtnLabel, { color: '#3E2A5A' }]}>Redeem</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => setConfirmModal(null)}>
                <Text style={styles.sheetBtnLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal visible={!!justRedeemed} transparent animationType="slide" onRequestClose={() => setJustRedeemed(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Redeem</Text>
            {justRedeemed && <TicketRow r={justRedeemed} />}
            <Text style={styles.sheetBody}>You may check your redeems in My Rewards.</Text>
            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                onPress={() => {
                  setJustRedeemed(null);
                  navigation.navigate('MyRewards');
                }}
              >
                <Text style={[styles.sheetBtnLabel, { color: '#3E2A5A' }]}>Redeemed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => setJustRedeemed(null)}>
                <Text style={styles.sheetBtnLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* -------------------- Sub-UI -------------------- */

// EarnList is READ-ONLY here — completion is set by other screens.
function EarnList({ taskDone }: { taskDone: Record<string, boolean> }) {
  return (
    <>
      {EARN_SECTIONS.map((sec) => (
        <View key={sec.title} style={{ marginBottom: 18 }}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {sec.data.map((t) => {
            const done = !!taskDone[t.id];
            return (
              <View
                key={t.id}
                style={[
                  styles.earnRowBase,
                  done ? styles.earnRowDone : styles.earnRowNormal,
                ]}
              >
                <Text
                  style={[
                    styles.earnLabelBase,
                    done ? styles.earnLabelDone : styles.earnLabelNormal,
                  ]}
                >
                  {t.label}
                </Text>
                <View style={[styles.coinPill, done && { backgroundColor: COLORS.white }]}>
                  <Image source={COIN} style={{ width: 16, height: 16, marginRight: 6 }} />
                  <Text
                    style={{
                      fontWeight: '700',
                      color: done ? COLORS.lilacText : COLORS.white,
                    }}
                  >
                    {t.points}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={{ color: COLORS.sub, fontSize: 12, marginTop: 4 }}>
            Complete these in their respective tabs to earn coins.
          </Text>
        </View>
      ))}
    </>
  );
}

function RedeemList({ onRedeem }: { onRedeem: (r: Reward) => void }) {
  return (
    <>
      {REDEEM_SECTIONS.map((sec) => (
        <View key={sec.title} style={{ marginBottom: 18 }}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {sec.data.map((r) => (
            <View key={r.id} style={styles.ticketCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketProvider}>{r.provider}</Text>
                <Text style={styles.ticketTitle}>{r.title}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <PricePill price={r.price} />
                <TouchableOpacity onPress={() => onRedeem(r)} style={styles.redeemBtn} activeOpacity={0.9}>
                  <Text style={{ color: COLORS.ticketPurple, fontWeight: '700' }}>Redeem</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function TicketRow({ r }: { r: Reward }) {
  return (
    <View style={styles.ticketCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.ticketProvider}>{r.provider}</Text>
        <Text style={styles.ticketTitle}>{r.title}</Text>
      </View>
      <PricePill price={r.price} />
    </View>
  );
}

function PricePill({ price }: { price: number | 'Free' }) {
  return (
    <View style={styles.pricePill}>
      <Image source={COIN} style={{ width: 16, height: 16, marginRight: 6 }} />
      <Text style={{ color: COLORS.white, fontWeight: '700' }}>
        {price === 'Free' ? 'Free' : price}
      </Text>
    </View>
  );
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  welcome: { color: COLORS.sub, fontSize: 14 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: '800', marginTop: 2 },

  goldWrap: {
    position: 'relative',
    paddingBottom: 26,
  },
  goldCard: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    paddingBottom: 28,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  coinStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coin: { width: 28, height: 28, marginBottom: 6 },
  coinLabel: { color: '#4E391C', fontWeight: '700', fontSize: 14 },

  balance: { fontSize: 28, color: '#1E1509', fontWeight: '800', lineHeight: 30 },
  earnings: { color: '#6D5232', marginTop: 4 },

  segmentFloatAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -22,
    alignItems: 'center',
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 4,
    width: 230,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  segmentBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  segmentActive: { backgroundColor: COLORS.pillActive },
  segmentText: { fontWeight: '700', color: '#7A5C2A' },
  segmentTextActive: { color: '#3C2A0A' },

  whitePanel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 24,
    paddingTop: 20,
  },

  viewMyRewards: {
    backgroundColor: COLORS.lilac,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  viewMyRewardsText: { color: COLORS.lilacText, fontWeight: '800' },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 10 },

  // Earn rows (read-only)
  earnRowBase: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earnRowNormal: {
    backgroundColor: COLORS.purple,
  },
  earnRowDone: {
    backgroundColor: COLORS.lilac,
  },
  earnLabelBase: { fontWeight: '700' },
  earnLabelNormal: { color: COLORS.white },
  earnLabelDone: { color: COLORS.lilacText },

  coinPill: {
    backgroundColor: '#9C6AE0',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Redeem tickets
  ticketCard: {
    backgroundColor: COLORS.ticketPurple,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ticketProvider: { color: COLORS.white, opacity: 0.9, fontWeight: '600' },
  ticketTitle: { color: COLORS.white, fontWeight: '800', fontSize: 16, marginTop: 2 },
  pricePill: {
    backgroundColor: '#9C6AE0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  redeemBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 8,
  },

  // bottom sheets
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white,
    padding: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheetTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  sheetBody: { color: COLORS.sub, marginTop: 4 },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
  },
  sheetBtnPrimary: { backgroundColor: COLORS.lilac },
  sheetBtnLabel: { fontWeight: '800', color: COLORS.sub },
});
