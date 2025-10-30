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
import { useAuth } from '../contexts/AuthContext';

const REWARD = require('../../assets/ui/rewards.png');
const COIN = require('../../assets/ui/coin.png');
const LEAVE = require('../../assets/leave.png');


type TabKey = 'earn' | 'redeem';

const COLORS = {
  sky1: '#FDF6FF',
  sky2: '#FFF3E7',
  white: '#FFFFFF',
  ink: '#1B1B1B',
  sub: '#6F6F6F',
  gold1: '#F2B666',
  gold2: '#FFD37A',
  lilac: '#EAD9FF',
  lilacDark: '#3E2A5A',
  purple: '#6B41C6',
  purpleDark: '#4B21A3',
  pill: '#FFF5E0',
  pillActive: '#FFE39B',
  ticket: '#6B41C6',
  ticketGlow: '#8E64FF',
  mint: '#FFE39B',
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

// -------- Redeem lists (matching backend voucher IDs) --------
const REDEEM_SECTIONS: Section<Reward>[] = [
  {
    title: 'Food & Beverages',
    data: [
      { id: 'food_starbucks_10', title: 'Zus Coffee RM10 Voucher', provider: 'Zus Coffee', price: 500 },
      { id: 'food_kfc_15', title: 'Set Lunch FREE Redeem', provider: 'Chinese Food Canteen', price: 750 },
      { id: 'food_mcd_12', title: "Malatang RM10 Voucher", provider: "Malatang Canteen", price: 600 },
    ],
  },
  {
    title: 'Health & Wellness',
    data: [
      { id: 'wellness_guardian_20', title: 'Tennis - 2 Class Pass', provider: 'Tennis Club', price: 1000 },
      { id: 'wellness_fitness_first_trial', title: 'Swimming - Single Class Pass', provider: 'Swimming Club', price: 400 },
      { id: 'wellness_yoga_class', title: 'Pure Yoga - Single Class Pass', provider: 'Yoga Club', price: 350 },
    ],
  },
  {
    title: 'Shopping & Services',
    data: [
      { id: 'shopping_grab_10', title: 'Minimart RM10 Credit', provider: 'Minimart', price: 500 },
      { id: 'shopping_shopee_15', title: 'XMUM Hoodie RM15 Voucher', provider: 'XMUM ECA', price: 750 },
      { id: 'shopping_lazada_12', title: 'Sport Month Tee RM10 Voucher', provider: 'XMUM ECA', price: 600 },
    ],
  },
  {
    title: 'Education & Learning',
    data: [
      { id: 'education_coursera_month', title: 'Mobile App Building Workshop', provider: 'Computer Club', price: 800 },
      { id: 'education_udemy_discount', title: 'Self-Care Workshop', provider: 'Counselling Centre', price: 300 },
    ],
  },
  {
    title: 'Entertainment & Media',
    data: [
      { id: 'entertainment_tgv_ticket', title: 'Mini Cinema Friday Movie Ticket ', provider: 'Mini Cinema', price: 900 },
      { id: 'entertainment_spotify_premium', title: 'KPOP Dance Competition Ticket RM15 Voucher ', provider: 'Dancing Cub', price: 450 },
    ],
  },
];

type Voucher = { id: string; provider: string; title: string; used?: boolean; price: number | 'Free' };

export default function RewardMarketScreen() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();

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
    if (token) {
      try {
        const response = await apiService.getUserPoints();
        if (response.success && response.points) {
          const totalPoints = response.points.total_points || 0;
          const earnedToday = response.points.earned_today || 0;

          setCoins(totalPoints);
          setTodayEarned(earnedToday);

          await AsyncStorage.setItem(K.coins, String(totalPoints));
          await AsyncStorage.setItem(K.todayEarned, String(earnedToday));

          console.log('[RewardMarket] Loaded coins from backend:', totalPoints);
          console.log('[RewardMarket] Loaded earned_today from backend:', earnedToday);
        }
      } catch (error) {
        console.log('[RewardMarket] Failed to load points from backend:', error);
      }

      // Fetch earn actions completion status from backend
      try {
        const earnResponse = await apiService.getEarnActionsToday();
        if (earnResponse.success && earnResponse.actions) {
          const completionMap: Record<string, boolean> = {};
          earnResponse.actions.forEach((action: any) => {
            completionMap[action.id] = action.completed;
          });
          setTaskDone(completionMap);
          console.log('[RewardMarket] Loaded earn actions from backend:', completionMap);
        }
      } catch (error) {
        console.log('[RewardMarket] Failed to load earn actions from backend:', error);
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
  }, [token]); // Refetch when user logs in/out

  // refresh when screen regains focus
  useFocusEffect(
    React.useCallback(() => {
      loadState();
    }, [token]) // Refetch when user logs in/out or screen focuses
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

    try {
      // Call backend API to redeem voucher
      console.log('[RewardMarket] Attempting to redeem:', reward.id);
      const response = await apiService.redeemVoucher(reward.id);

      if (response.success) {
        console.log('[RewardMarket] Redemption successful:', response);

        // Update local coins display with actual remaining points from backend
        const pointsResponse = await apiService.getUserPoints();
        if (pointsResponse.success && pointsResponse.points) {
          const updatedCoins = pointsResponse.points.total_points || 0;
          await persistCoins(updatedCoins);
          console.log('[RewardMarket] Updated coins after redemption:', updatedCoins);
        } else {
          // Fallback: deduct locally if backend doesn't return updated points
          if (typeof reward.price === 'number') {
            await persistCoins(coins - reward.price);
          }
        }

        // Also save to AsyncStorage for offline viewing
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
      } else {
        console.error('[RewardMarket] Redemption failed:', response.error);
        Alert.alert('Redemption Failed', response.error || 'Unable to redeem reward. Please try again.');
      }
    } catch (error) {
      console.error('[RewardMarket] Redemption error:', error);
      Alert.alert('Redemption Failed', 'Unable to redeem reward. Please check your connection and try again.');
    }
  };

  return (
    <LinearGradient colors={[COLORS.sky1, COLORS.sky2]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* top bar */}
        <View style={styles.topBar}>
          <View style={{ width: 28 }} />
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 20, left: 10, right: 10, bottom: 10 }}
          >
            <Image source={LEAVE} style={{ width: 25, height: 25 }} />
          </TouchableOpacity>
        </View>

        <ScrollView
          bounces={false}
          contentContainerStyle={{ paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {/* title */}
          <View style={{ alignItems: 'center', paddingHorizontal: 20, marginTop: 8 }}>
            <Text style={styles.welcome}>Welcome to</Text>
            <Text style={styles.title}>Reward Market</Text>
          </View>

          {/* golden wallet */}
          <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
            <View style={styles.goldWrap}>
              <LinearGradient
                colors={[COLORS.gold1, COLORS.gold2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.goldCard}
              >
                {/* glowy coin stack */}
                <View style={styles.coinStack}>
                  <Image source={REWARD} style={{ width: 100, height: 100, marginRight: 6 }} />
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.segmentText}>Coins</Text>
                  <Text style={styles.balance}>{coins.toLocaleString()}</Text>
                  <Text style={styles.earnings}>Today's earnings {todayEarned}</Text>
                </View>
              </LinearGradient>

              {/* segment pill */}
              <View style={styles.segmentFloatAbs}>
                <View style={styles.segmentWrap}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, active === 'earn' && styles.segmentActive]}
                    onPress={() => setActive('earn')}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.segmentText, active === 'earn' && styles.segmentTextActive]}>
                      Earn
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, active === 'redeem' && styles.segmentActive]}
                    onPress={() => setActive('redeem')}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.segmentText, active === 'redeem' && styles.segmentTextActive]}>
                      Redeem
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* white playfield */}
          <View style={styles.whitePanel}>
            {active === 'redeem' && (
              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('MyRewards')}
                  style={styles.viewMyRewards}
                  activeOpacity={0.9}
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
                <Text style={[styles.sheetBtnLabel, { color: COLORS.lilacDark }]}>Redeem</Text>
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
                <Text style={[styles.sheetBtnLabel, { color: COLORS.lilacDark }]}>Redeemed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => setJustRedeemed(null)}>
                <Text style={styles.sheetBtnLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* -------------------- Sub-UI (no logic changes) -------------------- */

function EarnList({ taskDone }: { taskDone: Record<string, boolean> }) {
  return (
    <>
      {EARN_SECTIONS.map((sec) => (
        <View key={sec.title} style={{ marginBottom: 18 }}>
          <View style={styles.secHeader}>
            <Text style={styles.secHeaderText}>{sec.title}</Text>
          </View>

          {sec.data.map((t) => {
            const done = !!taskDone[t.id];
            return (
              <LinearGradient
                key={t.id}
                colors={done ? [COLORS.lilac, '#F7EEFF'] : [COLORS.purple, COLORS.purpleDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.earnRow}
              >
                <View style={styles.earnLeft}>
                  <View style={[styles.badge, done ? styles.badgeDone : styles.badgeTodo]}>
                    <Text style={done ? styles.badgeTextDone : styles.badgeTextTodo}>
                      {done ? '✓' : '•'}
                    </Text>
                  </View>
                  <Text style={[styles.earnLabel, { color: done ? COLORS.lilacDark : COLORS.white }]}>{t.label}</Text>
                </View>

                <View style={[styles.coinPill, done && { backgroundColor: COLORS.white }]}>
                  <Image source={COIN} style={{ width: 18, height: 18, marginRight: 6 }} />
                  <Text
                    style={{
                      fontWeight: '800',
                      color: done ? COLORS.lilacDark : COLORS.white,
                    }}
                  >
                    {t.points}
                  </Text>
                </View>
              </LinearGradient>
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
          <View style={[styles.secHeader, { backgroundColor: COLORS.mint }]}>
            <Text style={[styles.secHeaderText, { color: '#b28030ff' }]}>{sec.title}</Text>
          </View>

          {sec.data.map((r) => (
            <View key={r.id} style={styles.ticketCard}>
              {/* perforation decorations */}
              <View style={styles.tickHoleLeft} />
              <View style={styles.tickHoleRight} />
              <View style={styles.tickDotted} />

              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.ticketProvider}>{r.provider}</Text>
                <Text style={styles.ticketTitle}>{r.title}</Text>
              </View>

              <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <PricePill price={r.price} />
                <TouchableOpacity onPress={() => onRedeem(r)} style={styles.redeemBtn} activeOpacity={0.95}>
                  <Text style={{ color: COLORS.ticket, fontWeight: '800' }}>Redeem</Text>
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
      <View style={styles.tickHoleLeft} />
      <View style={styles.tickHoleRight} />
      <View style={styles.tickDotted} />

      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.ticketProvider}>{r.provider}</Text>
        <Text style={styles.ticketTitle}>{r.title}</Text>
      </View>
      <PricePill price={r.price} />
    </View>
  );
}

function PricePill({ price }: { price: number | 'Free' }) {
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
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  welcome: { color: COLORS.sub, fontSize: 14 },
  title: { color: COLORS.ink, fontSize: 30, fontWeight: '800', marginTop: 2 },

  goldWrap: { position: 'relative', paddingBottom: 30 },
  goldCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  coinStack: { alignItems: 'center', justifyContent: 'center' },
  coinGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.4)',
    filter: 'blur(10px)' as any, // ignored on native; keeps web pretty
  },
  coin: { width: 34, height: 34, marginBottom: 6 },
  coinLabel: { color: '#4E391C', fontWeight: '800', fontSize: 14 },
  balance: { fontSize: 30, color: '#1E1509', fontWeight: '900', lineHeight: 32 },
  earnings: { color: '#6D5232', marginTop: 4 },

  segmentFloatAbs: { position: 'absolute', left: 0, right: 0, bottom: -24, alignItems: 'center' },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 5,
    width: 240,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  segmentBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22 },
  segmentActive: { backgroundColor: COLORS.pillActive },
  segmentText: { fontWeight: '800', color: '#7A5C2A' },
  segmentTextActive: { color: '#3C2A0A' },

  whitePanel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 26,
    paddingTop: 20,
    overflow: 'hidden',
  },

  viewMyRewards: {
    backgroundColor: COLORS.lilac,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  viewMyRewardsText: { fontSize: 14, color: COLORS.lilacDark, fontWeight: '900' },

  secHeader: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5ECFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 20,
  },
  secHeaderText: { fontSize: 14, fontWeight: '700', color: COLORS.lilacDark },

  // Earn rows
  earnRow: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  earnLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, paddingRight: 10 },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeTodo: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeDone: { backgroundColor: '#FFFFFF' },
  badgeTextTodo: { color: '#FFF', fontWeight: '900' },
  badgeTextDone: { color: COLORS.lilacDark, fontWeight: '900' },

  earnLabel: { fontWeight: '700', fontSize: 14, flex: 1, flexWrap: 'wrap' },

  coinPill: {
    backgroundColor: '#8A61E0',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -3,
  },

  // Redeem tickets
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
    left: '68%',
    width: 2,
    borderStyle: 'dashed',
    borderRightWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ticketProvider: { color: COLORS.white, opacity: 0.9, fontSize: 12, fontWeight: '500' },
  ticketTitle: { color: COLORS.white, fontWeight: '700', fontSize: 14, marginTop: 2 },

  pricePill: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  redeemBtn: {
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

  // bottom sheets
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white,
    padding: 30,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheetTitle: { fontSize: 30, fontWeight: '700', color: COLORS.ink, textAlign: 'center', marginBottom: 12 },
  sheetBody: { color: COLORS.sub, marginTop: 4 },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.pill,
    alignItems: 'center',
  },
  sheetBtnPrimary: { backgroundColor: COLORS.lilac },
  sheetBtnLabel: { fontWeight: '700', color: COLORS.sub },
});
