import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import CalendarScreen from "../screens/CalendarScreen";
import IslandScreen from "../screens/IslandScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { colors } from "../theme/colors";

export type TabParamList = {
  Calendar: undefined;
  Island: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Island"
      screenOptions={{ headerShown: false }}
      tabBar={(props: BottomTabBarProps) => <PillTabBar {...props} />}
    >
      {[
        <Tab.Screen key="cal" name="Calendar" component={CalendarScreen} />,
        <Tab.Screen key="isl" name="Island" component={IslandScreen} />,
        <Tab.Screen key="pro" name="Profile" component={ProfileScreen} />,
      ]}
    </Tab.Navigator>
  );
}

function PillTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const icons: Record<
    keyof TabParamList,
    keyof typeof MaterialCommunityIcons.glyphMap
  > = {
    Calendar: "calendar-month",
    Island: "palm-tree",
    Profile: "account",
  };

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || 8 }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const icon = icons[route.name as keyof TabParamList] ?? "circle";

          const onPress = () => {
            const e = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !e.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item}>
              <MaterialCommunityIcons
                name={icon}
                size={26}
                color={isFocused ? colors.primaryDark : "rgba(0,0,0,0.7)"}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    alignItems: "center",
  },
  pill: {
    backgroundColor: "#fff",
    height: 62,
    borderRadius: 32,
    width: "88%",
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 12,
    elevation: 6,
  },
  item: { width: 64, alignItems: "center", justifyContent: "center" },
});
