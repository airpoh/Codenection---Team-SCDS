// src/screens/SignUpScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { useAuth } from "../contexts/AuthContext";
import { Image } from "expo-image";

const LOGO = require("../../assets/UniMate.png");

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

export default function SignUpScreen({ navigation }: Props) {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [errEmail, setErrEmail] = useState("");
  const [errPw, setErrPw] = useState("");
  const [errPw2, setErrPw2] = useState("");

  function validate() {
    setErrEmail(""); setErrPw(""); setErrPw2("");
    const okEmail = /\S+@\S+\.\S+/.test(email) && email.includes('.edu.my');
    if (!email.includes('.edu.my')) {
      setErrEmail("Please use your university email ending with .edu.my");
    } else if (!okEmail) {
      setErrEmail("Please enter a valid campus email.");
    }
    if (name.trim().length < 2) {
      setErrEmail("Name must be at least 2 characters.");
    }
    if (pw.length < 8) setErrPw("Password must be at least 8 characters.");
    if (pw !== pw2) setErrPw2("Passwords do not match.");
    return okEmail && name.trim().length >= 2 && pw.length >= 8 && pw === pw2;
  }

  async function onCreate() {
    if (!validate() || isLoading) return;

    setIsLoading(true);
    try {
      // Use AuthContext signup function - it handles API call, token storage, and user state
      const result = await signup({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: pw,
        confirm_password: pw2
      });

      if (result.success) {
        Alert.alert(
          "Success!",
          "Account created successfully!",
          [
            {
              text: "Continue",
              onPress: () => navigation.replace("SignUpComplete")
            }
          ]
        );
      } else {
        Alert.alert("Sign Up Failed", result.error || "Please try again.");
      }
    } catch (error) {
      console.error('Signup error:', error);
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
  }

  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.gradientFrom, colors.gradientTo]} style={styles.topGrad} />

        <View style={styles.card}>
          <Text style={styles.title}>Get Started</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Justin Poh"
            placeholderTextColor="rgba(0,0,0,0.45)"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Campus Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="yourid@xmu.edu.my"
            placeholderTextColor="rgba(0,0,0,0.45)"
            style={styles.input}
          />
          {!!errEmail && <Text style={styles.error}>{errEmail}</Text>}

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              value={pw}
              onChangeText={setPw}
              secureTextEntry={!showPw}
              placeholder="********"
              placeholderTextColor="rgba(0,0,0,0.45)"
              style={[styles.input, { paddingRight: 44 }]}
            />
            <TouchableOpacity style={styles.eye} onPress={() => setShowPw((v) => !v)}>
              <MaterialCommunityIcons name={showPw ? "eye-off-outline" : "eye-outline"} size={22} color="rgba(0,0,0,0.6)" />
            </TouchableOpacity>
          </View>
          {!!errPw && <Text style={styles.error}>{errPw}</Text>}

          <Text style={[styles.label, { marginTop: 14 }]}>Confirm Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              value={pw2}
              onChangeText={setPw2}
              secureTextEntry={!showPw2}
              placeholder="********"
              placeholderTextColor="rgba(0,0,0,0.45)"
              style={[styles.input, { paddingRight: 44 }]}
            />
            <TouchableOpacity style={styles.eye} onPress={() => setShowPw2((v) => !v)}>
              <MaterialCommunityIcons name={showPw2 ? "eye-off-outline" : "eye-outline"} size={22} color="rgba(0,0,0,0.6)" />
            </TouchableOpacity>
          </View>
          {!!errPw2 && <Text style={styles.error}>{errPw2}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, isLoading && styles.disabledBtn]}
            onPress={onCreate}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.smallFooter}>
            Already created account?{" "}
            <Text style={styles.link} onPress={() => navigation.replace("Login")}>
              Login here
            </Text>
          </Text>
        </View>

        <LinearGradient colors={[colors.gradientFrom, colors.gradientTo]} style={styles.bottomBrand}>
          <Image source={LOGO} style={{ width: 200, height: 200 }} contentFit="contain" />
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F3F3F4" },
  container: { paddingBottom: 28 },

  topGrad: {
    marginHorizontal: 16,
    height: 120,
    borderRadius: 18,
    marginTop: 8,
    marginBottom: -90,
    opacity: 0.9,
  },

  card: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    paddingTop: 26,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  title: {
    fontFamily: fonts.heading,
    fontSize: 36,
    fontWeight: 600,
    textAlign: "center",
    color: "#111",
    marginBottom: 18,
  },
  label: { fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: "#222", marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 130,
    paddingHorizontal: 14,
    backgroundColor: "rgba(227,180,106,0.25)",
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "#111",
  },

  passwordWrap: { position: "relative" },
  eye: { position: "absolute", right: 12, top: 11 },

  error: { marginTop: 6, color: "#C62828", fontSize: 12, fontFamily: fonts.body },

  primaryBtn: {
    marginTop: 18,
    alignSelf: "flex-end",
    backgroundColor: colors.secondary,
    height: 42,
    minWidth: 150,
    paddingHorizontal: 18,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBtn: {
    backgroundColor: colors.secondary + '80', // 50% opacity
  },
  primaryBtnText: { color: "#fff", fontFamily: fonts.heading, fontSize: 14, fontWeight: 600},

  smallFooter: {
    textAlign: "center",
    marginTop: 20,
    marginBottom: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(0,0,0,0.55)",
  },
  link: { color: colors.primaryDark, textDecorationLine: "underline" },
  bottomBrand: {
    marginHorizontal: 16,
    height: 300,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    opacity: 0.95,
  },
});
