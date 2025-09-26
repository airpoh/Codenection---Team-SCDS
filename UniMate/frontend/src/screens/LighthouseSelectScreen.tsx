import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fonts } from "../theme/typography";
import { colors } from "../theme/colors";

type Item = { icon: string; label: string; tint?: string };

const ITEMS: Item[] = [
  { icon: "car-emergency", label: "Accident / Injury", tint: "#6C63FF" },
  { icon: "heart", label: "Chest Pain", tint: "#FF5A79" },
  { icon: "lungs", label: "Breathing Difficulty", tint: "#3AC4D1" },
  { icon: "sleep", label: "Unconsciousness", tint: "#7E8BB6" },
  { icon: "hand-back-right", label: "Sudden Paralysis / Weakness", tint: "#FF7A59" },
  { icon: "fire", label: "Fire / Hazard", tint: "#FF8A00" },
  { icon: "help-circle-outline", label: "Other Emergency", tint: "#8E8E93" },
];

export default function LighthouseSelectScreen({ navigation }: any) {
  // ✅ define onPick INSIDE the component and use the navigation prop
  const onPick = (label: string) => {
    navigation.navigate("LighthouseEmergency", { type: label });
  };

  return (
    <LinearGradient
      colors={["#E9E2FF", "#FBE9D6"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Please choose the emergency</Text>

          {ITEMS.map((it) => (
            <TouchableOpacity key={it.label} onPress={() => onPick(it.label)} activeOpacity={0.9}>
              <View style={styles.item}>
                <View style={[styles.iconBadge, { backgroundColor: `${it.tint}20` }]}>
                  <MaterialCommunityIcons name={it.icon as any} size={20} color={it.tint} />
                </View>
                <Text style={styles.itemText}>{it.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(0,0,0,0.4)" />
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: "#1a1a1a", marginBottom: 12 },

  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  itemText: { flex: 1, fontFamily: fonts.body, color: "#111", fontSize: 15 },

  backBtn: {
    alignSelf: "center",
    marginTop: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backText: { color: "#fff", fontFamily: fonts.heading },
});
