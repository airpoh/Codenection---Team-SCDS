import React from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";

const { width, height } = Dimensions.get("window");
const isTablet = Math.min(width, height) >= 600;

type Props = {
  source: any;       // require("...png")
  label: string;
  x: number;         // 0..1 of screen width (center)
  y: number;         // 0..1 of screen height (center)
  widthDp?: number;  // optional building width override
  onPress?: () => void;
};

export default function BuildingMarker({
  source,
  label,
  x,
  y,
  widthDp,
  onPress,
}: Props) {
  // Base building size
  const imgW = widthDp ?? (isTablet ? width * 0.19 : width * 0.26);

  // Make the pill wider for longer names (fixed font size, no shrinking)
  const len = label.length;
  const pillW =
    len > 16 ? imgW * 1.45 :
    len > 13 ? imgW * 1.30 :
    len > 10 ? imgW * 1.15 :
               imgW * 1.00;

  // Container width is the larger one so both image and pill can stay centered
  const containerW = Math.max(imgW, pillW);
  const left = width * x - containerW / 2;
  const top  = height * y - imgW / 2; // center using image height

  return (
    <Pressable onPress={onPress} style={[styles.wrap, { left, top, width: containerW }]}>
      <Image source={source} style={{ width: imgW, height: imgW }} contentFit="contain" />
      <View style={[styles.pill, { width: pillW }]}>
        <Text style={styles.pillText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", alignItems: "center" },
  pill: {
    height: 30,
    backgroundColor: colors.secondary, // yellow
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  pillText: {
    color: "#2a2a2a",
    fontFamily: fonts.body,
    fontSize: fontSize.body, // 14 — fixed size to match Diary Cabin / Light House
    textAlign: "center",
  },
});
