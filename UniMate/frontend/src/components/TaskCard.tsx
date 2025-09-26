import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, fontSize } from "../theme/typography";

type Props = {
  title: string;
  start: Date;
  end: Date;
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

export default function TaskCard({ title, start, end, colors = ["#EADBF7", "#F3D9A6"] }: Props) {
  const minutes = Math.max(0, Math.round((+end - +start) / 60000));

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <Text numberOfLines={2} style={styles.title}>
        {title}
      </Text>

      <View style={styles.row}>
        <View style={styles.timeBlock}>
          <Text style={styles.time}>{fmtTime(start)}</Text>
          <Text style={styles.timeLabel}>Start</Text>
        </View>

        <View style={styles.durationChip}>
          <Text style={styles.durationText}>{minutes} min</Text>
        </View>

        <View style={[styles.timeBlock, { alignItems: "flex-end" }]}>
          <Text style={styles.time}>{fmtTime(end)}</Text>
          <Text style={styles.timeLabel}>End</Text>
        </View>
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
  // ⬇️ Bold the task name
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 14,
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeBlock: { flex: 1 },
  time: { fontFamily: fonts.heading, fontSize: 16, color: "#101010" },
  timeLabel: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: fontSize.tiny,
    color: "rgba(0,0,0,0.55)",
  },
  durationChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  durationText: { fontFamily: fonts.body, fontSize: 12, color: "#2d2d2d" },
});
