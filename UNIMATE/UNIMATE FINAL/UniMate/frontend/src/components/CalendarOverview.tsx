import React, { useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import { fonts } from "../theme/typography";

// Types you already use in CalendarScreen
export type TaskItem = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  colors?: [string, string];
};

export type ReminderItem = {
  id: string;
  title: string;
  at: Date;
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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const cardPalette = ["#a77113ff", "#e8a022ff", "#145a1aff", "#97a704ff"];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Props = {
  tasks: TaskItem[];
  reminders?: ReminderItem[]; // ✅ Add reminders prop
  /** Optionally pick which month chip to highlight first (0..11). Defaults to current month */
  initiallySelectedMonth?: number;
};

export default function CalendarOverview({ tasks, reminders = [], initiallySelectedMonth }: Props) {
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState(
    initiallySelectedMonth ?? currentMonth
  );
  const monthsBarRef = useRef<ScrollView>(null);

  // ✅ Merge tasks and reminders, converting reminders to task format
  const allItems = useMemo(() => {
    const items: TaskItem[] = [...tasks];

    // Convert reminders to task format (reminders are single-time events)
    reminders.forEach((r) => {
      items.push({
        id: `reminder-${r.id}`,
        title: `🔔 ${r.title}`, // Add bell emoji to distinguish reminders
        start: r.at,
        end: r.at, // Reminders don't have duration, so start = end
        colors: r.colors || ["#EAD9FF", "#B39DDB"], // Purple tint for reminders
      });
    });

    return items;
  }, [tasks, reminders]);

  // Group all tasks+reminders by day (we'll filter by month afterward)
  const groupsAll = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    allItems.forEach((t) => {
      const key = ymd(t.start);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    });
    Array.from(m.values()).forEach((arr) => arr.sort((a, b) => +a.start - +b.start));
    return Array.from(m.entries()).sort((a, b) => +new Date(a[0]) - +new Date(b[0]));
  }, [allItems]);

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
      {/* Months bar */}
      <ScrollView
        ref={monthsBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthsBar}
      >
        {MONTHS.map((m, i) => {
          const active = i === selectedMonth;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, active && styles.monthChipActive]}
              onPress={() => onMonthPress(i)}
            >
              <Text style={[styles.monthText, active && styles.monthTextActive]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {groups.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Text style={styles.emptyText}>No tasks or reminders for this month yet.</Text>
        </View>
      ) : (
        groups.map(([key, dayTasks], i) => {
          const d = new Date(key);
          const { weekday, day, month } = fmtDay(d);
          const bg = cardPalette[i % cardPalette.length];

          return (
            <View key={key} style={[styles.dayCard, { backgroundColor: bg }]}>
              {/* Left: date (smaller & centered) */}
              <View style={styles.left}>
                <Text style={styles.weekday}>{weekday}</Text>
                <Text style={styles.bigDay}>{day}</Text>
                <Text style={styles.bigMonth}>{month}</Text>
              </View>

              {/* Right: horizontal time strip (no inner shadows/elevation) */}
              <View style={styles.right}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 15 }}
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
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  monthChipActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  monthText: { fontFamily: fonts.body, fontSize: 30, fontWeight: "600", color: "#4d4752" },
  monthTextActive: { fontFamily: fonts.heading, color: "#4d4752" },

  dayCard: {
    height: 145,
    flexDirection: "row",
    borderRadius: 28,
    marginBottom: 10,
    overflow: "hidden",
  },

  /** Left date block — centered & smaller */
  left: {
    width: 130,
    paddingHorizontal: 15,
    alignItems: "baseline",
    justifyContent: "center",
  },
  weekday: {
    fontSize: 14,
    fontWeight: "500",
    fontStyle: "italic",
    color: "rgba(0,0,0,0.6)",
    marginBottom: 2,
  },
  bigDay: {
    fontFamily: fonts.heading,
    fontSize: 45,           // smaller
    fontWeight: "700",
    color: "#111",
    lineHeight: 45,
  },
  bigMonth: {
    fontFamily: fonts.heading,
    fontSize: 45,           // smaller
    fontWeight: "700",
    color: "#111",
    letterSpacing: 2,
    marginTop: -10,
  },

  /** Right: soft container */
  right: {
    flex: 1,
    height: 92,
    paddingVertical: 14,
    alignSelf: "center",
    marginLeft: 12,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 40,
  },

  /** Inner strip — remove shadows/elevation to avoid dark frames on Android */
  strip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 12,
    borderRadius: 20,
    // No shadow/elevation here (prevents "black frame" on Android)
  },
  stripTime: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: "500",
    color: "#111",
  },
  stripDivider: {
    width: 2,
    height: 46,
    backgroundColor: "rgba(0,0,0,0.2)",
    marginHorizontal: 10,
    borderRadius: 1,
  },
  stripChip: {
    paddingHorizontal: 14,
    height: 28,
    borderRadius: 28,
    backgroundColor: "#292e2b",
    alignItems: "center",
    justifyContent: "center",
  },
  stripChipText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: "500",
    color: "#fff",
    maxWidth: 150,
  },

  emptyText: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(0,0,0,0.6)",
  },
});
