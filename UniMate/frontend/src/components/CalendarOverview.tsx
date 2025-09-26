import React, { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { fonts } from "../theme/typography";

// Types you already use in CalendarScreen
export type TaskItem = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  colors?: [string, string];
};

function fmtDay(d: Date) {
  const weekday = new Intl.DateTimeFormat("en-MY", { weekday: "long" }).format(d);
  const day = d.getDate();
  const month = new Intl.DateTimeFormat("en-MY", { month: "short" }).format(d).toUpperCase();
  return { weekday, day, month };
}
function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit" }).format(d);
}
function ymd(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const s = x.toISOString();
  return s.slice(0, 10);
}
const cardPalette = ["#EBD8B6", "#E9E0F6", "#98AF9A", "#F1E6D7"];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Props = {
  tasks: TaskItem[];
  /** Optionally pick which month chip to highlight first (0..11). Defaults to current month */
  initiallySelectedMonth?: number;
};

export default function CalendarOverview({ tasks, initiallySelectedMonth }: Props) {
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState<number>(
    initiallySelectedMonth ?? currentMonth
  );
  const monthsBarRef = useRef<ScrollView>(null);

  // Group all tasks by day (we'll filter by month afterward)
  const groupsAll = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    tasks.forEach((t) => {
      const key = ymd(t.start);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    });
    Array.from(m.values()).forEach((arr) => arr.sort((a, b) => +a.start - +b.start));
    return Array.from(m.entries()).sort((a, b) => +new Date(a[0]) - +new Date(b[0]));
  }, [tasks]);

  // Filter groups by selected month
  const groups = useMemo(
    () => groupsAll.filter(([key]) => new Date(key).getMonth() === selectedMonth),
    [groupsAll, selectedMonth]
  );

  const hasAny = groups.length > 0;

  function onMonthPress(i: number) {
    setSelectedMonth(i);
    // auto-scroll months bar to keep the selected chip in view
    monthsBarRef.current?.scrollTo({ x: Math.max(0, (i - 2) * 70), animated: true });
  }

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6 }}>
      {/* Months bar (scrollable) */}
      <ScrollView
        ref={monthsBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthsBar}
      >
        {MONTHS.map((m, i) => {
          const active = i === selectedMonth;
          return (
            <TouchableOpacity key={m} style={[styles.monthChip, active && styles.monthChipActive]} onPress={() => onMonthPress(i)}>
              <Text style={[styles.monthText, active && styles.monthTextActive]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!hasAny ? (
        <View style={{ padding: 16 }}>
          <Text style={{ fontFamily: fonts.body, color: "rgba(0,0,0,0.6)" }}>
            No tasks for this month yet.
          </Text>
        </View>
      ) : (
        groups.map(([key, dayTasks], i) => {
          const d = new Date(key);
          const { weekday, day, month } = fmtDay(d);
          const bg = cardPalette[i % cardPalette.length];

          return (
            <View key={key} style={[styles.dayCard, { backgroundColor: bg }]}>
              {/* Left: date */}
              <View style={styles.left}>
                <Text style={styles.weekday}>{weekday}</Text>
                <Text style={styles.bigDay}>{day}</Text>
                <Text style={styles.bigMonth}>{month}</Text>
              </View>

              {/* Right: horizontal time strip */}
              <View style={styles.right}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12 }}
                >
                  {dayTasks.map((t) => (
                    <View key={t.id} style={styles.strip}>
                      <Text style={styles.stripTime}>{fmtTime(t.start)}</Text>
                      <View style={styles.stripDivider} />
                      <View style={styles.stripChip}>
                        <Text style={styles.stripChipText} numberOfLines={1}>
                          {t.title.replace(/\n/g, " ")}
                        </Text>
                      </View>
                      <View style={styles.stripDivider} />
                      <Text style={styles.stripTime}>{fmtTime(t.end)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  monthsBar: { paddingVertical: 6, paddingHorizontal: 4, gap: 8, marginBottom: 6 },
  monthChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  monthChipActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  monthText: { fontFamily: fonts.body, fontSize: 14, color: "rgba(0,0,0,0.6)" },
  monthTextActive: { fontFamily: fonts.heading, color: "#111" },

  dayCard: {
    flexDirection: "row",
    borderRadius: 28,
    marginBottom: 12,
    overflow: "hidden",
  },
  left: { width: 120, paddingVertical: 16, paddingLeft: 16 },
  weekday: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontStyle: "italic",
    color: "rgba(0,0,0,0.6)",
    marginBottom: 2,
  },
  bigDay: { fontFamily: fonts.heading, fontSize: 44, color: "#111", lineHeight: 48 },
  bigMonth: { fontFamily: fonts.heading, fontSize: 26, color: "#111", letterSpacing: 3, marginTop: -8 },

  right: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
  },

  strip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stripTime: { fontFamily: fonts.heading, fontSize: 14, color: "#111" },
  stripDivider: { width: 1, height: 24, backgroundColor: "rgba(0,0,0,0.2)", marginHorizontal: 10 },
  stripChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  stripChipText: { fontFamily: fonts.body, fontSize: 12, color: "#2d2d2d", maxWidth: 140 },
});
