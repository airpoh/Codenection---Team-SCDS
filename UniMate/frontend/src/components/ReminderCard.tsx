import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, fontSize } from "../theme/typography";

type Props = {
  title: string;
  at: Date; // single point in time
  colors?: [string, string];
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
}: Props) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <Text numberOfLines={2} style={styles.title}>{title}</Text>
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
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: "#1a1a1a",
    marginBottom: 14,
    lineHeight: 22,
  },
  row: { flexDirection: "row", alignItems: "center" },
  timeChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#2d2d2d",
  },
  note: {
    marginLeft: 10,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    color: "rgba(0,0,0,0.55)",
  },
});
