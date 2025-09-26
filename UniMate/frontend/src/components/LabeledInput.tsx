import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Pressable,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";

type Props = TextInputProps & {
  label: string;
  secureToggle?: boolean;
  isSecure?: boolean;
  onToggleSecure?: () => void;
  error?: string;
};

export default function LabeledInput({
  label,
  secureToggle,
  isSecure,
  onToggleSecure,
  error,
  style,
  ...rest
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor="rgba(17,17,17,0.45)"
          style={[styles.input, style]}
          secureTextEntry={secureToggle ? isSecure : false}
          {...rest}
        />

        {secureToggle && (
          <Pressable accessibilityRole="button" onPress={onToggleSecure} style={styles.eye}>
            <MaterialCommunityIcons
              name={isSecure ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.textBlack}
            />
          </Pressable>
        )}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginBottom: 16 },
  label: {
    fontFamily: fonts.body,
    fontSize: fontSize.tiny,
    color: colors.textBlack,
    opacity: 0.9,
    marginBottom: 8,
  },
  inputWrap: { position: "relative", width: "100%" },
  input: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: colors.textBlack,
    backgroundColor: "rgba(227,180,106,0.25)", // soft yellow
  },
  eye: {
    position: "absolute",
    right: 14,
    top: 12,
    height: 24,
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    marginTop: 6,
    color: "#B00020",
    fontFamily: fonts.body,
    fontSize: 12,
  },
});
