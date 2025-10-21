// src/components/ChallengeCard.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ImageSourcePropType,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, fontSize } from "../theme/typography";
import { colors } from "../theme/colors";

type Props = {
  id?: string;
  title: string;
  subtitle?: string;
  duration?: string;
  characterSrc?: ImageSourcePropType;
  backgroundSrc?: ImageSourcePropType;
  completed?: boolean;
  onToggle?: (id?: string) => void;
  onPress?: () => void;
  onStart?: () => void;
  width?: number;
  cardHeight?: number;
};

export default function ChallengeCard({
  id,
  title,
  subtitle,
  duration,
  characterSrc,
  backgroundSrc,
  completed,
  onToggle,
  onPress,
  onStart,
  width = 360,
  cardHeight = 200,
}: Props) {
  const handleStartPress = () => {
    if (typeof onStart === "function") return onStart();
    if (typeof onPress === "function") return onPress();
    if (typeof onToggle === "function") return onToggle(id);
  };

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onPress}>
      <View style={[styles.card, { width, height: cardHeight }]}>
        {/* stronger background image (less transparent than before) */}
        {backgroundSrc && (
          <Image
            source={backgroundSrc}
            style={[styles.bgImg]}
            resizeMode="cover"
          />
        )}

        {/* soft overlay */}
        <LinearGradient
          colors={["rgba(255,255,255,0.76)", "rgba(255,255,255,0.60)"]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.content}>
          <View style={styles.left}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}

            <View style={styles.metaRow}>
              <View style={styles.durationPill}>
                <Text style={styles.durationText}>{duration ?? "1 min"}</Text>
              </View>

              <TouchableOpacity
                onPress={handleStartPress}
                style={[styles.actionBtn, completed ? styles.doneBtn : styles.doBtn]}
              >
                <Text style={[styles.actionBtnText]}>{completed ? "Done" : "Start"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.right}>
            {characterSrc && (
              <Image source={characterSrc} style={styles.charImg} resizeMode="contain" />
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#fff",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    position: "relative",
  },
  bgImg: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    opacity: 0.34,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    padding: 18,
    alignItems: "center",
  },
  left: {
    flex: 1,
    paddingRight: 12,
  },
  right: {
    width: 150,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: "#111",
    marginBottom: 6,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(0,0,0,0.65)",
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  durationPill: {
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  durationText: { fontFamily: fonts.body, fontSize: 12, color: "#222" },

  actionBtn: {
    marginLeft: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  doBtn: {
    backgroundColor: colors.primary,
  },
  doneBtn: { backgroundColor: "#4CAF50" },
  actionBtnText: { fontFamily: fonts.body, color: "#fff", fontSize: 13 },

  charImg: {
    width: 140,
    height: 140,
    transform: [{ translateY: 6 }],
  },
});
