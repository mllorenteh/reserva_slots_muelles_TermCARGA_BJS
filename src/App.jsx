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
  deliveryCounter: {
    startTime: "08:00",
    endTime: "20:00",
    stepMinutes: 15,
    counters: 1,
    deliveryDocks: 4,
    maxDeliveryReservationsPerDay: 3,
  },
  deliveryRules: [
    { id: "DR-1", deliveryType: "General", subtype: "Sin aduana", awbQuantityRange: "Entre 1 y 3", counterMinutes: 10, deliveryDockMinutes: 15 },
    { id: "DR-2", deliveryType: "General", subtype: "Sin aduana", awbQuantityRange: "Entre 4 - 7", counterMinutes: 20, deliveryDockMinutes: 15 },
    { id: "DR-3", deliveryType: "General", subtype: "Sin aduana", awbQuantityRange: "Entre 8-10", counterMinutes: 40, deliveryDockMinutes: 15 },
    { id: "DR-4", deliveryType: "General", subtype: "Sin aduana", awbQuantityRange: ">10", counterMinutes: 60, deliveryDockMinutes: 15 },
    { id: "DR-5", deliveryType: "General", subtype: "G5", awbQuantityRange: "Entre 1 y 3", counterMinutes: 20, deliveryDockMinutes: 15 },
    { id: "DR-6", deliveryType: "General", subtype: "G5", awbQuantityRange: "Entre 4 - 7", counterMinutes: 40, deliveryDockMinutes: 15 },
    { id: "DR-7", deliveryType: "General", subtype: "G5", awbQuantityRange: ">8", counterMinutes: 60, deliveryDockMinutes: 15 },
    { id: "DR-8", deliveryType: "General", subtype: "T1 (primero pesar al muelle +15 min)", awbQuantityRange: "Entre 1 y 3", counterMinutes: 20, deliveryDockMinutes: 15 },
    { id: "DR-9", deliveryType: "General", subtype: "T1 (primero pesar al muelle +15 min)", awbQuantityRange: "Entre 4 - 7", counterMinutes: 40, deliveryDockMinutes: 15 },
    { id: "DR-10", deliveryType: "General", subtype: "T1 (primero pesar al muelle +15 min)", awbQuantityRange: ">8", counterMinutes: 60, deliveryDockMinutes: 15 },
    { id: "DR-11", deliveryType: "General", subtype: "Re etiquetados", awbQuantityRange: "Entre 1 y 3", counterMinutes: 20, deliveryDockMinutes: 15 },
    { id: "DR-12", deliveryType: "General", subtype: "Re etiquetados", awbQuantityRange: "Entre 4 - 7", counterMinutes: 40, deliveryDockMinutes: 15 },
    { id: "DR-13", deliveryType: "General", subtype: "Re etiquetados", awbQuantityRange: ">8", counterMinutes: 60, deliveryDockMinutes: 15 },
    { id: "DR-14", deliveryType: "Restringidos 20 min", subtype: "N/A", awbQuantityRange: "N/A", counterMinutes: 20, deliveryDockMinutes: 15 },
    { id: "DR-15", deliveryType: "Avis", subtype: "N/A", awbQuantityRange: "N/A", counterMinutes: 20, deliveryDockMinutes: 15 },
  ],
  // Compatibilidad con reservas antiguas. La nueva logica usa deliveryCounter y deliveryRules.
  timeRanges: [
    { id: "FR-1", startTime: "08:00", endTime: "12:00", slotMinutes: 30, docks: 4 },
    { id: "FR-2", startTime: "12:00", endTime: "16:00", slotMinutes: 45, docks: 3 },
    { id: "FR-3", startTime: "16:00", endTime: "20:00", slotMinutes: 30, docks: 4 },
  ],
};

/* PEGA AQUI TUS VALORES REALES DE SUPABASE */
const SUPABASE_URL = "https://ppdmzpejjlwwqxurqvgq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_apQrgWIC1ZgbeUJI6vQ6pQ_OCzakgvQ";

const SUPABASE_TABLE = "reservations";
const LOCAL_RESERVATIONS_KEY = "slot-reservations-local";
const PASSWORD_RECOVERY_PENDING_KEY = "slot-password-recovery-pending";

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

function parseReservationNotes(notes) {
  if (!notes) return { parsed: false, notesText: "" };
  try {
    const parsed = JSON.parse(notes);
    if (parsed && parsed.__deliverySlotMeta === true) {
      return { parsed: true, ...parsed };
    }
  } catch (error) {
    // Reserva antigua con notas en texto libre.
  }
  return { parsed: false, notesText: notes };
}

function buildReservationNotes(meta) {
  return JSON.stringify({
    __deliverySlotMeta: true,
    notesText: meta.notesText || "",
    deliveryType: meta.deliveryType || "",
    deliverySubtype: meta.deliverySubtype || "",
    awbQuantityRange: meta.awbQuantityRange || "",
    counterDuration: Number(meta.counterDuration || 0),
    deliveryDockDuration: Number(meta.deliveryDockDuration || 0),
    counterStart: meta.counterStart || "",
    counterEnd: meta.counterEnd || "",
    counterBlockEnd: meta.counterBlockEnd || "",
    deliveryDockStart: meta.deliveryDockStart || "",
    deliveryDockEnd: meta.deliveryDockEnd || "",
    counterIndex: Number(meta.counterIndex || 0),
    deliveryDockIndex: Number(meta.deliveryDockIndex || 0),
  });
}

function toAppReservation(row) {
  const meta = parseReservationNotes(row.notes || "");
  const deliveryDockIndex = Number.isFinite(Number(meta.deliveryDockIndex))
    ? Number(meta.deliveryDockIndex)
    : Number(row.dock_index || 0);

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
    operation: row.operation || meta.deliveryType || "Entrega de mercancía",
    notes: meta.notesText || "",
    rawNotes: row.notes || "",
    status: row.status || "Confirmada",
    createdAt: row.created_at || "",
    dockIndex: deliveryDockIndex,
    deliveryType: meta.deliveryType || "",
    deliverySubtype: meta.deliverySubtype || "",
    awbQuantityRange: meta.awbQuantityRange || "",
    counterDuration: Number(meta.counterDuration || 0),
    deliveryDockDuration: Number(meta.deliveryDockDuration || 0),
    counterStart: meta.counterStart || row.time || "",
    counterEnd: meta.counterEnd || "",
    counterBlockEnd: meta.counterBlockEnd || "",
    deliveryDockStart: meta.deliveryDockStart || "",
    deliveryDockEnd: meta.deliveryDockEnd || "",
    counterIndex: Number(meta.counterIndex || 0),
    deliveryDockIndex,
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

function getDeliveryCounterConfig(config) {
  const counter = config.deliveryCounter || {};
  return {
    startTime: counter.startTime || "08:00",
    endTime: counter.endTime || "20:00",
    stepMinutes: Math.max(5, Number(counter.stepMinutes || 15)),
    counters: Math.max(1, Number(counter.counters || 1)),
    deliveryDocks: Math.max(1, Number(counter.deliveryDocks || 1)),
    maxDeliveryReservationsPerDay: Math.max(1, Number(counter.maxDeliveryReservationsPerDay || 3)),
  };
}

function buildCounterStartSlots(config, selectedRule) {
  const counter = getDeliveryCounterConfig(config);
  const duration = selectedRule ? Number(selectedRule.counterMinutes || 0) : counter.stepMinutes;
  const slots = [];
  let currentMinutes = timeToMinutes(counter.startTime);
  const endMinutes = timeToMinutes(counter.endTime);

  while (currentMinutes + duration <= endMinutes) {
    slots.push({
      time: minutesToTime(currentMinutes),
      stepMinutes: counter.stepMinutes,
      counterDuration: duration,
      deliveryDockDuration: selectedRule ? Number(selectedRule.deliveryDockMinutes || 0) : 0,
    });
    currentMinutes += counter.stepMinutes;
  }

  return slots;
}

function roundUpMinutes(value, step) {
  const safeStep = Math.max(1, Number(step || 15));
  return Math.ceil(Number(value || 0) / safeStep) * safeStep;
}

function addMinutesToClock(time, minutesToAdd) {
  return minutesToTime(timeToMinutes(time) + Number(minutesToAdd || 0));
}

function intervalsOverlap(startA, endA, startB, endB) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

function isActiveDeliveryReservation(reservation) {
  return reservation.status !== "Cancelada" && reservation.operation === "Entrega de mercancía";
}

function getRuleDeliveryTypes(config) {
  return Array.from(new Set((config.deliveryRules || []).map((rule) => rule.deliveryType))).filter(Boolean);
}

function getRuleSubtypes(config, deliveryType) {
  return Array.from(new Set((config.deliveryRules || []).filter((rule) => rule.deliveryType === deliveryType).map((rule) => rule.subtype))).filter(Boolean);
}

function getRuleAwbRanges(config, deliveryType, subtype) {
  return Array.from(new Set((config.deliveryRules || []).filter((rule) => rule.deliveryType === deliveryType && rule.subtype === subtype).map((rule) => rule.awbQuantityRange))).filter(Boolean);
}

function findDeliveryRule(config, deliveryType, subtype, awbQuantityRange) {
  return (config.deliveryRules || []).find(
    (rule) =>
      rule.deliveryType === deliveryType &&
      rule.subtype === subtype &&
      rule.awbQuantityRange === awbQuantityRange
  ) || null;
}

function normalizeDeliverySelection(config, currentForm) {
  const deliveryTypes = getRuleDeliveryTypes(config);
  const deliveryType = deliveryTypes.includes(currentForm.deliveryType) ? currentForm.deliveryType : deliveryTypes[0] || "";
  const subtypes = getRuleSubtypes(config, deliveryType);
  const deliverySubtype = subtypes.includes(currentForm.deliverySubtype) ? currentForm.deliverySubtype : subtypes[0] || "";
  const ranges = getRuleAwbRanges(config, deliveryType, deliverySubtype);
  const awbQuantityRange = ranges.includes(currentForm.awbQuantityRange) ? currentForm.awbQuantityRange : ranges[0] || "";
  return { deliveryType, deliverySubtype, awbQuantityRange };
}

function getCounterEndForReservation(reservation) {
  if (reservation.counterEnd) return reservation.counterEnd;
  const duration = Number(reservation.counterDuration || 0);
  return duration ? addMinutesToClock(reservation.counterStart || reservation.time, duration) : reservation.time;
}

function getDeliveryDockEndForReservation(reservation) {
  if (reservation.deliveryDockEnd) return reservation.deliveryDockEnd;
  const duration = Number(reservation.deliveryDockDuration || 0);
  return duration ? addMinutesToClock(reservation.deliveryDockStart || getCounterEndForReservation(reservation), duration) : "";
}

function findAvailableCounterIndex(reservations, date, startTime, endTime, counterCount) {
  for (let index = 0; index < counterCount; index += 1) {
    const occupied = reservations.some((reservation) => {
      if (!isActiveDeliveryReservation(reservation) || reservation.date !== date) return false;
      if (Number(reservation.counterIndex || 0) !== index) return false;
      const reservationStart = reservation.counterStart || reservation.time;
      const reservationEnd = getCounterEndForReservation(reservation);
      return intervalsOverlap(startTime, endTime, reservationStart, reservationEnd);
    });
    if (!occupied) return index;
  }
  return -1;
}

function findAvailableDeliveryDockIndex(reservations, date, startTime, endTime, dockCount) {
  for (let index = 0; index < dockCount; index += 1) {
    const occupied = reservations.some((reservation) => {
      if (!isActiveDeliveryReservation(reservation) || reservation.date !== date) return false;
      const reservationDockIndex = Number(
        Number.isFinite(Number(reservation.deliveryDockIndex)) ? reservation.deliveryDockIndex : reservation.dockIndex || 0
      );
      if (reservationDockIndex !== index) return false;
      const reservationStart = reservation.deliveryDockStart || getCounterEndForReservation(reservation);
      const reservationEnd = getDeliveryDockEndForReservation(reservation);
      return intervalsOverlap(startTime, endTime, reservationStart, reservationEnd);
    });
    if (!occupied) return index;
  }
  return -1;
}

function countCounterOccupancy(reservations, date, startTime, endTime) {
  return reservations.filter((reservation) => {
    if (!isActiveDeliveryReservation(reservation) || reservation.date !== date) return false;
    return intervalsOverlap(startTime, endTime, reservation.counterStart || reservation.time, getCounterEndForReservation(reservation));
  }).length;
}

function countDeliveryDockOccupancy(reservations, date, startTime, endTime) {
  return reservations.filter((reservation) => {
    if (!isActiveDeliveryReservation(reservation) || reservation.date !== date) return false;
    return intervalsOverlap(startTime, endTime, reservation.deliveryDockStart || getCounterEndForReservation(reservation), getDeliveryDockEndForReservation(reservation));
  }).length;
}

function getDeliveryScheduleForStart(config, rule, startTime) {
  if (!rule || !startTime) return null;
  const counter = getDeliveryCounterConfig(config);
  const counterDuration = Number(rule.counterMinutes || 0);
  const deliveryDockDuration = Number(rule.deliveryDockMinutes || 0);
  const counterStart = startTime;
  const counterEnd = addMinutesToClock(counterStart, counterDuration);
  const counterBlockEnd = addMinutesToClock(counterStart, roundUpMinutes(counterDuration, counter.stepMinutes));
  const deliveryDockStart = counterEnd;
  const deliveryDockEnd = addMinutesToClock(deliveryDockStart, deliveryDockDuration);

  return {
    counterStart,
    counterEnd,
    counterBlockEnd,
    deliveryDockStart,
    deliveryDockEnd,
    counterDuration,
    deliveryDockDuration,
  };
}

function getDeliveryAvailabilityForStart(reservations, date, config, rule, startTime) {
  const schedule = getDeliveryScheduleForStart(config, rule, startTime);
  if (!schedule) return null;

  const counter = getDeliveryCounterConfig(config);
  const counterIndex = findAvailableCounterIndex(reservations, date, schedule.counterStart, schedule.counterEnd, counter.counters);
  const deliveryDockIndex = findAvailableDeliveryDockIndex(reservations, date, schedule.deliveryDockStart, schedule.deliveryDockEnd, counter.deliveryDocks);
  const counterUsed = countCounterOccupancy(reservations, date, schedule.counterStart, schedule.counterEnd);
  const deliveryDockUsed = countDeliveryDockOccupancy(reservations, date, schedule.deliveryDockStart, schedule.deliveryDockEnd);

  return {
    ...schedule,
    counterIndex,
    deliveryDockIndex,
    counterUsed,
    deliveryDockUsed,
    counterCapacity: counter.counters,
    deliveryDockCapacity: counter.deliveryDocks,
    available: counterIndex >= 0 && deliveryDockIndex >= 0,
  };
}

function getReservationsOverlappingCounterWindow(reservations, date, startTime, minutes) {
  const endTime = addMinutesToClock(startTime, minutes);
  return reservations.filter((reservation) => {
    if (!isActiveDeliveryReservation(reservation) || reservation.date !== date) return false;
    return intervalsOverlap(startTime, endTime, reservation.counterStart || reservation.time, getCounterEndForReservation(reservation));
  });
}

function getReservationsOverlappingDeliveryDockWindow(reservations, date, startTime, minutes) {
  const endTime = addMinutesToClock(startTime, minutes);
  return reservations.filter((reservation) => {
    if (!isActiveDeliveryReservation(reservation) || reservation.date !== date) return false;
    return intervalsOverlap(startTime, endTime, reservation.deliveryDockStart || getCounterEndForReservation(reservation), getDeliveryDockEndForReservation(reservation));
  });
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

function getTransporterProfileFromUser(user) {
  const metadata = user?.user_metadata || {};
  return {
    company: String(metadata.company || "").trim(),
    fullName: String(metadata.fullName || metadata.full_name || metadata.name || "").trim(),
    phone: String(metadata.phone || "").trim(),
  };
}

function generateConfirmationCode() {
  return "CNF-" + Math.floor(100000 + Math.random() * 900000);
}

function countReservationsForEmailOnDate(reservations, email, date, operation = "") {
  const cleanEmail = normalizeEmail(email);
  return reservations.filter(
    (reservation) =>
      normalizeEmail(reservation.email) === cleanEmail &&
      reservation.date === date &&
      reservation.status !== "Cancelada" &&
      (!operation || reservation.operation === operation)
  ).length;
}

function hasReservationForEmailOnDate(reservations, email, date) {
  return countReservationsForEmailOnDate(reservations, email, date) > 0;
}

function hasReachedDeliveryReservationLimit(reservations, email, date, config) {
  const maxReservations = getDeliveryCounterConfig(config).maxDeliveryReservationsPerDay;
  return countReservationsForEmailOnDate(reservations, email, date, "Entrega de mercancía") >= maxReservations;
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

function shouldBlockSlotSelection(reservations, email, date, config) {
  return hasReachedDeliveryReservationLimit(reservations, email, date, config);
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
  { id: "RSV-1001", email: "demo.transportista@correo.com", confirmationCode: "CNF-100001", date: todayIso(), time: "09:00", plate: "1234ABC", awb: "075-12345678", company: "Transporte Demo", contact: "Carlos Martin", phone: "+34 600 000 001", operation: "Entrega de mercancía", status: "Confirmada", createdAt: new Date().toLocaleString(), dockIndex: 0 },
  { id: "RSV-1002", email: "otro.transportista@correo.com", confirmationCode: "CNF-100002", date: todayIso(), time: "09:00", plate: "9876XYZ", awb: "075-87654321", company: "Logistica Norte", contact: "Ana Perez", phone: "+34 600 000 002", operation: "Retirada de mercancía", status: "Confirmada", createdAt: new Date().toLocaleString(), dockIndex: 1 },
  { id: "RSV-1003", email: "cargo.express@correo.com", confirmationCode: "CNF-100003", date: todayIso(), time: "12:00", plate: "5555KLM", awb: "075-33334444", company: "Cargo Express", contact: "Luis Gomez", phone: "+34 600 000 003", operation: "Entrega de mercancía", status: "Confirmada", createdAt: new Date().toLocaleString(), dockIndex: 0 },
];

export default function App() {
  const isMobile = useIsMobile();
  const rs = useMemo(() => createResponsiveStyles(isMobile), [isMobile]);

  const [appMode, setAppMode] = useState("home");
  const [activeTab, setActiveTab] = useState("reservar");
  const [transporterEmail, setTransporterEmail] = useState("");
  const [transporterSession, setTransporterSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", repeatPassword: "", newPassword: "", repeatNewPassword: "", company: "", fullName: "", phone: "" });
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
  const [transporterProfile, setTransporterProfile] = useState({ company: "", fullName: "", phone: "" });
  const [form, setForm] = useState({ awb: "", phone: "", operation: "Entrega de mercancía", deliveryType: "General", deliverySubtype: "Sin aduana", awbQuantityRange: "Entre 1 y 3", notes: "" });
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ username: "", password: "" });
  const [adminLoginMessage, setAdminLoginMessage] = useState(null);

  function applyTransporterSession(session) {
    const user = session?.user;
    setTransporterSession(session || null);

    if (!user?.email) {
      setTransporterEmail("");
      setTransporterProfile({ company: "", fullName: "", phone: "" });
      return;
    }

    const profile = getTransporterProfileFromUser(user);
    setTransporterEmail(normalizeEmail(user.email));
    setTransporterProfile(profile);
    setForm((current) => ({
      ...current,
      phone: current.phone || profile.phone || "",
    }));
  }

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
    const hasAuthCode = urlParams.has("code") || hashParams.has("code") || hashParams.has("access_token");
    const hasRecoveryMarker =
      urlParams.get("recovery") === "1" ||
      urlParams.get("type") === "recovery" ||
      hashParams.get("recovery") === "1" ||
      hashParams.get("type") === "recovery";

    const hasPendingRecovery =
      canUseLocalStorage() && window.localStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY) === "1";

    const isRecoveryUrl = hasRecoveryMarker || (hasPendingRecovery && hasAuthCode);

    function showPasswordRecoveryScreen() {
      setAppMode("transportista");
      setAuthMode("updatePassword");
      setActiveTab("reservar");
      setLoginMessage({
        type: "success",
        text: "Introduce tu nueva contrasena para completar el restablecimiento.",
      });
    }

    if (isRecoveryUrl) {
      showPasswordRecoveryScreen();
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        applyTransporterSession(data.session);
        if (isRecoveryUrl || hasPendingRecovery) {
          showPasswordRecoveryScreen();
        }
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session?.user?.email && (isRecoveryUrl || hasPendingRecovery))) {
        showPasswordRecoveryScreen();
      }

      if (session?.user?.email) {
        applyTransporterSession(session);
      } else if (event === "SIGNED_OUT") {
        setTransporterSession(null);
        setTransporterEmail("");
        setTransporterProfile({ company: "", fullName: "", phone: "" });
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const slots = useMemo(() => buildSlots(config), [config]);
  const maxDocks = useMemo(() => Math.max(getMaxDocks(config), getDeliveryCounterConfig(config).deliveryDocks), [config]);
  const dayStart = useMemo(() => getDeliveryCounterConfig(config).startTime, [config]);
  const dayEnd = useMemo(() => getDeliveryCounterConfig(config).endTime, [config]);

  useEffect(() => {
    setForm((current) => {
      if (current.operation !== "Entrega de mercancía") return current;
      const normalized = normalizeDeliverySelection(config, current);
      if (
        current.deliveryType === normalized.deliveryType &&
        current.deliverySubtype === normalized.deliverySubtype &&
        current.awbQuantityRange === normalized.awbQuantityRange
      ) {
        return current;
      }
      return { ...current, ...normalized };
    });
  }, [config.deliveryRules]);

  function updateAuthForm(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
  }

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "operation") {
        setSelectedSlot("");
        setBookingLimitWarning(false);
      }

      if (field === "deliveryType") {
        const normalized = normalizeDeliverySelection(config, { ...next, deliverySubtype: "", awbQuantityRange: "" });
        return { ...next, ...normalized };
      }

      if (field === "deliverySubtype") {
        const normalized = normalizeDeliverySelection(config, { ...next, awbQuantityRange: "" });
        return { ...next, ...normalized };
      }

      if (field === "awbQuantityRange") {
        setSelectedSlot("");
      }

      return next;
    });
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
    applyTransporterSession(data.session);
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
    if (!authForm.company.trim()) {
      setLoginMessage({ type: "error", text: "Introduce el nombre de tu empresa." });
      return;
    }
    if (!authForm.fullName.trim()) {
      setLoginMessage({ type: "error", text: "Introduce el nombre y apellidos de la persona que se registra." });
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
        data: {
          company: authForm.company.trim(),
          fullName: authForm.fullName.trim(),
          phone: authForm.phone.trim(),
        },
      },
    });
    if (error) {
      setLoginMessage({ type: "error", text: error.message });
      return;
    }
    if (data.session && data.user?.email) {
      applyTransporterSession(data.session);
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

    if (canUseLocalStorage()) {
      window.localStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, "1");
    }

    const recoveryRedirectUrl = window.location.origin + window.location.pathname + "?recovery=1";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectUrl,
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

    if (canUseLocalStorage()) {
      window.localStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
    }

    setLoginMessage({ type: "success", text: "Contrasena actualizada correctamente. Ya puedes continuar." });
    setAuthMode("login");
    setAuthForm({ email: "", password: "", repeatPassword: "", newPassword: "", repeatNewPassword: "", company: "", fullName: "", phone: "" });

    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  async function logoutTransporter() {
    if (supabase) await supabase.auth.signOut();
    if (canUseLocalStorage()) {
      window.localStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
    }
    setTransporterSession(null);
    setTransporterEmail("");
    setTransporterProfile({ company: "", fullName: "", phone: "" });
    setAuthForm({ email: "", password: "", repeatPassword: "", newPassword: "", repeatNewPassword: "", company: "", fullName: "", phone: "" });
    setMessage(null);
    setBookingLimitWarning(false);
    setActiveTab("reservar");
    setAppMode("home");
  }

  function selectTransporterSlot(slotTime) {
    if (shouldBlockSlotSelection(reservations, transporterEmail, selectedDate, config)) {
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

  const selectedDeliveryRule = useMemo(() => {
    if (form.operation !== "Entrega de mercancía") return null;
    return findDeliveryRule(config, form.deliveryType, form.deliverySubtype, form.awbQuantityRange);
  }, [config, form.operation, form.deliveryType, form.deliverySubtype, form.awbQuantityRange]);

  const counterStartSlots = useMemo(() => buildCounterStartSlots(config, selectedDeliveryRule), [config, selectedDeliveryRule]);

  const availability = useMemo(() => {
    if (form.operation !== "Entrega de mercancía" || !selectedDeliveryRule) return [];
    return counterStartSlots.map((slot) => {
      const status = getDeliveryAvailabilityForStart(reservations, selectedDate, config, selectedDeliveryRule, slot.time);
      return {
        ...slot,
        ...status,
        available: Boolean(status?.available),
        full: !status?.available,
      };
    });
  }, [counterStartSlots, selectedDate, reservations, config, selectedDeliveryRule, form.operation]);

  const selectedSlotAvailability = useMemo(() => {
    if (!selectedSlot || !selectedDeliveryRule) return null;
    return getDeliveryAvailabilityForStart(reservations, selectedDate, config, selectedDeliveryRule, selectedSlot);
  }, [reservations, selectedDate, config, selectedDeliveryRule, selectedSlot]);

  const adminRows = useMemo(() => {
    const counter = getDeliveryCounterConfig(config);
    const slotsForAdmin = buildCounterStartSlots(config, { counterMinutes: counter.stepMinutes, deliveryDockMinutes: 0 });
    return slotsForAdmin.map((slot) => {
      const startTime = slot.time;
      const endTime = addMinutesToClock(startTime, counter.stepMinutes);
      const reservationsForWindow = getReservationsOverlappingCounterWindow(reservations, adminDate, startTime, counter.stepMinutes);
      return {
        ...slot,
        endTime,
        used: countCounterOccupancy(reservations, adminDate, startTime, endTime),
        docks: counter.counters,
        available: Math.max(counter.counters - countCounterOccupancy(reservations, adminDate, startTime, endTime), 0),
        reservations: reservationsForWindow,
      };
    });
  }, [config, adminDate, reservations]);

  const ganttReservations = useMemo(() => {
    return reservations
      .filter((reservation) => reservation.date === ganttDate && isActiveDeliveryReservation(reservation))
      .map((reservation) => ({
        ...reservation,
        counterStart: reservation.counterStart || reservation.time,
        counterEnd: getCounterEndForReservation(reservation),
        counterBlockEnd:
          reservation.counterBlockEnd ||
          addMinutesToClock(
            reservation.counterStart || reservation.time,
            roundUpMinutes(Number(reservation.counterDuration || 0), getDeliveryCounterConfig(config).stepMinutes)
          ),
        deliveryDockStart: reservation.deliveryDockStart || getCounterEndForReservation(reservation),
        deliveryDockEnd: getDeliveryDockEndForReservation(reservation),
        counterIndex: Number(reservation.counterIndex || 0),
        deliveryDockIndex: Number(
          Number.isFinite(Number(reservation.deliveryDockIndex)) ? reservation.deliveryDockIndex : reservation.dockIndex || 0
        ),
      }));
  }, [reservations, ganttDate, config]);

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

  const deliveryReservationsForSelectedDate = countReservationsForEmailOnDate(reservations, transporterEmail, selectedDate, "Entrega de mercancía");
  const maxDeliveryReservationsPerDay = getDeliveryCounterConfig(config).maxDeliveryReservationsPerDay;
  const hasReachedDeliveryLimitForSelectedDate = deliveryReservationsForSelectedDate >= maxDeliveryReservationsPerDay;
  const canSubmit = Boolean(
    transporterEmail &&
    !hasReachedDeliveryLimitForSelectedDate &&
    form.operation === "Entrega de mercancía" &&
    form.awb.trim() &&
    transporterProfile.company &&
    transporterProfile.fullName &&
    selectedDeliveryRule &&
    selectedDate &&
    selectedSlot &&
    selectedSlotAvailability?.available
  );

  const activeReservations = reservations.filter((reservation) => reservation.date === adminDate && reservation.status !== "Cancelada");
  const dailyCapacity = getDeliveryCounterConfig(config).counters * buildCounterStartSlots(config, { counterMinutes: getDeliveryCounterConfig(config).stepMinutes, deliveryDockMinutes: 0 }).length;
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

    if (form.operation === "Retirada de mercancía") {
      setMessage({ type: "error", text: "La logica de slots para Retirada de mercancia todavia esta pendiente de definir." });
      scrollToMessage();
      return;
    }

    if (!selectedDeliveryRule) {
      setMessage({ type: "error", text: "Selecciona tipo de entrega, subtipo y cantidad de AWBs." });
      scrollToMessage();
      return;
    }

    if (hasReachedDeliveryReservationLimit(reservations, transporterEmail, selectedDate, config)) {
      setMessage(null);
      setBookingLimitWarning(true);
      setSelectedSlot("");
      scrollToBookingLimitWarning();
      return;
    }

    const latestAvailability = getDeliveryAvailabilityForStart(reservations, selectedDate, config, selectedDeliveryRule, selectedSlot);

    if (!latestAvailability?.available) {
      setMessage({ type: "error", text: "Ese horario acaba de ocuparse. Selecciona otra hora de mostrador." });
      scrollToMessage();
      return;
    }

    const confirmationCode = generateConfirmationCode();
    const reservationMeta = {
      notesText: form.notes.trim(),
      deliveryType: form.deliveryType,
      deliverySubtype: form.deliverySubtype,
      awbQuantityRange: form.awbQuantityRange,
      counterDuration: latestAvailability.counterDuration,
      deliveryDockDuration: latestAvailability.deliveryDockDuration,
      counterStart: latestAvailability.counterStart,
      counterEnd: latestAvailability.counterEnd,
      counterBlockEnd: latestAvailability.counterBlockEnd,
      deliveryDockStart: latestAvailability.deliveryDockStart,
      deliveryDockEnd: latestAvailability.deliveryDockEnd,
      counterIndex: latestAvailability.counterIndex,
      deliveryDockIndex: latestAvailability.deliveryDockIndex,
    };

    const newReservation = {
      id: "RSV-" + Math.floor(100000 + Math.random() * 900000),
      email: transporterEmail,
      confirmationCode,
      date: selectedDate,
      time: latestAvailability.counterStart,
      plate: "",
      awb: form.awb.trim(),
      company: transporterProfile.company,
      contact: transporterProfile.fullName,
      phone: form.phone.trim(),
      operation: "Entrega de mercancía",
      notes: buildReservationNotes(reservationMeta),
      status: "Confirmada",
      createdAt: new Date().toLocaleString(),
      dockIndex: latestAvailability.deliveryDockIndex,
      ...reservationMeta,
    };

    try {
      const savedReservation = await insertReservationInDb(newReservation);
      const nextReservations = upsertReservationInList(reservations, savedReservation);
      setReservations(nextReservations);
      if (!isSupabaseConfigured()) saveLocalReservations(nextReservations);
      setMessage({
        type: "success",
        text:
          "Reserva confirmada: " +
          savedReservation.id +
          ". Codigo: " +
          savedReservation.confirmationCode +
          ". Mostrador " +
          latestAvailability.counterStart +
          "-" +
          latestAvailability.counterEnd +
          " y muelle entrega " +
          latestAvailability.deliveryDockStart +
          "-" +
          latestAvailability.deliveryDockEnd +
          ".",
      });
      setBookingLimitWarning(false);
      setActiveTab("perfil");
      scrollToMessage();
      setSelectedSlot("");
      setForm((current) => ({ ...current, awb: "", phone: transporterProfile.phone || "", notes: "" }));
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

    const targetDockIndex = Number(dockIndex);
    const capacity = getDeliveryCounterConfig(config).deliveryDocks;

    if (!Number.isInteger(targetDockIndex) || targetDockIndex < 0) {
      setMessage({ type: "error", text: "Muelle seleccionado no valido." });
      return;
    }

    if (targetDockIndex >= capacity) {
      setMessage({ type: "error", text: "Ese muelle de entrega no esta disponible." });
      return;
    }

    const dockStart = targetReservation.deliveryDockStart || getCounterEndForReservation(targetReservation);
    const dockEnd = getDeliveryDockEndForReservation(targetReservation);

    const occupied = reservations.some((reservation) => {
      if (reservation.id === id || !isActiveDeliveryReservation(reservation) || reservation.date !== targetReservation.date) return false;
      const reservationDockIndex = Number(
        Number.isFinite(Number(reservation.deliveryDockIndex)) ? reservation.deliveryDockIndex : reservation.dockIndex || 0
      );
      if (reservationDockIndex !== targetDockIndex) return false;
      return intervalsOverlap(dockStart, dockEnd, reservation.deliveryDockStart || getCounterEndForReservation(reservation), getDeliveryDockEndForReservation(reservation));
    });

    if (occupied) {
      setMessage({ type: "error", text: "Ese muelle ya esta ocupado durante la ventana de entrega. Elige otro muelle." });
      return;
    }

    const currentMeta = parseReservationNotes(targetReservation.rawNotes || targetReservation.notes || "");
    const nextNotes = buildReservationNotes({
      ...currentMeta,
      notesText: targetReservation.notes || currentMeta.notesText || "",
      deliveryType: targetReservation.deliveryType || currentMeta.deliveryType || "",
      deliverySubtype: targetReservation.deliverySubtype || currentMeta.deliverySubtype || "",
      awbQuantityRange: targetReservation.awbQuantityRange || currentMeta.awbQuantityRange || "",
      counterDuration: targetReservation.counterDuration || currentMeta.counterDuration || 0,
      deliveryDockDuration: targetReservation.deliveryDockDuration || currentMeta.deliveryDockDuration || 0,
      counterStart: targetReservation.counterStart || currentMeta.counterStart || targetReservation.time,
      counterEnd: targetReservation.counterEnd || currentMeta.counterEnd || getCounterEndForReservation(targetReservation),
      counterBlockEnd: targetReservation.counterBlockEnd || currentMeta.counterBlockEnd || "",
      deliveryDockStart: dockStart,
      deliveryDockEnd: dockEnd,
      counterIndex: targetReservation.counterIndex || currentMeta.counterIndex || 0,
      deliveryDockIndex: targetDockIndex,
    });

    try {
      const updatedReservation = await updateReservationInDb(id, { dock_index: targetDockIndex, notes: nextNotes });
      const localUpdated = {
        ...targetReservation,
        dockIndex: targetDockIndex,
        deliveryDockIndex: targetDockIndex,
        rawNotes: nextNotes,
        notes: targetReservation.notes || "",
      };
      const nextReservations = updatedReservation
        ? upsertReservationInList(reservations, updatedReservation)
        : upsertReservationInList(reservations, localUpdated);

      setReservations(nextReservations);
      if (!isSupabaseConfigured()) saveLocalReservations(nextReservations);
      setMessage({ type: "success", text: "Reserva " + id + " movida al Muelle entrega " + dockName(targetDockIndex) + "." });
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

  function updateDeliveryCounter(field, value) {
    setConfig((current) => ({
      ...current,
      deliveryCounter: {
        ...current.deliveryCounter,
        [field]: field === "startTime" || field === "endTime" ? value : Math.max(1, Number(value || 1)),
      },
    }));
  }

  function updateDeliveryRule(id, field, value) {
    setConfig((current) => ({
      ...current,
      deliveryRules: current.deliveryRules.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              [field]: field === "counterMinutes" || field === "deliveryDockMinutes" ? Math.max(1, Number(value || 1)) : value,
            }
          : rule
      ),
    }));
  }

  function addDeliveryRule() {
    setConfig((current) => ({
      ...current,
      deliveryRules: current.deliveryRules.concat({
        id: "DR-" + Date.now(),
        deliveryType: "General",
        subtype: "Nuevo subtipo",
        awbQuantityRange: "N/A",
        counterMinutes: 20,
        deliveryDockMinutes: 15,
      }),
    }));
  }

  function removeDeliveryRule(id) {
    setConfig((current) => {
      if ((current.deliveryRules || []).length <= 1) return current;
      return { ...current, deliveryRules: current.deliveryRules.filter((rule) => rule.id !== id) };
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
        {isRegister && <p style={rs.muted}>Crea tu perfil con correo, empresa, nombre y apellidos. Estos datos se usaran para rellenar tus reservas automaticamente.</p>}
        {isForgot && <p style={rs.muted}>Introduce tu correo y te enviaremos un enlace de restablecimiento.</p>}
        {isUpdatePassword && <p style={rs.muted}>Introduce una nueva contrasena para tu perfil.</p>}

        {loginMessage && <div style={loginMessage.type === "success" ? rs.success : rs.error}>{loginMessage.text}</div>}

        {!isUpdatePassword && (
          <label style={rs.label}>
            Correo electronico
            <input style={rs.input} type="email" value={authForm.email} onChange={(event) => updateAuthForm("email", event.target.value)} placeholder="empresa@transportista.com" />
          </label>
        )}

        {isRegister && (
          <>
            <label style={rs.label}>
              Empresa transportista
              <input style={rs.input} value={authForm.company} onChange={(event) => updateAuthForm("company", event.target.value)} placeholder="Nombre de la empresa" />
            </label>
            <label style={rs.label}>
              Nombre y apellidos
              <input style={rs.input} value={authForm.fullName} onChange={(event) => updateAuthForm("fullName", event.target.value)} placeholder="Nombre y apellidos" />
            </label>
            <label style={rs.label}>
              Telefono opcional
              <input style={rs.input} value={authForm.phone} onChange={(event) => updateAuthForm("phone", event.target.value)} placeholder="Telefono de contacto" />
            </label>
          </>
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

  function renderResourceGantt(title, resources, reservationsForGantt, resourceType) {
    const counter = getDeliveryCounterConfig(config);
    const startMinutes = timeToMinutes(counter.startTime);
    const endMinutes = timeToMinutes(counter.endTime);
    const totalMinutes = Math.max(endMinutes - startMinutes, 1);
    const hourMarks = [];
    let mark = Math.ceil(startMinutes / 60) * 60;

    while (mark <= endMinutes) {
      hourMarks.push(mark);
      mark += 60;
    }

    return (
      <div style={{ marginBottom: 22 }}>
        <h3 style={{ margin: "0 0 10px" }}>{title}</h3>
        <div style={rs.ganttWrapper}>
          <div style={rs.ganttHeader}>
            <div style={{ padding: 12, fontWeight: 700 }}>{resourceType === "counter" ? "Mostrador" : "Muelle"}</div>
            <div style={{ position: "relative", height: 46 }}>
              {hourMarks.map((minute) => {
                const left = ((minute - startMinutes) / totalMinutes) * 100;
                return <div key={minute} style={{ position: "absolute", left: left + "%", top: 8, fontSize: 12, color: "#64748b" }}>{minutesToTime(minute)}</div>;
              })}
            </div>
          </div>

          {Array.from({ length: resources }).map((_, resourceIndex) => (
            <div style={rs.ganttRow} key={resourceIndex}>
              <div style={{ padding: 12, fontWeight: 800, background: "#f8fafc" }}>
                {resourceType === "counter" ? "Mostrador " : "Muelle entrega "}{dockName(resourceIndex)}
              </div>
              <div style={{ position: "relative", height: 68, background: "linear-gradient(to right, #f8fafc, #ffffff)" }}>
                {hourMarks.map((minute) => {
                  const left = ((minute - startMinutes) / totalMinutes) * 100;
                  return <div key={minute} style={{ position: "absolute", left: left + "%", top: 0, bottom: 0, borderLeft: "1px solid #e2e8f0" }} />;
                })}

                {reservationsForGantt
                  .filter((reservation) =>
                    resourceType === "counter"
                      ? Number(reservation.counterIndex || 0) === resourceIndex
                      : Number(reservation.deliveryDockIndex || reservation.dockIndex || 0) === resourceIndex
                  )
                  .map((reservation) => {
                    const realStart = resourceType === "counter" ? reservation.counterStart : reservation.deliveryDockStart;
                    const realEnd = resourceType === "counter" ? reservation.counterEnd : reservation.deliveryDockEnd;
                    const visualEnd = resourceType === "counter" ? reservation.counterBlockEnd : reservation.deliveryDockEnd;
                    const realLeft = ((timeToMinutes(realStart) - startMinutes) / totalMinutes) * 100;
                    const visualWidth = Math.max(((timeToMinutes(visualEnd) - timeToMinutes(realStart)) / totalMinutes) * 100, 0.5);
                    const realWidth = Math.max(((timeToMinutes(realEnd) - timeToMinutes(realStart)) / totalMinutes) * 100, 0.5);
                    const tooltip = [
                      "Reserva: " + reservation.id,
                      "Empresa: " + (reservation.company || "-"),
                      "Contacto: " + (reservation.contact || "-"),
                      "AWB: " + (reservation.awb || "-"),
                      "Tipo: " + (reservation.deliveryType || reservation.operation || "-"),
                      "Subtipo: " + (reservation.deliverySubtype || "-"),
                      "Cantidad AWBs: " + (reservation.awbQuantityRange || "-"),
                      resourceType === "counter"
                        ? "Mostrador real: " + realStart + "-" + realEnd
                        : "Muelle entrega: " + realStart + "-" + realEnd,
                      resourceType === "counter"
                        ? "Bloque mostrado: " + realStart + "-" + visualEnd
                        : "Duracion: " + (reservation.deliveryDockDuration || "-") + " min",
                    ].join(String.fromCharCode(10));

                    return (
                      <div
                        key={reservation.id + resourceType}
                        title={tooltip}
                        aria-label={tooltip}
                        style={{
                          position: "absolute",
                          left: realLeft + "%",
                          top: 10,
                          width: visualWidth + "%",
                          minWidth: 6,
                          height: 48,
                          borderRadius: 10,
                          background: resourceType === "counter" ? "#dbeafe" : "#dcfce7",
                          border: "1px solid #94a3b8",
                          overflow: "hidden",
                          boxSizing: "border-box",
                          cursor: "help",
                        }}
                      >
                        {resourceType === "counter" && (
                          <div
                            style={{
                              height: "100%",
                              width: Math.min(100, (realWidth / Math.max(visualWidth, 0.1)) * 100) + "%",
                              background: "rgba(15, 23, 42, 0.25)",
                              borderRadius: 10,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderGantt() {
    const counter = getDeliveryCounterConfig(config);

    return (
      <div>
        {renderResourceGantt("Gantt mostrador de entrega", counter.counters, ganttReservations, "counter")}
        {renderResourceGantt("Gantt muelle de entrega", counter.deliveryDocks, ganttReservations, "deliveryDock")}
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
                <div style={rs.homeStepItemDark}><span style={rs.dotLight} /><span>Identificate con tu correo electronico y contrasena.</span></div>
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
            <p style={rs.muted}>Introduce los datos minimos para reservar un hueco. Puedes reservar hasta {maxDeliveryReservationsPerDay} slots de Entrega de mercancia al dia.</p>
            <div style={{ ...rs.warning, marginTop: 12 }}>*Esta reserva no incluye perecederos y el ecommerce.</div>
            {(!transporterProfile.company || !transporterProfile.fullName) && (
              <div style={rs.warning}>Tu perfil no tiene empresa o contacto guardados. Cierra sesion y crea un perfil nuevo, o avisanos para actualizar tus datos.</div>
            )}

            <label style={rs.label}>AWB / Referencia *<input style={rs.input} value={form.awb} onChange={(event) => updateForm("awb", event.target.value)} placeholder="Ej. 075-12345678" /></label>
            <label style={rs.label}>Empresa transportista<input style={{ ...rs.input, background: "#f8fafc" }} value={transporterProfile.company} readOnly /></label>
            <label style={rs.label}>Contacto<input style={{ ...rs.input, background: "#f8fafc" }} value={transporterProfile.fullName} readOnly /></label>
            <label style={rs.label}>Email<input style={{ ...rs.input, background: "#f8fafc" }} value={transporterEmail} readOnly /></label>
            <label style={rs.label}>Telefono opcional<input style={rs.input} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="Telefono de contacto" /></label>
            <label style={rs.label}>
              Tipo de operacion
              <select style={rs.input} value={form.operation} onChange={(event) => updateForm("operation", event.target.value)}>
                <option>Entrega de mercancía</option>
                <option>Retirada de mercancía</option>
              </select>
            </label>

            {form.operation === "Entrega de mercancía" && (
              <div style={rs.rangeCard}>
                <h3 style={{ margin: "0 0 8px" }}>Datos de entrega</h3>
                <label style={rs.label}>
                  Tipo de entrega
                  <select style={rs.input} value={form.deliveryType} onChange={(event) => updateForm("deliveryType", event.target.value)}>
                    {getRuleDeliveryTypes(config).map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label style={rs.label}>
                  Subtipo
                  <select style={rs.input} value={form.deliverySubtype} onChange={(event) => updateForm("deliverySubtype", event.target.value)}>
                    {getRuleSubtypes(config, form.deliveryType).map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label style={rs.label}>
                  Cantidad de AWBs
                  <select style={rs.input} value={form.awbQuantityRange} onChange={(event) => updateForm("awbQuantityRange", event.target.value)}>
                    {getRuleAwbRanges(config, form.deliveryType, form.deliverySubtype).map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              </div>
            )}

            {form.operation === "Retirada de mercancía" && (
              <div style={rs.warning}>La logica de slots para Retirada de mercancia todavia esta pendiente de definir. De momento no se muestran horarios disponibles.</div>
            )}
          </div>

          <div style={rs.card}>
            <div style={rs.sectionHeader}>
              <div>
                <h2 style={{ margin: 0 }}>Selecciona dia y hora de mostrador</h2>
                <p style={rs.muted}>
                  Las horas se muestran cada {getDeliveryCounterConfig(config).stepMinutes} minutos.
                  La reserva bloquea mostrador y, justo despues, un muelle de entrega.
                </p>
                {bookingLimitWarning && <p ref={bookingLimitRef} style={{ ...rs.error, marginTop: 12 }}>No puedes reservar mas de {maxDeliveryReservationsPerDay} slots de Entrega de mercancia al dia.</p>}
              </div>
              <label style={{ ...rs.label, marginTop: 0, minWidth: isMobile ? "100%" : 180 }}>
                Fecha
                <input style={rs.input} type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setBookingLimitWarning(false); setSelectedSlot(""); }} />
              </label>
            </div>

            {message && <div ref={messageRef} style={message.type === "success" ? rs.success : rs.error}>{message.text}</div>}

            {form.operation === "Retirada de mercancía" && (
              <div style={rs.warning}>La seleccion de horarios para Retirada de mercancia todavia no esta disponible.</div>
            )}

            {form.operation === "Entrega de mercancía" && !selectedDeliveryRule && (
              <div style={rs.error}>Selecciona tipo de entrega, subtipo y cantidad de AWBs para ver horarios disponibles.</div>
            )}

            {form.operation === "Entrega de mercancía" && selectedDeliveryRule && (
              <div style={{ ...rs.slotGrid, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(120px, 1fr))", alignItems: "start" }}>
                {availability.map((slot) => {
                  const occupancyStyle = getOccupancyBadgeStyle(slot.counterUsed, slot.counterCapacity, config.occupancyThresholds);
                  const currentSlotStyle = selectedSlot === slot.time
                    ? { ...rs.slot, ...rs.slotSelected }
                    : slot.full
                      ? { ...rs.slot, ...occupancyStyle, borderColor: occupancyStyle.borderColor, cursor: "not-allowed", opacity: 0.65 }
                      : { ...rs.slot, ...occupancyStyle, borderColor: occupancyStyle.borderColor };

                  const compactSlotStyle = {
                    ...currentSlotStyle,
                    minHeight: "auto",
                    padding: "10px 14px",
                    borderRadius: 14,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    gap: 3,
                    lineHeight: 1.15,
                  };

                  return (
                    <button key={slot.time} disabled={slot.full} style={compactSlotStyle} onClick={() => selectTransporterSlot(slot.time)}>
                      <strong style={{ display: "block", fontSize: 20, lineHeight: 1 }}>{slot.time}</strong>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>
                        {slot.full ? "Ocupado" : "Disponible"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={rs.confirmBox}>
              <div>
                <strong>Hora de mostrador seleccionada: {selectedSlot || "ninguna"}</strong>
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>Al confirmar se vuelve a validar la disponibilidad de mostrador y muelle de entrega.</p>
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
                      <span style={{ display: "block", marginTop: 8 }}>{row.used}/{row.docks} mostradores ocupados</span>
                      
                    </button>
                  );
                })}
              </div>

              {selectedAdminSlot && (
                <div style={rs.rangeCard}>
                  <h3 style={{ marginTop: 0 }}>Detalle del slot {selectedAdminSlot}</h3>
                  {getReservationsOverlappingCounterWindow(reservations, adminDate, selectedAdminSlot, getDeliveryCounterConfig(config).stepMinutes).length === 0 && <p style={rs.muted}>No hay reservas en este intervalo de mostrador.</p>}
                  {getReservationsOverlappingCounterWindow(reservations, adminDate, selectedAdminSlot, getDeliveryCounterConfig(config).stepMinutes).map((reservation) => (
                    <div style={rs.reservationItem} key={reservation.id}>
                      <div>
                        <strong>{reservation.company}{reservation.plate ? " - " + reservation.plate : ""}</strong>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Reserva {reservation.id} - AWB {reservation.awb}</p>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Transportista: {reservation.email}</p>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Mostrador: <strong>{reservation.counterStart || reservation.time}-{getCounterEndForReservation(reservation)}</strong> · Muelle entrega: <strong>{reservation.deliveryDockStart || getCounterEndForReservation(reservation)}-{getDeliveryDockEndForReservation(reservation)}</strong></p>
                        <p style={{ margin: "5px 0 0", color: "#64748b" }}>Asignacion: <strong>Mostrador {dockName(Number(reservation.counterIndex || 0))}</strong> · <strong>Muelle entrega {dockName(Number(reservation.deliveryDockIndex || reservation.dockIndex || 0))}</strong></p>
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
              const capacity = getDeliveryCounterConfig(config).deliveryDocks;
              return (
                <div style={rs.reservationItem} key={reservation.id}>
                  <div>
                    <strong>{reservation.id} - Mostrador {reservation.counterStart}-{reservation.counterEnd} - {reservation.company}</strong>
                    <p style={{ margin: "5px 0 0", color: "#64748b" }}>
                      AWB {reservation.awb} · {reservation.deliveryType || reservation.operation} · {reservation.deliverySubtype || "-"} · {reservation.awbQuantityRange || "-"}
                    </p>
                    <p style={{ margin: "5px 0 0", color: "#64748b" }}>
                      Muelle entrega actual {dockName(Number(reservation.deliveryDockIndex || reservation.dockIndex || 0))}: {reservation.deliveryDockStart}-{reservation.deliveryDockEnd}
                    </p>
                  </div>
                  <label style={{ ...rs.label, marginTop: 0, minWidth: isMobile ? "100%" : 180 }}>
                    Mover a muelle de entrega
                    <select style={rs.input} value={reservation.deliveryDockIndex || reservation.dockIndex || 0} onChange={(event) => moveReservationToDock(reservation.id, event.target.value)}>
                      {Array.from({ length: capacity }).map((_, dockIndex) => <option key={dockIndex} value={dockIndex}>Muelle entrega {dockName(dockIndex)}</option>)}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>

          <div style={rs.warning}>Si el muelle elegido ya esta ocupado durante la ventana real de entrega, la app bloquea el cambio para evitar solapes.</div>
        </section>
      )}

      {appMode === "admin" && adminLoggedIn && activeTab === "config" && (
        <section style={rs.card}>
          <div style={rs.sectionHeader}>
            <div>
              <h2 style={{ margin: 0 }}>Configuracion de entrega de mercancia</h2>
              <p style={rs.muted}>Configura horarios de mostrador, numero de mostradores, muelles de entrega y la tabla de duraciones por tipo de entrega.</p>
            </div>
            <button style={rs.primaryButton} onClick={addDeliveryRule}>Anadir regla de duracion</button>
          </div>


          <div style={rs.rangeCard}>
            <h3 style={{ margin: "0 0 8px" }}>Atencion de mostrador y muelles de entrega</h3>
            <p style={rs.muted}>Las horas disponibles para transportistas se generan desde la hora de inicio hasta la hora de fin, en intervalos configurables.</p>
            <div style={rs.configGrid}>
              <label style={rs.label}>Hora inicio atencion<input style={rs.input} type="time" value={config.deliveryCounter.startTime} onChange={(event) => updateDeliveryCounter("startTime", event.target.value)} /></label>
              <label style={rs.label}>Hora fin atencion<input style={rs.input} type="time" value={config.deliveryCounter.endTime} onChange={(event) => updateDeliveryCounter("endTime", event.target.value)} /></label>
              <label style={rs.label}>Intervalo visible de horas<input style={rs.input} type="number" min="5" value={config.deliveryCounter.stepMinutes} onChange={(event) => updateDeliveryCounter("stepMinutes", event.target.value)} /></label>
              <label style={rs.label}>Numero de mostradores<input style={rs.input} type="number" min="1" value={config.deliveryCounter.counters} onChange={(event) => updateDeliveryCounter("counters", event.target.value)} /></label>
              <label style={rs.label}>Numero de muelles de entrega<input style={rs.input} type="number" min="1" value={config.deliveryCounter.deliveryDocks} onChange={(event) => updateDeliveryCounter("deliveryDocks", event.target.value)} /></label>
              <label style={rs.label}>Maximo slots por persona/dia<input style={rs.input} type="number" min="1" value={config.deliveryCounter.maxDeliveryReservationsPerDay || 3} onChange={(event) => updateDeliveryCounter("maxDeliveryReservationsPerDay", event.target.value)} /></label>
            </div>
          </div>

          <div style={rs.rangeCard}>
            <h3 style={{ margin: "0 0 8px" }}>Tabla de duraciones por tipo de entrega</h3>
            <p style={rs.muted}>Edita la cantidad de AWBs y las duraciones de mostrador y muelle de entrega. Estos valores se aplican al calcular los slots disponibles.</p>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1.4fr 1fr 0.8fr 0.9fr 90px", gap: 8, fontWeight: 800, color: "#475569" }}>
                <span>Tipo entrega</span>
                <span>Subtipo</span>
                <span>Cantidad AWBs</span>
                <span>Min mostrador</span>
                <span>Min muelle entrega</span>
                <span></span>
              </div>

              {config.deliveryRules.map((rule) => (
                <div key={rule.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1.4fr 1fr 0.8fr 0.9fr 90px", gap: 8, alignItems: "center" }}>
                  <input style={rs.input} value={rule.deliveryType} onChange={(event) => updateDeliveryRule(rule.id, "deliveryType", event.target.value)} />
                  <input style={rs.input} value={rule.subtype} onChange={(event) => updateDeliveryRule(rule.id, "subtype", event.target.value)} />
                  <input style={rs.input} value={rule.awbQuantityRange} onChange={(event) => updateDeliveryRule(rule.id, "awbQuantityRange", event.target.value)} />
                  <input style={rs.input} type="number" min="1" value={rule.counterMinutes} onChange={(event) => updateDeliveryRule(rule.id, "counterMinutes", event.target.value)} />
                  <input style={rs.input} type="number" min="1" value={rule.deliveryDockMinutes} onChange={(event) => updateDeliveryRule(rule.id, "deliveryDockMinutes", event.target.value)} />
                  <button style={rs.dangerButton} onClick={() => removeDeliveryRule(rule.id)}>Quitar</button>
                </div>
              ))}
            </div>
          </div>

          <div style={rs.rangeCard}>
            <h3 style={{ margin: "0 0 8px" }}>Rangos de color de ocupacion</h3>
            <p style={rs.muted}>Configura los umbrales que pintan los indicadores de ocupacion.</p>
            <div style={rs.configGrid}>
              <label style={rs.label}>Verde hasta menor que (%)<input style={rs.input} type="number" min="0" max="100" value={config.occupancyThresholds.greenMax} onChange={(event) => updateOccupancyThreshold("greenMax", event.target.value)} /></label>
              <label style={rs.label}>Amarillo hasta (%)<input style={rs.input} type="number" min="0" max="100" value={config.occupancyThresholds.yellowMax} onChange={(event) => updateOccupancyThreshold("yellowMax", event.target.value)} /></label>
              <label style={rs.label}>Naranja hasta (%)<input style={rs.input} type="number" min="0" max="100" value={config.occupancyThresholds.orangeMax} onChange={(event) => updateOccupancyThreshold("orangeMax", event.target.value)} /></label>
            </div>
          </div>


          <div style={rs.warning}>La opcion Retirada de mercancia queda visible en el formulario, pero no muestra horarios porque su logica todavia esta pendiente. Los cambios de configuracion, incluido el maximo de slots por persona y dia, se aplican en esta sesion de la app; para hacerlos permanentes y compartidos entre usuarios conviene guardarlos en una tabla de configuracion de Supabase.</div>
        </section>
      )}
    </main>
  );
}
