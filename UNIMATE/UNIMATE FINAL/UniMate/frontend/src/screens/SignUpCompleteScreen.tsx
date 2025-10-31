// src/screens/SignUpCompleteScreen.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors } from "../theme/colors";
import { fonts, fontSize } from "../theme/typography";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";

type Props = NativeStackScreenProps<RootStackParamList, "SignUpComplete">;

export default function SignUpCompleteScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.tickWrap}>
            <View style={styles.tickCircle}>
              <MaterialCommunityIcons name="check" size={44} color="#fff" />
            </View>
          </View>

          <Text style={styles.title}>You're all set!</Text>
          <Text style={styles.subtitle}>
            Your account was created successfully. Use your campus credentials to sign in and start using UniMate.
          </Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.replace("Login")}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>Go to Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.secondary, marginTop: 10 }]}
            onPress={() => navigation.replace("Tabs")}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>Enter App</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F3F3F4" },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tickWrap: { marginTop: -60, marginBottom: 8 },
  tickCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#4CAF50", // green
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  title: { fontFamily: fonts.heading, fontSize: 24, marginTop: 12, color: "#111" },
  subtitle: { textAlign: "center", marginTop: 12, color: "rgba(0,0,0,0.7)", fontFamily: fonts.body },
  btn: {
    marginTop: 20,
    width: "86%",
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontFamily: fonts.heading, fontSize: 16 },
});
