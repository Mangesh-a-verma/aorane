import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Alert, Dimensions, ActivityIndicator, Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/lib/api";

const { width: W } = Dimensions.get("window");
const DOC_W = Math.min(W - 24, 480);

type ReportType = "weekly" | "monthly";
type CompanySettings = {
  companyName: string; companyLogoUrl: string | null; tagline: string | null;
  website: string | null; supportPhone: string | null; supportEmail: string | null;
  address: string | null; primaryColor: string; accentColor: string;
  reportHeaderText: string | null; reportFooterText: string | null;
  reportLogoUrl: string | null; weeklyReportEnabled: boolean; monthlyReportEnabled: boolean;
};
type Scorecard = {
  aoraneId: string; name: string; bloodGroup: string; bmi: string; bmiCategory: string;
  plan: string; gender: string; age: number | null; city: string | null; state: string | null;
  activePercent: { overall: number; foodPct: number; waterPct: number; exercisePct: number; medicinePct: number; };
};

const DEFAULT_CO: CompanySettings = {
  companyName: "AORANE Health", companyLogoUrl: null, tagline: "Your health, in your hands",
  website: "aorane.com", supportPhone: null, supportEmail: null, address: null,
  primaryColor: "#0077B6", accentColor: "#00B896",
  reportHeaderText: null, reportFooterText: null, reportLogoUrl: null,
  weeklyReportEnabled: true, monthlyReportEnabled: true,
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}
function getDateRange(type: ReportType): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  if (type === "weekly") {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { from, to };
  } else {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to };
  }
}
function getActiveLabel(pct: number): string {
  if (pct >= 90) return "Excellent";
  if (pct >= 70) return "Good";
  if (pct >= 50) return "Average";
  if (pct >= 30) return "Low";
  return "Inactive";
}
function getActiveColor(pct: number): string {
  if (pct >= 70) return "#10B981";
  if (pct >= 40) return "#F59E0B";
  return "#EF4444";
}

function buildReportHtml(
  card: Scorecard | null,
  company: CompanySettings,
  reportType: ReportType,
  dateRange: { from: Date; to: Date },
  generatedAt: Date
): string {
  const overall = card?.activePercent?.overall ?? 0;
  const pColor = company.primaryColor || "#0077B6";
  const aColor = company.accentColor || "#00B896";
  const reportNo = Math.floor(Math.random() * 90000 + 10000);

  const metrics = [
    { label: "Nutrition", value: card?.activePercent?.foodPct ?? 0, weight: "35%" },
    { label: "Hydration", value: card?.activePercent?.waterPct ?? 0, weight: "30%" },
    { label: "Exercise", value: card?.activePercent?.exercisePct ?? 0, weight: "25%" },
    { label: "Medicine", value: card?.activePercent?.medicinePct ?? 0, weight: "10%" },
  ];

  const metricsRows = [
    { param: "Body Mass Index (BMI)", value: card?.bmi || "N/A", cat: card?.bmiCategory || "N/A" },
    { param: "Blood Group", value: card?.bloodGroup || "N/A", cat: "Recorded" },
    { param: `${reportType === "weekly" ? "Weekly" : "Monthly"} Active Score`, value: `${overall}%`, cat: getActiveLabel(overall) },
    { param: "Nutrition Adherence", value: `${card?.activePercent?.foodPct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.foodPct ?? 0) },
    { param: "Hydration Score", value: `${card?.activePercent?.waterPct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.waterPct ?? 0) },
    { param: "Exercise Adherence", value: `${card?.activePercent?.exercisePct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.exercisePct ?? 0) },
    { param: "Medicine Adherence", value: `${card?.activePercent?.medicinePct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.medicinePct ?? 0) },
  ];

  const insightText = overall >= 70
    ? `Your health activity is ${getActiveLabel(overall).toLowerCase()} this ${reportType === "weekly" ? "week" : "month"}. Keep maintaining your current habits. Consistency is key to long-term health improvement.`
    : `Your ${reportType === "weekly" ? "weekly" : "monthly"} health score of ${overall}% shows room for improvement. Focus on increasing ${(card?.activePercent?.waterPct ?? 0) < 50 ? "water intake" : (card?.activePercent?.foodPct ?? 0) < 50 ? "meal logging" : "daily exercise"}. Small daily improvements lead to significant health gains.`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #F5F7FA; padding: 20px; }
  .doc { background: #fff; max-width: 700px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
  .letterhead { background: linear-gradient(to right, ${pColor}, ${aColor}); padding: 20px 24px; display: flex; align-items: center; gap: 16px; }
  .letterhead-text h1 { color: #fff; font-size: 22px; letter-spacing: 1px; }
  .letterhead-text p { color: rgba(255,255,255,0.75); font-size: 11px; margin-top: 2px; }
  .letterhead-text small { color: rgba(255,255,255,0.55); font-size: 9px; }
  .letterhead-right { margin-left: auto; text-align: right; }
  .letterhead-right span { display: block; color: rgba(255,255,255,0.65); font-size: 9px; }
  .letterhead-right strong { color: #fff; font-size: 16px; letter-spacing: 1px; }
  .info-bar { display: flex; border-bottom: 1px solid #E5EFF7; }
  .info-cell { flex: 1; padding: 10px 12px; }
  .info-cell + .info-cell { border-left: 1px solid #E5EFF7; }
  .info-label { font-size: 8px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-val { font-size: 11px; color: #0D1F33; font-weight: bold; margin-top: 2px; }
  .section { padding: 16px 20px; }
  .section-title { font-size: 10px; font-weight: bold; color: ${pColor}; text-transform: uppercase; letter-spacing: 0.8px; border-left: 3px solid ${pColor}; padding-left: 8px; margin-bottom: 12px; }
  .patient-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .patient-field { background: #F8FAFC; border-radius: 6px; padding: 8px 12px; min-width: 140px; border: 1px solid #E5EFF7; }
  .patient-label { font-size: 8px; color: #9CA3AF; text-transform: uppercase; }
  .patient-val { font-size: 13px; font-weight: bold; color: #0D1F33; margin-top: 2px; }
  .ruler { height: 1px; background: #E5EFF7; margin: 0 20px; }
  .score-row { display: flex; align-items: center; gap: 20px; margin-top: 12px; }
  .score-circle { width: 90px; height: 90px; border-radius: 50%; border: 3px solid ${getActiveColor(overall)}; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .score-num { font-size: 26px; font-weight: bold; color: ${getActiveColor(overall)}; }
  .score-lbl { font-size: 9px; color: ${getActiveColor(overall)}; margin-top: 2px; }
  .metric-bar-wrap { flex: 1; }
  .metric-row { margin-bottom: 8px; }
  .metric-header { display: flex; justify-content: space-between; font-size: 10px; color: #0D1F33; margin-bottom: 3px; }
  .bar-bg { height: 6px; background: #F0F4F8; border-radius: 3px; }
  .bar-fill { height: 6px; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${pColor}18; padding: 8px 10px; font-size: 9px; color: #0D1F33; text-align: left; text-transform: uppercase; }
  td { padding: 8px 10px; font-size: 10px; color: #0D1F33; border-bottom: 1px solid #F0F4F8; }
  tr:nth-child(even) td { background: #FAFBFC; }
  .insight-box { background: #FFFBEB; border-radius: 8px; padding: 14px 16px; margin: 0 20px; }
  .insight-title { font-size: 10px; font-weight: bold; color: #92400E; margin-bottom: 6px; }
  .insight-text { font-size: 10px; color: #78350F; line-height: 1.6; }
  .disclaimer { padding: 10px 20px; font-size: 8px; color: #9CA3AF; text-align: center; line-height: 1.5; }
  .footer { background: linear-gradient(to right, ${pColor}18, ${aColor}18); padding: 14px 20px; text-align: center; border-top: 1px solid #E5EFF7; }
  .footer-co { font-size: 12px; font-weight: bold; color: ${pColor}; letter-spacing: 0.5px; }
  .footer-sub { font-size: 9px; color: #6B7280; margin-top: 3px; }
  .footer-line { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px solid #E5EFF7; font-size: 8px; color: #9CA3AF; }
</style>
</head>
<body>
<div class="doc">
  <div class="letterhead">
    <div class="letterhead-text">
      <h1>${company.companyName}</h1>
      ${company.tagline ? `<p>${company.tagline}</p>` : ""}
      ${company.website ? `<small>${company.website}</small>` : ""}
    </div>
    <div class="letterhead-right">
      <span>REPORT TYPE</span>
      <strong>${reportType === "weekly" ? "WEEKLY" : "MONTHLY"}</strong>
    </div>
  </div>

  <div class="info-bar">
    <div class="info-cell">
      <div class="info-label">Report Period</div>
      <div class="info-val">${formatDate(dateRange.from)} — ${formatDate(dateRange.to)}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Generated On</div>
      <div class="info-val">${formatDate(generatedAt)}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Report No.</div>
      <div class="info-val">#${reportNo}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Patient Information</div>
    <div class="patient-grid">
      <div class="patient-field"><div class="patient-label">Patient Name</div><div class="patient-val">${card?.name || "—"}</div></div>
      <div class="patient-field"><div class="patient-label">AORANE ID</div><div class="patient-val">${card?.aoraneId ? card.aoraneId.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3") : "—"}</div></div>
      <div class="patient-field"><div class="patient-label">Age</div><div class="patient-val">${card?.age ? `${card.age} Years` : "—"}</div></div>
      <div class="patient-field"><div class="patient-label">Gender</div><div class="patient-val">${card?.gender ? card.gender.charAt(0).toUpperCase() + card.gender.slice(1) : "—"}</div></div>
      <div class="patient-field"><div class="patient-label">Blood Group</div><div class="patient-val" style="color:#DC2626">${card?.bloodGroup || "—"}</div></div>
      <div class="patient-field"><div class="patient-label">BMI</div><div class="patient-val">${card?.bmi ? `${card.bmi} (${card.bmiCategory})` : "—"}</div></div>
      <div class="patient-field"><div class="patient-label">Location</div><div class="patient-val">${card?.city ? `${card.city}${card.state ? `, ${card.state}` : ""}` : "—"}</div></div>
      <div class="patient-field"><div class="patient-label">Health Plan</div><div class="patient-val">${(card?.plan || "free").toUpperCase()}</div></div>
    </div>
  </div>

  <div class="ruler"></div>

  <div class="section">
    <div class="section-title">Activity Score — ${reportType === "weekly" ? "This Week" : "This Month"}</div>
    <div class="score-row">
      <div class="score-circle">
        <span class="score-num">${overall}%</span>
        <span class="score-lbl">${getActiveLabel(overall)}</span>
      </div>
      <div class="metric-bar-wrap">
        ${metrics.map(m => `
        <div class="metric-row">
          <div class="metric-header">
            <span>${m.label} <span style="color:#9CA3AF;font-size:8px">(${m.weight})</span></span>
            <strong style="color:${getActiveColor(m.value)}">${m.value}%</strong>
          </div>
          <div class="bar-bg">
            <div class="bar-fill" style="width:${Math.max(m.value, 2)}%;background:${getActiveColor(m.value)}"></div>
          </div>
        </div>`).join("")}
      </div>
    </div>
  </div>

  <div class="ruler"></div>

  <div class="section">
    <div class="section-title">Health Metrics Summary</div>
    <table>
      <tr><th>Parameter</th><th>Value</th><th>Status</th></tr>
      ${metricsRows.map((r, i) => `
      <tr>
        <td>${r.param}</td>
        <td><strong>${r.value}</strong></td>
        <td style="color:${getActiveColor(parseInt(r.value)||0)};font-weight:bold">${r.cat}</td>
      </tr>`).join("")}
    </table>
  </div>

  <div class="ruler"></div>

  <div class="section" style="padding-bottom:4px">
    <div class="insight-box">
      <div class="insight-title">📋 AI HEALTH INSIGHTS</div>
      <div class="insight-text">${insightText}</div>
    </div>
  </div>

  <div class="disclaimer">
    This report is auto-generated by AORANE Health platform and is for personal health tracking purposes only.
    It does not constitute medical advice. Please consult a qualified healthcare professional for medical diagnosis or treatment.
  </div>

  <div class="footer">
    <div class="footer-co">${company.companyName}</div>
    <div class="footer-sub">${[company.website, company.supportEmail].filter(Boolean).join(" · ") || "aorane.com"}</div>
    <div class="footer-line">
      <span>CONFIDENTIAL — FOR PATIENT USE ONLY</span>
      <span>Generated: ${formatDate(generatedAt)}</span>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function captureAndDownloadWeb(elementId: string, filename: string): Promise<void> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const el = document.getElementById(elementId);
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#FFFFFF", logging: false });
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename; a.click();
  } catch { Alert.alert("Error", "Report capture failed. Please try again."); }
}

async function downloadPdfNative(html: string, filename: string): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Share ${filename}`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("Saved!", `Report saved as PDF.`);
    }
  } catch {
    Alert.alert("Error", "PDF generate karne mein problem aayi. Dobara try karein.");
  }
}

export default function HealthReportScreen() {
  const insets = useSafeAreaInsets();
  const [reportType, setReportType] = useState<ReportType>("weekly");
  const [card, setCard] = useState<Scorecard | null>(null);
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_CO);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const dateRange = getDateRange(reportType);
  const generatedAt = new Date();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [sc, co] = await Promise.all([api.getScorecard(), api.getCompanySettings()]);
      setCard(sc as Scorecard);
      setCompany({ ...DEFAULT_CO, ...co.settings });
    } catch { }
    setLoading(false);
  };

  const handleDownload = async () => {
    setDownloading(true);
    const name = card?.name?.replace(/\s+/g, "_") || "User";
    const filename = `AORANE_${reportType}_report_${name}`;
    if (Platform.OS === "web") {
      await captureAndDownloadWeb("health-report-doc", `${filename}.png`);
    } else {
      const html = buildReportHtml(card, company, reportType, dateRange, generatedAt);
      await downloadPdfNative(html, `${filename}.pdf`);
    }
    setDownloading(false);
  };

  const handleShare = async () => {
    setSharing(true);
    const name = card?.name?.replace(/\s+/g, "_") || "User";
    const filename = `AORANE_${reportType}_report_${name}`;
    if (Platform.OS === "web") {
      try {
        const html2canvas = (await import("html2canvas")).default;
        const el = document.getElementById("health-report-doc");
        if (!el) { setSharing(false); return; }
        const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: "#FFFFFF", logging: false });
        const dataUrl = canvas.toDataURL("image/png");
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `${filename}.png`, { type: "image/png" });
        if ("share" in navigator) {
          try { await (navigator as unknown as { share: (d: unknown) => Promise<void> }).share({ title: "AORANE Health Report", files: [file] }); }
          catch { const a = document.createElement("a"); a.href = dataUrl; a.download = `${filename}.png`; a.click(); }
        } else {
          const a = document.createElement("a"); a.href = dataUrl; a.download = `${filename}.png`; a.click();
        }
      } catch { Alert.alert("Error", "Share failed."); }
    } else {
      const html = buildReportHtml(card, company, reportType, dateRange, generatedAt);
      await downloadPdfNative(html, `${filename}.pdf`);
    }
    setSharing(false);
  };

  const logoUrl = company.reportLogoUrl || company.companyLogoUrl;
  const pColor = company.primaryColor || "#0077B6";

  const metrics = [
    { icon: "🍛", label: "Nutrition", value: card?.activePercent?.foodPct ?? 0, weight: "35%", desc: "Food logging adherence" },
    { icon: "💧", label: "Hydration", value: card?.activePercent?.waterPct ?? 0, weight: "30%", desc: "Water intake tracking" },
    { icon: "🏃", label: "Exercise", value: card?.activePercent?.exercisePct ?? 0, weight: "25%", desc: "Physical activity logged" },
    { icon: "💊", label: "Medicine", value: card?.activePercent?.medicinePct ?? 0, weight: "10%", desc: "Medicine adherence" },
  ];

  const overall = card?.activePercent?.overall ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F7FA" }}>
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: 100, paddingHorizontal: 12 }}>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, paddingHorizontal: 4 }}>
          <TouchableOpacity onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,119,182,0.1)", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name="arrow-back" size={18} color="#0077B6" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#0D1F33", fontFamily: "Inter_700Bold", fontSize: 20 }}>Health Report</Text>
            <Text style={{ color: "#7A90A4", fontSize: 11, fontFamily: "Inter_400Regular" }}>
              {Platform.OS === "web" ? "Download as image or share" : "Download as PDF or share"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: "#FFF", borderRadius: 14, padding: 4, marginBottom: 16, marginHorizontal: 4, borderWidth: 1, borderColor: "#E5EFF7" }}>
          {(["weekly", "monthly"] as ReportType[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => setReportType(t)} style={{ flex: 1 }}>
              <LinearGradient
                colors={reportType === t ? [pColor, company.accentColor || "#00B896"] : ["transparent", "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: reportType === t ? "#FFF" : "#7A90A4" }}>
                  {t === "weekly" ? "Saptahik Report" : "Maasik Report"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 80 }}>
            <ActivityIndicator size="large" color="#0077B6" />
            <Text style={{ color: "#7A90A4", fontFamily: "Inter_400Regular", marginTop: 12 }}>Report taiyar ho rahi hai...</Text>
          </View>
        ) : (
          <>
            <View
              {...(Platform.OS === "web" ? { id: "health-report-doc" } : {})}
              style={[styles.doc, { width: DOC_W, alignSelf: "center" }]}
            >
              <LinearGradient colors={[pColor, company.accentColor || "#00B896"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.letterhead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)" }} resizeMode="contain" />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 22 }}>🏥</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 }}>{company.companyName}</Text>
                    {company.tagline && <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 }}>{company.tagline}</Text>}
                    {company.website && <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontFamily: "Inter_400Regular" }}>{company.website}</Text>}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 8, fontFamily: "Inter_400Regular" }}>REPORT TYPE</Text>
                    <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1 }}>{reportType === "weekly" ? "WEEKLY" : "MONTHLY"}</Text>
                  </View>
                </View>
              </LinearGradient>

              {company.reportHeaderText && (
                <View style={{ backgroundColor: "#F0F7FF", padding: 10, borderBottomWidth: 1, borderColor: "#DCEDF8" }}>
                  <Text style={{ color: "#0D1F33", fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 15 }}>{company.reportHeaderText}</Text>
                </View>
              )}

              <View style={styles.infoBar}>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>REPORT PERIOD</Text>
                  <Text style={styles.infoVal}>{formatDate(dateRange.from)} — {formatDate(dateRange.to)}</Text>
                </View>
                <View style={[styles.infoCell, { borderLeftWidth: 1, borderColor: "#E5EFF7" }]}>
                  <Text style={styles.infoLabel}>GENERATED ON</Text>
                  <Text style={styles.infoVal}>{formatDate(generatedAt)}</Text>
                </View>
                <View style={[styles.infoCell, { borderLeftWidth: 1, borderColor: "#E5EFF7" }]}>
                  <Text style={styles.infoLabel}>REPORT NO.</Text>
                  <Text style={styles.infoVal}>#{Math.floor(Math.random() * 90000 + 10000)}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { borderColor: pColor }]}>PATIENT INFORMATION</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                  {[
                    { label: "Patient Name", value: card?.name || "—" },
                    { label: "AORANE ID", value: card?.aoraneId ? card.aoraneId.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3") : "—" },
                    { label: "Age", value: card?.age ? `${card.age} Years` : "—" },
                    { label: "Gender", value: card?.gender ? card.gender.charAt(0).toUpperCase() + card.gender.slice(1) : "—" },
                    { label: "Blood Group", value: card?.bloodGroup || "—" },
                    { label: "BMI", value: card?.bmi ? `${card.bmi} (${card.bmiCategory})` : "—" },
                    { label: "Location", value: card?.city ? `${card.city}${card.state ? `, ${card.state}` : ""}` : "—" },
                    { label: "Health Plan", value: card?.plan?.toUpperCase() || "FREE" },
                  ].map((item) => (
                    <View key={item.label} style={styles.patientField}>
                      <Text style={styles.patientLabel}>{item.label}</Text>
                      <Text style={[styles.patientVal, item.label === "Blood Group" && { color: "#DC2626" }]}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.ruler} />

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { borderColor: pColor }]}>ACTIVITY SCORE — {reportType === "weekly" ? "THIS WEEK" : "THIS MONTH"}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 16 }}>
                  <View style={[styles.scoreCircle, { borderColor: getActiveColor(overall) }]}>
                    <Text style={[styles.scoreNum, { color: getActiveColor(overall) }]}>{overall}%</Text>
                    <Text style={[styles.scoreLabel, { color: getActiveColor(overall) }]}>{getActiveLabel(overall)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    {metrics.map((m) => (
                      <View key={m.label}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, color: "#0D1F33", fontFamily: "Inter_500Medium" }}>{m.icon} {m.label} <Text style={{ color: "#9CA3AF", fontSize: 8 }}>({m.weight})</Text></Text>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: getActiveColor(m.value) }}>{m.value}%</Text>
                        </View>
                        <View style={{ height: 5, backgroundColor: "#F0F4F8", borderRadius: 3, overflow: "hidden" }}>
                          <View style={{ height: 5, width: `${Math.max(m.value, 2)}%` as `${number}%`, backgroundColor: getActiveColor(m.value), borderRadius: 3 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.ruler} />

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { borderColor: pColor }]}>HEALTH METRICS SUMMARY</Text>
                <View style={styles.table}>
                  <View style={[styles.tableRow, { backgroundColor: `${pColor}12` }]}>
                    <Text style={[styles.thCell, { flex: 2 }]}>PARAMETER</Text>
                    <Text style={[styles.thCell, { flex: 1.5 }]}>VALUE</Text>
                    <Text style={[styles.thCell, { flex: 1 }]}>STATUS</Text>
                  </View>
                  {[
                    { param: "Body Mass Index (BMI)", value: card?.bmi || "N/A", cat: card?.bmiCategory || "N/A" },
                    { param: "Blood Group", value: card?.bloodGroup || "N/A", cat: "Recorded" },
                    { param: `${reportType === "weekly" ? "Weekly" : "Monthly"} Active Score`, value: `${overall}%`, cat: getActiveLabel(overall) },
                    { param: "Nutrition Adherence", value: `${card?.activePercent?.foodPct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.foodPct ?? 0) },
                    { param: "Hydration Score", value: `${card?.activePercent?.waterPct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.waterPct ?? 0) },
                    { param: "Exercise Adherence", value: `${card?.activePercent?.exercisePct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.exercisePct ?? 0) },
                    { param: "Medicine Adherence", value: `${card?.activePercent?.medicinePct ?? 0}%`, cat: getActiveLabel(card?.activePercent?.medicinePct ?? 0) },
                  ].map((row, i) => (
                    <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: "#FAFBFC" }]}>
                      <Text style={[styles.tdCell, { flex: 2 }]}>{row.param}</Text>
                      <Text style={[styles.tdCell, { flex: 1.5, fontFamily: "Inter_600SemiBold" }]}>{row.value}</Text>
                      <Text style={[styles.tdCell, { flex: 1, color: getActiveColor(parseInt(row.value) || 0), fontFamily: "Inter_600SemiBold", fontSize: 9 }]}>{row.cat}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.ruler} />

              <View style={[styles.section, { backgroundColor: "#FFFBEB", borderRadius: 8, padding: 12, marginHorizontal: 12 }]}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <Text style={{ fontSize: 18 }}>📋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#92400E", marginBottom: 4 }}>AI HEALTH INSIGHTS</Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#78350F", lineHeight: 16 }}>
                      {overall >= 70
                        ? `Aapki health activity is ${reportType === "weekly" ? "week" : "month"} mein ${getActiveLabel(overall).toLowerCase()} hai. Apni aadatein banaaye rakho — consistency hi long-term health ka secret hai.`
                        : `Aapka ${reportType === "weekly" ? "weekly" : "monthly"} score ${overall}% hai, isme aur sudhaar ki gunjaish hai. Focus karo ${(card?.activePercent?.waterPct ?? 0) < 50 ? "paani peene pe 💧" : (card?.activePercent?.foodPct ?? 0) < 50 ? "khana log karne pe 🍛" : "roz exercise karne pe 🏃"}. Chhote chhote kadam bade fark laate hain.`
                      }
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ padding: 12, paddingTop: 8 }}>
                <Text style={{ fontSize: 7.5, color: "#9CA3AF", fontFamily: "Inter_400Regular", lineHeight: 12, textAlign: "center" }}>
                  Yeh report AORANE Health platform dwara auto-generate ki gayi hai aur sirf personal health tracking ke liye hai. Yeh kisi bhi tarah ki medical advice nahi hai. Kisi bhi bimari ke liye qualified doctor se milein.
                </Text>
              </View>

              <LinearGradient colors={[`${pColor}18`, `${company.accentColor || "#00B896"}18`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.reportFooter}>
                {company.reportFooterText ? (
                  <Text style={{ fontSize: 9, color: "#0D1F33", fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 15 }}>{company.reportFooterText}</Text>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: pColor, letterSpacing: 0.5 }}>{company.companyName}</Text>
                    <Text style={{ fontSize: 8, color: "#6B7280", fontFamily: "Inter_400Regular", marginTop: 2 }}>
                      {[company.website, company.supportEmail].filter(Boolean).join(" · ") || "aorane.com"}
                    </Text>
                    {company.address && <Text style={{ fontSize: 8, color: "#9CA3AF", fontFamily: "Inter_400Regular", marginTop: 1, textAlign: "center" }}>{company.address}</Text>}
                  </View>
                )}
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderColor: "#E5EFF7" }}>
                  <Text style={{ fontSize: 7.5, color: "#9CA3AF", fontFamily: "Inter_400Regular" }}>CONFIDENTIAL — FOR PATIENT USE ONLY</Text>
                  <Text style={{ fontSize: 7.5, color: "#9CA3AF", fontFamily: "Inter_400Regular" }}>Generated: {formatDate(generatedAt)}</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={{ width: DOC_W, alignSelf: "center", gap: 12, marginTop: 16 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={handleDownload} disabled={downloading || sharing}
                  style={[styles.btn, { flex: 1, backgroundColor: pColor }]}>
                  {downloading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="download-outline" size={18} color="#FFF" />}
                  <Text style={styles.btnText}>{downloading ? "Download ho raha hai..." : "Download PDF"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShare} disabled={sharing || downloading}
                  style={[styles.btn, { flex: 1, backgroundColor: company.accentColor || "#00B896" }]}>
                  {sharing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="share-social-outline" size={18} color="#FFF" />}
                  <Text style={styles.btnText}>{sharing ? "Share ho raha hai..." : "Share Karein"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  doc: {
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  letterhead: { padding: 16 },
  infoBar: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#E5EFF7" },
  infoCell: { flex: 1, padding: 10 },
  infoLabel: { fontSize: 8, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Inter_400Regular" },
  infoVal: { fontSize: 10, color: "#0D1F33", fontFamily: "Inter_600SemiBold", marginTop: 2 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#0077B6", textTransform: "uppercase", letterSpacing: 0.8, borderLeftWidth: 3, paddingLeft: 8, marginBottom: 4 },
  ruler: { height: 1, backgroundColor: "#E5EFF7", marginHorizontal: 16 },
  patientField: { backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, minWidth: 130, borderWidth: 1, borderColor: "#E5EFF7" },
  patientLabel: { fontSize: 8, color: "#9CA3AF", textTransform: "uppercase", fontFamily: "Inter_400Regular" },
  patientVal: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#0D1F33", marginTop: 2 },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  scoreNum: { fontSize: 22, fontFamily: "Inter_700Bold" },
  scoreLabel: { fontSize: 9, fontFamily: "Inter_500Medium", marginTop: 2 },
  table: { borderWidth: 1, borderColor: "#E5EFF7", borderRadius: 6, overflow: "hidden" },
  tableRow: { flexDirection: "row" },
  thCell: { padding: 8, fontSize: 9, fontFamily: "Inter_700Bold", color: "#0D1F33", textTransform: "uppercase" },
  tdCell: { padding: 8, fontSize: 10, fontFamily: "Inter_400Regular", color: "#0D1F33", borderTopWidth: 1, borderColor: "#F0F4F8" },
  reportFooter: { padding: 14 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  btnText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
