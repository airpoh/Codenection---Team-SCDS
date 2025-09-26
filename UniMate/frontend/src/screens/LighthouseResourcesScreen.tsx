import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fonts } from "../theme/typography";

export default function LighthouseResourcesScreen({ navigation }: any) {
  return (
    <LinearGradient colors={["#ECE6FF", "#FCEAD6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <Text style={styles.heading}>Resources & Support</Text>
          <Text style={styles.sub}>Tools and support when you need them most</Text>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="alert" size={16} color="#D97706" />
              <Text style={styles.sectionTitle}>  Crisis Support</Text>
            </View>

            <Card
              title="988 Crisis & Suicide Lifeline"
              sub="24/7 free and confidential support"
              right="24/7"
              action="988"
            />
            <Card
              title="Crisis Text Line"
              sub="24/7 free and confidential support via text"
              right="24/7"
              action="Text HOME to 741741"
            />
            <Card
              title="Campus Counselling Center"
              sub="University Mental Health Service"
              right="Mon–Fri 9am–5pm"
              action="(555) 123-4567"
            />
          </View>

          <Text style={styles.note}>
            You don’t have to go through this alone – help is just one step away
          </Text>

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Card({ title, sub, right, action }: { title: string; sub: string; right: string; action: string }) {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{sub}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
          <MaterialCommunityIcons name="phone" size={14} color="#111" />
          <Text style={styles.cardAction}>  {action}</Text>
        </View>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{right}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.heading, fontSize: 22, textAlign: "center", color: "#111" },
  sub: { textAlign: "center", color: "rgba(0,0,0,0.6)", marginTop: 6 },
  section: {
    marginTop: 16, backgroundColor: "#FFF5E5", borderRadius: 16, padding: 12,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontFamily: fonts.heading, color: "#D97706" },

  card: {
    marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: "#fff",
    flexDirection: "row", alignItems: "center", shadowColor: "#000",
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontFamily: fonts.heading, fontSize: 14, color: "#111" },
  cardSub: { marginTop: 2, color: "rgba(0,0,0,0.6)" },
  pill: { backgroundColor: "#E5F4EA", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 10 },
  pillText: { fontSize: 11, color: "#166534" },
  cardAction: { fontFamily: fonts.body, color: "#111", fontSize: 12 },

  note: { marginTop: 16, textAlign: "center", color: "rgba(0,0,0,0.7)", fontStyle: "italic" },
  backBtn: {
    alignSelf: "center", marginTop: 16, backgroundColor: "#6C5CE7",
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  backText: { color: "#fff", fontFamily: fonts.heading },
});
