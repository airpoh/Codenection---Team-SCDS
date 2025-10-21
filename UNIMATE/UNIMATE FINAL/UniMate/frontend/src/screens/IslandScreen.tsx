// src/screens/IslandScreen.tsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { fonts } from "../theme/typography";
import BuildingSheet from "../components/BuildingSheet";

import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootStackParamList } from "../../App";
import type { TabParamList } from "../navigation/MainTabs";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { apiService } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

// ✅ SVG for a true radial gradient background
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from "react-native-svg";

const { width: W, height: H } = Dimensions.get("window");

// Reference dimensions (iPhone 13 Pro Max)
const REFERENCE_WIDTH = 428;
const REFERENCE_HEIGHT = 926;

// Calculate uniform scale factor based on screen width
// This ensures proportional scaling across all devices
const SCALE = W / REFERENCE_WIDTH;

// assets
const ISLAND = require("../../assets/island/Island.png");
const COIN = require("../../assets/ui/coin.png");
const LIBRARY = require("../../assets/buildings/wellness_library.png");
const LIGHTHOUSE = require("../../assets/buildings/lighthouse.png");
const GYM = require("../../assets/buildings/challenge_gym.png");
const CAFE = require("../../assets/buildings/community_cafe.png");
const DIARY = require("../../assets/buildings/dairy_cabin.png");
const REWARD = require("../../assets/buildings/reward_market.png");
const MEDITATION = require("../../assets/buildings/mediation_store.png");

// Centered full-screen birds GIF overlay
const BIRDS_GIF = require("../../assets/island/bird.gif");

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Island">,
  NativeStackScreenProps<RootStackParamList>
>;

type BuildingKey =
  | "library"
  | "lighthouse"
  | "gym"
  | "cafe"
  | "diary"
  | "reward"
  | "meditation";

type Placement = {
  key: BuildingKey;
  src: any;
  left: number;  // absolute pixels from left (on reference device)
  top: number;   // absolute pixels from top (on reference device)
  width: number; // absolute pixels width (on reference device)
};

// Base positions in ABSOLUTE PIXELS tuned to iPhone 13 Pro Max (428x926)
// These will be scaled proportionally for other devices
const BASE_PLACEMENTS: Placement[] = [
  { key: "library", src: LIBRARY, left: -60, top: 240, width: 390 },
  { key: "lighthouse", src: LIGHTHOUSE, left: 220, top: 250, width: 160 },
  { key: "gym", src: GYM, left: 0, top: 460, width: 170 },
  { key: "cafe", src: CAFE, left: 290, top: 395, width: 140 },
  { key: "diary", src: DIARY, left: 290, top: 550, width: 150 },
  { key: "reward", src: REWARD, left: 60, top: 540, width: 180 },
  { key: "meditation", src: MEDITATION, left: 135, top: 420, width: 150 },
];

// Apply uniform scaling to all placements
const PLACEMENTS: Placement[] = BASE_PLACEMENTS.map((p) => ({
  key: p.key,
  src: p.src,
  left: p.left * SCALE,
  top: p.top * SCALE,
  width: p.width * SCALE,
}));

const GIF_INTERVAL_MS = 15000; // how often it shows
const GIF_VISIBLE_MS = 6000;   // how long it stays visible

function OceanRadial() {
  return (
    <Svg style={StyleSheet.absoluteFill} width={W} height={H}>
      <Defs>
        <SvgRadialGradient id="ocean" cx="0.30" cy="0.22" r="1.05">
          <Stop offset="0" stopColor="#C4EAF8" />
          <Stop offset="0.45" stopColor="#44a0be" />
          <Stop offset="1" stopColor="#44a0be" />
        </SvgRadialGradient>
      </Defs>
      <Rect x="0" y="0" width={W} height={H} fill="url(#ocean)" />
    </Svg>
  );
}

export default function IslandScreen({ navigation }: Props) {
  const [coins, setCoins] = useState<number>(0);
  const [active, setActive] = useState<BuildingKey | null>(null);
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();

  // —— centered GIF overlay (fade in/out) ——
  const [showGif, setShowGif] = useState(false);
  const gifOpacity = useRef(new Animated.Value(0)).current;

  const playGifOnce = useCallback(() => {
    setShowGif(true);
    gifOpacity.setValue(0);
    Animated.timing(gifOpacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(gifOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setShowGif(false));
      }, GIF_VISIBLE_MS);
    });
  }, [gifOpacity]);

  useEffect(() => {
    const first = setTimeout(() => playGifOnce(), 1200);
    const id = setInterval(() => playGifOnce(), GIF_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      gifOpacity.stopAnimation();
    };
  }, [playGifOnce, gifOpacity]);

  // — bottom sheet content —
  const sheet = useMemo(() => {
    switch (active) {
      case "library":
        return {
          title: "Wellness Library",
          desc: "Explore mental health assessments, educational resources, and personalized wellness recommendations.",
          enter: false,
        };
      case "lighthouse":
        return {
          title: "Light House",
          desc: "Crisis info, SOS shortcuts, and calming resources when you need them most.",
          enter: true,
        };
      case "gym":
        return {
          title: "Challenge Gym",
          desc: "Bite-size reset games and focus challenges (earn coins).",
          enter: true,
        };
      case "cafe":
        return {
          title: "Community Cafe",
          desc: "Find your friends: Encourage Wall, peer groups, streaks.",
          enter: false,
        };
      case "diary":
        return {
          title: "Diary Cabin",
          desc: "Quick mood + note, voice-to-text, weekly trends.",
          enter: false,
        };
      case "reward":
        return {
          title: "Reward Market",
          desc: "Trade coins for café vouchers, gym passes, study perks.",
          enter: true,
        };
      case "meditation":
        return {
          title: "Meditation Store",
          desc: "Guided meditations and ambient soundscapes.",
          enter: false,
        };
      default:
        return null;
    }
  }, [active]);

  const loadCoins = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const response = await apiService.getUserPoints();
        if (response.success && response.points) {
          setCoins(response.points.total_points || 0);
          console.log('[IslandScreen] Loaded coins from backend:', response.points.total_points);
        } else {
          setCoins(0);
        }
      } catch (error) {
        console.log('[IslandScreen] Failed to load coins:', error);
        setCoins(0);
      }
    } else {
      setCoins(0);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadCoins();
  }, [loadCoins]);

  useFocusEffect(
    useCallback(() => {
      loadCoins();
    }, [loadCoins])
  );

  const onEnter = () => {
    const parent = navigation.getParent?.();
    if (active === "lighthouse")
      parent ? parent.navigate("Lighthouse") : navigation.navigate("Lighthouse");
    if (active === "reward")
      parent ? parent.navigate("RewardMarket") : navigation.navigate("RewardMarket");
    if (active === "gym")
      parent ? parent.navigate("ChallengeGym") : navigation.navigate("ChallengeGym");
    setActive(null);
  };

  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.fill}>
        <OceanRadial />

        {/* Full-bleed island art that fits every screen */}
        <Image
          source={ISLAND}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          contentPosition="center"
        />

        {/* Coins HUD */}
        <View
          style={[
            styles.hud,
            {
              top: Math.max(insets.top + 8, 12),
              right: 16,
            },
          ]}
          pointerEvents="none"
        >
          <Image source={COIN} style={styles.coin} contentFit="contain" />
          <Text style={styles.hudText}>{coins.toLocaleString()}</Text>
        </View>

        {/* Buildings (no title tags) */}
        {PLACEMENTS.map((p) => {
          return (
            <TouchableOpacity
              key={p.key}
              activeOpacity={0.85}
              onPress={() => setActive(p.key)}
              style={[
                styles.marker,
                {
                  left: p.left,
                  top: p.top,
                  width: p.width,
                },
              ]}
            >
              <Image
                source={p.src}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />
            </TouchableOpacity>
          );
        })}

        {/* Centered full-screen GIF overlay (appears every 15s) */}
        {showGif && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.gifLayer, { opacity: gifOpacity }]}
          >
            <Image
              source={BIRDS_GIF}
              style={{ width: W, height: H * 0.3, top: -H * 0.2 }}
              contentFit="cover"
            />
          </Animated.View>
        )}

        {sheet && (
          <BuildingSheet
            visible={!!active}
            title={sheet.title}
            description={sheet.desc}
            canEnter={sheet.enter}
            onEnter={onEnter}
            onClose={() => setActive(null)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#6097C4" },
  marker: {
    position: "absolute",
    height: undefined,
    aspectRatio: 1.8,
    zIndex: 5,
  },
  hud: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 50,
  },
  coin: { width: 30, height: 30 },
  hudText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: 600,
    fontFamily: fonts.heading,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  gifLayer: {
    justifyContent: "center",
    alignItems: "center",
    zIndex: 40, // below HUD, above buildings
  },
});
