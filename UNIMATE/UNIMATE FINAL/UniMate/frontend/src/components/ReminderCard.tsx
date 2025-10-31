import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fonts, fontSize } from "../theme/typography";

type Props = {
  title: string;
  at: Date; // single point in time
  colors?: [string, string];
  onDelete?: () => void;
};

function fmtTime(d: Date) {
  try {
    return new Intl.DateTimeFormat("en-MY", {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${m} ${ampm}`;
  }
}

export default function ReminderCard({
  title,
  at,
  colors = ["#EDE7F6", "#FFF3E0"],
  onDelete,
}: Props) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      {onDelete ? (
        <View style={styles.header}>
          <Text numberOfLines={2} style={styles.title}>{title}</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onDelete} style={styles.iconBtn}>
              <MaterialCommunityIcons name="delete" size={18} color="#d32f2f" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text numberOfLines={2} style={styles.title}>{title}</Text>
      )}
      <View style={styles.row}>
        <View style={styles.timeChip}>
          <Text style={styles.timeText}>{fmtTime(at)}</Text>
        </View>
        <Text style={styles.note}>Reminder</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 30,
    padding: 20,
    marginHorizontal: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  title: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: 700,
    color: "#fbf9f9ff",
    marginBottom: 15,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center" },
  timeChip: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 30,
    backgroundColor: "rgba(247, 247, 247, 0.21)",
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "#fbf9f9ff",
    fontWeight: 500
  },
  note: {
    marginLeft: 10,
    fontWeight: 500,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(234, 227, 227, 0.79)",
  },
});
