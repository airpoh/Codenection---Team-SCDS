import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";

type Props = {
  title: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export default function PrimaryButton({ title, onPress, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.88 : 1 }, style]}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.secondary,
    height: 48,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  label: {
    color: colors.textWhite,
    fontSize: fontSize.body,
    fontFamily: fonts.body,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
