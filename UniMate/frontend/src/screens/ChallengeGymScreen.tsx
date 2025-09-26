// src/screens/ChallengeGymScreen.tsx
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { PanGestureHandler, PanGestureHandlerGestureEvent } from "react-native-gesture-handler";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ChallengeCard from "../components/ChallengeCard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiService } from "../services/api";
import { authService } from "../services/auth";
import { fonts } from "../theme/typography";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "../../App";

const { width, height } = Dimensions.get("window");
const CARD_WIDTH = Math.min(520, width - 40);
const CARD_HEIGHT = 220;

const HEADER_TOTAL_HEIGHT = 240;
const HEADER_CARD_HEIGHT = 160;
const HEADER_TOP_PADDING = 24;

const initialChallenges = [
  {
    id: "c1",
    title: "Calm Breath Reset",
    subtitle: "Box breathing — settle your mind",
    duration: 1,
    char: require("../../assets/challenges/challenge1/character1.png"),
    bg: require("../../assets/challenges/challenge1/background1.png"),
  },
  {
    id: "c2",
    title: "Mini Cardio Boost",
    subtitle: "Quick moves to lift your mood",
    duration: 2,
    char: require("../../assets/challenges/challenge2/character2.png"),
    bg: require("../../assets/challenges/challenge2/background2.png"),
  },
  {
    id: "c3",
    title: "Gentle Stretch Flow",
    subtitle: "Loosen shoulders & neck",
    duration: 1,
    char: require("../../assets/challenges/challenge3/character3.png"),
    bg: require("../../assets/challenges/challenge3/background3.png"),
  },
];

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const LEAVE = require("../../assets/leave.png");
const K = { challengesToday: "completedChallenges_today" };

export default function ChallengeGymScreen() {
  const [cardQueue, setCardQueue] = useState(initialChallenges);
  const [completedToday, setCompletedToday] = useState(0);

  // SAFE: Only fetch challenge data, don't modify blockchain operations
  const loadChallengesFromBackend = async () => {
    try {
      const token = await authService.getAccessToken();
      if (token) {
        const response = await apiService.getDailyChallenges(token);
        if (response.success && response.challenges && response.challenges.length > 0) {
          // Transform backend challenges to frontend format, keep hardcoded as fallback
          const backendChallenges = response.challenges.map((challenge: any, index: number) => ({
            id: challenge.id || challenge.challenge_id,
            title: challenge.title || initialChallenges[index % initialChallenges.length].title,
            subtitle: challenge.subtitle || challenge.description || initialChallenges[index % initialChallenges.length].subtitle,
            duration: challenge.duration_minutes || challenge.duration || initialChallenges[index % initialChallenges.length].duration,
            char: initialChallenges[index % initialChallenges.length].char, // Keep local assets
            bg: initialChallenges[index % initialChallenges.length].bg, // Keep local assets
          }));

          // Only update if we have valid data
          if (backendChallenges.length > 0) {
            setCardQueue(backendChallenges);
          }
        }
      }
    } catch (error) {
      console.log('Failed to load challenges from backend, using fallback:', error);
      // Keep hardcoded challenges as fallback - no change to blockchain operations
    }
  };

  const translateY = useSharedValue(0);
  const navigation = useNavigation<NavProp>();

  // Load today's progress whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          // Load challenges from backend first (SAFE: read-only)
          await loadChallengesFromBackend();

          // Load local progress
          const raw = await AsyncStorage.getItem(K.challengesToday);
          const obj: { date?: string; items?: string[] } = raw ? JSON.parse(raw) : {};
          const items = Array.isArray(obj.items) ? obj.items : [];
          if (mounted) setCompletedToday(items.length);
        } catch (e) {
          console.warn("read completedToday error", e);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [])
  );

  const goIsland = () => {
    // @ts-ignore allow different typings
    navigation.navigate("Tabs", { screen: "Island" });
  };

  const onGestureEvent = (e: PanGestureHandlerGestureEvent) => {
    translateY.value = e.nativeEvent.translationY;
  };

  const onEnd = () => {
    if (translateY.value > 140) {
      translateY.value = withTiming(height, { duration: 260 }, () => {
        runOnJS(reorderCards)();
        translateY.value = 0;
      });
    } else {
      translateY.value = withTiming(0, { duration: 260 });
    }
  };

  const reorderCards = () => {
    setCardQueue((prev) => {
      const copy = [...prev];
      const first = copy.shift();
      if (first) copy.push(first);
      return copy;
    });
  };

  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const onStart = (id: string, title: string, durationMin = 1) => {
    const durationSec = Math.max(30, Math.round(durationMin * 60));
    navigation.navigate("ChallengeRun", { id, title, durationSec });
  };

  const total = initialChallenges.length;
  const percent = Math.round((completedToday / Math.max(1, total)) * 100);

  return (
    <SafeAreaView style={styles.container}>
      {/* TOP BAR */}
      <View style={styles.headerBar}>
        <View style={{ width: 28 }} />
        <Text style={styles.headerTitle}> </Text>
        <TouchableOpacity onPress={goIsland} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Image source={LEAVE} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
      </View>

      {/* Decorative gradient */}
      <LinearGradient
        colors={["#FFF7ED", "#F7F0FF", "#F0E6FF"]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bgGradient, { height: HEADER_TOTAL_HEIGHT }]}
        pointerEvents="none"
      >
        <View style={styles.orangeGlowWrapper} pointerEvents="none">
          <LinearGradient
            colors={["rgba(227,180,106,0.28)", "rgba(226,213,238,0.10)"]}
            style={styles.orangeGlow}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
      </LinearGradient>

      {/* Header area */}
      <View style={{ height: HEADER_TOTAL_HEIGHT, paddingHorizontal: 18, paddingTop: HEADER_TOP_PADDING }}>
        <View style={[styles.headerCard, { height: HEADER_CARD_HEIGHT }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitleText}>Daily Challenges</Text>
              <Text style={styles.headerSubtitle}>Short boosters — 1–2 minutes each</Text>
            </View>

            <View style={styles.badgeWrap}>
              <View style={styles.badgeInner}>
                <Text style={styles.badgePercent}>{percent}%</Text>
              </View>
              <Text style={styles.badgeLabel}>Today</Text>
            </View>
          </View>

          {/* Progress */}
          <View style={styles.progressArea}>
            <View style={styles.progressLeft}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressSmall}>
                {completedToday}/{total} done
              </Text>
            </View>

            <View style={[styles.progressBarWrap, { overflow: "visible", paddingVertical: 6, paddingRight: 16 }]}>
              <View style={styles.progressTrack} />
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${percent}%` }]}
              />
              <View style={styles.progressHud}>
                <Text style={styles.hudIcon}>✨</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Deck */}
      <View style={styles.deck}>
        {cardQueue
          .map((item, i) => {
            const isTop = i === 0;
            const wrapperStyle: any = [styles.cardWrapper, { top: i * 12, zIndex: cardQueue.length - i }];
            if (isTop) wrapperStyle.push(topStyle);

            return (
              <PanGestureHandler key={item.id} enabled={isTop} onGestureEvent={onGestureEvent} onEnded={onEnd}>
                <Animated.View style={wrapperStyle}>
                  <ChallengeCard
                    id={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    duration={`${item.duration} min`}
                    characterSrc={item.char}
                    backgroundSrc={item.bg}
                    width={CARD_WIDTH}
                    cardHeight={CARD_HEIGHT}
                    onStart={() => onStart(item.id, item.title, item.duration)}
                  />
                </Animated.View>
              </PanGestureHandler>
            );
          })
          .reverse()}
      </View>

      {/* Brand */}
      <View style={styles.logoWrap}>
        <Text style={styles.brand}>
          <Text style={styles.brandUni}>Uni</Text>
          <Text style={styles.brandMate}>Mate</Text>
        </Text>
        <Text style={styles.logoTag}>Your Campus Life Assistant</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FBFAFF" },
  headerBar: {
    paddingTop: 6,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 30,
  },
  headerTitle: { color: "transparent" },

  bgGradient: { position: "absolute", left: 0, right: 0, top: 0 },
  orangeGlowWrapper: { position: "absolute", left: -40, right: -40, top: 20, height: 200, alignItems: "center" },
  orangeGlow: { width: "120%", height: "100%", borderRadius: 28, transform: [{ scaleX: 1.12 }] },

  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerTitleText: { fontFamily: fonts.heading, fontSize: 20, color: "#111" },
  headerSubtitle: { marginTop: 6, fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.6)" },

  badgeWrap: { alignItems: "center", justifyContent: "center" },
  badgeInner: {
    backgroundColor: colors.primary,
    width: 64,
    height: 64,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  badgePercent: { color: "#fff", fontFamily: fonts.heading, fontSize: 18 },
  badgeLabel: { marginTop: 6, fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.55)" },

  progressArea: { marginTop: 12, flexDirection: "row", alignItems: "center" },
  progressLeft: { width: 120 },
  progressLabel: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.6)" },
  progressSmall: { fontFamily: fonts.heading, fontSize: 14, marginTop: 4, color: "#111" },

  progressBarWrap: { flex: 1, height: 36, borderRadius: 14, marginLeft: 12, justifyContent: "center", position: "relative", backgroundColor: "transparent" },
  progressTrack: { position: "absolute", left: 8, right: 8, height: 12, top: 12, backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 10, alignSelf: "center" },
  progressFill: { position: "absolute", left: 8, top: 12, height: 12, borderRadius: 10 },
  progressHud: { position: "absolute", right: 12, top: 6, backgroundColor: "#fff", padding: 6, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 4 },
  hudIcon: { fontSize: 14 },

  deck: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 28 },
  cardWrapper: { position: "absolute", width: CARD_WIDTH, height: CARD_HEIGHT },

  logoWrap: { position: "absolute", bottom: 18, left: 0, right: 0, alignItems: "center" },
  brand: { fontSize: 22, fontFamily: fonts.heading, letterSpacing: 0.5 },
  brandUni: { color: colors.secondary },
  brandMate: { color: colors.primary },
  logoTag: { marginTop: 6, fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.55)" },
});
