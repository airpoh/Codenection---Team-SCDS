import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fonts } from "../theme/typography";
import { colors } from "../theme/colors";

type Item = { icon: string; label: string; tint?: string };

const ITEMS: Item[] = [
  { icon: "car-emergency", label: "Accident / Injury", tint: "#27af8dff" },
  { icon: "heart", label: "Chest Pain", tint: "#b71414ff" },
  { icon: "lungs", label: "Breathing Difficulty", tint: "#d3317aff" },
  { icon: "sleep", label: "Unconsciousness", tint: "#4c64b4ff" },
  { icon: "hand-back-right", label: "Sudden Paralysis", tint: "#713bd4ff" },
  { icon: "fire", label: "Fire / Hazard", tint: "#f49229ff" },
  { icon: "help-circle-outline", label: "Other Emergency", tint: "#08081ab6" },
];

export default function LighthouseSelectScreen({ navigation }: any) {
  // ✅ define onPick INSIDE the component and use the navigation prop
  const onPick = (label: string) => {
    navigation.navigate("LighthouseEmergency", { type: label });
  };

  return (
    <LinearGradient
      colors={["#efe7e7ff", "#cdc7c7ff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Type of Emergency</Text>

          {ITEMS.map((it) => (
            <TouchableOpacity key={it.label} onPress={() => onPick(it.label)} activeOpacity={0.9}>
              <View style={styles.item}>
                <View style={[styles.iconBadge, { backgroundColor: `${it.tint}20` }]}>
                  <MaterialCommunityIcons name={it.icon as any} size={30} color={it.tint} />
                </View>
                <Text style={styles.itemText}>{it.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={25} color="rgba(167, 18, 18, 0.97)" />
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
  container: { padding: 20, paddingTop: 30, paddingBottom: 28 },
  title: { fontFamily: fonts.heading, fontSize: 30, fontWeight:600, color: "#101010ff", marginBottom: 30, textAlign: "center" },

  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 30,
    padding: 15,
    marginBottom: 15,
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
  itemText: { flex: 1, fontFamily: fonts.body, color: "#111", fontSize: 14, fontWeight:500 },

  backBtn: {
    alignSelf: "center",
    marginTop: 15,
    backgroundColor: "#a30606ff",
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 20,
  },
  backText: { color: "#fff", fontFamily: fonts.heading, fontSize: 14, fontWeight:500 },
});
