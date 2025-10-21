import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fonts } from "../theme/typography";

export default function LighthouseResourcesScreen({ navigation }: any) {
  return (
    <LinearGradient colors={["#fbf1d7", "#73ae52"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 25, paddingBottom: 25 }}>
          <Text style={styles.heading}>Resources & Support</Text>
          <Text style={styles.sub}>Tools and support when you need them most</Text>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="alert" size={30} color="#73ae52" />
              <Text style={styles.sectionTitle}>  Crisis Support</Text>
            </View>

            <Card
              title="Crisis WhatsApp"
              sub="Talk to trained peers & volunteers "
              right="24 HOURS"
              action="03-97656088"
            />
            <Card
              title="Crisis Helpline"
              sub="Provide emotional support & care"
              right="24 HOURS"
              action="1-800-180-066"
            />
            <Card
              title="Campus Counselling"
              sub="Talk to us in the campus"
              right="WEEKDAYS 9AM-5PM"
              action="03-84081748"
            />
          </View>

          <Text style={styles.note}>
            You don't have to go through this alone – help is just one step away
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
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          <MaterialCommunityIcons name="phone" size={25} color="#73ae52" />
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
  heading: { fontFamily: fonts.heading, fontSize: 30, fontWeight: 700, textAlign: "center", color: "#111" },
  sub: { textAlign: "center", color: "rgba(0,0,0,0.6)", marginTop: 6, fontSize: 14, fontWeight: 400},
  section: {
    marginTop: 30, backgroundColor: "#FFF5E5", borderRadius: 16, padding: 20,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontFamily: fonts.heading, color: "#73ae52", fontSize: 20, fontWeight: 500},

  card: {
    marginTop: 10, padding: 15, borderRadius: 20, backgroundColor: "#fff",
    flexDirection: "row", alignItems: "center", shadowColor: "#000",
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontFamily: fonts.heading, fontSize: 14, fontWeight: 600, color: "#f57ed7ff" },
  cardSub: { marginTop: 2, color: "rgba(0,0,0,0.6)", fontSize: 14, fontWeight: 400,},
  pill: { backgroundColor: "#deddd9ff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 10 },
  pillText: { fontSize: 11, color: "#333531ff" },
  cardAction: { fontFamily: fonts.body, color: "#111", fontSize: 12 },

  note: { marginTop: 25, textAlign: "center", color: "rgba(255, 255, 255, 1)", fontStyle: "italic" },
  backBtn: {
    alignSelf: "center", marginTop: 16, backgroundColor: "#fbf1d7",
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  backText: { color: "#73ae52", fontFamily: fonts.heading },
});
