// src/screens/ResetPasswordScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";
import LabeledInput from "../components/LabeledInput";
import PrimaryButton from "../components/PrimaryButton";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";

const { height } = Dimensions.get("window");
type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [secure1, setSecure1] = useState(true);
  const [secure2, setSecure2] = useState(true);
  const [touched, setTouched] = useState({ pwd: false, confirm: false });

  // Extract token from deep link or URL query params
  const [token, setToken] = useState(route.params?.token || "");

  useEffect(() => {
    const extractTokenFromURL = async () => {
      // If token is already in params, we're good
      if (token) {
        console.log('[ResetPassword] Token from params:', token);
        return;
      }

      // Otherwise, try to extract from deep link URL
      try {
        const url = await Linking.getInitialURL();
        console.log('[ResetPassword] Initial URL:', url);

        if (url) {
          // Extract token from URL query params
          const match = url.match(/[?&]token=([^&]+)/);
          if (match && match[1]) {
            console.log('[ResetPassword] Token extracted from URL:', match[1]);
            setToken(match[1]);
            return;
          }
        }

        // If we still don't have a token after a moment, show error
        setTimeout(() => {
          if (!token) {
            console.log('[ResetPassword] No token found');
            Alert.alert(
              "Invalid Link",
              "This password reset link is invalid or has expired. Please request a new one.",
              [{ text: "OK", onPress: () => navigation.navigate("Login") }]
            );
          }
        }, 1000);
      } catch (error) {
        console.error('[ResetPassword] Error extracting token:', error);
      }
    };

    extractTokenFromURL();
  }, []);

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

  const isValid = !pwdError && !confirmError && password && confirmPassword;

  const onSubmit = async () => {
    if (!isValid || isLoading) {
      setTouched({ pwd: true, confirm: true });
      return;
    }

    if (!token) {
      Alert.alert("Error", "Invalid reset token");
      return;
    }

    setIsLoading(true);
    try {
      // Call Supabase to update password with token
      const response = await fetch("https://ofjrucbezyohtnqsycko.supabase.co/auth/v1/user", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
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
        const error = await response.json();
        Alert.alert(
          "Reset Failed",
          error.message || "Unable to reset password. The link may have expired. Please request a new one."
        );
      }
    } catch (error) {
      console.error('[ResetPassword] Error:', error);
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
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.brand}>
                <Text style={styles.brandUni}>Uni</Text>
                <Text style={styles.brandMate}>Mate</Text>
              </Text>
            </View>

            {/* White sheet */}
            <View style={styles.sheet}>
              <Text style={styles.title}>Reset Password</Text>
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
                    title="Reset Password"
                    onPress={onSubmit}
                    accessibilityLabel="Reset your password"
                    style={{
                      alignSelf: "center",
                      width: 180,
                      height: 46,
                      opacity: isValid ? 1 : 0.7
                    }}
                  />
                )}
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
    lineHeight: 20,
  },
});
