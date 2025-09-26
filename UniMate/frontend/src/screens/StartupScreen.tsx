// src/screens/StartupScreen.tsx
import React from "react";
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import PrimaryButton from "../components/PrimaryButton";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { fonts, fontSize } from "../theme/typography";
import { Image } from "expo-image";

const { height } = Dimensions.get("window");
const HERO = require("../../assets/stickers/unimate-sticker.gif"); // your gif or image

type Props = NativeStackScreenProps<RootStackParamList, "Startup">;

export default function StartupScreen({ navigation }: Props) {
  return (
    <LinearGradient
      colors={[colors.gradientFrom, colors.gradientTo]}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <View style={styles.container}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>
              <Text style={styles.brandUni}>Uni</Text>
              <Text style={styles.brandMate}>Mate</Text>
            </Text>
            <Text style={styles.subtitle}>Your Campus Life Assistant</Text>
          </View>

          <View style={styles.heroWrap}>
            <Image source={HERO} style={styles.hero} contentFit="contain" />
          </View>

          <View style={styles.bottomBlock}>
            <Text style={styles.welcome}>👋 Welcome!</Text>
            <Text style={styles.caption}>
              Please log in with your Campus account to continue
            </Text>

            <PrimaryButton
              title="Login"
              onPress={() => navigation.navigate("Login")}
              style={{ width: 180, marginTop: 14 }}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate("SignUp")}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.secondary}>No account?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flex: 1,
    alignItems: "center",
  },
  brandBlock: {
    marginTop: height * 0.06,
    alignItems: "center",
  },
  brand: {
    fontSize: fontSize.heading, // 36
    fontFamily: fonts.heading, // Poppins Medium
    letterSpacing: 0.5,
  },
  brandUni: {
    color: colors.secondary, // Yellow
  },
  brandMate: {
    color: colors.primary, // Purple
  },
  subtitle: {
    marginTop: 6,
    fontSize: fontSize.subtitle,
    fontFamily: fonts.body,
    color: colors.textBlack,
    opacity: 0.7,
  },
  heroWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  hero: {
    width: 280,
    height: 280,
  },
  bottomBlock: {
    width: "86%",
    alignItems: "center",
    paddingBottom: 24,
  },
  welcome: {
    fontSize: fontSize.body,
    fontFamily: fonts.body,
    color: colors.textBlack,
    marginBottom: 4,
    fontWeight: "600",
  },
  caption: {
    textAlign: "center",
    color: colors.textBlack,
    opacity: 0.65,
    fontSize: fontSize.body,
    lineHeight: 18,
    marginBottom: 14,
    fontFamily: fonts.body,
  },
  secondary: {
    marginTop: 12,
    fontSize: 10,
    color: colors.textBlack,
    opacity: 0.55,
    fontFamily: fonts.body,
  },
});
