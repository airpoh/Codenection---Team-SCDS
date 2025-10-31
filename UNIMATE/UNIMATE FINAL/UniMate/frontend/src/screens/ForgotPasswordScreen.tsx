// src/screens/ForgotPasswordScreen.tsx
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
import { apiService } from "../services/api";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";

const { height } = Dimensions.get("window");
type Props = NativeStackScreenProps<RootStackParamList, "ForgotPassword">;

const LOGO = require("../../assets/UniMate.png");

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError = useMemo(() => {
    if (!touched) return "";
    if (!email.trim()) return "Email is required";
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.includes('.edu.my');
    if (!email.includes('.edu.my')) return "Please use your university email ending with .edu.my";
    return ok ? "" : "Enter a valid email";
  }, [email, touched]);

  const isValid = !emailError && email;

  const onSubmit = async () => {
    if (!isValid || isLoading) {
      setTouched(true);
      return;
    }

    setIsLoading(true);
    try {
      console.log('[ForgotPassword] Sending reset email to:', email);

      const response = await fetch(`${apiService['baseUrl']}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const result = await response.json();

      console.log('[ForgotPassword] Response:', result);

      if (response.ok || result.success) {
        setEmailSent(true);
        // Navigate to OTP screen
        navigation.navigate("ResetPasswordOTP", { email: email.toLowerCase().trim() });
      } else {
        // For security reasons, we still show success and navigate
        setEmailSent(true);
        navigation.navigate("ResetPasswordOTP", { email: email.toLowerCase().trim() });
      }
    } catch (error) {
      console.error('[ForgotPassword] Error:', error);
      Alert.alert(
        "Connection Error",
        "Unable to send reset email. Please check your internet connection and try again."
      );
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
            {/* Header with back button */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
                accessibilityLabel="Go back to previous screen"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color={colors.primaryDark} />
              </TouchableOpacity>
              <Image source={LOGO} style={styles.logo} contentFit="contain" />
            </View>

            {/* White sheet */}
            <View style={styles.sheet}>
              <Text style={styles.title}>Forgot Password</Text>
              <Text style={styles.subtitle}>
                Enter your campus email and we'll send you a 6-digit code to reset your password.
              </Text>
              <View style={{ height: 24 }} />

              <LabeledInput
                label="Campus Email"
                placeholder="you@xmu.edu.my"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (!touched) setTouched(true);
                }}
                onBlur={() => setTouched(true)}
                error={emailError}
                labelStyle={styles.inputLabel}
              />

              <View style={{ height: 24 }} />
              <View style={{ alignItems: 'center' }}>
                {isLoading ? (
                  <View style={{
                    width: 180,
                    height: 46,
                    backgroundColor: colors.secondary,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7
                  }}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : (
                  <PrimaryButton
                    title="Send Code"
                    onPress={onSubmit}
                    accessibilityLabel="Send password reset code to your email"
                    style={{
                      alignSelf: "center",
                      width: 180,
                      height: 46,
                      opacity: isValid ? 1 : 0.7
                    }}
                  />
                )}
              </View>

              <View style={{ marginTop: 24, alignItems: "center" }}>
                <Text style={styles.footerText}>
                  Remember your password?{" "}
                  <Text style={styles.footerLink} onPress={() => navigation.goBack()}>
                    Back to Login
                  </Text>
                </Text>
              </View>

              {/* Info section */}
              <View style={styles.infoBox}>
                <MaterialCommunityIcons name="information-outline" size={20} color={colors.secondary} />
                <Text style={styles.infoText}>
                  The password reset link will expire in 1 hour. If you don't receive an email, please check your spam folder or contact support.
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
  header: {
    height: height * 0.24,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    left: 20,
    top: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  logo: { width: 200, height: 200 },

  sheet: {
    flexGrow: 1,
    minHeight: height * 0.76,
    backgroundColor: "#fff",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
    elevation: 3,
  },
  title: {
    textAlign: "center",
    fontSize: 36,
    fontWeight: 600,
    color: "#111",
  },
  subtitle: {
    textAlign: "center",
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(17,17,17,0.6)",
    marginTop: 8,
    lineHeight: 20,
  },
  inputLabel: { fontSize: 14, fontWeight: 500 },
  footerText: {
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(17,17,17,0.6)",
    textAlign: "center",
  },
  footerLink: {
    color: colors.secondary,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
  },
  infoBox: {
    marginTop: 32,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    backgroundColor: "rgba(142,106,214,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(142,106,214,0.2)",
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(17,17,17,0.7)",
    lineHeight: 18,
  },
});
