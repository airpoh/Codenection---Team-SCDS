// src/screens/ChallengeRunScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CompletionModal from "../components/CompletionModal";
import { apiService } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const { width, height } = Dimensions.get("window");
const SIZE = Math.min(width, height) * 0.48;

type RouteParams = { id: string; title?: string; durationSec?: number };

// ------ Reward Market keys (same as other screens) ------
const K = {
  coins: "rm_coins_total",
  todayEarned: "rm_today_earned",
  taskDates: "rm_task_dates", // actionId -> "YYYY-MM-DD"
  // For Challenge Gym daily progress (today only)
  challengesToday: "completedChallenges_today", // { date: 'YYYY-MM-DD', items: string[] }
  // Legacy total list (kept for backwards-compat)
  challengesAll: "completedChallenges",
};

const todayKey = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

// Award an action once per day and bump coins/todayEarned
async function awardOncePerDay(actionId: "complete_1_challenge" | "complete_3_challenges", points: number) {
  try {
    const [coinsStr, earnedStr, mapStr] = await Promise.all([
      AsyncStorage.getItem(K.coins),
      AsyncStorage.getItem(K.todayEarned),
      AsyncStorage.getItem(K.taskDates),
    ]);

    const coins = coinsStr ? Number(coinsStr) : 0;
    const earned = earnedStr ? Number(earnedStr) : 0;
    const map: Record<string, string> = mapStr ? JSON.parse(mapStr) : {};

    const today = todayKey();
    if (map[actionId] === today) return; // already granted today

    map[actionId] = today;

    await AsyncStorage.multiSet([
      [K.coins, String(coins + points)],
      [K.todayEarned, String(earned + points)],
      [K.taskDates, JSON.stringify(map)],
    ]);
  } catch (e) {
    console.warn(`Failed to award ${actionId}:`, e);
  }
}

export default function ChallengeRunScreen({ route, navigation }: any) {
  const { id, title = "Challenge", durationSec = 60 } = route.params as RouteParams;
  const { isAuthenticated } = useAuth();

  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(durationSec);
  const [progress, setProgress] = useState(0);
  const [showComplete, setShowComplete] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
    if (running) return;

    // Call backend to start challenge
    if (isAuthenticated) {
      try {
        const result = await apiService.startChallenge(id);
        if (!result.success) {
          // If challenge is already completed or in progress, show alert and stop
          const errorMsg = result.error || '';
          if (errorMsg.includes('already completed') || errorMsg.includes('already in progress')) {
            console.log('Challenge cannot be started:', result.error);
            alert(result.error || 'This challenge cannot be started');
            return; // ✅ Stop timer from starting
          }

          // For other errors (network issues), continue anyway for offline support
          console.warn('Backend error, continuing with offline mode:', result.error);
        }
      } catch (e) {
        console.warn('Network error starting challenge, continuing with offline mode:', e);
        // Network error - continue anyway for offline support
      }
    }

    setRunning(true);
    setSecondsLeft(durationSec);
    setProgress(0);

    const started = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const left = Math.max(0, durationSec - elapsed);
      const p = Math.min(1, elapsed / durationSec);
      setSecondsLeft(left);
      setProgress(p);

      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setRunning(false);
        setProgress(1);
        setTimeout(() => setShowComplete(true), 300);
      }
    }, 250) as unknown as number;
  };

  // After finishing → record today's completion + award coins once-per-day
  const onClaim = async () => {
    // Call backend to complete challenge
    if (isAuthenticated) {
      try {
        const result = await apiService.completeChallenge(id, durationSec);
        if (!result.success) {
          console.error('Failed to complete challenge on backend:', result.error);
          // Continue with local tracking anyway
        } else {
          console.log('✅ Challenge completed successfully on backend!', result);
        }
      } catch (e) {
        console.error('Error completing challenge on backend:', e);
        // Continue with local tracking anyway
      }
    }

    // Keep local AsyncStorage tracking for offline support
    try {
      // 1) Maintain legacy "all-time" list
      const rawAll = await AsyncStorage.getItem(K.challengesAll);
      const all: string[] = rawAll ? JSON.parse(rawAll) : [];
      if (!all.includes(id)) all.push(id);
      await AsyncStorage.setItem(K.challengesAll, JSON.stringify(all));

      // 2) Track today's list in a single object
      const rawToday = await AsyncStorage.getItem(K.challengesToday);
      const today = todayKey();
      let todayObj: { date: string; items: string[] } = rawToday ? JSON.parse(rawToday) : { date: today, items: [] };
      if (todayObj.date !== today) todayObj = { date: today, items: [] };
      if (!todayObj.items.includes(id)) todayObj.items.push(id);
      await AsyncStorage.setItem(K.challengesToday, JSON.stringify(todayObj));

      // 3) Award per-day coins based on today's count
      const count = todayObj.items.length;
      if (count >= 1) await awardOncePerDay("complete_1_challenge", 5);
      if (count >= 3) await awardOncePerDay("complete_3_challenges", 10);
    } catch (e) {
      console.warn("Challenge award error", e);
    }

    setShowComplete(false);
    navigation.goBack();
  };

  const onBackFromModal = () => {
    setShowComplete(false);
    navigation.goBack();
  };

  const radius = SIZE / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar hidden />
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>

        <View style={{ height: 20 }} />

        <View style={styles.circleWrap}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth={8} fill="transparent" />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={radius}
              stroke="#FFFFFF"
              strokeWidth={8}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>

          <View style={styles.counter}>
            <Text style={styles.counterText}>{secondsLeft}</Text>
            <Text style={styles.counterLabel}>seconds</Text>
          </View>
        </View>

        <View style={{ height: 28 }} />

        <TouchableOpacity onPress={start} disabled={running} style={[styles.startBtn, running ? { opacity: 0.6 } : {}]}>
          <Text style={styles.startText}>{running ? "Running…" : "Start"}</Text>
        </TouchableOpacity>
      </View>

      <CompletionModal visible={showComplete} title="Well done!" onClaim={onClaim} onClose={onBackFromModal} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#0B0B0B" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, marginBottom: 4, fontWeight: "600" },
  circleWrap: { alignItems: "center", justifyContent: "center", position: "relative" },
  counter: { position: "absolute", width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  counterText: { fontSize: 44, color: "#fff", fontWeight: "700" },
  counterLabel: { color: "rgba(255,255,255,0.6)", marginTop: 6 },
  startBtn: { backgroundColor: "#fff", paddingVertical: 12, paddingHorizontal: 38, borderRadius: 12 },
  startText: { fontSize: 16, color: "#111", fontWeight: "700" },
});
