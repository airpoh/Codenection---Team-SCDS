import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import TaskCard from "../components/TaskCard";
import ReminderCard from "../components/ReminderCard";
import CalendarOverview, { TaskItem } from "../components/CalendarOverview";
import { fonts, fontSize } from "../theme/typography";
import { colors } from "../theme/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiService } from "../services/api";
import { authService } from "../services/auth";

type Tab = "tasks" | "reminders";
type ViewMode = "today" | "calendar";
type FormType = "task" | "reminder";

/** ---- Reward Market shared keys (per-day stamping) ---- */
const K = {
  coins: "rm_coins_total",
  todayEarned: "rm_today_earned",
  taskDates: "rm_task_dates", // actionId -> "YYYY-MM-DD"
};

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Award an earn action once per day and mark it as completed for today. */
async function awardEarnOncePerDay(
  actionId: "login" | "add_task" | "add_reminder",
  points: number
) {
  const [coinsStr, earnedStr, mapStr] = await Promise.all([
    AsyncStorage.getItem(K.coins),
    AsyncStorage.getItem(K.todayEarned),
    AsyncStorage.getItem(K.taskDates),
  ]);

  const coins = coinsStr ? Number(coinsStr) : 0;
  const earned = earnedStr ? Number(earnedStr) : 0;
  const map: Record<string, string> = mapStr ? JSON.parse(mapStr) : {};

  const today = todayKey();
  if (map[actionId] === today) return; // already awarded today

  map[actionId] = today;

  await AsyncStorage.multiSet([
    [K.coins, String(coins + points)],
    [K.todayEarned, String(earned + points)],
    [K.taskDates, JSON.stringify(map)],
  ]);
}

function useTodayInfo() {
  const now = new Date();
  const dayName = new Intl.DateTimeFormat("en-MY", { weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const day = now.getDate();
  const month = new Intl.DateTimeFormat("en-MY", { month: "short" })
    .format(now)
    .toUpperCase();
  return { dayName, time, day, month, now };
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function combineDateAndTime(date: Date, time: Date) {
  const d = new Date(date);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const TASK_PALETTES: [string, string][] = [
  ["#DCD2F4", "#D1E1FF"],
  ["#F5E1B6", "#FFE0B2"],
  ["#CDEDF6", "#E1F5FE"],
  ["#E0F2F1", "#D6F5E5"],
  ["#FFD6E8", "#FEE0F1"],
  ["#FCE5D2", "#FFE9C7"],
  ["#E8F0FE", "#DDE7FF"],
];
const REM_PALETTES: [string, string][] = [
  ["#EDE7F6", "#FFF3E0"],
  ["#E0F2F1", "#E3F2FD"],
  ["#FFF0F3", "#FDEBD0"],
  ["#E6EEFB", "#FFF5E1"],
];

export default function CalendarScreen() {
  const { dayName, time, day, month, now } = useTodayInfo();
  const year = now.getFullYear();

  // Load tasks from backend
  const loadTasks = async () => {
    try {
      const token = await authService.getAccessToken();
      if (token) {
        const response = await apiService.getTasks(token);
        if (response.success && response.tasks) {
          // Transform backend tasks to frontend format
          const backendTasks = response.tasks.map((task: any, index: number) => ({
            id: task.id,
            title: task.title,
            start: task.due_date ? new Date(task.due_date) : new Date(),
            end: task.due_date ? new Date(task.due_date) : new Date(),
            colors: TASK_PALETTES[index % TASK_PALETTES.length],
          }));
          setTasks(backendTasks);
        }
      }
    } catch (error) {
      console.log('Failed to load tasks from backend:', error);
      // Keep hardcoded tasks as fallback
    }
  };

  // Load reminders from backend
  const loadReminders = async () => {
    try {
      const token = await authService.getAccessToken();
      if (token) {
        const response = await apiService.getReminders(token);
        if (response.success && response.reminders) {
          // Transform backend reminders to frontend format
          const backendReminders = response.reminders.map((reminder: any, index: number) => ({
            id: reminder.id,
            title: reminder.title,
            at: reminder.reminder_time ? new Date(reminder.reminder_time) : new Date(),
            colors: REM_PALETTES[index % REM_PALETTES.length],
          }));
          setReminders(backendReminders);
        }
      }
    } catch (error) {
      console.log('Failed to load reminders from backend:', error);
      // Keep hardcoded reminders as fallback
    }
  };

  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: "t1",
      title: "You Have\nAn Interview",
      start: new Date(new Date().setHours(10, 0, 0, 0)),
      end: new Date(new Date().setHours(11, 0, 0, 0)),
      colors: TASK_PALETTES[0],
    },
    {
      id: "t2",
      title: "XMUM Training Session",
      start: new Date(new Date().setHours(13, 0, 0, 0)),
      end: new Date(new Date().setHours(15, 0, 0, 0)),
      colors: TASK_PALETTES[1],
    },
    {
      id: "t3",
      title: "Yoga",
      start: new Date(addDays(now, 1).setHours(15, 0, 0, 0)),
      end: new Date(addDays(now, 1).setHours(16, 0, 0, 0)),
      colors: TASK_PALETTES[2],
    },
    {
      id: "t4",
      title: "Meeting",
      start: new Date(addDays(now, 2).setHours(16, 0, 0, 0)),
      end: new Date(addDays(now, 2).setHours(17, 0, 0, 0)),
      colors: TASK_PALETTES[3],
    },
    // January samples
    {
      id: "tJan1",
      title: "Orientation Briefing",
      start: new Date(year, 0, 10, 9, 0),
      end: new Date(year, 0, 10, 10, 0),
      colors: TASK_PALETTES[4],
    },
    {
      id: "tJan2",
      title: "New Year Meetup",
      start: new Date(year, 0, 25, 18, 0),
      end: new Date(year, 0, 25, 19, 0),
      colors: TASK_PALETTES[5],
    },
  ]);

  const [reminders, setReminders] = useState(() => [
    {
      id: "r1",
      title: "Take Medicine",
      at: new Date(new Date().setHours(19, 0, 0, 0)),
      colors: REM_PALETTES[0],
    },
    {
      id: "r2",
      title: "Hydration Break",
      at: new Date(new Date().setHours(15, 30, 0, 0)),
      colors: REM_PALETTES[1],
    },
  ]);

  const [taskColorIdx, setTaskColorIdx] = useState(6);
  const [remColorIdx, setRemColorIdx] = useState(2);

  const remaining = tasks.filter((t) => sameDay(t.start, now)).length;

  const [view, setView] = useState<ViewMode>("today");
  const [tab, setTab] = useState<Tab>("tasks");

  const [chooserVisible, setChooserVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [formType, setFormType] = useState<FormType>("task");

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date(now));
  const [startTime, setStartTime] = useState(new Date(now));
  const [endTime, setEndTime] = useState(new Date(now.getTime() + 30 * 60000));
  const [remTime, setRemTime] = useState(new Date(now));

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showRemPicker, setShowRemPicker] = useState(false);

  // Load data from backend when component mounts
  useEffect(() => {
    loadTasks();
    loadReminders();
  }, []);

  function openChooser() {
    setChooserVisible(true);
  }
  function startForm(type: FormType) {
    setFormType(type);
    setTitle("");
    setDate(new Date(now));
    setStartTime(new Date(now));
    setEndTime(new Date(now.getTime() + 30 * 60000));
    setRemTime(new Date(now));
    setChooserVisible(false);
    setFormVisible(true);
  }

  async function addItem() {
    if (!title.trim()) return;

    const token = await authService.getAccessToken();

    if (formType === "task") {
      const start = combineDateAndTime(date, startTime);
      const endRaw = combineDateAndTime(date, endTime);
      const end = endRaw <= start ? new Date(start.getTime() + 30 * 60000) : endRaw;

      // Create task in backend first
      if (token) {
        try {
          const taskData = {
            title,
            description: "",
            due_date: end.toISOString(),
            priority: "medium"
          };

          const response = await apiService.createTask(token, taskData);
          if (response.success && response.task) {
            // Add to local state with backend data
            const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
            setTaskColorIdx((i) => i + 1);

            setTasks((prev) => [
              ...prev,
              {
                id: response.task.id,
                title: response.task.title,
                start,
                end,
                colors: pair
              },
            ]);
          } else {
            console.log('Failed to create task in backend:', response.error);
            // Fallback to local task creation
            const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
            setTaskColorIdx((i) => i + 1);
            setTasks((prev) => [
              ...prev,
              { id: "t" + Date.now(), title, start, end, colors: pair },
            ]);
          }
        } catch (error) {
          console.log('Error creating task:', error);
          // Fallback to local task creation
          const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
          setTaskColorIdx((i) => i + 1);
          setTasks((prev) => [
            ...prev,
            { id: "t" + Date.now(), title, start, end, colors: pair },
          ]);
        }
      } else {
        // No token, fallback to local task creation
        const pair = TASK_PALETTES[taskColorIdx % TASK_PALETTES.length];
        setTaskColorIdx((i) => i + 1);
        setTasks((prev) => [
          ...prev,
          { id: "t" + Date.now(), title, start, end, colors: pair },
        ]);
      }

      // ✅ Award Reward Market: Add a task (+5), once per day
      await awardEarnOncePerDay("add_task", 5);

      if (sameDay(start, now)) {
        setView("today");
        setTab("tasks");
      } else {
        setView("calendar");
      }
    } else {
      const at = combineDateAndTime(now, remTime);

      // Create reminder in backend first
      if (token) {
        try {
          const reminderData = {
            title,
            description: "",
            reminder_time: at.toISOString(),
            repeat_type: "once"
          };

          const response = await apiService.createReminder(token, reminderData);
          if (response.success && response.reminder) {
            // Add to local state with backend data
            const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
            setRemColorIdx((i) => i + 1);
            setReminders((prev) => [
              ...prev,
              {
                id: response.reminder.id,
                title: response.reminder.title,
                at,
                colors: pair
              },
            ]);
          } else {
            console.log('Failed to create reminder in backend:', response.error);
            // Fallback to local reminder creation
            const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
            setRemColorIdx((i) => i + 1);
            setReminders((prev) => [
              ...prev,
              { id: "r" + Date.now(), title, at, colors: pair },
            ]);
          }
        } catch (error) {
          console.log('Error creating reminder:', error);
          // Fallback to local reminder creation
          const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
          setRemColorIdx((i) => i + 1);
          setReminders((prev) => [
            ...prev,
            { id: "r" + Date.now(), title, at, colors: pair },
          ]);
        }
      } else {
        // No token, fallback to local reminder creation
        const pair = REM_PALETTES[remColorIdx % REM_PALETTES.length];
        setRemColorIdx((i) => i + 1);
        setReminders((prev) => [
          ...prev,
          { id: "r" + Date.now(), title, at, colors: pair },
        ]);
      }

      // ✅ Optional: Add a reminder awards once per day (+10)
      await awardEarnOncePerDay("add_reminder", 10);

      setView("today");
      setTab("reminders");
    }

    setFormVisible(false);
  }

  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView
        contentContainerStyle={styles.container}
        bounces
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>
          {view === "today" ? "Today" : "Calendar"}
        </Text>

        <LinearGradient
          colors={["#EFE7FA", "#F7F0FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          {/* Switcher + add */}
          <View style={styles.segment}>
            <TouchableOpacity
              onPress={() => setView("today")}
              style={[styles.segmentPill, view === "today" && styles.segmentPillActive]}
            >
              <Text
                style={[styles.segmentText, view === "today" && styles.segmentTextActive]}
              >
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setView("calendar")}
              style={[styles.segmentPill, view === "calendar" && styles.segmentPillActive]}
            >
              <Text
                style={[styles.segmentText, view === "calendar" && styles.segmentTextActive]}
              >
                Calendar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addBtn} onPress={openChooser}>
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={22}
                color="rgba(0,0,0,0.4)"
              />
            </TouchableOpacity>
          </View>

          {view === "today" && (
            <>
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayName}>{dayName}</Text>
                  <Text style={styles.bigDay}>{day}</Text>
                  <Text style={styles.bigMonth}>{month}</Text>
                </View>

                <View style={styles.vDivider} />

                <View style={{ flex: 1, paddingLeft: 14 }}>
                  <Text style={styles.rightTime}>{time}</Text>
                  <Text style={styles.rightSub}>MALAYSIA</Text>
                  <View style={{ height: 10 }} />
                  <Text style={styles.rightTime}>{remaining} Tasks</Text>
                  <Text style={styles.rightSub}>Remaining</Text>
                </View>
              </View>

              <View style={styles.innerCard}>
                <View style={styles.innerTabs}>
                  <TouchableOpacity
                    onPress={() => setTab("tasks")}
                    style={[styles.innerTabPill, tab === "tasks" && styles.innerTabActive]}
                  >
                    <Text
                      style={[
                        styles.innerTabText,
                        tab === "tasks" && styles.innerTabTextActive,
                      ]}
                    >
                      Today Tasks
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setTab("reminders")}
                    style={[
                      styles.innerTabPill,
                      tab === "reminders" && styles.innerTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.innerTabText,
                        tab === "reminders" && styles.innerTabTextActive,
                      ]}
                    >
                      Reminders
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </LinearGradient>

        {view === "today" ? (
          tab === "tasks" ? (
            <View style={{ marginTop: 12 }}>
              {tasks
                .filter((t) => sameDay(t.start, now))
                .map((t) => (
                  <TaskCard
                    key={t.id}
                    title={t.title}
                    start={t.start}
                    end={t.end}
                    colors={(t.colors || TASK_PALETTES[0]) as [string, string]}
                  />
                ))}
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              {reminders.map((r) => (
                <ReminderCard
                  key={r.id}
                  title={r.title}
                  at={r.at}
                  colors={(r.colors || REM_PALETTES[0]) as [string, string]}
                />
              ))}
            </View>
          )
        ) : (
          <CalendarOverview tasks={tasks} />
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* CHOOSER */}
      <Modal
        transparent
        visible={chooserVisible}
        animationType="fade"
        onRequestClose={() => setChooserVisible(false)}
      >
        <View style={styles.backdrop} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Add new</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={styles.choiceBtn}
              onPress={() => startForm("task")}
            >
              <MaterialCommunityIcons name="calendar-clock" size={22} color="#444" />
              <Text style={styles.choiceText}>Task</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.choiceBtn}
              onPress={() => startForm("reminder")}
            >
              <MaterialCommunityIcons name="bell" size={22} color="#444" />
              <Text style={styles.choiceText}>Reminder</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => setChooserVisible(false)}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* FORM */}
      <Modal
        transparent
        visible={formVisible}
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.backdrop} />
        <View style={styles.formCard}>
          <LinearGradient colors={["#EFE7FA", "#F7F0FF"]} style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {formType === "task" ? "Add Task" : "Add Reminder"}
            </Text>
          </LinearGradient>

          <Text style={styles.label}>Title</Text>
          <TextInput
            placeholder={formType === "task" ? "e.g., Study Session" : "e.g., Take Medicine"}
            placeholderTextColor="rgba(0,0,0,0.35)"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />

          {formType === "task" && (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Date</Text>
              <TouchableOpacity
                style={styles.fieldBtn}
                onPress={() => setShowDatePicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color="#333" />
                <Text style={styles.fieldText}>
                  {new Intl.DateTimeFormat("en-MY", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(date)}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {formType === "task" ? (
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start</Text>
                <TouchableOpacity
                  style={styles.fieldBtn}
                  onPress={() => setShowStartPicker(true)}
                >
                  <MaterialCommunityIcons name="clock-outline" size={18} color="#333" />
                  <Text style={styles.fieldText}>
                    {new Intl.DateTimeFormat("en-MY", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(startTime)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End</Text>
                <TouchableOpacity
                  style={styles.fieldBtn}
                  onPress={() => setShowEndPicker(true)}
                >
                  <MaterialCommunityIcons
                    name="clock-time-five-outline"
                    size={18}
                    color="#333"
                  />
                  <Text style={styles.fieldText}>
                    {new Intl.DateTimeFormat("en-MY", {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(endTime)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Time (Today)</Text>
              <TouchableOpacity
                style={styles.fieldBtn}
                onPress={() => setShowRemPicker(true)}
              >
                <MaterialCommunityIcons name="alarm" size={18} color="#333" />
                <Text style={styles.fieldText}>
                  {new Intl.DateTimeFormat("en-MY", {
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(remTime)}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.pillBtn, { backgroundColor: "#eee" }]}
              onPress={() => setFormVisible(false)}
            >
              <Text style={[styles.pillText, { color: "#333" }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillBtn, { backgroundColor: colors.secondary }]}
              onPress={addItem}
            >
              <Text style={[styles.pillText, { color: "#fff" }]}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(_, v) => {
              setShowDatePicker(false);
              if (v) setDate(v);
            }}
          />
        )}
        {showStartPicker && (
          <DateTimePicker
            value={startTime}
            mode="time"
            is24Hour={false}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, v) => {
              setShowStartPicker(false);
              if (v) setStartTime(v);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={endTime}
            mode="time"
            is24Hour={false}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, v) => {
              setShowEndPicker(false);
              if (v) setEndTime(v);
            }}
          />
        )}
        {showRemPicker && (
          <DateTimePicker
            value={remTime}
            mode="time"
            is24Hour={false}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, v) => {
              setShowRemPicker(false);
              if (v) setRemTime(v);
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F3F3F4" },
  container: { paddingBottom: 16 },
  pageTitle: {
    marginTop: 4,
    marginLeft: 16,
    marginBottom: 10,
    fontFamily: fonts.body,
    fontSize: 16,
    color: "rgba(0,0,0,0.5)",
  },
  headerCard: {
    marginHorizontal: 12,
    borderRadius: 26,
    padding: 16,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  segment: { flexDirection: "row", alignItems: "center" },
  segmentPill: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentPillActive: { backgroundColor: "#fff" },
  segmentText: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.6)" },
  segmentTextActive: { color: "#111" },
  addBtn: { marginLeft: "auto" },

  headerRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  dayName: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "rgba(0,0,0,0.6)",
    marginBottom: 2,
    fontStyle: "italic",
  },
  bigDay: {
    fontFamily: fonts.heading,
    fontSize: 50,
    fontWeight: "700",
    color: "#111",
    lineHeight: 50,
  },
  bigMonth: {
    fontFamily: fonts.heading,
    fontSize: 50,
    color: "#111",
    letterSpacing: 3,
    marginTop: -6,
    fontWeight: "700",
  },
  vDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(0,0,0,0.15)",
    marginHorizontal: 14,
  },

  rightTime: { fontFamily: fonts.heading, fontSize: 18, color: "#111" },
  rightSub: {
    fontFamily: fonts.body,
    fontSize: fontSize.tiny,
    color: "rgba(0,0,0,0.55)",
    marginTop: 2,
    letterSpacing: 0.2,
  },

  innerCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginTop: 16,
  },
  innerTabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  innerTabPill: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  innerTabActive: { backgroundColor: colors.primary },
  innerTabText: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.65)" },
  innerTabTextActive: { color: "#fff" },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 140,
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 18, marginBottom: 12, color: "#222" },
  choiceRow: { flexDirection: "row", gap: 12 },
  choiceBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  choiceText: { fontFamily: fonts.body, fontSize: 14, color: "#333" },
  cancelLink: { marginTop: 12, alignSelf: "center" },
  cancelText: { fontFamily: fonts.body, fontSize: 14, color: "rgba(0,0,0,0.6)" },

  formCard: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 80,
    bottom: 80,
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
    padding: 16,
  },
  formHeader: { borderRadius: 18, padding: 12, marginBottom: 12 },
  formTitle: { fontFamily: fonts.heading, fontSize: 18, color: "#222" },
  label: { fontFamily: fonts.body, fontSize: 12, color: "rgba(0,0,0,0.6)", marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    fontFamily: fonts.body,
    fontSize: 14,
    color: "#111",
  },
  fieldBtn: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldText: { fontFamily: fonts.body, fontSize: 14, color: "#111" },
  timeRow: { flexDirection: "row", marginTop: 6 },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  pillBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pillText: { fontFamily: fonts.heading, fontSize: 14 },
});
