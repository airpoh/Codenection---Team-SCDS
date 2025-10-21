// src/screens/LoginScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";
import LabeledInput from "../components/LabeledInput";
import PrimaryButton from "../components/PrimaryButton";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../contexts/AuthContext";
import { Image } from "expo-image";

const { height } = Dimensions.get("window");
type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const LOGO = require("../../assets/UniMate.png");

/** ---------- Reward Market shared keys & helpers (per-day stamping) ---------- */
const K = {
  coins: "rm_coins_total",
  todayEarned: "rm_today_earned",
  taskDates: "rm_task_dates", // actionId -> "YYYY-MM-DD"
};

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Award an earn action once per day and mark it as completed for today. */
async function awardEarnOncePerDay(
  actionId: "login" | "add_task" | "add_reminder",
  points: number
) {
  const [coinsStr, earnedStr, mapStr] = await Promise.all([
    AsyncStorage.getItem(K.coins),
    AsyncStorage.getItem(K.todayEarned),
    AsyncStorage.getItem(K.taskDates),
  ]);

  const coins = coinsStr ? Number(coinsStr) : 0;
  const earned = earnedStr ? Number(earnedStr) : 0;
  const map: Record<string, string> = mapStr ? JSON.parse(mapStr) : {};

  const today = todayKey();
  if (map[actionId] === today) return; // already awarded today

  map[actionId] = today;

  await AsyncStorage.multiSet([
    [K.coins, String(coins + points)],
    [K.todayEarned, String(earned + points)],
    [K.taskDates, JSON.stringify(map)],
  ]);
}

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [secure, setSecure] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, pwd: false });

  const emailError = useMemo(() => {
    if (!touched.email) return "";
    if (!email.trim()) return "Email is required";
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.includes('.edu.my');
    if (!email.includes('.edu.my')) return "Please use your university email ending with .edu.my";
    return ok ? "" : "Enter a valid email";
  }, [email, touched.email]);

  const pwdError = useMemo(() => {
    if (!touched.pwd) return "";
    if (pwd.length < 6) return "Minimum 6 characters";
    return "";
  }, [pwd, touched.pwd]);

  const isValid = !emailError && !pwdError && email && pwd;

  const onLogin = async () => {
    if (!isValid || isLoading) {
      setTouched({ email: true, pwd: true });
      return;
    }

    setIsLoading(true);
    try {
      console.log('[LoginScreen] Attempting login via AuthContext...');
      const result = await login({
        email: email.toLowerCase().trim(),
        password: pwd
      });

      console.log('[LoginScreen] Login result:', { success: result.success, error: result.error });

      if (result.success) {
        console.log('[LoginScreen] Login successful, awarding points...');
        // ✅ Earn: Login the app (+5) — once per day
        await awardEarnOncePerDay("login", 5);

        console.log('[LoginScreen] Navigating to Tabs...');
        // Go to Tabs (Island first) and clear history
        navigation.reset({
          index: 0,
          routes: [{ name: "Tabs" }],
        });
      } else {
        console.log('[LoginScreen] Login failed:', result.error);
        Alert.alert("Login Failed", result.error || "Please check your credentials and try again.");
      }
    } catch (error) {
      console.error('[LoginScreen] Login error:', error);
      let errorMessage = "An unexpected error occurred. Please try again.";

      if (error instanceof TypeError && error.message.includes('Network request failed')) {
        errorMessage = "Cannot connect to server. Please check your internet connection and ensure the backend is running.";
      } else if (error instanceof Error) {
        errorMessage = `Connection error: ${error.message}`;
      }

      Alert.alert("Connection Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient colors={[colors.gradientTo, colors.gradientFrom]} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.select({ ios: "padding", android: undefined })}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {/* Header with brand image */}
            <View style={styles.header}>
              <Image source={LOGO} style={styles.logo} contentFit="contain" />
            </View>

            {/* White sheet */}
            <View style={styles.sheet}>
              <Text style={styles.title}>Welcome Back</Text>
              <View style={{ height: 20 }} />

              <LabeledInput
                label="Campus Email"
                placeholder="you@xmu.edu.my"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (!touched.email) setTouched((s) => ({ ...s, email: true }));
                }}
                onBlur={() => setTouched((s) => ({ ...s, email: true }))}
                error={emailError}
                labelStyle={styles.inputLabel}
              />

              <LabeledInput
                label="Password"
                placeholder="••••••••"
                secureToggle
                isSecure={secure}
                onToggleSecure={() => setSecure((s) => !s)}
                value={pwd}
                onChangeText={(t) => {
                  setPwd(t);
                  if (!touched.pwd) setTouched((s) => ({ ...s, pwd: true }));
                }}
                onBlur={() => setTouched((s) => ({ ...s, pwd: true }))}
                error={pwdError}
                labelStyle={styles.inputLabel}
              />

              <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword")}>
                <Text style={styles.forgot}>Forgot Password</Text>
              </TouchableOpacity>

              <View style={{ height: 18 }} />
              {isLoading ? (
                <View style={{
                  width: 140,
                  height: 46,
                  backgroundColor: colors.secondary,
                  borderRadius: 23,
                  alignItems: 'center',
                  justifyContent: 'center',
                  alignSelf: 'center',
                  opacity: 0.7
                }}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              ) : (
                <PrimaryButton
                  title="Login"
                  onPress={onLogin}
                  style={{ alignSelf: "center", width: 140, height: 46, opacity: isValid ? 1 : 0.7 }}
                />
              )}

              <View style={{ marginTop: "auto", alignItems: "center" }}>
                <View style={{ height: 20 }} />
                <Text style={styles.footerText}>
                  Haven’t created account yet?{" "}
                  <Text style={styles.footerLink} onPress={() => navigation.navigate("SignUp")}>
                    Create one
                  </Text>
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const SHEET_RADIUS = 28;
const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { height: height * 0.24, alignItems: "center", justifyContent: "center" },
  logo: { width: 200, height: 200 },
  sheet: {
    flexGrow: 1,
    minHeight: height * 0.66,
    backgroundColor: "#fff",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 20,
  },
  title: { textAlign: "center", fontFamily: fonts.heading, fontSize: 32, fontWeight: 600, color: "#111" },
  inputLabel: { fontSize: 14, fontWeight: 500 },
  forgot: { marginTop: 8, fontFamily: fonts.body, fontSize: fontSize.body, color: "rgba(17,17,17,0.6)" },
  footerText: { fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: "#111", textAlign: "center" },
  footerLink: { color: colors.secondary, fontFamily: fonts.body, fontSize: fontSize.body },
});
