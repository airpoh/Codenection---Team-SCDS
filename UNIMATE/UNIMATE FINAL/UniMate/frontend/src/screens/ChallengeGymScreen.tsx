// src/screens/ChallengeGymScreen.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { apiService } from "../services/api";
import { fonts } from "../theme/typography";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "../../App";

// ---- sizes ---------------------------------------------------------------
const { width } = Dimensions.get("window");
const CARD_W = Math.min(520, width - 40);

// ---- local data (unchanged logic) ----------------------------------------
const initialChallenges = [
  {
    id: "c1",
    title: "DEEP BREATHING",
    subtitle: "Take 1 minute for box breathing",
    duration: 1,
    tokens: 50,
    char: require("../../assets/challenges/challenge1.png"),
  },
  {
    id: "c2",
    title: "GRATITUDE MOMENT",
    subtitle: "Write down 3 things you are grateful for today",
    duration: 2,
    tokens: 60,
    char: require("../../assets/challenges/challenge2.png"),
  },
  {
    id: "c3",
    title: "DESK STRETCH",
    subtitle: "Quick shoulder rolls and neck stretches",
    duration: 2,
    tokens: 40,
    char: require("../../assets/challenges/challenge3.png"),
  },
  {
    id: "c4",
    title: "MINDFUL PAUSE",
    subtitle: "Close your eyes and focus on breath",
    duration: 1,
    tokens: 50,
    char: require("../../assets/challenges/challenge4.png"),
  },
  {
    id: "c5",
    title: "DESK ORGANIZE",
    subtitle: "Clear and organize your study space",
    duration: 2,
    tokens: 50,
    char: require("../../assets/challenges/challenge5.png"),
  },
  {
    id: "c6",
    title: "GOAL SETTING",
    subtitle: "Set 3 priorities for your study session",
    duration: 2,
    tokens: 60,
    char: require("../../assets/challenges/challenge6.png"),
  },
  {
    id: "c7",
    title: "Brain Break Walk",
    subtitle: "Take a 2-minute walk now",
    duration: 2,
    tokens: 70,
    char: require("../../assets/challenges/challenge7.png"),
  },
  {
    id: "c8",
    title: "HYDRATION CHECK",
    subtitle: "Drink a full glass of water right now",
    duration: 1,
    tokens: 30,
    char: require("../../assets/challenges/challenge8.png"),
  },
  {
    id: "c9",
    title: "EYE CARE BREAK",
    subtitle: "Look at something 20 feet far",
    duration: 1,
    tokens: 40,
    char: require("../../assets/challenges/challenge9.png"),
  },
  {
    id: "c10",
    title: "POSTURE RESET",
    subtitle: "Check and adjust your sitting posture",
    duration: 1,
    tokens: 30,
    char: require("../../assets/challenges/challenge10.png"),
  },
];

type Nav = NativeStackNavigationProp<RootStackParamList>;
const LEAVE = require("../../assets/white_leave.png");
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export default function ChallengeGymScreen() {
  const [cardQueue, setCardQueue] = useState(initialChallenges);
  const [completedToday, setCompletedToday] = useState(0);

  const navigation = useNavigation<Nav>();

  // SAFE: Only fetch challenge data, don't modify blockchain operations
  const loadChallengesFromBackend = async () => {
    try {
      const response = await apiService.getChallenges();
      console.log('[ChallengeGym] Backend response:', response);

      if (response.success && response.challenges && response.challenges.length > 0) {
        // Transform backend challenges to frontend format, keep hardcoded as fallback
        const backendChallenges = response.challenges.map((challenge: any, index: number) => ({
          id: challenge.id || challenge.challenge_id,
          title: challenge.title || initialChallenges[index % initialChallenges.length].title,
          subtitle: challenge.subtitle || challenge.description || initialChallenges[index % initialChallenges.length].subtitle,
          duration: challenge.duration_minutes || challenge.duration || initialChallenges[index % initialChallenges.length].duration,
          tokens: challenge.tokens || initialChallenges[index % initialChallenges.length].tokens, // Token rewards
          char: initialChallenges[index % initialChallenges.length].char, // Keep local assets
        }));

        console.log('[ChallengeGym] Loaded', backendChallenges.length, 'challenges from backend');

        // Only update if we have valid data
        if (backendChallenges.length > 0) {
          setCardQueue(backendChallenges);
        }

        // Update completed count from backend
        if (response.completed_today !== undefined) {
          console.log('[ChallengeGym] Completed today from backend:', response.completed_today);
          setCompletedToday(response.completed_today);
        }
      }
    } catch (error) {
      console.log('[ChallengeGym] Failed to load challenges from backend, using fallback:', error);
      // Keep hardcoded challenges as fallback
    }
  };

  // Load today's progress whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          // Load challenges and progress from backend (SAFE: read-only)
          await loadChallengesFromBackend();
          console.log('[ChallengeGym] Screen focused, data loaded from backend');
        } catch (e) {
          console.warn("[ChallengeGym] Error loading data:", e);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [])
  );

  const goIsland = () => {
    // @ts-ignore different navigator types
    navigation.navigate("Tabs", { screen: "Island" });
  };

  const onStart = (id: string, title: string, durationMin = 1) => {
    const durationSec = Math.max(30, Math.round(durationMin * 60));
    navigation.navigate("ChallengeRun", { id, title, durationSec });
  };

  const total = initialChallenges.length;
  const percent = Math.round((completedToday / Math.max(1, total)) * 100);

  // simple ring (no extra libs): two circles + numeric progress
  const ProgressRing = () => (
    <View style={styles.ringOuter}>
      <View style={[styles.ringInner, { opacity: 0.25 }]} />
      <View style={styles.ringInner} />
      <Text style={styles.ringText}>{percent}%</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* top bar */}
      <View style={styles.topbar}>
        <View style={{ width: 28 }} />
        <Text style={{ color: "transparent" }}>.</Text>
        <TouchableOpacity onPress={goIsland} hitSlop={HITSLOP}>
          <Image source={LEAVE} style={{ width: 25, height: 25 }} />
        </TouchableOpacity>
      </View>

      {/* HEADER (gold gradient) */}
      <LinearGradient
        colors={["#5c5b5bff", "#2b2a2bff"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.hTitle}>Daily Challenges</Text>
            <Text style={styles.hSub}>Short boosters: 1–2 minutes each</Text>
          </View>
          <ProgressRing />
        </View>

        <View style={styles.hProgressRow}>
          <View style={styles.hPillTrack}>
            <LinearGradient
              colors={["#ffffffff", "rgba(225, 189, 61, 0.85)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.hPillFill, { width: `${percent}%` }]}
            />
          </View>
          <Text style={styles.hProgressLabel}>
            Today · {completedToday}/{total}
          </Text>
        </View>
      </LinearGradient>

      {/* CARD LIST (stacked, all visible) */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {cardQueue.map((c, idx) => {
          // alternating dark / orange styles similar to the sample
          const isDark = idx % 2 === 0;
          return (
            <LinearGradient
              key={c.id}
              colors={isDark ? ["#95c2e4ff", "#3186a0ff"] : ["#fad273ff", "#eeac29ff"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.card, { width: CARD_W, marginBottom: 16 }]}
            >
              <View style={{ padding: 18, flexDirection: "row", minHeight: 180 }}>
                {/* left text block */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardNo, { color: isDark ? "#ffffffff" : "#1e2020ff" }]}>
                    #{idx + 1}
                  </Text>
                  <Text style={[styles.cardTitle, { color: isDark ? "#fff" : "#1E0A00" }]}>
                    {c.title.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.cardSub,
                      { color: isDark ? "rgba(255,255,255,0.7)" : "rgba(30,10,0,0.75)" },
                    ]}
                    numberOfLines={2}
                  >
                    {c.subtitle}
                  </Text>

                  {/* token + CTA pill row */}
                  <View style={styles.pillsRow}>
                    <View style={[styles.tokenPill, isDark ? styles.tokenPillDark : styles.tokenPillLight]}>
                      <Text style={[styles.tokenText, { color: isDark ? "#fff" : "#1E0A00" }]}>
                        {c.tokens} Token{c.tokens !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => onStart(c.id, c.title, c.duration)}
                      style={[styles.ctaPill, isDark ? styles.ctaDark : styles.ctaLight]}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.ctaText}>Challenge!</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* character art */}
                <Image source={c.char} style={styles.char} resizeMode="contain" />
              </View>
            </LinearGradient>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#222222ff" },

  // top bar
  topbar: {
    paddingTop: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // header styles
  headerCard: {
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: 20,
    borderRadius: 22,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  hTitle: { fontFamily: fonts.heading, fontWeight: '800', fontSize: 25, color: "#f6f0f0ff" },
  hSub: { marginTop: 4, fontFamily: fonts.body, fontSize: 14, color: "rgba(255, 255, 255, 0.75)" },

  ringOuter: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  ringInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 33,
    borderColor: "rgba(255, 255, 255, 0.69)",
    borderWidth: 3,
  },
  ringText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', color: "rgba(255, 255, 255, 0.69)" },

  hProgressRow: { marginTop: 14 },
  hPillTrack: {
    width: "100%",
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.69)",
    borderRadius: 999,
  },
  hPillFill: {
    height: "100%",
    borderRadius: 999,
  },
  hProgressLabel: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.69)",
  },

  // cards
  card: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    alignSelf: "center",
  },
  cardNo: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '700', marginTop: 4 },
  cardSub: { fontFamily: fonts.body, fontSize: 14, marginTop: 4 },

  pillsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  tokenPill: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  tokenPillDark: { backgroundColor: "#1F2937" },
  tokenPillLight: { backgroundColor: "rgba(255,255,255,0.9)" },
  tokenText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: 500 },

  ctaPill: {
    backgroundColor: "#fff",
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  ctaDark: { backgroundColor: "#d9dee6ff" },
  ctaLight: { backgroundColor: "rgba(63, 61, 56, 0.9)" },
  ctaText: { fontFamily: fonts.heading, fontWeight: '700', fontSize: 14, color: "#FFA41D" },

  char: { width: 84, height: 120, alignSelf: "flex-start" },
});
