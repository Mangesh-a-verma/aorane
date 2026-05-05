import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Platform, ActivityIndicator, Animated, Modal, StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AdsSlider } from "@/components/AdsSlider";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { DS } from "@/lib/theme";
import {
  Flame, Droplets, Dumbbell,
  Utensils, Pill, ScanLine, Brain, FileText,
  ChevronRight, Sparkles, Plus, Beef, Wheat,
} from "lucide-react-native";

// ── WEATHER ─────────────────────────────────────────────────────────────────
type WeatherInfo = {
  temp: number; feelsLike: number; humidity: number;
  windspeed: number; emoji: string; description: string;
  city: string; healthTip: string; isDay: boolean;
};

function wmoEmoji(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code <= 2)  return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 65) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}
function wmoDesc(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 2)  return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 55) return "Drizzle";
  if (code <= 65) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Rain showers";
  return "Thunderstorm";
}
function weatherHealthTip(code: number, temp: number): string {
  if (temp >= 38) return "🔥 Bahut garmi hai — pani zyada piyein, outdoor exercise avoid karein";
  if (temp >= 32) return "☀️ Stay hydrated! Heat affects energy & focus";
  if (temp <= 12) return "🧣 Thandi hai — warm up well before exercising";
  if (code >= 51 && code <= 82) return "🌧️ Rainy day — indoor workout kaafi accha rahega";
  if (code >= 95) return "⛈️ Thunderstorm — ghar ke andar rehna safer hai";
  return "🌿 Great weather for a walk or outdoor exercise!";
}

const DELHI = { lat: 28.6139, lon: 77.2090, city: "New Delhi" };

function useWeather() {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [wLoading, setWLoading] = useState(true);

  useEffect(() => { fetchW(); }, []);

  const fetchW = async () => {
    setWLoading(true);
    // Cross-platform fetch with timeout (AbortSignal.timeout not available on all RN versions)
    const fetchWithTimeout = (url: string, ms: number) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
    };
    try {
      let lat = DELHI.lat, lon = DELHI.lon, city = DELHI.city;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          lat = loc.coords.latitude; lon = loc.coords.longitude;
          try {
            const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            city = geo?.city || geo?.subregion || geo?.region || city;
          } catch { /* geocode failed, keep coords */ }
        } else {
          try {
            const ip = await fetchWithTimeout("https://ipapi.co/json/", 4000);
            const ipd = await ip.json() as { latitude: number; longitude: number; city: string };
            if (ipd.latitude) { lat = ipd.latitude; lon = ipd.longitude; city = ipd.city || city; }
          } catch { /* use Delhi fallback */ }
        }
      } catch { /* location error — use Delhi fallback */ }

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current_weather=true&hourly=relativehumidity_2m,apparent_temperature&forecast_days=1&timezone=auto`;
      const res = await fetchWithTimeout(url, 10000);
      const d = await res.json() as {
        current_weather: { temperature: number; windspeed: number; weathercode: number; is_day: number };
        hourly: { relativehumidity_2m: number[]; apparent_temperature: number[] };
      };
      const hr = new Date().getHours();
      const temp = Math.round(d.current_weather.temperature);
      const code = d.current_weather.weathercode;
      const isDay = d.current_weather.is_day === 1;
      setWeather({
        temp,
        feelsLike: Math.round(d.hourly.apparent_temperature[hr] ?? temp),
        humidity: d.hourly.relativehumidity_2m[hr] ?? 0,
        windspeed: Math.round(d.current_weather.windspeed),
        emoji: wmoEmoji(code, isDay),
        description: wmoDesc(code),
        city,
        healthTip: weatherHealthTip(code, temp),
        isDay,
      });
    } catch { }
    setWLoading(false);
  };

  return { weather, wLoading, refetchWeather: fetchW };
}

function WeatherPill({
  weather, loading, onPress,
}: { weather: WeatherInfo | null; loading: boolean; onPress: () => void }) {
  if (loading) {
    return (
      <TouchableOpacity style={wp.pill} onPress={onPress} activeOpacity={0.85}>
        <ActivityIndicator size="small" color="#FFF" style={{ width: 16, height: 16 }} />
        <Text style={wp.pillTxt}>Loading weather…</Text>
      </TouchableOpacity>
    );
  }
  if (!weather) {
    return (
      <TouchableOpacity style={[wp.pill, { backgroundColor: "rgba(0,0,0,0.35)" }]} onPress={onPress} activeOpacity={0.85}>
        <Text style={wp.pillEmoji}>🌤️</Text>
        <Text style={wp.pillTxt}>Tap for weather</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={wp.pill} onPress={onPress} activeOpacity={0.85}>
      <Text style={wp.pillEmoji}>{weather.emoji}</Text>
      <Text style={wp.pillTxt}>{weather.temp}°C · {weather.city}</Text>
    </TouchableOpacity>
  );
}

function WeatherModal({
  weather, visible, onClose,
}: { weather: WeatherInfo | null; visible: boolean; onClose: () => void }) {
  if (!weather) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={wp.overlay} activeOpacity={1} onPress={onClose}>
        <LinearGradient
          colors={weather.isDay ? ["#1565C0", "#0D47A1"] : ["#1A237E", "#283593"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={wp.modal}
        >
          <Text style={wp.mCity}>📍 {weather.city}</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 40 }}>{weather.emoji}</Text>
            <Text style={wp.mTemp}>{weather.temp}°C</Text>
            <Text style={wp.mDesc}>{weather.description}</Text>
          </View>
          <View style={wp.mStats}>
            <Text style={wp.mStat}>🌡️ Feels {weather.feelsLike}°C</Text>
            <Text style={wp.mStat}>💧 Humidity {weather.humidity}%</Text>
            <Text style={wp.mStat}>🌬️ Wind {weather.windspeed} km/h</Text>
          </View>
          <View style={wp.tipRow}>
            <Text style={wp.tip}>{weather.healthTip}</Text>
          </View>
          <Text style={wp.mClose}>Tap anywhere to close</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Modal>
  );
}

const wp = StyleSheet.create({
  pill:      {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(21,101,192,0.88)", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    shadowColor: "#1565C0", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 5,
  },
  pillEmoji: { fontSize: 16 },
  pillTxt:   { fontSize: 13, color: "#FFF", fontFamily: "Inter_600SemiBold" },
  overlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", padding: 16 },
  modal:     { borderRadius: 22, padding: 20, marginBottom: 90 },
  mCity:     { fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_500Medium" },
  mTemp:     { fontSize: 42, color: "#FFF", fontFamily: "Inter_700Bold", lineHeight: 48 },
  mDesc:     { fontSize: 14, color: "rgba(255,255,255,0.8)", fontFamily: "Inter_400Regular", paddingBottom: 6 },
  mStats:    { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  mStat:     { fontSize: 13, color: "rgba(255,255,255,0.9)", fontFamily: "Inter_500Medium" },
  tipRow:    { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.18)" },
  tip:       { fontSize: 13, color: "#FFF", fontFamily: "Inter_400Regular", lineHeight: 20 },
  mClose:    { marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", fontFamily: "Inter_400Regular" },
});

function todayDate() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Good Night 🌙";
  if (h < 12) return "Good Morning ☀️";
  if (h < 17) return "Good Afternoon 🌤️";
  return "Good Evening 🌆";
}


// ── SUMMARY BANNER ─────────────────────────────────────────────────────────────
function SummaryBanner({ greeting, healthScore, calories, water, exerciseMin, activityPct }: {
  greeting: string; healthScore: number;
  calories: { eaten: number; burned: number };
  water: { current: number; goal: number };
  exerciseMin: number;
  activityPct: number;
}) {
  return (
    <LinearGradient
      colors={["#0668AD", "#0B84D6", "#38B6FF"]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={bn.card}
    >
      <View style={bn.shine1} />
      <View style={bn.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={bn.greet}>{greeting}</Text>
          <Text style={bn.sub}>Today's health overview</Text>
        </View>
        <View style={bn.scoreBlock}>
          <View style={bn.badge}>
            <Text style={bn.badgeNum}>{healthScore}</Text>
            <Text style={bn.badgeLbl}>HEALTH</Text>
          </View>
          <View style={bn.actBadge}>
            <Text style={bn.actNum}>{activityPct}%</Text>
            <Text style={bn.actLbl}>ACTIVE</Text>
          </View>
        </View>
      </View>
      <View style={bn.divider} />
      <View style={bn.statsRow}>
        {[
          { icon: <Utensils  size={13} color="rgba(255,255,255,0.9)" strokeWidth={2} />, val: String(calories.eaten),            lbl: "Kcal" },
          { icon: <Flame     size={13} color="rgba(255,255,255,0.9)" strokeWidth={2} />, val: String(calories.burned),           lbl: "Burned" },
          { icon: <Droplets  size={13} color="rgba(255,255,255,0.9)" strokeWidth={2} />, val: `${water.current}/${water.goal}`,  lbl: "Glass" },
          { icon: <Dumbbell  size={13} color="rgba(255,255,255,0.9)" strokeWidth={2} />, val: `${exerciseMin}m`,                 lbl: "Active" },
        ].map((s, i) => (
          <View key={i} style={bn.stat}>
            {s.icon}
            <Text style={bn.statVal}>{s.val}</Text>
            <Text style={bn.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
const bn = StyleSheet.create({
  card:     { borderRadius: 20, padding: 16, overflow: "hidden" },
  shine1:   { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.07)", top: -50, right: -30 },
  topRow:   { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  greet:    { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 2 },
  sub:      { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  scoreBlock: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  badge:    { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", minWidth: 56 },
  badgeNum: { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 20 },
  badgeLbl: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  actBadge: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", minWidth: 56 },
  actNum:   { color: "#FFF", fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 20 },
  actLbl:   { color: "rgba(255,255,255,0.85)", fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  divider:  { height: 0.8, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 12 },
  statsRow: { flexDirection: "row" },
  stat:     { flex: 1, alignItems: "center", gap: 4 },
  statVal:  { color: "#FFF", fontSize: 14, fontFamily: "Inter_700Bold" },
  statLbl:  { color: "rgba(255,255,255,0.72)", fontSize: 9.5, fontFamily: "Inter_400Regular" },
});

// ── NUTRITION CARD ─────────────────────────────────────────────────────────────
function NutritionCard({ calories, protein, carbs, fat }: {
  calories: number; protein: number; carbs: number; fat: number;
}) {
  const total = protein + carbs + fat || 1;
  const pctP = Math.round((protein / total) * 100);
  const pctC = Math.round((carbs / total) * 100);
  const pctF = 100 - pctP - pctC;

  const items = [
    { label: "Calories", value: `${calories}`, unit: "kcal", color: "#E8478C", icon: <Flame size={16} color="#E8478C" strokeWidth={2} />, width: "100%" as const },
    { label: "Protein",  value: `${protein}`,  unit: "g",    color: "#6366F1", icon: <Beef  size={16} color="#6366F1" strokeWidth={2} />, width: `${pctP}%` as `${number}%` },
    { label: "Carbs",    value: `${carbs}`,    unit: "g",    color: "#10B981", icon: <Wheat size={16} color="#10B981" strokeWidth={2} />, width: `${pctC}%` as `${number}%` },
    { label: "Fat",      value: `${fat}`,      unit: "g",    color: "#F59E0B", icon: <Droplets size={16} color="#F59E0B" strokeWidth={2} />, width: `${pctF}%` as `${number}%` },
  ];

  return (
    <View style={nc.card}>
      <View style={nc.header}>
        <Text style={nc.title}>Today's Nutrition</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/food" as never)}>
          <Text style={nc.viewAll}>Log Food</Text>
        </TouchableOpacity>
      </View>
      <View style={nc.grid}>
        {items.map((item, i) => (
          <View key={i} style={nc.item}>
            <View style={nc.itemTop}>
              {item.icon}
              <View style={nc.itemTextWrap}>
                <Text style={nc.itemVal}>{item.value}<Text style={nc.itemUnit}> {item.unit}</Text></Text>
                <Text style={nc.itemLabel}>{item.label}</Text>
              </View>
            </View>
            <View style={nc.barBg}>
              <View style={[nc.barFill, { backgroundColor: item.color, width: item.width }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
const nc = StyleSheet.create({
  card:      { backgroundColor: "#FFF", borderRadius: 20, padding: 16 },
  header:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title:     { fontSize: 15, fontFamily: "Inter_700Bold", color: DS.color.text },
  viewAll:   { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DS.color.primary },
  grid:      { gap: 10 },
  item:      { gap: 5 },
  itemTop:   { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTextWrap: { flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  itemVal:   { fontSize: 15, fontFamily: "Inter_700Bold", color: DS.color.text },
  itemUnit:  { fontSize: 11, fontFamily: "Inter_400Regular", color: DS.color.muted },
  itemLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: DS.color.muted },
  barBg:     { height: 5, borderRadius: 3, backgroundColor: "#F1F5F9" },
  barFill:   { height: 5, borderRadius: 3 },
});

// ── SERVICE TILE ───────────────────────────────────────────────────────────────
function ServiceTile({ icon, label, color, onPress, badge }: {
  icon: React.ReactNode; label: string; color: string; onPress?: () => void; badge?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      style={st.wrap} activeOpacity={1}
      onPressIn ={() => Animated.spring(sc, { toValue: 0.88, useNativeDriver: Platform.OS !== "web", damping: 10 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1,    useNativeDriver: Platform.OS !== "web", damping: 8  }).start()}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
    >
      <Animated.View style={[st.inner, { transform: [{ scale: sc }] }]}>
        <View style={[st.shadow3d, { backgroundColor: color + "44" }]} />
        <LinearGradient
          colors={[color + "DD", color + "FF"]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={st.circle}
        >
          {icon}
          {badge ? <View style={st.badgeDot}><Text style={st.badgeT}>{badge}</Text></View> : null}
        </LinearGradient>
        <Text style={st.lbl} numberOfLines={2}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
const st = StyleSheet.create({
  wrap:     { width: "33.33%", alignItems: "center", paddingVertical: 6 },
  inner:    { alignItems: "center", gap: 7, width: 64 },
  shadow3d: { position: "absolute", width: 44, height: 13, borderRadius: 10, top: 45, left: 10, opacity: 0.9 },
  circle:   { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  lbl:      { fontSize: 11, fontFamily: "Inter_600SemiBold", color: DS.color.text, textAlign: "center", lineHeight: 14, height: 28 },
  badgeDot: { position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeT:   { fontSize: 8, fontFamily: "Inter_700Bold", color: DS.color.primary },
});

// ── WATER DOTS ─────────────────────────────────────────────────────────────────
function WaterDots({ current, goal, onAdd }: { current: number; goal: number; onAdd: () => void }) {
  const total = Math.max(goal, 6);
  return (
    <View style={wd.wrap}>
      <View style={wd.header}>
        <Text style={wd.title}>Water Intake</Text>
        <Text style={wd.sub}>{current} of {goal} cups goal met</Text>
      </View>
      <View style={wd.row}>
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < current;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => { if (!filled) onAdd(); }}
              activeOpacity={filled ? 1 : 0.7}
              style={wd.dotWrap}
            >
              <View style={[wd.dot, filled ? wd.filled : wd.empty]}>
                {filled
                  ? <Droplets size={16} color="#FFF" strokeWidth={2} />
                  : <Plus size={14} color={DS.color.sky + "90"} strokeWidth={2.5} />
                }
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const wd = StyleSheet.create({
  wrap:    { backgroundColor: "#FFF", borderRadius: 20, padding: 16 },
  header:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title:   { fontSize: 14, fontFamily: "Inter_700Bold", color: DS.color.text },
  sub:     { fontSize: 11, fontFamily: "Inter_400Regular", color: DS.color.muted },
  row:     { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dotWrap: { flex: 1, alignItems: "center" },
  dot:     { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filled:  { backgroundColor: DS.color.sky },
  empty:   { backgroundColor: "#EBF5FB", borderWidth: 1.5, borderColor: DS.color.sky + "30" },
});

// ── STRESS CARD ────────────────────────────────────────────────────────────────
type StressToday = { checkedIn: boolean; latestScore: number | null; avgScore: number | null; count: number; latestMood: string | null; burnoutRisk: boolean };

function stressScoreColor(s: number): string {
  if (s < 26) return DS.color.green;
  if (s < 51) return "#F59E0B";
  if (s < 76) return "#F97316";
  return "#EF4444";
}
function stressScoreLabel(s: number): string {
  if (s < 26) return "Low";
  if (s < 51) return "Moderate";
  if (s < 76) return "Elevated";
  return "High Risk";
}

function StressCard({ data, onPress }: { data: StressToday | null; onPress: () => void }) {
  const hasScore = data?.checkedIn && data.latestScore !== null;
  const score    = data?.latestScore ?? 0;
  const col      = hasScore ? stressScoreColor(score) : "#8B5CF6";
  const label    = hasScore ? stressScoreLabel(score) : "Not checked in";

  const gradColors: [string, string] = hasScore
    ? (score < 26  ? ["#10B981", "#059669"]
      : score < 51 ? ["#F59E0B", "#D97706"]
      : score < 76 ? ["#F97316", "#EA580C"]
      : ["#EF4444", "#DC2626"])
    : ["#7C3AED", "#6D28D9"];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={{ borderRadius: 20, overflow: "hidden" }}>
      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sc.wrap}>
        <View style={sc.shine1} />
        <View style={sc.shine2} />
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={sc.badge}>
            <Brain size={12} color="#FFF" strokeWidth={2.5} />
            <Text style={sc.badgeTxt}> MENTAL WELLNESS</Text>
          </View>
          {data?.burnoutRisk && (
            <View style={sc.burnoutBadge}>
              <Text style={sc.burnoutTxt}>⚠️ Burnout Risk</Text>
            </View>
          )}
        </View>
        {/* Content row */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={sc.title}>Stress Check-In</Text>
            <Text style={sc.status}>
              {hasScore ? `${label} · ${data!.count} check-in${data!.count !== 1 ? "s" : ""} today` : "Tap to log your stress level"}
            </Text>
          </View>
          {hasScore ? (
            <View style={sc.ring}>
              <Text style={sc.ringNum}>{score}</Text>
              <Text style={sc.ringLabel}>/100</Text>
            </View>
          ) : (
            <View style={sc.addBtn}>
              <Plus size={20} color="#FFF" strokeWidth={2.5} />
            </View>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const sc = StyleSheet.create({
  wrap:        { borderRadius: 20, padding: 16, overflow: "hidden", minHeight: 100 },
  shine1:      { position: "absolute", top: -30, right: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.1)" },
  shine2:      { position: "absolute", bottom: -20, left: -10, width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(255,255,255,0.06)" },
  badge:       { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  badgeTxt:    { color: "#FFF", fontSize: 8.5, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  burnoutBadge:{ backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  burnoutTxt:  { color: "#FFF", fontSize: 9, fontFamily: "Inter_700Bold" },
  title:       { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 3 },
  status:      { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)" },
  ring:        { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  ringNum:     { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF", lineHeight: 18 },
  ringLabel:   { fontSize: 8, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  addBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
});

// ── QUICK STRESS MODAL ─────────────────────────────────────────────────────────
const QUICK_MOODS = [
  { score: 10, emoji: "😄", label: "Great",     color: "#10B981" },
  { score: 30, emoji: "🙂", label: "Good",      color: "#34D399" },
  { score: 50, emoji: "😐", label: "Okay",      color: "#F59E0B" },
  { score: 70, emoji: "😟", label: "Stressed",  color: "#F97316" },
  { score: 90, emoji: "😰", label: "Very High", color: "#EF4444" },
];

function QuickStressModal({
  visible, onClose, onSaved,
}: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (score: number) => {
    setSelected(score);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.logStress({ stressScore: score, stressType: "quick_checkin", mood: QUICK_MOODS.find(m => m.score === score)?.label?.toLowerCase() || "okay" });
      onSaved();
      onClose();
    } catch { } finally { setSaving(false); setSelected(null); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={qm.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={qm.sheet} onPress={() => {}}>
          <View style={qm.handle} />
          <Text style={qm.title}>How are you feeling? 💭</Text>
          <Text style={qm.sub}>Tap to log your stress level instantly</Text>
          <View style={qm.moodRow}>
            {QUICK_MOODS.map((m) => (
              <TouchableOpacity
                key={m.score}
                style={[qm.moodBtn, selected === m.score && { backgroundColor: m.color + "22", borderColor: m.color }]}
                onPress={() => handleSelect(m.score)}
                disabled={saving}
              >
                {saving && selected === m.score
                  ? <ActivityIndicator size="small" color={m.color} />
                  : <Text style={qm.emoji}>{m.emoji}</Text>
                }
                <Text style={[qm.label, { color: m.color }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={qm.detailBtn} onPress={() => { onClose(); router.push("/stress" as never); }}>
            <Text style={qm.detailTxt}>Detailed Check-in →</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const qm = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:     { backgroundColor: "#FFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  handle:    { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  title:     { fontSize: 20, fontFamily: "Inter_700Bold", color: "#1F2937", textAlign: "center", marginBottom: 6 },
  sub:       { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center", marginBottom: 22 },
  moodRow:   { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  moodBtn:   { flex: 1, alignItems: "center", gap: 6, padding: 10, borderRadius: 16, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  emoji:     { fontSize: 28 },
  label:     { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  detailBtn: { marginTop: 20, alignSelf: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" },
  detailTxt: { color: "#7C3AED", fontFamily: "Inter_600SemiBold", fontSize: 13 },
});

// ── MEDICINE ROW ───────────────────────────────────────────────────────────────
const mealColors: Record<string, string> = {
  before_meal: DS.color.orange, after_meal: DS.color.green, with_meal: DS.color.sky, anytime: DS.color.purple,
};
const mealLabels: Record<string, string> = {
  before_meal: "Before Breakfast", after_meal: "After Breakfast", with_meal: "With Meal", anytime: "Anytime",
};

// ── MAIN SCREEN ────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { weather, wLoading, refetchWeather } = useWeather();
  const [showWeatherModal, setShowWeatherModal] = useState(false);

  const [healthScore, setHealthScore] = useState(0);
  const [water,       setWater]       = useState({ current: 0, goal: 8 });
  const [calories,    setCalories]    = useState({ eaten: 0, burned: 0 });
  const [nutrition,   setNutrition]   = useState({ protein: 0, carbs: 0, fat: 0 });
  const [exerciseMin, setExerciseMin] = useState(0);
  const [activityPct, setActivityPct] = useState(0);
  const [stressToday, setStressToday] = useState<StressToday | null>(null);
  const [showStressModal, setShowStressModal] = useState(false);
  const [isLoading,   setIsLoading]   = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [isOffline,   setIsOffline]   = useState(false);
  const [userName,    setUserName]    = useState("");
  const [userGender,  setUserGender]  = useState("");
  const [medicines,   setMedicines]   = useState<Array<{
    id: string; medicineName: string; dosage?: string;
    mealTiming: string; reminderTimes: string[]; isActive: boolean;
  }>>([]);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scrollRef = useRef<ScrollView>(null);

  const greeting = getGreeting();

  const loadData = useCallback(async () => {
    try {
      // Detect offline state before loading
      const online = typeof navigator !== "undefined"
        ? navigator.onLine
        : true;
      setIsOffline(!online);

      const date = todayDate();
      const [scoreRes, waterRes, foodRes, exerciseRes, profileRes, medRes, activityRes, stressRes] = await Promise.allSettled([
        api.getHealthScore(date), api.getWaterLog(date), api.getFoodSummary(date),
        api.getExerciseLogs(date), api.getProfile(), api.getMedicineSchedules(),
        api.getActivePercent(), api.getStressToday(),
      ]);

      // If all API calls failed → likely offline
      const allFailed = [scoreRes, waterRes, foodRes, exerciseRes, profileRes, medRes, activityRes, stressRes]
        .every((r) => r.status === "rejected");
      if (allFailed) setIsOffline(true);
      if (scoreRes.status === "fulfilled") {
        const sc = scoreRes.value.score as Record<string, number>;
        setHealthScore(sc.healthScore ?? 0);
      }
      if (waterRes.status === "fulfilled")
        setWater({ current: waterRes.value.totalGlasses || 0, goal: waterRes.value.goal || 8 });
      if (foodRes.status === "fulfilled") {
        const summ = foodRes.value.summary as Record<string, number>;
        setCalories((c) => ({ ...c, eaten: Math.round(summ.totalCalories || 0) }));
        setNutrition({
          protein: Math.round(Number(summ.totalProteinG || 0)),
          carbs:   Math.round(Number(summ.totalCarbsG   || 0)),
          fat:     Math.round(Number(summ.totalFatG     || 0)),
        });
      }
      if (exerciseRes.status === "fulfilled") {
        const logs = exerciseRes.value.logs as Array<{ durationMinutes: number; caloriesBurned?: string }>;
        setExerciseMin(logs.reduce((s, l) => s + l.durationMinutes, 0));
        setCalories((c) => ({ ...c, burned: Math.round(logs.reduce((s, l) => s + Number(l.caloriesBurned || 0), 0)) }));
      }
      if (activityRes.status === "fulfilled") {
        setActivityPct(activityRes.value.pct ?? 0);
      }
      if (profileRes.status === "fulfilled") {
        const p = profileRes.value.profile as Record<string, string>;
        const name = p?.full_name || p?.fullName || "";
        setUserName(name.split(" ")[0] || "");
        setUserGender(p?.gender || "");
      }
      if (medRes.status === "fulfilled") {
        setMedicines(
          (medRes.value.schedules as typeof medicines).filter((m) => m.isActive)
        );
      }
      if (stressRes.status === "fulfilled") {
        setStressToday(stressRes.value as StressToday);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Dashboard] Data load error:", err);
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 460, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(slideAnim, { toValue: 0, damping: 18,   useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, []);

  useEffect(() => { loadData(); }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [loadData]));

  const handleAddWater = async () => {
    if (water.current >= water.goal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.logWater({ glassesCount: 1 });
      setWater((w) => ({ ...w, current: Math.min(w.current + 1, w.goal) }));
    } catch { }
  };

  const topPad = insets.top;

  if (isLoading) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F9FF" />
        <ActivityIndicator size="large" color={DS.color.primary} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F9FF" translucent={false} />
      <LinearGradient
        colors={["#F5F9FF", "#EAF3FC", "#F5F9FF"]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── OFFLINE BANNER ── */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📶 Internet nahi hai — data load nahi ho sakta. Online hone ke baad refresh karein.</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100, paddingTop: topPad + 12 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={DS.color.primary} colors={[DS.color.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── BODY ── */}
        <Animated.View style={[s.body, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* 1. SUMMARY BANNER */}
          <SummaryBanner
            greeting={greeting}
            healthScore={healthScore}
            calories={calories}
            water={water}
            exerciseMin={exerciseMin}
            activityPct={activityPct}
          />


          {/* 2. QUICK SERVICES */}
          <View style={s.surfaceCard}>
            <Text style={s.secTitle}>Quick Services</Text>
            <View style={s.grid}>
              {[
                { icon: <Utensils size={22} color="#FFF" strokeWidth={2.2} />, label: "Meal Log",  color: "#2EAD6E", route: "/(tabs)/food" },
                { icon: <Dumbbell size={22} color="#FFF" strokeWidth={2.2} />, label: "Exercise",  color: "#00A693",       route: "/(tabs)/exercise" },
                { icon: <Pill     size={22} color="#FFF" strokeWidth={2.2} />, label: "Medicine",  color: DS.color.primary, route: "/(tabs)/medicine",
                  badge: medicines.length > 0 ? String(medicines.length) : undefined },
                { icon: <ScanLine size={22} color="#FFF" strokeWidth={2.2} />, label: "AI Scan",   color: DS.color.primary, route: "/(tabs)/scan" },
                { icon: <Brain    size={22} color="#FFF" strokeWidth={2.2} />, label: "AI Coach",  color: "#6B4FA0", route: "/suggestions" },
                { icon: <FileText size={22} color="#FFF" strokeWidth={2.2} />, label: "Reports",   color: DS.color.sky,     route: "/health-report" },
              ].map((t, i) => (
                <ServiceTile
                  key={i} icon={t.icon} label={t.label} color={t.color}
                  badge={(t as { badge?: string }).badge}
                  onPress={() => router.push(t.route as never)}
                />
              ))}
            </View>
          </View>

          {/* 3. WATER INTAKE */}
          <WaterDots current={water.current} goal={Math.max(water.goal, 6)} onAdd={handleAddWater} />

          {/* 4. TODAY'S MEDICINES */}
          <View style={s.surfaceCard}>
            <View style={s.cardHeader}>
              <Text style={s.secTitle}>Today's Medicines 💊</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/medicine" as never)}>
                <Text style={s.viewAll}>View All</Text>
              </TouchableOpacity>
            </View>
            {medicines.length === 0 ? (
              <TouchableOpacity
                style={s.emptyRow}
                onPress={() => router.push("/(tabs)/medicine" as never)}
                activeOpacity={0.8}
              >
                <View style={[s.medIcon, { backgroundColor: DS.color.purple + "18" }]}>
                  <Pill size={15} color={DS.color.purple} strokeWidth={2} />
                </View>
                <Text style={s.emptyTxt}>No medicine schedule — Add one</Text>
                <ChevronRight size={14} color={DS.color.purple} strokeWidth={2} />
              </TouchableOpacity>
            ) : (
              medicines.slice(0, 3).map((med, idx) => (
                <View
                  key={med.id}
                  style={[s.medRow, idx === Math.min(medicines.length, 3) - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={[s.medIcon, { backgroundColor: (mealColors[med.mealTiming] || DS.color.purple) + "18" }]}>
                    <Pill size={15} color={mealColors[med.mealTiming] || DS.color.purple} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.medName}>{med.medicineName}{med.dosage ? ` · ${med.dosage}` : ""}</Text>
                    <Text style={s.medSub}>{med.reminderTimes[0] || ""} • {mealLabels[med.mealTiming] || "Anytime"}</Text>
                  </View>
                  <ChevronRight size={14} color={DS.color.muted} strokeWidth={1.5} />
                </View>
              ))
            )}
          </View>

          {/* 5. NUTRITION CARD */}
          <NutritionCard
            calories={calories.eaten}
            protein={nutrition.protein}
            carbs={nutrition.carbs}
            fat={nutrition.fat}
          />

          {/* 7. ADS SLIDER */}
          <AdsSlider />

          {/* 8. HEALTH TOOLS — clean light grid */}
          <View style={s.surfaceCard}>
            <Text style={s.secTitle}>Health Tools</Text>
            {[
              [
                { emoji: "🪪", label: "Health ID",  sub: "Your card",      route: "/scorecard",        iconBg: "#EDE9FE" },
                { emoji: "⌚", label: "Wearables",   sub: "Device sync",    route: "/wearable",          iconBg: "#DCFCE7" },
                { emoji: "💧", label: "Water",       sub: "Hydration",      route: "/water",             iconBg: "#E0F2FE" },
                { emoji: "🧘", label: "Stress",      sub: "Mood check",     route: "/stress",            iconBg: "#F3E8FF" },
              ],
              [
                { emoji: "😴", label: "Sleep",       sub: "Rest tracker",   route: "/sleep",             iconBg: "#EDE9FE" },
                { emoji: "🏃", label: "Exercise",    sub: "Workouts",       route: "/(tabs)/exercise",   iconBg: "#FEF3C7" },
                { emoji: "💊", label: "Medicine",    sub: "Reminders",      route: "/(tabs)/medicine",   iconBg: "#DBEAFE" },
                { emoji: "📊", label: "Reports",     sub: "Health report",  route: "/health-report",     iconBg: "#F1F5F9" },
              ],
              [
                userGender === "female"
                  ? { emoji: "🌸", label: "Period",  sub: "Cycle tracker",  route: "/period",            iconBg: "#FCE7F3" }
                  : { emoji: "🔥", label: "Calories", sub: "Nutrition",     route: "/(tabs)/food",       iconBg: "#FEE2E2" },
              ],
            ].map((row, ri) => (
              <View key={ri} style={[s.toolGrid, ri > 0 && { marginTop: 8 }]}>
                {row.map((t) => (
                  <TouchableOpacity key={t.label} style={{ flex: 1 }} onPress={() => router.push(t.route as never)} activeOpacity={0.85}>
                    <View style={s.toolCard}>
                      <View style={[s.toolIconBg, { backgroundColor: t.iconBg }]}>
                        <Text style={{ fontSize: 19 }}>{t.emoji}</Text>
                      </View>
                      <Text style={s.toolLabel} numberOfLines={1}>{t.label}</Text>
                      <Text style={s.toolSub} numberOfLines={1}>{t.sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>

          {/* 9. AI FEATURES — clean white cards with accent icons */}
          <View style={s.aiRow}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push("/suggestions" as never)} activeOpacity={0.85}>
              <View style={s.aiCleanCard}>
                <View style={[s.aiCleanIcon, { backgroundColor: "#E8F1FB" }]}>
                  <Sparkles size={16} color="#0B84D6" strokeWidth={2} />
                </View>
                <View style={[s.aiCleanBadge, { backgroundColor: "#E8F1FB" }]}>
                  <Text style={[s.aiCleanBadgeTxt, { color: "#0B84D6" }]}>AI</Text>
                </View>
                <Text style={s.aiCleanTitle}>Daily Coach</Text>
                <Text style={s.aiCleanSub}>AI nutrition</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push("/intelligence" as never)} activeOpacity={0.85}>
              <View style={s.aiCleanCard}>
                <View style={[s.aiCleanIcon, { backgroundColor: "#F0EBFA" }]}>
                  <Brain size={16} color="#6B4FA0" strokeWidth={2} />
                </View>
                <View style={[s.aiCleanBadge, { backgroundColor: "#F0EBFA" }]}>
                  <Text style={[s.aiCleanBadgeTxt, { color: "#6B4FA0" }]}>AI</Text>
                </View>
                <Text style={s.aiCleanTitle}>Intelligence</Text>
                <Text style={s.aiCleanSub}>Deep analysis</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowStressModal(true)} activeOpacity={0.85}>
              <View style={s.aiCleanCard}>
                <View style={[s.aiCleanIcon, { backgroundColor: "#E5F6F4" }]}>
                  <Brain size={16} color="#00A693" strokeWidth={2} />
                </View>
                <View style={[s.aiCleanBadge, { backgroundColor: "#E5F6F4" }]}>
                  <Text style={[s.aiCleanBadgeTxt, { color: "#00A693" }]}>Zen</Text>
                </View>
                <Text style={s.aiCleanTitle}>Stress</Text>
                <Text style={s.aiCleanSub}>Mood & breathe</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push("/blood" as never)} activeOpacity={0.85}>
              <View style={s.aiCleanCard}>
                <View style={[s.aiCleanIcon, { backgroundColor: "#FDEAEA" }]}>
                  <Text style={{ fontSize: 16 }}>🩸</Text>
                </View>
                <View style={[s.aiCleanBadge, { backgroundColor: "#FDEAEA" }]}>
                  <Text style={[s.aiCleanBadgeTxt, { color: "#D94040" }]}>SOS</Text>
                </View>
                <Text style={s.aiCleanTitle}>Blood SOS</Text>
                <Text style={s.aiCleanSub}>Find donors</Text>
              </View>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </ScrollView>

      <QuickStressModal
        visible={showStressModal}
        onClose={() => setShowStressModal(false)}
        onSaved={() => { loadData(); }}
      />

      {/* FLOATING WEATHER PILL — always visible above tab bar */}
      <View style={{
        position: "absolute", bottom: insets.bottom + 68,
        alignSelf: "center", zIndex: 99,
      }}>
        <WeatherPill
          weather={weather}
          loading={wLoading}
          onPress={() => { if (weather) setShowWeatherModal(true); else refetchWeather(); }}
        />
      </View>

      <WeatherModal
        weather={weather}
        visible={showWeatherModal}
        onClose={() => setShowWeatherModal(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { gap: 0 },
  offlineBanner: {
    backgroundColor: "#FFF3CD", borderBottomWidth: 1, borderBottomColor: "#FBBF24",
    paddingHorizontal: 14, paddingVertical: 9,
  },
  offlineTxt: {
    fontSize: 12, fontFamily: "Inter_500Medium", color: "#92400E", textAlign: "center",
  },

  body:     { paddingHorizontal: 14, paddingTop: 0, gap: 12 },

  surfaceCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 16 },
  cardHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  secTitle:    { fontSize: 15, fontFamily: "Inter_700Bold", color: DS.color.text, marginBottom: 14 },
  viewAll:     { fontSize: 12, fontFamily: "Inter_600SemiBold", color: DS.color.primary },

  grid: { flexDirection: "row", flexWrap: "wrap" },

  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: DS.color.purple + "0D", borderRadius: 12, padding: 12 },
  emptyTxt: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: DS.color.muted },
  medRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E4ECF4" },
  medIcon:  { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  medName:  { fontSize: 13, fontFamily: "Inter_600SemiBold", color: DS.color.text },
  medSub:   { fontSize: 11, fontFamily: "Inter_400Regular", color: DS.color.muted, marginTop: 1 },

  aiGrid:    { flexDirection: "row", gap: 6 },
  aiCard:    { flex: 1, borderRadius: 16, padding: 9, minHeight: 96, overflow: "hidden", gap: 4 },
  aiShine:   { position: "absolute", top: -18, right: -18, width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.1)" },
  aiBadge:   { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start" },
  aiBadgeTxt:{ color: "#FFF", fontSize: 7.5, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  aiIconBox: { width: 28, height: 28, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  aiTitle:   { fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFF", lineHeight: 15 },
  aiSub:     { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.82)", lineHeight: 12 },

  // ── Clean Health Tools (Airtel-style) ──────────────────────
  toolGrid:       { flexDirection: "row", gap: 7 },
  toolCard:       { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, backgroundColor: "#FFFFFF", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#E4ECF4" },
  toolIconBg:     { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  toolLabel:      { fontSize: 11, fontFamily: "Inter_700Bold", color: "#0D1B2A", textAlign: "center" },
  toolSub:        { fontSize: 9, fontFamily: "Inter_400Regular", color: "#8FA3BC", textAlign: "center" },

  // ── Clean AI Row ───────────────────────────────────────────
  aiRow:          { flexDirection: "row", gap: 7 },
  aiCleanCard:    { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, backgroundColor: "#FFFFFF", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#E4ECF4" },
  aiCleanIcon:    { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  aiCleanBadge:   { borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "center" },
  aiCleanBadgeTxt:{ fontSize: 7.5, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  aiCleanTitle:   { fontSize: 11, fontFamily: "Inter_700Bold", color: "#0D1B2A", textAlign: "center" },
  aiCleanSub:     { fontSize: 8.5, fontFamily: "Inter_400Regular", color: "#8FA3BC", textAlign: "center" },
});
