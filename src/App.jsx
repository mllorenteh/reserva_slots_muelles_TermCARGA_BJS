import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/*
  App Reserva Slots Muelles
  - Login transportista con Supabase Auth: crear perfil, iniciar sesion, recuperar contrasena y nueva contrasena.
  - Reservas persistentes en Supabase cuando SUPABASE_URL y SUPABASE_ANON_KEY son reales.
  - Fallback localStorage si Supabase no esta configurado.
  - Admin simple con usuario/clave en frontend.
*/

const initialConfig = {
  occupancyThresholds: {
    greenMax: 50,
    yellowMax: 90,
    orangeMax: 99,
  },
  timeRanges: [
    { id: "FR-1", startTime: "08:00", endTime: "12:00", slotMinutes: 30, docks: 4 },
    { id: "FR-2", startTime: "12:00", endTime: "16:00", slotMinutes: 45, docks: 3 },
    { id: "FR-3", startTime: "16:00", endTime: "20:00", slotMinutes: 30, docks: 4 },
  ],
};

/* PEGA AQUI TUS VALORES REALES DE SUPABASE */
const SUPABASE_URL = "https://ppdmzpejjlwwqxurqvgq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_apQrgWIC1ZgbeUJI6vQ6pQ_OCzakgvQ";;

const SUPABASE_TABLE = "reservations";
const LOCAL_RESERVATIONS_KEY = "slot-reservations-local";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

function isValidAdminLogin(username, password) {
  return String(username || "").trim() === ADMIN_USERNAME && String(password || "") === ADMIN_PASSWORD;
}

function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 30;
}

const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function supabaseHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

function toAppReservation(row) {
  return {
    id: row.id,
    email: row.email || "",
    confirmationCode: row.confirmation_code || "",
    date: row.date,
    time: row.time,
    plate: row.plate || "",
    awb: row.awb || "",
    company: row.company || "",
    contact: row.contact || "",
    phone: row.phone || "",
    operation: row.operation || "Descarga",
    notes: row.notes || "",
    status: row.status || "Confirmada",
    createdAt: row.created_at || "",
    dockIndex: Number(row.dock_index || 0),
  };
}

function toDbReservation(reservation) {
  return {
    id: reservation.id,
    email: reservation.email,
    confirmation_code: reservation.confirmationCode,
    date: reservation.date,
    time: reservation.time,
    plate: reservation.plate,
    awb: reservation.awb,
    company: reservation.company,
    contact: reservation.contact,
    phone: reservation.phone,
    operation: reservation.operation,
    notes: reservation.notes,
    status: reservation.status,
    dock_index: reservation.dockIndex,
  };
}

async function fetchReservationsFromDb() {
  if (!isSupabaseConfigured()) return [];
  const url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?select=*&order=date.asc,time.asc,created_at.asc";
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("No se pudieron cargar reservas: " + text);
  }
  const rows = await response.json();
  return rows.map(toAppReservation);
}

async function insertReservationInDb(reservation) {
  if (!isSupabaseConfigured()) return reservation;
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(toDbReservation(reservation)),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("No se pudo guardar la reserva: " + text);
  }
  const rows = await response.json();
  return toAppReservation(rows[0]);
}

async function updateReservationInDb(id, changes) {
  if (!isSupabaseConfigured()) return null;
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("No se pudo actualizar la reserva: " + text);
  }
  const rows = await response.json();
  return rows[0] ? toAppReservation(rows[0]) : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function timeToMinutes(time) {
  const parts = String(time || "00:00").split(":").map(Number);
  const hours = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  return hours * 60 + minutes;
}

function addMinutes(time, minutesToAdd) {
  const parts = String(time || "00:00").split(":").map(Number);
  const date = new Date(2000, 0, 1, parts[0] || 0, parts[1] || 0);
  date.setMinutes(date.getMinutes() + Number(minutesToAdd || 0));
  return date.toTimeString().slice(0, 5);
}

function minutesToTime(totalMinutes) {
  const safeMinutes = Math.max(0, Number(totalMinutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

function buildSlotsForRange(range) {
  const slots = [];
  const slotMinutes = Number(range.slotMinutes || 0);
  let current = range.startTime;
  if (!slotMinutes || slotMinutes <= 0) return slots;
  if (timeToMinutes(range.endTime) <= timeToMinutes(range.startTime)) return slots;
  while (timeToMinutes(current) < timeToMinutes(range.endTime)) {
    slots.push({
      time: current,
      endTime: addMinutes(current, slotMinutes),
      slotMinutes,
      docks: Number(range.docks || 1),
      rangeId: range.id,
    });
    current = addMinutes(current, slotMinutes);
  }
  return slots;
}

function buildSlots(config) {
  return (config.timeRanges || [])
    .slice()
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    .flatMap(buildSlotsForRange);
}

function getDayStart(config) {
  const ranges = config.timeRanges || [];
  if (!ranges.length) return "08:00";
  return ranges.reduce((min, range) => (timeToMinutes(range.startTime) < timeToMinutes(min) ? range.startTime : min), ranges[0].startTime);
}

function getDayEnd(config) {
  const ranges = config.timeRanges || [];
  if (!ranges.length) return "20:00";
  return ranges.reduce((max, range) => (timeToMinutes(range.endTime) > timeToMinutes(max) ? range.endTime : max), ranges[0].endTime);
}

function getMaxDocks(config) {
  const ranges = config.timeRanges || [];
  return Math.max(1, ...ranges.map((range) => Number(range.docks || 1)));
}

function dockName(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return "M" + String(index + 1);
}

function escapeCsv(value) {
  return '"' + String(value || "").replace(/"/g, '""') + '"';
}

function getSlotByTime(slots, time) {
  return slots.find((slot) => slot.time === time) || null;
}

function isDockAvailable(reservations, reservationId, date, time, dockIndex) {
  return !reservations.some(
    (reservation) =>
      reservation.id !== reservationId &&
      reservation.date === date &&
      reservation.time === time &&
      reservation.status !== "Cancelada" &&
      Number(reservation.dockIndex) === Number(dockIndex)
  );
}

function findFirstAvailableDock(reservations, date, time, capacity) {
  for (let dockIndex = 0; dockIndex < capacity; dockIndex += 1) {
    if (isDockAvailable(reservations, "", date, time, dockIndex)) return dockIndex;
  }
  return 0;
}

function isValidEmail(email) {
  return /^[^ @]+@[^ @]+[.][^ @]+$/.test(String(email || "").trim());
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateConfirmationCode() {
  return "CNF-" + Math.floor(100000 + Math.random() * 900000);
}

function hasReservationForEmailOnDate(reservations, email, date) {
  const cleanEmail = normalizeEmail(email);
  return reservations.some(
    (reservation) =>
      normalizeEmail(reservation.email) === cleanEmail &&
      reservation.date === date &&
      reservation.status !== "Cancelada"
  );
}

function dateToIso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(isoDate + "T00:00:00");
  date.setDate(date.getDate() + Number(days || 0));
  return dateToIso(date);
}

function addMonths(isoDate, months) {
  const date = new Date(isoDate + "T00:00:00");
  date.setMonth(date.getMonth() + months);
  return dateToIso(date);
}

function getMondayOfWeek(isoDate) {
  const date = new Date(isoDate + "T00:00:00");
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return dateToIso(date);
}

function getWeekDays(isoDate) {
  const monday = getMondayOfWeek(isoDate);
  return Array.from({ length: 7 }).map((_, index) => addDays(monday, index));
}

function getMonthDaysGrid(isoDate) {
  const base = new Date(isoDate + "T00:00:00");
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const days = [];
  for (let i = 0; i < startOffset; i += 1) days.push(null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) days.push(dateToIso(new Date(year, month, day)));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getMonthTitle(isoDate) {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function isPastDate(isoDate) {
  return isoDate < todayIso();
}

function countActiveReservationsForDate(reservations, date) {
  return reservations.filter((reservation) => reservation.date === date && reservation.status !== "Cancelada").length;
}

function getDailyCapacity(config) {
  return buildSlots(config).reduce((sum, slot) => sum + Number(slot.docks || 0), 0);
}

function dayLabelFromIso(isoDate) {
  const labels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const date = new Date(isoDate + "T00:00:00");
  return labels[date.getDay()];
}

function getOccupancyPercent(used, capacity) {
  const safeCapacity = Number(capacity || 0);
  if (safeCapacity <= 0) return 0;
  return Math.round((Number(used || 0) / safeCapacity) * 100);
}

function getOccupancyLevel(used, capacity, thresholds) {
  const percent = getOccupancyPercent(used, capacity);
  const safeThresholds = thresholds || { greenMax: 50, yellowMax: 90, orangeMax: 99 };
  if (percent >= 100) return "red";
  if (percent > Number(safeThresholds.orangeMax || 99)) return "red";
  if (percent > Number(safeThresholds.yellowMax || 90)) return "orange";
  if (percent >= Number(safeThresholds.greenMax || 50)) return "yellow";
  return "green";
}

function getOccupancyBadgeStyle(used, capacity, thresholds) {
  const level = getOccupancyLevel(used, capacity, thresholds);
  const styles = {
    green: { background: "#dcfce7", color: "#166534", borderColor: "#22c55e" },
    yellow: { background: "#fef9c3", color: "#854d0e", borderColor: "#eab308" },
    orange: { background: "#fed7aa", color: "#9a3412", borderColor: "#f97316" },
    red: { background: "#fee2e2", color: "#991b1b", borderColor: "#ef4444" },
  };
  return styles[level] || styles.green;
}

function shouldBlockSlotSelection(reservations, email, date) {
  return hasReservationForEmailOnDate(reservations, email, date);
}

function getReservationsForEmail(reservations, email) {
  const cleanEmail = normalizeEmail(email);
  return reservations
    .filter((reservation) => normalizeEmail(reservation.email) === cleanEmail)
    .sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)));
}

function getGanttBarWidthPercent(durationMinutes, totalMinutes) {
  const safeTotal = Math.max(Number(totalMinutes || 0), 1);
  const safeDuration = Math.max(Number(durationMinutes || 0), 0);
  return (safeDuration / safeTotal) * 100;
}

function buildGanttTooltip(reservation) {
  return [
    "Reserva: " + reservation.id,
    "Horario: " + reservation.time + "-" + reservation.endTime,
    "Empresa: " + (reservation.company || "Sin empresa"),
    "AWB: " + (reservation.awb || "-"),
    "Matricula: " + (reservation.plate || "-"),
    "Operacion: " + (reservation.operation || "-"),
    "Muelle: " + dockName(Number(reservation.dockIndex || 0)),
  ].join(String.fromCharCode(10));
}

function upsertReservationInList(reservations, reservationToSave) {
  const exists = reservations.some((reservation) => reservation.id === reservationToSave.id);
  if (!exists) return reservations.concat(reservationToSave);
  return reservations.map((reservation) => (reservation.id === reservationToSave.id ? reservationToSave : reservation));
}

function setReservationStatusInList(reservations, id, status) {
  return reservations.map((reservation) => (reservation.id === id ? { ...reservation, status } : reservation));
}

function setReservationDockInList(reservations, id, dockIndex) {
  const numericDockIndex = Number(dockIndex);
  return reservations.map((reservation) => (reservation.id === id ? { ...reservation, dockIndex: numericDockIndex } : reservation));
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadLocalReservations(fallbackReservations) {
  if (!canUseLocalStorage()) return fallbackReservations;
  try {
    const stored = window.localStorage.getItem(LOCAL_RESERVATIONS_KEY);
    if (!stored) return fallbackReservations;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : fallbackReservations;
  } catch (error) {
    return fallbackReservations;
  }
}

function saveLocalReservations(reservations) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(LOCAL_RESERVATIONS_KEY, JSON.stringify(reservations));
  } catch (error) {
    console.warn("No se pudieron guardar las reservas en localStorage", error);
  }
}

const baseStyles = {
  page: { maxWidth: 1320, margin: "0 auto", padding: 24, fontFamily: "Arial, Helvetica, sans-serif", color: "#172033" },
  card: { background: "white", borderRadius: 24, padding: 24, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" },
  eyebrow: { margin: "0 0 8px", color: "#64748b", fontSize: 14, fontWeight: 700 },
  modeBar: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  tabs: { display: "flex", gap: 8, background: "white", padding: 8, borderRadius: 18, width: "fit-content", marginBottom: 20, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)", flexWrap: "wrap" },
  tab: { border: 0, background: "transparent", padding: "12px 18px", borderRadius: 14, cursor: "pointer", fontWeight: 700, color: "#475569" },
  activeTab: { background: "#172033", color: "white" },
  gridTwo: { display: "grid", gridTemplateColumns: "minmax(280px, 400px) 1fr", gap: 20 },
  label: { display: "grid", gap: 7, marginTop: 14, fontWeight: 700, color: "#334155" },
  input: { width: "100%", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, background: "white", color: "#172033", boxSizing: "border-box" },
  sectionHeader: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "end", marginBottom: 20, flexWrap: "wrap" },
  muted: { color: "#64748b" },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 },
  slot: { border: "1px solid #cbd5e1", background: "white", borderRadius: 18, padding: 16, cursor: "pointer", textAlign: "left" },
  slotSelected: { background: "#172033", color: "white", borderColor: "#172033" },
  confirmBox: { marginTop: 20, background: "#f1f5f9", borderRadius: 18, padding: 18, display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" },
  primaryButton: { border: 0, borderRadius: 12, padding: "12px 16px", fontWeight: 700, cursor: "pointer", background: "#172033", color: "white" },
  disabledButton: { background: "#94a3b8", cursor: "not-allowed" },
  secondaryButton: { border: 0, borderRadius: 12, padding: "12px 16px", fontWeight: 700, cursor: "pointer", background: "#e2e8f0", color: "#172033" },
  dangerButton: { border: 0, borderRadius: 12, padding: "12px 16px", fontWeight: 700, cursor: "pointer", background: "#fee2e2", color: "#991b1b" },
  linkButton: { border: 0, background: "transparent", color: "#0f766e", fontWeight: 800, cursor: "pointer", padding: 0 },
  success: { borderRadius: 14, padding: 14, marginBottom: 16, fontWeight: 700, background: "#dcfce7", color: "#166534" },
  error: { borderRadius: 14, padding: 14, marginBottom: 16, fontWeight: 700, background: "#fee2e2", color: "#991b1b" },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 },
  stat: { background: "#f1f5f9", borderRadius: 18, padding: 18 },
  badge: { display: "inline-block", width: "fit-content", background: "#e2e8f0", borderRadius: 999, padding: "5px 10px", fontWeight: 700, color: "#334155" },
  dangerBadge: { background: "#fee2e2", color: "#991b1b" },
  reservationItem: { background: "#f8fafc", borderRadius: 16, padding: 12, display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 10, flexWrap: "wrap" },
  configGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginTop: 14 },
  warning: { marginTop: 20, background: "#fffbeb", color: "#92400e", borderRadius: 18, padding: 16, fontWeight: 700 },
  rangeCard: { border: "1px solid #e2e8f0", borderRadius: 18, padding: 16, marginTop: 14, background: "#f8fafc" },
  ganttWrapper: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 18, background: "white" },
  ganttHeader: { display: "grid", gridTemplateColumns: "90px 1fr", minWidth: 900, borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" },
  ganttRow: { display: "grid", gridTemplateColumns: "90px 1fr", minWidth: 900, borderBottom: "1px solid #e2e8f0" },
  homeShell: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 0.9fr)", gap: 22, alignItems: "stretch" },
  homePrimaryCard: { position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #172033 0%, #26364f 52%, #0f766e 100%)", color: "white", borderRadius: 30, padding: 38, minHeight: 360, boxShadow: "0 22px 50px rgba(15, 23, 42, 0.22)", display: "grid", alignContent: "space-between", gap: 24 },
  homePrimaryOverlay: { position: "absolute", right: -90, top: -90, width: 260, height: 260, borderRadius: 999, background: "rgba(255,255,255,0.10)" },
  homeTitle: { margin: 0, fontSize: 42, lineHeight: 1.05, letterSpacing: -0.8, maxWidth: 720, color: "#ffffff" },
  homeLead: { margin: "16px 0 0", color: "rgba(255,255,255,0.82)", fontSize: 18, lineHeight: 1.6, maxWidth: 720 },
  homeActions: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" },
  homePrimaryButton: { border: 0, borderRadius: 16, padding: "16px 22px", fontWeight: 800, cursor: "pointer", background: "white", color: "#172033", fontSize: 17, boxShadow: "0 14px 30px rgba(0,0,0,0.16)" },
  homeGhostBadge: { display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content", borderRadius: 999, padding: "8px 12px", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.92)", fontWeight: 800, fontSize: 13 },
  homeStepListDark: { display: "grid", gap: 12, marginTop: 24, maxWidth: 680 },
  homeStepItemDark: { display: "flex", gap: 12, alignItems: "flex-start", color: "rgba(255,255,255,0.86)", lineHeight: 1.45, fontWeight: 700 },
  dotLight: { width: 9, height: 9, borderRadius: 999, background: "#99f6e4", marginTop: 6, flex: "0 0 auto" },
  homeSideCard: { background: "white", borderRadius: 26, padding: 22, boxShadow: "0 14px 34px rgba(15, 23, 42, 0.10)", border: "1px solid #e2e8f0", display: "grid", gap: 16, alignContent: "space-between" },
  homeAdminBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, padding: 16 },
};

function useIsMobile() {
  const getInitialValue = () => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 760;
  };
  const [isMobile, setIsMobile] = useState(getInitialValue);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setIsMobile(window.innerWidth <= 760);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

function createResponsiveStyles(isMobile) {
  if (!isMobile) return baseStyles;
  return {
    ...baseStyles,
    page: { ...baseStyles.page, padding: 12, maxWidth: "100%" },
    card: { ...baseStyles.card, padding: 16, borderRadius: 18 },
    modeBar: { ...baseStyles.modeBar, width: "100%", display: "grid", gridTemplateColumns: "1fr" },
    tabs: { ...baseStyles.tabs, width: "100%", display: "grid", gridTemplateColumns: "1fr", gap: 8, boxSizing: "border-box" },
    tab: { ...baseStyles.tab, width: "100%" },
    gridTwo: { ...baseStyles.gridTwo, gridTemplateColumns: "1fr", gap: 14 },
    label: { ...baseStyles.label, width: "100%" },
    input: { ...baseStyles.input, minHeight: 44 },
    sectionHeader: { ...baseStyles.sectionHeader, alignItems: "stretch" },
    slotGrid: { ...baseStyles.slotGrid, gridTemplateColumns: "1fr", gap: 10 },
    slot: { ...baseStyles.slot, padding: 14, borderRadius: 16 },
    confirmBox: { ...baseStyles.confirmBox, alignItems: "stretch", padding: 14 },
    primaryButton: { ...baseStyles.primaryButton, width: "100%", minHeight: 44 },
    secondaryButton: { ...baseStyles.secondaryButton, width: "100%", minHeight: 44 },
    dangerButton: { ...baseStyles.dangerButton, width: "100%", minHeight: 44 },
    stats: { ...baseStyles.stats, gridTemplateColumns: "1fr", gap: 10 },
    reservationItem: { ...baseStyles.reservationItem, display: "grid", gridTemplateColumns: "1fr", gap: 10 },
    configGrid: { ...baseStyles.configGrid, gridTemplateColumns: "1fr", gap: 10 },
    rangeCard: { ...baseStyles.rangeCard, padding: 14, borderRadius: 16 },
    ganttWrapper: { ...baseStyles.ganttWrapper, overflowX: "auto", WebkitOverflowScrolling: "touch" },
    ganttHeader: { ...baseStyles.ganttHeader, minWidth: 760, gridTemplateColumns: "80px 1fr" },
    ganttRow: { ...baseStyles.ganttRow, minWidth: 760, gridTemplateColumns: "80px 1fr" },
    homeShell: { ...baseStyles.homeShell, gridTemplateColumns: "1fr", gap: 14 },
    homePrimaryCard: { ...baseStyles.homePrimaryCard, padding: 22, minHeight: "auto", borderRadius: 22, gap: 20 },
    homeTitle: { ...baseStyles.homeTitle, fontSize: 30, lineHeight: 1.12, color: "#ffffff" },
    homeLead: { ...baseStyles.homeLead, fontSize: 16 },
    homeActions: { ...baseStyles.homeActions, display: "grid", gridTemplateColumns: "1fr", width: "100%" },
    homePrimaryButton: { ...baseStyles.homePrimaryButton, width: "100%", minHeight: 52 },
    homeSideCard: { ...baseStyles.homeSideCard, borderRadius: 20, padding: 16 },
    homeStepListDark: { ...baseStyles.homeStepListDark, gap: 10, marginTop: 18 },
    homeAdminBox: { ...baseStyles.homeAdminBox, padding: 14 },
    homePrimaryOverlay: { ...baseStyles.homePrimaryOverlay, right: -130, top: -130 },
  };
}

const initialReservations = [
  { id: "RSV-1001", email: "demo.transportista@correo.com", confirmationCode: "CNF-100001", date: todayIso(), time: "09:00", plate: "1234ABC", awb: "075-12345678", company: "Transporte Demo", contact: "Carlos Martin", phone: "+34 600 000 001", operation: "Descarga", status: "Confirmada", createdAt: new Date().toLocaleString(), dockIndex: 0 },
  { id: "RSV-1002", email: "otro.transportista@correo.com", confirmationCode: "CNF-100002", date: todayIso(), time: "09:00", plate: "9876XYZ", awb: "075-87654321", company: "Logistica Norte", contact: "Ana Perez", phone: "+34 600 000 002", operation: "Carga", status: "Confirmada", createdAt: new Date().toLocaleString(), dockIndex: 1 },
  { id: "RSV-1003", email: "cargo.express@correo.com", confirmationCode: "CNF-100003", date: todayIso(), time: "12:00", plate: "5555KLM", awb: "075-33334444", company: "Cargo Express", contact: "Luis Gomez", phone: "+34 600 000 003", operation: "Descarga", status: "Confirmada", createdAt: new Date().toLocaleString(), dockIndex: 0 },
];

export default function App() {
  const isMobile = useIsMobile();
  const rs = useMemo(() => createResponsiveStyles(isMobile), [isMobile]);

  const [appMode, setAppMode] = useState("home");
  const [activeTab, setActiveTab] = useState("reservar");
  const [transporterEmail, setTransporterEmail] = useState("");
  const [transporterSession, setTransporterSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", repeatPassword: "", newPassword: "", repeatNewPassword: "" });
  const [config, setConfig] = useState(initialConfig);
  const [reservations, setReservations] = useState([]);
  const [dbStatus, setDbStatus] = useState({ loading: false, error: "", lastSync: "" });
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedSlot, setSelectedSlot] = useState("");
  const [adminDate, setAdminDate] = useState(todayIso());
  const [adminView, setAdminView] = useState("diaria");
  const [selectedAdminSlot, setSelectedAdminSlot] = useState("");
  const [ganttDate, setGanttDate] = useState(todayIso());
  const [profileMonth, setProfileMonth] = useState(todayIso());
  const [message, setMessage] = useState(null);
  const messageRef = useRef(null);
  const bookingLimitRef = useRef(null);
  const [bookingLimitWarning, setBookingLimitWarning] = useState(false);
  const [loginMessage, setLoginMessage] = useState(null);
  const [form, setForm] = useState({ plate: "", awb: "", company: "", contact: "", phone: "", operation: "Descarga", notes: "" });
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ username: "", password: "" });
  const [adminLoginMessage, setAdminLoginMessage] = useState(null);

  async function loadReservations() {
    if (!isSupabaseConfigured()) {
      const localReservations = loadLocalReservations(initialReservations);
      setReservations(localReservations);
      setDbStatus({ loading: false, error: "Supabase no configurado. Guardando reservas en este navegador.", lastSync: "" });
      return;
    }
    setDbStatus((current) => ({ ...current, loading: true, error: "" }));
    try {
      const dbReservations = await fetchReservationsFromDb();
      setReservations(dbReservations);
      setDbStatus({ loading: false, error: "", lastSync: new Date().toLocaleTimeString() });
    } catch (error) {
      const localReservations = loadLocalReservations(initialReservations);
      setReservations(localReservations);
      setDbStatus({ loading: false, error: error.message + " Usando copia local del navegador.", lastSync: "" });
    }
  }

  useEffect(() => {
    loadReservations();
    const intervalId = window.setInterval(loadReservations, 15000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
    const isRecoveryUrl = urlParams.get("recovery") === "1" || hashParams.get("type") === "recovery";

    if (isRecoveryUrl) {
      setAppMode("transportista");
      setAuthMode("updatePassword");
      setActiveTab("reservar");
      setLoginMessage({
        type: "success",
        text: "Introduce tu nueva contrasena para completar el restablecimiento.",
      });
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setTransporterSession(data.session);
        setTransporterEmail(normalizeEmail(data.session.user.email));
        if (isRecoveryUrl) {
          setAppMode("transportista");
          setAuthMode("updatePassword");
          setActiveTab("reservar");
          setLoginMessage({
            type: "success",
            text: "Introduce tu nueva contrasena para completar el restablecimiento.",
          });
        }
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAppMode("transportista");
        setAuthMode("updatePassword");
        setActiveTab("reservar");
        setLoginMessage({
          type: "success",
          text: "Introduce tu nueva contrasena para completar el restablecimiento.",
        });
      }

      if (session?.user?.email) {
        setTransporterSession(session);
        setTransporterEmail(normalizeEmail(session.user.email));
      } else if (event === "SIGNED_OUT") {
        setTransporterSession(null);
        setTransporterEmail("");
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const slots = useMemo(() => buildSlots(config), [config]);
  const maxDocks = useMemo(() => getMaxDocks(config), [config]);
  const dayStart = useMemo(() => getDayStart(config), [config]);
  const dayEnd = useMemo(() => getDayEnd(config), [config]);

  function updateAuthForm(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function scrollToMessage() {
    window.setTimeout(() => {
      if (messageRef.current) {
        messageRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
  }

  function scrollToBookingLimitWarning() {
    window.setTimeout(() => {
      if (bookingLimitRef.current) bookingLimitRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  function getReservationsForSlot(date, time) {
    return reservations.filter((reservation) => reservation.date === date && reservation.time === time && reservation.status !== "Cancelada");
  }

  async function loginTransporterWithPassword() {
    if (!supabase) {
      setLoginMessage({ type: "error", text: "Supabase no esta configurado. Pega tu URL y ANON KEY en App.jsx." });
      return;
    }
    const email = normalizeEmail(authForm.email);
    if (!isValidEmail(email)) {
      setLoginMessage({ type: "error", text: "Introduce un correo electronico valido." });
      return;
    }
    if (!authForm.password) {
      setLoginMessage({ type: "error", text: "Introduce tu contrasena." });
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: authForm.password });
    if (error) {
      setLoginMessage({ type: "error", text: "No se ha podido iniciar sesion. Revisa el correo y la contrasena." });
      return;
    }
    setTransporterSession(data.session);
    setTransporterEmail(normalizeEmail(data.user.email));
    setLoginMessage(null);
    setBookingLimitWarning(false);
    setActiveTab("reservar");
  }

  async function createTransporterProfile() {
    if (!supabase) {
      setLoginMessage({ type: "error", text: "Supabase no esta configurado. Pega tu URL y ANON KEY en App.jsx." });
      return;
    }
    const email = normalizeEmail(authForm.email);
    if (!isValidEmail(email)) {
      setLoginMessage({ type: "error", text: "Introduce un correo electronico valido." });
      return;
    }
    if (authForm.password.length < 6) {
      setLoginMessage({ type: "error", text: "La contrasena debe tener al menos 6 caracteres." });
      return;
    }
    if (authForm.password !== authForm.repeatPassword) {
      setLoginMessage({ type: "error", text: "Las contrasenas no coinciden." });
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: authForm.password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setLoginMessage({ type: "error", text: error.message });
      return;
    }
    if (data.session && data.user?.email) {
      setTransporterSession(data.session);
      setTransporterEmail(normalizeEmail(data.user.email));
      setLoginMessage(null);
      setActiveTab("reservar");
      return;
    }
    setLoginMessage({ type: "success", text: "Perfil creado. Revisa tu correo si Supabase te pide confirmar la cuenta. Despues inicia sesion." });
    setAuthMode("login");
  }

  async function sendPasswordResetEmail() {
    if (!supabase) {
      setLoginMessage({ type: "error", text: "Supabase no esta configurado. Pega tu URL y ANON KEY en App.jsx." });
      return;
    }

    const email = normalizeEmail(authForm.email);

    if (!isValidEmail(email)) {
      setLoginMessage({ type: "error", text: "Introduce tu correo electronico para restablecer la contrasena." });
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "?recovery=1",
    });

    if (error) {
      setLoginMessage({ type: "error", text: error.message });
      return;
    }

    setLoginMessage({
      type: "success",
      text: "Te hemos enviado un correo para restablecer la contrasena. Abre el enlace del email para crear una nueva.",
    });
  }

  async function updateTransporterPassword() {
    if (!supabase) {
      setLoginMessage({ type: "error", text: "Supabase no esta configurado." });
      return;
    }
    if (authForm.newPassword.length < 6) {
      setLoginMessage({ type: "error", text: "La nueva contrasena debe tener al menos 6 caracteres." });
      return;
    }
    if (authForm.newPassword !== authForm.repeatNewPassword) {
      setLoginMessage({ type: "error", text: "Las nuevas contrasenas no coinciden." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: authForm.newPassword });
    if (error) {
      setLoginMessage({ type: "error", text: error.message });
      return;
    }

    setLoginMessage({ type: "success", text: "Contrasena actualizada correctamente. Ya puedes continuar." });
    setAuthMode("login");
    setAuthForm({ email: "", password: "", repeatPassword: "", newPassword: "", repeatNewPassword: "" });

    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  async function logoutTransporter() {
    if (supabase) await supabase.auth.signOut();
    setTransporterSession(null);
    setTransporterEmail("");
    setAuthForm({ email: "", password: "", repeatPassword: "", newPassword: "", repeatNewPassword: "" });
    setMessage(null);
    setBookingLimitWarning(false);
    setActiveTab("reservar");
    setAppMode("home");
  }

  function selectTransporterSlot(slotTime) {
    if (shouldBlockSlotSelection(reservations, transporterEmail, selectedDate)) {
      setMessage(null);
      setBookingLimitWarning(true);
      setSelectedSlot("");
      scrollToBookingLimitWarning();
      return;
    }
    setBookingLimitWarning(false);
    setSelectedSlot(slotTime);
  }

  function getDockIndexForReservation(date, time, reservationId) {
    const reservation = reservations.find((item) => item.id === reservationId);
    if (reservation && Number.isInteger(Number(reservation.dockIndex))) return Number(reservation.dockIndex);
    const slotReservations = getReservationsForSlot(date, time).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const index = slotReservations.findIndex((item) => item.id === reservationId);
    return index < 0 ? 0 : index;
  }

  const availability = useMemo(() => {
    return slots.map((slot) => {
      const used = getReservationsForSlot(selectedDate, slot.time).length;
      const available = Math.max(Number(slot.docks || 1) - used, 0);
      return { ...slot, used, available, full: available === 0 };
    });
  }, [slots, selectedDate, reservations]);

  const adminRows = useMemo(() => {
    return slots.map((slot) => {
      const slotReservations = getReservationsForSlot(adminDate, slot.time);
      return { ...slot, used: slotReservations.length, available: Math.max(Number(slot.docks || 1) - slotReservations.length, 0), reservations: slotReservations };
    });
  }, [slots, adminDate, reservations]);

  const ganttReservations = useMemo(() => {
    return reservations
      .filter((reservation) => reservation.date === ganttDate && reservation.status !== "Cancelada")
      .map((reservation) => {
        const slot = getSlotByTime(slots, reservation.time);
        const duration = slot ? slot.slotMinutes : 30;
        const dockIndex = getDockIndexForReservation(reservation.date, reservation.time, reservation.id);
        return { ...reservation, endTime: addMinutes(reservation.time, duration), duration, dockIndex };
      })
      .filter((reservation) => reservation.dockIndex < maxDocks);
  }, [reservations, ganttDate, slots, maxDocks]);

  const transporterReservations = useMemo(() => getReservationsForEmail(reservations, transporterEmail), [reservations, transporterEmail]);
  const profileMonthDays = useMemo(() => getMonthDaysGrid(profileMonth), [profileMonth]);

  const transporterReservationsByDay = useMemo(() => {
    const grouped = {};
    transporterReservations.forEach((reservation) => {
      if (!grouped[reservation.date]) grouped[reservation.date] = [];
      grouped[reservation.date].push(reservation);
    });
    return grouped;
  }, [transporterReservations]);

  const alreadyBookedSelectedDate = hasReservationForEmailOnDate(reservations, transporterEmail, selectedDate);
  const canSubmit = Boolean(transporterEmail && !alreadyBookedSelectedDate && form.plate.trim() && form.awb.trim() && form.company.trim() && form.phone.trim() && selectedDate && selectedSlot);

  const activeReservations = reservations.filter((reservation) => reservation.date === adminDate && reservation.status !== "Cancelada");
  const dailyCapacity = getDailyCapacity(config);
  const weekDays = getWeekDays(adminDate);
  const weeklyReservations = weekDays.map((date) => ({ date, dayName: dayLabelFromIso(date), count: countActiveReservationsForDate(reservations, date), capacity: dailyCapacity }));
  const weeklyTotalReservations = weeklyReservations.reduce((sum, day) => sum + day.count, 0);
  const weeklyTotalCapacity = weeklyReservations.reduce((sum, day) => sum + day.capacity, 0);

  async function createReservation() {
    if (!transporterEmail) {
      setMessage({ type: "error", text: "Primero accede con tu correo electronico y contrasena." });
      scrollToMessage();
      return;
    }
    if (hasReservationForEmailOnDate(reservations, transporterEmail, selectedDate)) {
      setMessage(null);
      setBookingLimitWarning(true);
      setSelectedSlot("");
      scrollToBookingLimitWarning();
      return;
    }
    const selectedSlotInfo = getSlotByTime(slots, selectedSlot);
    const capacity = selectedSlotInfo ? Number(selectedSlotInfo.docks || 1) : 1;
    const usedNow = getReservationsForSlot(selectedDate, selectedSlot).length;
    if (usedNow >= capacity) {
      setMessage({ type: "error", text: "Ese slot acaba de ocuparse. Selecciona otro horario." });
      scrollToMessage();
      return;
    }
    const assignedDockIndex = findFirstAvailableDock(reservations, selectedDate, selectedSlot, capacity);
    const confirmationCode = generateConfirmationCode();
    const newReservation = {
      id: "RSV-" + Math.floor(100000 + Math.random() * 900000),
      email: transporterEmail,
      confirmationCode,
      date: selectedDate,
      time: selectedSlot,
      plate: form.plate.trim().toUpperCase(),
      awb: form.awb.trim(),
      company: form.company.trim(),
      contact: form.contact.trim(),
      phone: form.phone.trim(),
      operation: form.operation,
      notes: form.notes.trim(),
      status: "Confirmada",
      createdAt: new Date().toLocaleString(),
      dockIndex: assignedDockIndex,
    };
    try {
      const savedReservation = await insertReservationInDb(newReservation);
      const nextReservations = upsertReservationInList(reservations, savedReservation);
      setReservations(nextReservations);
      if (!isSupabaseConfigured()) saveLocalReservations(nextReservations);
      setMessage({
        type: "success",
        text: "Reserva confirmada: " + savedReservation.id + ". Codigo: " + savedReservation.confirmationCode + ". Puedes verla y cancelarla desde Mi perfil / reservas.",
      });
      setBookingLimitWarning(false);
      setActiveTab("perfil");
      scrollToMessage();
      setSelectedSlot("");
      setForm({ plate: "", awb: "", company: "", contact: "", phone: "", operation: "Descarga", notes: "" });
      if (isSupabaseConfigured()) await loadReservations();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      scrollToMessage();
    }
  }

  async function cancelReservation(id) {
    try {
      await updateReservationInDb(id, { status: "Cancelada" });
      const nextReservations = setReservationStatusInList(reservations, id, "Cancelada");
      setReservations(nextReservations);
      if (!isSupabaseConfigured()) saveLocalReservations(nextReservations);
      if (isSupabaseConfigured()) await loadReservations();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function cancelTransporterReservation(id) {
    const targetReservation = reservations.find((reservation) => reservation.id === id);
    if (!targetReservation) return;
    if (normalizeEmail(targetReservation.email) !== normalizeEmail(transporterEmail)) {
      setMessage({ type: "error", text: "No puedes cancelar una reserva asociada a otro correo." });
      return;
    }
    if (targetReservation.status === "Cancelada") {
      setMessage({ type: "error", text: "Esta reserva ya estaba cancelada." });
      return;
    }
    try {
      await updateReservationInDb(id, { status: "Cancelada" });
      const nextReservations = setReservationStatusInList(reservations, id, "Cancelada");
      setReservations(nextReservations);
      if (!isSupabaseConfigured()) saveLocalReservations(nextReservations);
      setMessage({ type: "success", text: "Reserva " + id + " cancelada correctamente." });
      if (isSupabaseConfigured()) await loadReservations();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function moveReservationToDock(id, dockIndex) {
    const targetReservation = reservations.find((reservation) => reservation.id === id);
    if (!targetReservation) return;
    const slot = getSlotByTime(slots, targetReservation.time);
    const capacity = slot ? Number(slot.docks || 1) : maxDocks;
    const targetDockIndex = Number(dockIndex);

    if (!Number.isInteger(targetDockIndex) || targetDockIndex < 0) {
      setMessage({ type: "error", text: "Muelle seleccionado no valido." });
      return;
    }
    if (targetDockIndex >= capacity) {
      setMessage({ type: "error", text: "Ese muelle no esta abierto para la franja de esta reserva." });
      return;
    }
    if (!isDockAvailable(reservations, id, targetReservation.date, targetReservation.time, targetDockIndex)) {
      setMessage({ type: "error", text: "Ese muelle ya esta ocupado en el mismo slot. Elige otro muelle." });
      return;
    }
    try {
      const updatedReservation = await updateReservationInDb(id, { dock_index: targetDockIndex });
      const nextReservations = updatedReservation
        ? upsertReservationInList(reservations, updatedReservation)
        : setReservationDockInList(reservations, id, targetDockIndex);
      setReservations(nextReservations);
      if (!isSupabaseConfigured()) saveLocalReservations(nextReservations);
      setMessage({ type: "success", text: "Reserva " + id + " movida al Muelle " + dockName(targetDockIndex) + "." });
      if (isSupabaseConfigured()) await loadReservations();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  function exportCsv() {
    const rows = reservations.filter((reservation) => reservation.date === adminDate);
    const headers = ["ID", "Codigo", "Email", "Fecha", "Hora", "Estado", "Operacion", "Matricula", "AWB", "Empresa", "Contacto", "Telefono", "Creada"];
    const csvRows = [headers.join(";")].concat(
      rows.map((reservation) =>
        [
          reservation.id,
          reservation.confirmationCode,
          reservation.email,
          reservation.date,
          reservation.time,
          reservation.status,
          reservation.operation,
          reservation.plate,
          reservation.awb,
          reservation.company,
          reservation.contact,
          reservation.phone,
          reservation.createdAt,
        ]
          .map(escapeCsv)
          .join(";")
      )
    );
    const newLine = String.fromCharCode(10);
    const blob = new Blob([csvRows.join(newLine)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reservas_muelles_" + adminDate + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateRange(id, field, value) {
    setConfig((current) => ({
      ...current,
      timeRanges: current.timeRanges.map((range) =>
        range.id === id ? { ...range, [field]: field === "slotMinutes" || field === "docks" ? Number(value) || 1 : value } : range
      ),
    }));
  }

  function updateOccupancyThreshold(field, value) {
    const numericValue = Math.max(0, Math.min(100, Number(value) || 0));
    setConfig((current) => ({ ...current, occupancyThresholds: { ...current.occupancyThresholds, [field]: numericValue } }));
  }

  function addRange() {
    setConfig((current) => ({
      ...current,
      timeRanges: current.timeRanges.concat({ id: "FR-" + Date.now(), startTime: "20:00", endTime: "22:00", slotMinutes: 30, docks: 2 }),
    }));
  }

  function removeRange(id) {
    setConfig((current) => {
      if (current.timeRanges.length <= 1) return current;
      return { ...current, timeRanges: current.timeRanges.filter((range) => range.id !== id) };
    });
  }

  function tabStyle(tabName) {
    return activeTab === tabName ? { ...rs.tab, ...rs.activeTab } : rs.tab;
  }

  function openTransporterMode() {
    setAppMode("transportista");
    setActiveTab("reservar");
    setMessage(null);
  }

  function goHome() {
    setAppMode("home");
    setActiveTab("reservar");
    setMessage(null);
    setBookingLimitWarning(false);
    setLoginMessage(null);
    setAdminLoginMessage(null);
  }

  function openAdminMode() {
    setAppMode("admin");
    setActiveTab(adminLoggedIn ? "admin" : "adminLogin");
    setMessage(null);
  }

  function updateAdminLogin(field, value) {
    setAdminLogin((current) => ({ ...current, [field]: value }));
  }

  function loginAdmin() {
    if (!isValidAdminLogin(adminLogin.username, adminLogin.password)) {
      setAdminLoginMessage({ type: "error", text: "Usuario o contrasena de administrador incorrectos." });
      return;
    }
    setAdminLoggedIn(true);
    setAdminLogin({ username: "", password: "" });
    setAdminLoginMessage(null);
    setActiveTab("admin");
  }

  function logoutAdmin() {
    setAdminLoggedIn(false);
    setAdminLogin({ username: "", password: "" });
    setAdminLoginMessage(null);
    setActiveTab("adminLogin");
    setAppMode("home");
  }

  function renderTransporterAuth() {
    const isLogin = authMode === "login";
    const isRegister = authMode === "register";
    const isForgot = authMode === "forgot";
    const isUpdatePassword = authMode === "updatePassword";

    return (
      <section style={{ ...rs.card, maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ margin: 0 }}>
          {isLogin && "Acceso transportista"}
          {isRegister && "Crear perfil transportista"}
          {isForgot && "Restablecer contrasena"}
          {isUpdatePassword && "Nueva contrasena"}
        </h2>

        {isLogin && <p style={rs.muted}>Introduce tu correo y contrasena para acceder a tus reservas.</p>}
        {isRegister && <p style={rs.muted}>Crea tu perfil con un correo valido y una contrasena de al menos 6 caracteres.</p>}
        {isForgot && <p style={rs.muted}>Introduce tu correo y te enviaremos un enlace de restablecimiento.</p>}
        {isUpdatePassword && <p style={rs.muted}>Introduce una nueva contrasena para tu perfil.</p>}

        {loginMessage && <div style={loginMessage.type === "success" ? rs.success : rs.error}>{loginMessage.text}</div>}

        {!isUpdatePassword && (
          <label style={rs.label}>
            Correo electronico
            <input style={rs.input} type="email" value={authForm.email} onChange={(event) => updateAuthForm("email", event.target.value)} placeholder="empresa@transportista.com" />
          </label>
        )}

        {(isLogin || isRegister) && (
          <label style={rs.label}>
            Contrasena
            <input style={rs.input} type="password" value={authForm.password} onChange={(event) => updateAuthForm("password", event.target.value)} placeholder="Minimo 6 caracteres" />
          </label>
        )}

        {isRegister && (
          <label style={rs.label}>
            Repetir contrasena
            <input style={rs.input} type="password" value={authForm.repeatPassword} onChange={(event) => updateAuthForm("repeatPassword", event.target.value)} placeholder="Repite la contrasena" />
          </label>
        )}

        {isUpdatePassword && (
          <>
            <label style={rs.label}>
              Nueva contrasena
              <input style={rs.input} type="password" value={authForm.newPassword} onChange={(event) => updateAuthForm("newPassword", event.target.value)} placeholder="Minimo 6 caracteres" />
            </label>
            <label style={rs.label}>
              Repetir nueva contrasena
              <input style={rs.input} type="password" value={authForm.repeatNewPassword} onChange={(event) => updateAuthForm("repeatNewPassword", event.target.value)} placeholder="Repite la nueva contrasena" />
            </label>
          </>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          {isLogin && <button style={rs.primaryButton} onClick={loginTransporterWithPassword}>Iniciar sesion</button>}
          {isRegister && <button style={rs.primaryButton} onClick={createTransporterProfile}>Crear perfil</button>}
          {isForgot && <button style={rs.primaryButton} onClick={sendPasswordResetEmail}>Enviar correo de restablecimiento</button>}
          {isUpdatePassword && <button style={rs.primaryButton} onClick={updateTransporterPassword}>Guardar nueva contrasena</button>}

          {isLogin && (
            <>
              <button style={rs.linkButton} onClick={() => { setAuthMode("register"); setLoginMessage(null); }}>Crear perfil nuevo</button>
              <button style={rs.linkButton} onClick={() => { setAuthMode("forgot"); setLoginMessage(null); }}>He olvidado mi contrasena</button>
            </>
          )}

          {!isLogin && !isUpdatePassword && <button style={rs.linkButton} onClick={() => { setAuthMode("login"); setLoginMessage(null); }}>Volver a iniciar sesion</button>}
        </div>
      </section>
    );
  }

  function renderGantt() {
    const startMinutes = timeToMinutes(dayStart);
    const endMinutes = timeToMinutes(dayEnd);
    const totalMinutes = Math.max(endMinutes - startMinutes, 1);
    const hourMarks = [];
    let mark = Math.ceil(startMinutes / 60) * 60;
    while (mark <= endMinutes) {
      hourMarks.push(mark);
      mark += 60;
    }

    return (
      <div style={rs.ganttWrapper}>
        <div style={rs.ganttHeader}>
          <div style={{ padding: 12, fontWeight: 700 }}>Muelle</div>
          <div style={{ position: "relative", height: 46 }}>
            {hourMarks.map((minute) => {
              const left = ((minute - startMinutes) / totalMinutes) * 100;
              return <div key={minute} style={{ position: "absolute", left: left + "%", top: 8, fontSize: 12, color: "#64748b" }}>{minutesToTime(minute)}</div>;
            })}
          </div>
        </div>

        {Array.from({ length: maxDocks }).map((_, dockIndex) => (
          <div style={rs.ganttRow} key={dockIndex}>
            <div style={{ padding: 12, fontWeight: 800, background: "#f8fafc" }}>Muelle {dockName(dockIndex)}</div>
            <div style={{ position: "relative", height: 64, background: "linear-gradient(to right, #f8fafc, #ffffff)" }}>
              {hourMarks.map((minute) => {
                const left = ((minute - startMinutes) / totalMinutes) * 100;
                return <div key={minute} style={{ position: "absolute", left: left + "%", top: 0, bottom: 0, borderLeft: "1px solid #e2e8f0" }} />;
              })}
              {ganttReservations
                .filter((reservation) => reservation.dockIndex === dockIndex)
                .map((reservation) => {
                  const left = ((timeToMinutes(reservation.time) - startMinutes) / totalMinutes) * 100;
                  const width = getGanttBarWidthPercent(reservation.duration, totalMinutes);
                  const tooltip = buildGanttTooltip(reservation);
                  return (
                    <div
                      key={reservation.id}
                      title={tooltip}
                      aria-label={tooltip}
                      style={{
                        position: "absolute",
                        left: left + "%",
                        top: 8,
                        width: width + "%",
                        minWidth: 0,
                        height: 50,
                        borderRadius: 10,
                        background: reservation.operation === "Carga" ? "#dbeafe" : "#dcfce7",
                        border: "1px solid #94a3b8",
                        overflow: "hidden",
                        boxSizing: "border-box",
                        cursor: "help",
                      }}
                    />
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <main style={rs.page}>
      {appMode === "home" && (
        <section style={rs.homeShell}>
          <div style={rs.homePrimaryCard}>
            <img
              src="/logo_south_fondo_gris.png"
              alt="South Europe Ground Services"
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                width: isMobile ? 110 : 170,
                maxWidth: "32%",
                borderRadius: 12,
                background: "rgba(255,255,255,0.9)",
                padding: 6,
                zIndex: 2,
              }}
            />
            <div style={rs.homePrimaryOverlay} />

            <div style={{ position: "relative", paddingRight: isMobile ? 0 : 190 }}>
              <span style={rs.homeGhostBadge}>✓ Acceso para transportistas</span>
              <h2 style={rs.homeTitle}>Reserva tu slot de carga o descarga sin esperas.</h2>
              <p style={rs.homeLead}>Consulta la ocupacion de los muelles en tiempo real, elige el horario que mejor encaje con tu ruta y recibe tu codigo de confirmacion.</p>

              <div style={rs.homeStepListDark}>
                <div style={rs.homeStepItemDark}><span style={rs.dotLight} /><span>Identificate con tu correo electronico.</span></div>
                <div style={rs.homeStepItemDark}><span style={rs.dotLight} /><span>Selecciona el dia y un slot disponible.</span></div>
                <div style={rs.homeStepItemDark}><span style={rs.dotLight} /><span>Guarda tu codigo de confirmacion para la llegada.</span></div>
              </div>
            </div>

            <div style={{ ...rs.homeActions, position: "relative" }}>
              <button style={rs.homePrimaryButton} onClick={openTransporterMode}>Entrar como transportista</button>
              <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>Acceso con correo y contrasena.</span>
            </div>
          </div>

          <aside style={rs.homeSideCard}>
            <div style={rs.homeAdminBox}>
              <p style={{ ...rs.eyebrow, marginBottom: 6 }}>Acceso interno</p>
              <h4 style={{ margin: "0 0 8px", fontSize: 17 }}>Administrador</h4>
              <p style={{ ...rs.muted, margin: "0 0 14px", fontSize: 14 }}>Panel privado para gestionar reservas, Gantt y configuracion.</p>
              <button style={{ ...rs.secondaryButton, width: "100%" }} onClick={openAdminMode}>Login administrador</button>
            </div>
          </aside>
        </section>
      )}

      {appMode !== "home" && (
        <div style={rs.modeBar}>
          <button style={rs.secondaryButton} onClick={goHome}>Volver al inicio</button>
        </div>
      )}

      {appMode === "transportista" && transporterEmail && authMode !== "updatePassword" && (
        <nav style={rs.tabs}>
          <button style={tabStyle("reservar")} onClick={() => setActiveTab("reservar")}>Reservar slot</button>
          <button style={tabStyle("perfil")} onClick={() => setActiveTab("perfil")}>Mi perfil / reservas</button>
        </nav>
      )}

      {appMode === "admin" && adminLoggedIn && (
        <nav style={rs.tabs}>
          <button style={tabStyle("admin")} onClick={() => setActiveTab("admin")}>Panel interno</button>
          <button style={tabStyle("gantt")} onClick={() => setActiveTab("gantt")}>Gantt muelles</button>
          <button style={tabStyle("config")} onClick={() => setActiveTab("config")}>Configuracion</button>
          <button style={rs.secondaryButton} onClick={logoutAdmin}>Cerrar sesion admin</button>
        </nav>
      )}

      {appMode === "admin" && !adminLoggedIn && (
        <section style={{ ...rs.card, maxWidth: 520, margin: "0 auto", padding: isMobile ? 16 : 20 }}>
          <p style={rs.eyebrow}>Acceso interno</p>
          <h2 style={{ margin: 0, fontSize: 24 }}>Administrador</h2>
          <p style={rs.muted}>Introduce usuario y contrasena para acceder al panel interno.</p>
          {adminLoginMessage && <div style={adminLoginMessage.type === "success" ? rs.success : rs.error}>{adminLoginMessage.text}</div>}
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ ...rs.label, minWidth: isMobile ? "100%" : 200 }}>
              Usuario
              <input style={rs.input} value={adminLogin.username} onChange={(event) => updateAdminLogin("username", event.target.value)} placeholder="Usuario admin" />
            </label>
            <label style={{ ...rs.label, minWidth: isMobile ? "100%" : 200 }}>
              Contrasena
              <input style={rs.input} type="password" value={adminLogin.password} onChange={(event) => updateAdminLogin("password", event.target.value)} placeholder="Contrasena" onKeyDown={(event) => { if (event.key === "Enter") loginAdmin(); }} />
            </label>
            <button style={rs.primaryButton} onClick={loginAdmin}>Entrar</button>
          </div>
          <div style={rs.warning}>Este login es una proteccion simple en frontend. Para produccion conviene usar autenticacion real con Supabase Auth y politicas de seguridad por rol.</div>
        </section>
      )}

      {appMode === "transportista" && (!transporterEmail || authMode === "updatePassword") && renderTransporterAuth()}

      {appMode === "transportista" && transporterEmail && authMode !== "updatePassword" && activeTab === "reservar" && (
        <section style={rs.gridTwo}>
          <div style={rs.card}>
            <h2 style={{ margin: 0 }}>Datos de identificacion</h2>
            <p style={rs.muted}>Sesion iniciada como <strong>{transporterEmail}</strong>.</p>
            <button style={rs.secondaryButton} onClick={logoutTransporter}>Salir / cambiar cuenta</button>
            <p style={rs.muted}>Introduce los datos minimos para reservar un hueco. Solo puedes tener una reserva activa por dia.</p>

            <label style={rs.label}>Matricula tractora *<input style={rs.input} value={form.plate} onChange={(event) => updateForm("plate", event.target.value)} placeholder="Ej. 1234ABC" /></label>
            <label style={rs.label}>AWB / Referencia *<input style={rs.input} value={form.awb} onChange={(event) => updateForm("awb", event.target.value)} placeholder="Ej. 075-12345678" /></label>
            <label style={rs.label}>Empresa transportista *<input style={rs.input} value={form.company} onChange={(event) => updateForm("company", event.target.value)} placeholder="Nombre de la empresa" /></label>
            <label style={rs.label}>Contacto<input style={rs.input} value={form.contact} onChange={(event) => updateForm("contact", event.target.value)} placeholder="Nombre del conductor/contacto" /></label>
            <label style={rs.label}>Telefono / email *<input style={rs.input} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="Telefono o email" /></label>
            <label style={rs.label}>Tipo de operacion<select style={rs.input} value={form.operation} onChange={(event) => updateForm("operation", event.target.value)}><option>Carga</option><option>Descarga</option><option>Carga y descarga</option></select></label>
          </div>

          <div style={rs.card}>
            <div style={rs.sectionHeader}>
              <div>
                <h2 style={{ margin: 0 }}>Selecciona dia y slot</h2>
                <p style={rs.muted}>Cada slot usa la duracion y capacidad de su franja horaria configurada.</p>
                {bookingLimitWarning && <p ref={bookingLimitRef} style={{ ...rs.error, marginTop: 12 }}>No puedes reservar mas de un slot al dia. Si necesitas cambiar la cita, cancela primero tu reserva actual en Mi perfil / reservas.</p>}
              </div>
              <label style={{ ...rs.label, marginTop: 0, minWidth: isMobile ? "100%" : 180 }}>
                Fecha
                <input style={rs.input} type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setBookingLimitWarning(false); setSelectedSlot(""); }} />
              </label>
            </div>

            {message && <div ref={messageRef} style={message.type === "success" ? rs.success : rs.error}>{message.text}</div>}

            <div style={rs.slotGrid}>
              {availability.map((slot) => {
                const occupancyStyle = getOccupancyBadgeStyle(slot.used, slot.docks, config.occupancyThresholds);
                const currentSlotStyle = selectedSlot === slot.time
                  ? { ...rs.slot, ...rs.slotSelected }
                  : slot.full
                    ? { ...rs.slot, ...occupancyStyle, borderColor: occupancyStyle.borderColor, cursor: "not-allowed" }
                    : { ...rs.slot, ...occupancyStyle, borderColor: occupancyStyle.borderColor };
                const availableText = slot.full ? "Completo" : slot.available + " hueco" + (slot.available === 1 ? "" : "s") + " disponible" + (slot.available === 1 ? "" : "s");
                return (
                  <button key={slot.rangeId + slot.time} disabled={slot.full} style={currentSlotStyle} onClick={() => selectTransporterSlot(slot.time)}>
                    <strong style={{ display: "block", fontSize: 20 }}>{slot.time}</strong>
                    <span style={{ display: "block", marginTop: 8 }}>{availableText}</span>
                  </button>
                );
              })}
            </div>

            <div style={rs.confirmBox}>
              <div>
                <strong>Slot seleccionado: {selectedSlot || "ninguno"}</strong>
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>Al confirmar se vuelve a validar la disponibilidad para evitar doble reserva.</p>
              </div>
              <button style={canSubmit ? rs.primaryButton : { ...rs.primaryButton, ...rs.disabledButton }} disabled={!canSubmit} onClick={createReservation}>Confirmar reserva</button>
            </div>
          </div>
        </section>
      )}

      {appMode === "transportista" && transporterEmail && authMode !== "updatePassword" && activeTab === "perfil" && (
        <section style={rs.card}>
          <div style={rs.sectionHeader}>
            <div>
              <h2 style={{ margin: 0 }}>Mi calendario de reservas</h2>
              <p style={rs.muted}>Correo de acceso: <strong>{transporterEmail}</strong></p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={rs.secondaryButton} onClick={() => setProfileMonth(addMonths(profileMonth, -1))}>Mes anterior</button>
              <button style={rs.secondaryButton} onClick={() => setProfileMonth(todayIso())}>Mes actual</button>
              <button style={rs.secondaryButton} onClick={() => setProfileMonth(addMonths(profileMonth, 1))}>Mes siguiente</button>
              <button style={rs.secondaryButton} onClick={logoutTransporter}>Salir / cambiar cuenta</button>
            </div>
          </div>

          {message && <div ref={messageRef} style={message.type === "success" ? rs.success : rs.error}>{message.text}</div>}
          <h3 style={{ marginTop: 0, textTransform: "capitalize" }}>{getMonthTitle(profileMonth)}</h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8, color: "#64748b", fontWeight: 800, textAlign: "center" }}>
            {["L", "M", "X", "J", "V", "S", "D"].map((day) => <div key={day}>{day}</div>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
            {profileMonthDays.map((date, index) => {
              const dayReservations = date ? transporterReservationsByDay[date] || [] : [];
              const past = date ? isPastDate(date) : false;
              return (
                <div
                  key={date || "empty-" + index}
                  style={{
                    minHeight: isMobile ? 88 : 110,
                    borderRadius: 14,
                    padding: 10,
                    background: !date ? "transparent" : past ? "#e5e7eb" : "#f8fafc",
                    border: date ? "1px solid #e2e8f0" : "1px solid transparent",
                    color: past ? "#6b7280" : "#172033",
                    opacity: !date ? 0 : 1,
                    fontSize: isMobile ? 12 : 14,
                  }}
                >
                  {date && (
                    <>
                      <strong>{Number(date.slice(-2))}</strong>
                      {dayReservations.map((reservation) => {
                        const expired = isPastDate(reservation.date);
                        const shownStatus = expired && reservation.status !== "Cancelada" ? "Expirada" : reservation.status;
                        return (
                          <div
                            key={reservation.id}
                            style={{
                              marginTop: 8,
                              padding: 8,
                              borderRadius: 10,
                              background: expired ? "#d1d5db" : reservation.status === "Cancelada" ? "#fee2e2" : "#dcfce7",
                              color: expired ? "#374151" : reservation.status === "Cancelada" ? "#991b1b" : "#166534",
                              fontSize: 12,
                            }}
                          >
                            <strong>{reservation.time}</strong>
                            <div>{shownStatus}</div>
                            <div>AWB {reservation.awb}</div>
                            {reservation.status !== "Cancelada" && !expired && (
                              <button style={{ ...rs.dangerButton, marginTop: 6, padding: "7px 9px", fontSize: 12 }} onClick={() => cancelTransporterReservation(reservation.id)}>
                                Cancelar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={rs.warning}>Los dias pasados aparecen en gris. Las reservas de dias anteriores se muestran como expiradas.</div>
        </section>
      )}

      {appMode === "admin" && adminLoggedIn && activeTab === "admin" && (
        <section style={rs.card}>
          <div style={rs.sectionHeader}>
            <div>
              <h2 style={{ margin: 0 }}>Panel interno de reservas</h2>
              <p style={rs.muted}>Vista operativa por franja, ocupacion y detalle de transportistas.</p>
            </div>
            <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
              <label style={{ ...rs.label, marginTop: 0 }}>
                Fecha
                <input style={rs.input} type="date" value={adminDate} onChange={(event) => { setAdminDate(event.target.value); setSelectedAdminSlot(""); }} />
              </label>
              <button style={adminView === "diaria" ? rs.primaryButton : rs.secondaryButton} onClick={() => setAdminView("diaria")}>Vista diaria</button>
              <button style={adminView === "semanal" ? rs.primaryButton : rs.secondaryButton} onClick={() => setAdminView("semanal")}>Vista semanal</button>
              <button style={rs.secondaryButton} onClick={loadReservations}>Refrescar</button>
              <button style={rs.secondaryButton} onClick={exportCsv}>Exportar CSV</button>
            </div>
          </div>

          {adminView === "semanal" && (
            <div>
              <div style={rs.stats}>
                <div style={rs.stat}><span>Total semana</span><strong style={{ display: "block", marginTop: 8, fontSize: 30 }}>{weeklyTotalReservations}/{weeklyTotalCapacity}</strong></div>
                <div style={rs.stat}><span>Semana desde</span><strong style={{ display: "block", marginTop: 8, fontSize: 24 }}>{weekDays[0]}</strong></div>
                <div style={rs.stat}><span>Semana hasta</span><strong style={{ display: "block", marginTop: 8, fontSize: 24 }}>{weekDays[6]}</strong></div>
              </div>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, padding: 14, background: "#f1f5f9", fontWeight: 700, color: "#475569" }}>
                  <span>Dia</span><span>Fecha</span><span>Reservas / slots</span>
                </div>
                {weeklyReservations.map((day) => (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, padding: 14, borderTop: "1px solid #e2e8f0" }} key={day.date}>
                    <strong>{day.dayName}</strong>
                    <span>{day.date}</span>
                    <span style={{ ...rs.badge, ...getOccupancyBadgeStyle(day.count, day.capacity, config.occupancyThresholds) }}>{day.count}/{day.capacity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adminView === "diaria" && (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={rs.stats}>
                <div style={rs.stat}><span>Reservas activas</span><strong style={{ display: "block", marginTop: 8, fontSize: 30 }}>{activeReservations.length}</strong></div>
                <div style={rs.stat}><span>Capacidad diaria</span><strong style={{ display: "block", marginTop: 8, fontSize: 30 }}>{dailyCapacity}</strong></div>
                <div style={rs.stat}><span>Maximo muelles</span><strong style={{ display: "block", marginTop: 8, fontSize: 30 }}>{maxDocks}</strong></div>
              </div>
              <div style={rs.slotGrid}>
                {adminRows.map((row) => {
                  const occupancyStyle = getOccupancyBadgeStyle(row.used, row.docks, config.occupancyThresholds);
                  const isSelected = selectedAdminSlot === row.time;
                  return (
                    <button
                      key={row.rangeId + row.time}
                      style={{ ...rs.slot, ...occupancyStyle, borderColor: occupancyStyle.borderColor, outline: isSelected ? "3px solid #172033" : "none" }}
                      onClick={() => setSelectedAdminSlot(isSelected ? "" : row.time)}
                    >
                      <strong style={{ display: "block", fontSize: 20 }}>{row.time}</strong>
                      <span style={{ display: "block", marginTop: 8 }}>{row.used}/{row.docks} muelles ocupados</span>
                      <small style={{ display: "block", marginTop: 8 }}>{row.slotMinutes} min</small>
                    </button>
                  );
                })}
              </div>

              {selectedAdminSlot && (
                <div style={rs.rangeCard}>
                  <h3 style={{ marginTop: 0 }}>Detalle del slot {selectedAdminSlot}</h3>
                  {getReservationsForSlot(adminDate, selectedAdminSlot).length === 0 && <p style={rs.muted}>No hay reservas en este slot.</p>}
                  {getReservationsForSlot(adminDate, selectedAdminSlot).map((reservation) => (
                    <div style={rs.reservationItem} key={reservation.id}>
                      <div>
                        <strong>{reservation.company} - {reservation.plate}</strong>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Reserva {reservation.id} - AWB {reservation.awb}</p>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Transportista: {reservation.email}</p>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Muelle asignado en Gantt: <strong>Muelle {dockName(Number(reservation.dockIndex || 0))}</strong></p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={reservation.status === "Cancelada" ? { ...rs.badge, ...rs.dangerBadge } : rs.badge}>{reservation.status}</span>
                        {reservation.status !== "Cancelada" && <button style={rs.secondaryButton} onClick={() => cancelReservation(reservation.id)}>Cancelar</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {appMode === "admin" && adminLoggedIn && activeTab === "gantt" && (
        <section style={rs.card}>
          <div style={rs.sectionHeader}>
            <div>
              <h2 style={{ margin: 0 }}>Gantt de ocupacion por muelle</h2>
              <p style={rs.muted}>Vista de ocupacion por muelle. Puedes reasignar manualmente reservas entre Muelle A, B, C, D...</p>
            </div>
            <label style={{ ...rs.label, marginTop: 0, minWidth: isMobile ? "100%" : 180 }}>
              Fecha
              <input style={rs.input} type="date" value={ganttDate} onChange={(event) => setGanttDate(event.target.value)} />
            </label>
          </div>

          {renderGantt()}

          <div style={{ marginTop: 20 }}>
            <h3 style={{ margin: "0 0 12px" }}>Asignacion manual de muelles</h3>
            {message && <div style={message.type === "success" ? rs.success : rs.error}>{message.text}</div>}
            {ganttReservations.length === 0 && <p style={rs.muted}>No hay reservas activas para esta fecha.</p>}

            {ganttReservations.map((reservation) => {
              const slot = getSlotByTime(slots, reservation.time);
              const capacity = slot ? Number(slot.docks || 1) : maxDocks;
              return (
                <div style={rs.reservationItem} key={reservation.id}>
                  <div>
                    <strong>{reservation.id} - {reservation.time}-{reservation.endTime} - {reservation.plate}</strong>
                    <p style={{ margin: "5px 0 0", color: "#64748b" }}>AWB {reservation.awb} - {reservation.company} - muelle actual {dockName(reservation.dockIndex)}</p>
                  </div>
                  <label style={{ ...rs.label, marginTop: 0, minWidth: isMobile ? "100%" : 160 }}>
                    Mover a muelle
                    <select style={rs.input} value={reservation.dockIndex} onChange={(event) => moveReservationToDock(reservation.id, event.target.value)}>
                      {Array.from({ length: capacity }).map((_, dockIndex) => <option key={dockIndex} value={dockIndex}>Muelle {dockName(dockIndex)}</option>)}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>

          <div style={rs.warning}>Si el muelle elegido ya esta ocupado en el mismo slot, la app bloquea el cambio para evitar solapes.</div>
        </section>
      )}

      {appMode === "admin" && adminLoggedIn && activeTab === "config" && (
        <section style={rs.card}>
          <div style={rs.sectionHeader}>
            <div>
              <h2 style={{ margin: 0 }}>Configuracion por franjas horarias</h2>
              <p style={rs.muted}>Puedes crear varias franjas con diferente duracion de slot y diferente numero de muelles abiertos.</p>
            </div>
            <button style={rs.primaryButton} onClick={addRange}>Anadir franja</button>
          </div>

          <div style={rs.rangeCard}>
            <h3 style={{ margin: "0 0 8px" }}>Rangos de color de ocupacion</h3>
            <p style={rs.muted}>Configura los umbrales que pintan los indicadores de ocupacion. Por defecto: verde por debajo del 50%, amarillo entre 50% y 90%, naranja por encima del 90%, rojo al 100%.</p>
            <div style={rs.configGrid}>
              <label style={rs.label}>Verde hasta menor que (%)<input style={rs.input} type="number" min="0" max="100" value={config.occupancyThresholds.greenMax} onChange={(event) => updateOccupancyThreshold("greenMax", event.target.value)} /></label>
              <label style={rs.label}>Amarillo hasta (%)<input style={rs.input} type="number" min="0" max="100" value={config.occupancyThresholds.yellowMax} onChange={(event) => updateOccupancyThreshold("yellowMax", event.target.value)} /></label>
              <label style={rs.label}>Naranja hasta (%)<input style={rs.input} type="number" min="0" max="100" value={config.occupancyThresholds.orangeMax} onChange={(event) => updateOccupancyThreshold("orangeMax", event.target.value)} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <span style={{ ...rs.badge, ...getOccupancyBadgeStyle(20, 100, config.occupancyThresholds) }}>20%</span>
              <span style={{ ...rs.badge, ...getOccupancyBadgeStyle(60, 100, config.occupancyThresholds) }}>60%</span>
              <span style={{ ...rs.badge, ...getOccupancyBadgeStyle(95, 100, config.occupancyThresholds) }}>95%</span>
              <span style={{ ...rs.badge, ...getOccupancyBadgeStyle(100, 100, config.occupancyThresholds) }}>100%</span>
            </div>
          </div>

          {config.timeRanges.map((range, index) => (
            <div style={rs.rangeCard} key={range.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <strong>Franja {index + 1}</strong>
                <button style={config.timeRanges.length <= 1 ? { ...rs.dangerButton, ...rs.disabledButton } : rs.dangerButton} disabled={config.timeRanges.length <= 1} onClick={() => removeRange(range.id)}>Eliminar</button>
              </div>
              <div style={rs.configGrid}>
                <label style={rs.label}>Hora inicio<input style={rs.input} type="time" value={range.startTime} onChange={(event) => updateRange(range.id, "startTime", event.target.value)} /></label>
                <label style={rs.label}>Hora fin<input style={rs.input} type="time" value={range.endTime} onChange={(event) => updateRange(range.id, "endTime", event.target.value)} /></label>
                <label style={rs.label}>Duracion slot<select style={rs.input} value={range.slotMinutes} onChange={(event) => updateRange(range.id, "slotMinutes", event.target.value)}><option value="15">15 minutos</option><option value="20">20 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option></select></label>
                <label style={rs.label}>Muelles abiertos<input style={rs.input} type="number" min="1" value={range.docks} onChange={(event) => updateRange(range.id, "docks", event.target.value)} /></label>
              </div>
              <p style={{ ...rs.muted, marginBottom: 0 }}>Slots generados en esta franja: {buildSlotsForRange(range).length}</p>
            </div>
          ))}

          <div style={rs.warning}>Evita solapar franjas si quieres una disponibilidad limpia. Si dos franjas tienen la misma hora de inicio, el sistema las mostrara como slots separados con la misma hora. Los rangos de color se aplican a la vista semanal y a los indicadores de ocupacion por slot.</div>
        </section>
      )}
    </main>
  );
}
