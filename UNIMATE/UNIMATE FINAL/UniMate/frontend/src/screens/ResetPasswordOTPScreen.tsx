// src/screens/ResetPasswordOTPScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";
import LabeledInput from "../components/LabeledInput";
import PrimaryButton from "../components/PrimaryButton";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { apiService } from "../services/api";

const { height } = Dimensions.get("window");
type Props = NativeStackScreenProps<RootStackParamList, "ResetPasswordOTP">;

export default function ResetPasswordOTPScreen({ navigation, route }: Props) {
  const email = route.params?.email || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [secure1, setSecure1] = useState(true);
  const [secure2, setSecure2] = useState(true);
  const [touched, setTouched] = useState({ pwd: false, confirm: false });
  const [step, setStep] = useState<"otp" | "password">("otp");

  // Refs for OTP inputs
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const otpComplete = otp.every((digit) => digit !== "");
  const otpCode = otp.join("");

  const pwdError = useMemo(() => {
    if (!touched.pwd) return "";
    if (password.length < 6) return "Minimum 6 characters";
    return "";
  }, [password, touched.pwd]);

  const confirmError = useMemo(() => {
    if (!touched.confirm) return "";
    if (confirmPassword !== password) return "Passwords don't match";
    return "";
  }, [confirmPassword, password, touched.confirm]);

  const isPasswordValid = !pwdError && !confirmError && password && confirmPassword;

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      // Focus previous input on backspace
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOTP = async () => {
    if (!otpComplete || isLoading) return;

    // Skip verification step - go directly to password entry
    // The OTP will be verified when the user submits the new password
    setStep("password");
  };

  const resetPassword = async () => {
    if (!isPasswordValid || isLoading) {
      setTouched({ pwd: true, confirm: true });
      return;
    }

    setIsLoading(true);
    try {
      console.log('[ResetPasswordOTP] Resetting password with OTP');

      // Reset password via secure backend endpoint
      const response = await fetch(`${apiService['baseUrl']}/auth/reset-password-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          token: otpCode,
          password: password,
          confirm_password: password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        Alert.alert(
          "Password Reset Successful! ✅",
          "Your password has been changed. You can now log in with your new password.",
          [
            {
              text: "Go to Login",
              onPress: () => navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              }),
            },
          ]
        );
      } else {
        Alert.alert(
          "Reset Failed",
          result.detail || result.message || "Unable to reset password. Please request a new code."
        );
      }
    } catch (error) {
      console.error('[ResetPasswordOTP] Reset error:', error);
      Alert.alert(
        "Connection Error",
        "Unable to reset password. Please check your internet connection and try again."
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
                accessibilityLabel="Go back"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color={colors.primaryDark} />
              </TouchableOpacity>
              <Text style={styles.brand}>
                <Text style={styles.brandUni}>Uni</Text>
                <Text style={styles.brandMate}>Mate</Text>
              </Text>
            </View>

            {/* White sheet */}
            <View style={styles.sheet}>
              {step === "otp" ? (
                <>
                  <Text style={styles.title}>Enter Code</Text>
                  <Text style={styles.subtitle}>
                    We sent a 6-digit code to{"\n"}
                    <Text style={{ color: colors.secondary, fontWeight: "600" }}>{email}</Text>
                  </Text>
                  <View style={{ height: 32 }} />

                  {/* OTP Input */}
                  <View style={styles.otpContainer}>
                    {otp.map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={(ref) => (otpRefs.current[index] = ref)}
                        style={[
                          styles.otpInput,
                          digit && styles.otpInputFilled,
                        ]}
                        value={digit}
                        onChangeText={(value) => handleOtpChange(index, value)}
                        onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                        autoFocus={index === 0}
                      />
                    ))}
                  </View>

                  <View style={{ height: 32 }} />
                  <View style={{ alignItems: 'center' }}>
                    {isLoading ? (
                      <View style={styles.loadingButton}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    ) : (
                      <PrimaryButton
                        title="Continue"
                        onPress={verifyOTP}
                        accessibilityLabel="Continue to password entry"
                        style={{
                          alignSelf: "center",
                          width: 180,
                          height: 46,
                          opacity: otpComplete ? 1 : 0.5
                        }}
                      />
                    )}
                  </View>

                  <View style={{ marginTop: 24, alignItems: "center" }}>
                    <Text style={styles.footerText}>
                      Didn't receive a code?{" "}
                      <Text style={styles.footerLink} onPress={() => navigation.goBack()}>
                        Resend
                      </Text>
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={60}
                    color={colors.secondary}
                    style={{ alignSelf: "center", marginBottom: 16 }}
                  />
                  <Text style={styles.title}>New Password</Text>
                  <Text style={styles.subtitle}>
                    Enter your new password below
                  </Text>
                  <View style={{ height: 24 }} />

                  <LabeledInput
                    label="New Password"
                    placeholder="••••••••"
                    secureToggle
                    isSecure={secure1}
                    onToggleSecure={() => setSecure1((s) => !s)}
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      if (!touched.pwd) setTouched((s) => ({ ...s, pwd: true }));
                    }}
                    onBlur={() => setTouched((s) => ({ ...s, pwd: true }))}
                    error={pwdError}
                  />

                  <LabeledInput
                    label="Confirm Password"
                    placeholder="••••••••"
                    secureToggle
                    isSecure={secure2}
                    onToggleSecure={() => setSecure2((s) => !s)}
                    value={confirmPassword}
                    onChangeText={(t) => {
                      setConfirmPassword(t);
                      if (!touched.confirm) setTouched((s) => ({ ...s, confirm: true }));
                    }}
                    onBlur={() => setTouched((s) => ({ ...s, confirm: true }))}
                    error={confirmError}
                  />

                  <View style={{ height: 24 }} />
                  <View style={{ alignItems: 'center' }}>
                    {isLoading ? (
                      <View style={styles.loadingButton}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    ) : (
                      <PrimaryButton
                        title="Reset Password"
                        onPress={resetPassword}
                        accessibilityLabel="Reset password"
                        style={{
                          alignSelf: "center",
                          width: 180,
                          height: 46,
                          opacity: isPasswordValid ? 1 : 0.7
                        }}
                      />
                    )}
                  </View>
                </>
              )}
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
  brand: {
    fontSize: fontSize.heading,
    fontFamily: fonts.heading,
    letterSpacing: 0.5,
  },
  brandUni: { color: colors.secondary },
  brandMate: { color: colors.primaryDark },

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
    fontFamily: fonts.heading,
    fontSize: 32,
    color: "#111",
  },
  subtitle: {
    textAlign: "center",
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(17,17,17,0.6)",
    marginTop: 8,
    lineHeight: 22,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  otpInput: {
    width: 50,
    height: 60,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    color: "#111",
    backgroundColor: "#F9FAFB",
  },
  otpInputFilled: {
    borderColor: colors.secondary,
    backgroundColor: "#F3E8FF",
  },
  loadingButton: {
    width: 180,
    height: 46,
    backgroundColor: colors.secondary,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
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
    fontWeight: "600",
  },
});
