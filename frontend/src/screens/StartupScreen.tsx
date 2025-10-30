// src/screens/StartupScreen.tsx
import React from "react";
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import PrimaryButton from "../components/PrimaryButton";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { fonts, fontSize } from "../theme/typography";
import { Image } from "expo-image";

const { height } = Dimensions.get("window");

// assets
const HERO = require("../../assets/stickers/unimate-sticker.gif");
const LOGO = require("../../assets/UniMate.png");

type Props = NativeStackScreenProps<RootStackParamList, "Startup">;

export default function StartupScreen({ navigation }: Props) {
  return (
    <LinearGradient
      colors={[colors.gradientFrom, colors.gradientTo]}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.container} bounces={false}>
          {/* Brand / Title */}
          <View style={styles.brandBlock}>
            <Image source={LOGO} style={styles.brandLogo} contentFit="contain" />
            <Text style={styles.subtitle}>Your Campus Life Assistant</Text>
          </View>

          {/* Mascot / Hero */}
          <View style={styles.heroWrap}>
            <Image source={HERO} style={styles.hero} contentFit="contain" />
          </View>

          {/* CTA */}
          <View style={styles.bottomBlock}>
            <Text style={styles.welcome}>👋 Welcome!</Text>
            <Text style={styles.caption}>
              Log in with your Campus account to continue
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
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flexGrow: 1,
    alignItems: "center",
    minHeight: height,
  },
  brandBlock: {
    marginTop: height * 0.02,
    alignItems: "center",
  },
  brandLogo: {
    width: 200,
    height: 200,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: "500",
    fontFamily: fonts.body, // ensure theme body font
    color: "#111",
    opacity: 0.7,
    textAlign: "center"
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
    paddingBottom: 40,
  },
  welcome: {
    fontSize: 20,
    fontFamily: fonts.body, // theme font
    color: colors.textBlack,
    marginBottom: 20,
    fontWeight: "600",
  },
  caption: {
    textAlign: "center",
    color: "#111",
    opacity: 0.65,
    fontSize: fontSize.body,
    fontWeight: "500",
    lineHeight: 20,
    marginBottom: 12,
    fontFamily: fonts.body, // theme font
  },
  secondary: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "600",
    color: colors.primaryDark,
    opacity: 0.55,
    fontFamily: fonts.body, // theme font
  },
});
