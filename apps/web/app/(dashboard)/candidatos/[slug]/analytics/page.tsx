"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme-context";

import { api } from "@/lib/services";

import {
  DigitalHeader,
  KpiCards,
  PagesTable,
  TrafficSources,
  CitiesRanking,
  DailyChart,
  EventsFunnel,
  PagesDetailedTable,
  SourceQuality,
  InsightsPanel,
  RegionsRanking,
  SeoReport,
  GscPanel,
  type GA4Data,
  type GA4Region,
  type GSCData,
} from "./_components";

/* ─────────────────────────────────────────────────────────────────────
   HARDCODED: Detalles demográficos por Región — Edwards Infante
   Fuente: Detalles_demográficos_Región.csv
   Período: 2025-10-01 → 2026-03-07
   ───────────────────────────────────────────────────────────────────── */
const EDWARDS_INFANTE_REGIONS: GA4Region[] = [
  { region: "Lima Province",          activeUsers: 1615, newUsers: 1575, engagedSessions: 892,  engagementRate: 0.317, sessionsPerUser: 0.552, avgEngagementTime: 43.985, events: 10328, keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Callao Region",          activeUsers: 244,  newUsers: 214,  engagedSessions: 174,  engagementRate: 0.385, sessionsPerUser: 0.713, avgEngagementTime: 43.951, events: 1523,  keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "La Libertad",            activeUsers: 104,  newUsers: 94,   engagedSessions: 28,   engagementRate: 0.219, sessionsPerUser: 0.269, avgEngagementTime: 28.635, events: 391,   keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Oregon",                 activeUsers: 55,   newUsers: 55,   engagedSessions: 10,   engagementRate: 0.182, sessionsPerUser: 0.182, avgEngagementTime: 0.982,  events: 178,   keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Piura",                  activeUsers: 36,   newUsers: 23,   engagedSessions: 24,   engagementRate: 0.436, sessionsPerUser: 0.667, avgEngagementTime: 111.444, events: 220,  keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Arequipa",               activeUsers: 29,   newUsers: 21,   engagedSessions: 20,   engagementRate: 0.345, sessionsPerUser: 0.690, avgEngagementTime: 21.586, events: 179,   keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Junin",                  activeUsers: 28,   newUsers: 20,   engagedSessions: 13,   engagementRate: 0.406, sessionsPerUser: 0.464, avgEngagementTime: 40.036, events: 101,   keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Ancash",                 activeUsers: 23,   newUsers: 17,   engagedSessions: 10,   engagementRate: 0.323, sessionsPerUser: 0.435, avgEngagementTime: 10.565, events: 92,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Cusco",                  activeUsers: 21,   newUsers: 12,   engagedSessions: 18,   engagementRate: 0.409, sessionsPerUser: 0.857, avgEngagementTime: 26.762, events: 117,   keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Lambayeque",             activeUsers: 17,   newUsers: 9,    engagedSessions: 10,   engagementRate: 0.385, sessionsPerUser: 0.588, avgEngagementTime: 18.235, events: 71,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Loreto",                 activeUsers: 13,   newUsers: 6,    engagedSessions: 9,    engagementRate: 0.450, sessionsPerUser: 0.692, avgEngagementTime: 32.538, events: 65,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Lima Region",            activeUsers: 12,   newUsers: 10,   engagedSessions: 4,    engagementRate: 0.267, sessionsPerUser: 0.333, avgEngagementTime: 14.917, events: 45,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Virginia",               activeUsers: 7,    newUsers: 7,    engagedSessions: 3,    engagementRate: 0.429, sessionsPerUser: 0.429, avgEngagementTime: 23.143, events: 28,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "California",             activeUsers: 4,    newUsers: 4,    engagedSessions: 2,    engagementRate: 0.500, sessionsPerUser: 0.500, avgEngagementTime: 26.750, events: 18,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Huanuco",                activeUsers: 4,    newUsers: 4,    engagedSessions: 0,    engagementRate: 0,     sessionsPerUser: 0,     avgEngagementTime: 0,      events: 14,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Ica",                    activeUsers: 4,    newUsers: 3,    engagedSessions: 1,    engagementRate: 0.200, sessionsPerUser: 0.250, avgEngagementTime: 20.500, events: 16,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "San Martin",             activeUsers: 3,    newUsers: 3,    engagedSessions: 0,    engagementRate: 0,     sessionsPerUser: 0,     avgEngagementTime: 0,      events: 9,     keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Moquegua",               activeUsers: 2,    newUsers: 2,    engagedSessions: 1,    engagementRate: 0.250, sessionsPerUser: 0.500, avgEngagementTime: 0.500,  events: 12,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Ayacucho",               activeUsers: 1,    newUsers: 1,    engagedSessions: 2,    engagementRate: 1.000, sessionsPerUser: 2.000, avgEngagementTime: 65.000, events: 17,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Cajamarca",              activeUsers: 1,    newUsers: 1,    engagedSessions: 0,    engagementRate: 0,     sessionsPerUser: 0,     avgEngagementTime: 0,      events: 3,     keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Puno",                   activeUsers: 1,    newUsers: 1,    engagedSessions: 1,    engagementRate: 1.000, sessionsPerUser: 1.000, avgEngagementTime: 114.000, events: 4,    keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Tacna",                  activeUsers: 1,    newUsers: 1,    engagedSessions: 0,    engagementRate: 0,     sessionsPerUser: 0,     avgEngagementTime: 0,      events: 3,     keyEvents: 0, keyEventRate: 0, revenue: 0 },
  { region: "Ucayali",                activeUsers: 1,    newUsers: 1,    engagedSessions: 0,    engagementRate: 0,     sessionsPerUser: 0,     avgEngagementTime: 0,      events: 3,     keyEvents: 0, keyEventRate: 0, revenue: 0 },
];

/* ─────────────────────────────────────────────────────────────────────
   HARDCODED: Google Search Console — Edwards Infante
   Fuente: edward/Gráfico.csv, Consultas.csv, Páginas.csv,
           Dispositivos.csv, Países.csv
   Período: Últimos 3 meses (Web)
   Totales: 99 clics · 2400 impresiones · CTR 4.1% · Pos. 4.78
   ───────────────────────────────────────────────────────────────────── */
const EDWARDS_INFANTE_GSC: GSCData = {
  period: "Últimos 3 meses",
  totals: {
    clicks: 99,
    impressions: 2400,
    ctr: 0.041,
    avgPosition: 4.78,
  },
  daily: [
    { date: "2025-12-05", clicks: 1,  impressions: 24,  ctr: 0.0417, position: 5.3  },
    { date: "2025-12-06", clicks: 0,  impressions: 9,   ctr: 0,      position: 3.6  },
    { date: "2025-12-07", clicks: 1,  impressions: 5,   ctr: 0.2,    position: 3.8  },
    { date: "2025-12-08", clicks: 1,  impressions: 8,   ctr: 0.125,  position: 5.4  },
    { date: "2025-12-09", clicks: 1,  impressions: 12,  ctr: 0.0833, position: 5.0  },
    { date: "2025-12-10", clicks: 1,  impressions: 13,  ctr: 0.0769, position: 3.0  },
    { date: "2025-12-11", clicks: 5,  impressions: 17,  ctr: 0.2941, position: 4.1  },
    { date: "2025-12-12", clicks: 0,  impressions: 17,  ctr: 0,      position: 2.5  },
    { date: "2025-12-13", clicks: 1,  impressions: 25,  ctr: 0.04,   position: 4.3  },
    { date: "2025-12-14", clicks: 1,  impressions: 7,   ctr: 0.1429, position: 4.0  },
    { date: "2025-12-15", clicks: 0,  impressions: 23,  ctr: 0,      position: 4.9  },
    { date: "2025-12-16", clicks: 3,  impressions: 15,  ctr: 0.2,    position: 2.6  },
    { date: "2025-12-17", clicks: 0,  impressions: 23,  ctr: 0,      position: 4.9  },
    { date: "2025-12-18", clicks: 0,  impressions: 20,  ctr: 0,      position: 3.4  },
    { date: "2025-12-19", clicks: 1,  impressions: 35,  ctr: 0.0286, position: 4.8  },
    { date: "2025-12-20", clicks: 1,  impressions: 17,  ctr: 0.0588, position: 8.6  },
    { date: "2025-12-21", clicks: 0,  impressions: 10,  ctr: 0,      position: 7.1  },
    { date: "2025-12-22", clicks: 3,  impressions: 40,  ctr: 0.075,  position: 6.2  },
    { date: "2025-12-23", clicks: 2,  impressions: 26,  ctr: 0.0769, position: 4.8  },
    { date: "2025-12-24", clicks: 2,  impressions: 13,  ctr: 0.1538, position: 8.9  },
    { date: "2025-12-25", clicks: 0,  impressions: 24,  ctr: 0,      position: 13.7 },
    { date: "2025-12-26", clicks: 0,  impressions: 20,  ctr: 0,      position: 6.3  },
    { date: "2025-12-27", clicks: 1,  impressions: 13,  ctr: 0.0769, position: 8.0  },
    { date: "2025-12-28", clicks: 1,  impressions: 16,  ctr: 0.0625, position: 6.9  },
    { date: "2025-12-29", clicks: 2,  impressions: 32,  ctr: 0.0625, position: 23.1 },
    { date: "2025-12-30", clicks: 1,  impressions: 39,  ctr: 0.0256, position: 24.0 },
    { date: "2025-12-31", clicks: 1,  impressions: 14,  ctr: 0.0714, position: 6.4  },
    { date: "2026-01-01", clicks: 0,  impressions: 7,   ctr: 0,      position: 17.3 },
    { date: "2026-01-02", clicks: 0,  impressions: 18,  ctr: 0,      position: 5.6  },
    { date: "2026-01-03", clicks: 0,  impressions: 10,  ctr: 0,      position: 3.9  },
    { date: "2026-01-04", clicks: 0,  impressions: 12,  ctr: 0,      position: 4.1  },
    { date: "2026-01-05", clicks: 1,  impressions: 15,  ctr: 0.0667, position: 5.7  },
    { date: "2026-01-06", clicks: 0,  impressions: 23,  ctr: 0,      position: 6.9  },
    { date: "2026-01-07", clicks: 2,  impressions: 25,  ctr: 0.08,   position: 5.0  },
    { date: "2026-01-08", clicks: 2,  impressions: 22,  ctr: 0.0909, position: 2.9  },
    { date: "2026-01-09", clicks: 0,  impressions: 23,  ctr: 0,      position: 5.3  },
    { date: "2026-01-10", clicks: 1,  impressions: 15,  ctr: 0.0667, position: 4.6  },
    { date: "2026-01-11", clicks: 0,  impressions: 14,  ctr: 0,      position: 5.6  },
    { date: "2026-01-12", clicks: 0,  impressions: 30,  ctr: 0,      position: 4.2  },
    { date: "2026-01-13", clicks: 3,  impressions: 32,  ctr: 0.0938, position: 3.1  },
    { date: "2026-01-14", clicks: 1,  impressions: 19,  ctr: 0.0526, position: 6.6  },
    { date: "2026-01-15", clicks: 0,  impressions: 22,  ctr: 0,      position: 7.5  },
    { date: "2026-01-16", clicks: 1,  impressions: 25,  ctr: 0.04,   position: 4.4  },
    { date: "2026-01-17", clicks: 2,  impressions: 28,  ctr: 0.0714, position: 4.6  },
    { date: "2026-01-18", clicks: 0,  impressions: 17,  ctr: 0,      position: 13.2 },
    { date: "2026-01-19", clicks: 2,  impressions: 28,  ctr: 0.0714, position: 5.7  },
    { date: "2026-01-20", clicks: 3,  impressions: 38,  ctr: 0.0789, position: 5.6  },
    { date: "2026-01-21", clicks: 2,  impressions: 56,  ctr: 0.0357, position: 4.1  },
    { date: "2026-01-22", clicks: 2,  impressions: 45,  ctr: 0.0444, position: 5.8  },
    { date: "2026-01-23", clicks: 3,  impressions: 45,  ctr: 0.0667, position: 5.3  },
    { date: "2026-01-24", clicks: 5,  impressions: 18,  ctr: 0.2778, position: 1.9  },
    { date: "2026-01-25", clicks: 0,  impressions: 17,  ctr: 0,      position: 4.3  },
    { date: "2026-01-26", clicks: 4,  impressions: 39,  ctr: 0.1026, position: 3.5  },
    { date: "2026-01-27", clicks: 0,  impressions: 35,  ctr: 0,      position: 3.7  },
    { date: "2026-01-28", clicks: 1,  impressions: 33,  ctr: 0.0303, position: 5.9  },
    { date: "2026-01-29", clicks: 4,  impressions: 44,  ctr: 0.0909, position: 4.8  },
    { date: "2026-01-30", clicks: 0,  impressions: 33,  ctr: 0,      position: 2.8  },
    { date: "2026-01-31", clicks: 2,  impressions: 29,  ctr: 0.069,  position: 6.1  },
    { date: "2026-02-01", clicks: 1,  impressions: 29,  ctr: 0.0345, position: 5.5  },
    { date: "2026-02-02", clicks: 1,  impressions: 35,  ctr: 0.0286, position: 3.9  },
    { date: "2026-02-03", clicks: 3,  impressions: 47,  ctr: 0.0638, position: 3.4  },
    { date: "2026-02-04", clicks: 1,  impressions: 39,  ctr: 0.0256, position: 3.4  },
    { date: "2026-02-05", clicks: 1,  impressions: 54,  ctr: 0.0185, position: 4.6  },
    { date: "2026-02-06", clicks: 3,  impressions: 45,  ctr: 0.0667, position: 4.4  },
    { date: "2026-02-07", clicks: 0,  impressions: 30,  ctr: 0,      position: 5.1  },
    { date: "2026-02-08", clicks: 1,  impressions: 30,  ctr: 0.0333, position: 4.4  },
    { date: "2026-02-09", clicks: 0,  impressions: 35,  ctr: 0,      position: 6.1  },
    { date: "2026-02-10", clicks: 1,  impressions: 38,  ctr: 0.0263, position: 4.1  },
    { date: "2026-02-11", clicks: 0,  impressions: 23,  ctr: 0,      position: 5.4  },
    { date: "2026-02-12", clicks: 0,  impressions: 30,  ctr: 0,      position: 6.2  },
    { date: "2026-02-13", clicks: 0,  impressions: 24,  ctr: 0,      position: 5.1  },
    { date: "2026-02-14", clicks: 0,  impressions: 14,  ctr: 0,      position: 4.6  },
    { date: "2026-02-15", clicks: 0,  impressions: 19,  ctr: 0,      position: 4.4  },
    { date: "2026-02-16", clicks: 3,  impressions: 39,  ctr: 0.0769, position: 5.8  },
    { date: "2026-02-17", clicks: 2,  impressions: 45,  ctr: 0.0444, position: 5.8  },
    { date: "2026-02-18", clicks: 0,  impressions: 30,  ctr: 0,      position: 6.3  },
    { date: "2026-02-19", clicks: 3,  impressions: 55,  ctr: 0.0545, position: 5.1  },
    { date: "2026-02-20", clicks: 1,  impressions: 41,  ctr: 0.0244, position: 7.6  },
    { date: "2026-02-21", clicks: 0,  impressions: 14,  ctr: 0,      position: 3.7  },
    { date: "2026-02-22", clicks: 0,  impressions: 31,  ctr: 0,      position: 3.7  },
    { date: "2026-02-23", clicks: 1,  impressions: 34,  ctr: 0.0294, position: 6.8  },
    { date: "2026-02-24", clicks: 0,  impressions: 30,  ctr: 0,      position: 4.6  },
    { date: "2026-02-25", clicks: 0,  impressions: 24,  ctr: 0,      position: 4.0  },
    { date: "2026-02-26", clicks: 0,  impressions: 41,  ctr: 0,      position: 6.7  },
    { date: "2026-02-27", clicks: 0,  impressions: 34,  ctr: 0,      position: 4.4  },
    { date: "2026-02-28", clicks: 0,  impressions: 27,  ctr: 0,      position: 4.1  },
    { date: "2026-03-01", clicks: 1,  impressions: 21,  ctr: 0.0476, position: 4.1  },
    { date: "2026-03-02", clicks: 1,  impressions: 30,  ctr: 0.0333, position: 3.4  },
    { date: "2026-03-03", clicks: 1,  impressions: 39,  ctr: 0.0256, position: 3.2  },
    { date: "2026-03-04", clicks: 3,  impressions: 39,  ctr: 0.0769, position: 4.3  },
  ],
  queries: [
    { query: "edwards infante",                      clicks: 23, impressions: 187, ctr: 0.123,  position: 2.49  },
    { query: "edward infante",                       clicks: 8,  impressions: 86,  ctr: 0.093,  position: 2.52  },
    { query: "alcalde de carmen de la legua",        clicks: 5,  impressions: 217, ctr: 0.023,  position: 4.84  },
    { query: "alcalde carmen de la legua",           clicks: 2,  impressions: 60,  ctr: 0.0333, position: 4.32  },
    { query: "edwards infante lópez",                clicks: 2,  impressions: 34,  ctr: 0.0588, position: 3.85  },
    { query: "edward infante alcalde",               clicks: 1,  impressions: 8,   ctr: 0.125,  position: 4.12  },
    { query: "alcalde de carmen de la legua reynoso",clicks: 0,  impressions: 45,  ctr: 0,      position: 3.67  },
    { query: "alcalde de carmen de la legua 2025",   clicks: 0,  impressions: 30,  ctr: 0,      position: 2.33  },
    { query: "carmelinas",                           clicks: 0,  impressions: 12,  ctr: 0,      position: 40.92 },
    { query: "educación para adultos mayores",       clicks: 0,  impressions: 10,  ctr: 0,      position: 1.0   },
    { query: "veterinaria patitas carmen de la legua",clicks: 0, impressions: 9,   ctr: 0,      position: 4.11  },
    { query: "escuela del adulto mayor",             clicks: 0,  impressions: 9,   ctr: 0,      position: 12.78 },
    { query: "carmelimo",                            clicks: 0,  impressions: 8,   ctr: 0,      position: 4.25  },
    { query: "alcaldes de carmen de la legua",       clicks: 0,  impressions: 8,   ctr: 0,      position: 5.12  },
    { query: "carmelinos",                           clicks: 0,  impressions: 8,   ctr: 0,      position: 5.88  },
    { query: "carmelino",                            clicks: 0,  impressions: 7,   ctr: 0,      position: 7.86  },
    { query: "omaped",                               clicks: 0,  impressions: 6,   ctr: 0,      position: 30.33 },
    { query: "somos el pueblo",                      clicks: 0,  impressions: 5,   ctr: 0,      position: 35.0  },
    { query: "municipalidad de carmen de la legua reynoso", clicks: 0, impressions: 4, ctr: 0, position: 1.5 },
    { query: "educación adultos mayores",            clicks: 0,  impressions: 3,   ctr: 0,      position: 1.0   },
    { query: "parvularia de adultos mayores",        clicks: 0,  impressions: 3,   ctr: 0,      position: 1.0   },
    { query: "reynoso callao",                       clicks: 0,  impressions: 3,   ctr: 0,      position: 7.0   },
    { query: "preferencias",                         clicks: 0,  impressions: 3,   ctr: 0,      position: 75.67 },
    { query: "carmen de la legua municipalidad",     clicks: 0,  impressions: 2,   ctr: 0,      position: 1.0   },
    { query: "la bombonera carmen de la legua",      clicks: 0,  impressions: 2,   ctr: 0,      position: 23.5  },
  ],
  pages: [
    { url: "https://www.edwardsinfante.com/",                                                                    clicks: 83, impressions: 1631, ctr: 0.0509, position: 3.94  },
    { url: "https://www.edwardsinfante.com/seguridad/la-seguridad-con-alerta-carmelino/",                        clicks: 5,  impressions: 48,   ctr: 0.1042, position: 3.81  },
    { url: "https://www.edwardsinfante.com/novedades/agua-y-desague-para-villa-senor-de-los-milagros/",          clicks: 3,  impressions: 26,   ctr: 0.1154, position: 13.96 },
    { url: "https://www.edwardsinfante.com/novedades/vida-plena-escuela-adulto-mayor/",                          clicks: 2,  impressions: 112,  ctr: 0.0179, position: 4.61  },
    { url: "https://www.edwardsinfante.com/salud/inspeccion-sanitaria/",                                         clicks: 2,  impressions: 68,   ctr: 0.0294, position: 6.28  },
    { url: "https://www.edwardsinfante.com/deporte/tai-chi-para-adultos-mayores/",                               clicks: 2,  impressions: 32,   ctr: 0.0625, position: 4.12  },
    { url: "https://www.edwardsinfante.com/salud/cero-anemia-club-mamitas-d-hierro/",                            clicks: 2,  impressions: 24,   ctr: 0.0833, position: 5.71  },
    { url: "https://www.edwardsinfante.com/salud/huellitas-protegidas-en-carmen-de-la-legua-reynoso/",           clicks: 0,  impressions: 91,   ctr: 0,      position: 10.38 },
    { url: "https://www.edwardsinfante.com/proteccion-social/talleres-productivos-cdl/",                         clicks: 0,  impressions: 88,   ctr: 0,      position: 8.22  },
    { url: "https://www.edwardsinfante.com/proteccion-social/club-omaped-inclusion/",                            clicks: 0,  impressions: 77,   ctr: 0,      position: 9.62  },
    { url: "https://www.edwardsinfante.com/novedades/cubo-rubik-educacion-carmenlegua/",                         clicks: 0,  impressions: 64,   ctr: 0,      position: 9.5   },
    { url: "https://www.edwardsinfante.com/novedades/pueblo-lo-confirma-lideramos/",                             clicks: 0,  impressions: 31,   ctr: 0,      position: 47.23 },
    { url: "https://www.edwardsinfante.com/novedades/protegiendo-a-nuestros-animalitos/",                        clicks: 0,  impressions: 30,   ctr: 0,      position: 12.73 },
    { url: "https://www.edwardsinfante.com/infraestructura/jugar-es-un-derecho/",                                clicks: 0,  impressions: 20,   ctr: 0,      position: 6.25  },
    { url: "https://www.edwardsinfante.com/novedades/ninos-sonrien-carmen-de-la-legua/",                         clicks: 0,  impressions: 14,   ctr: 0,      position: 5.0   },
    { url: "https://www.edwardsinfante.com/category/gestion-municipal/",                                         clicks: 0,  impressions: 13,   ctr: 0,      position: 6.0   },
    { url: "https://www.edwardsinfante.com/proteccion-social/inclusion-resultados/",                             clicks: 0,  impressions: 11,   ctr: 0,      position: 4.18  },
    { url: "https://www.edwardsinfante.com/salud/compra-segura-mercados-carmelinos/",                            clicks: 0,  impressions: 11,   ctr: 0,      position: 5.27  },
  ],
  devices: [
    { device: "Ordenador", clicks: 51, impressions: 903,  ctr: 0.0565, position: 7.13 },
    { device: "Móviles",   clicks: 45, impressions: 1450, ctr: 0.031,  position: 4.66 },
    { device: "Tablet",    clicks: 3,  impressions: 47,   ctr: 0.0638, position: 7.09 },
  ],
  countries: [
    { country: "Perú",          clicks: 93, impressions: 1680, ctr: 0.0554, position: 4.3   },
    { country: "Estados Unidos",clicks: 1,  impressions: 155,  ctr: 0.0065, position: 10.39 },
    { country: "México",        clicks: 1,  impressions: 148,  ctr: 0.0068, position: 5.5   },
    { country: "España",        clicks: 1,  impressions: 81,   ctr: 0.0123, position: 11.23 },
    { country: "Argentina",     clicks: 1,  impressions: 25,   ctr: 0.04,   position: 7.08  },
    { country: "Uruguay",       clicks: 1,  impressions: 5,    ctr: 0.2,    position: 5.8   },
    { country: "Bélgica",       clicks: 1,  impressions: 4,    ctr: 0.25,   position: 9.0   },
    { country: "Colombia",      clicks: 0,  impressions: 28,   ctr: 0,      position: 8.04  },
    { country: "Ecuador",       clicks: 0,  impressions: 26,   ctr: 0,      position: 7.38  },
    { country: "Reino Unido",   clicks: 0,  impressions: 21,   ctr: 0,      position: 11.0  },
    { country: "Venezuela",     clicks: 0,  impressions: 19,   ctr: 0,      position: 4.0   },
    { country: "Guatemala",     clicks: 0,  impressions: 18,   ctr: 0,      position: 7.67  },
    { country: "Chile",         clicks: 0,  impressions: 16,   ctr: 0,      position: 5.0   },
    { country: "La India",      clicks: 0,  impressions: 16,   ctr: 0,      position: 16.12 },
    { country: "República Dominicana", clicks: 0, impressions: 12, ctr: 0, position: 2.33  },
    { country: "El Salvador",   clicks: 0,  impressions: 10,   ctr: 0,      position: 5.3   },
    { country: "Canadá",        clicks: 0,  impressions: 10,   ctr: 0,      position: 8.3   },
    { country: "Brasil",        clicks: 0,  impressions: 8,    ctr: 0,      position: 14.5  },
    { country: "Italia",        clicks: 0,  impressions: 7,    ctr: 0,      position: 4.0   },
    { country: "Malasia",       clicks: 0,  impressions: 7,    ctr: 0,      position: 8.43  },
  ],
};

/** Lazy-load CitiesHeatmap — keeps MapLibre GL out of the analytics chunk */
const CitiesHeatmap = dynamic(
  () => import("./_components/cities-heatmap").then((m) => m.CitiesHeatmap),
  { ssr: false },
);

/** Lazy-load RegionsMap — keeps MapLibre GL out of the analytics chunk */
const RegionsMap = dynamic(
  () => import("./_components/regions-map").then((m) => m.RegionsMap),
  { ssr: false },
);

/* ========== Types ========== */

type CampaignInfo = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  color_primario: string;
  color_secundario: string;
};

type AnalyticsResponse = {
  ok: boolean;
  campaign: CampaignInfo;
  analytics: GA4Data;
  error?: { message: string };
};

/* ========== Page ========== */

export default function DigitalPage() {
  const params = useParams();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const slug = params.slug as string;

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [ga4Data, setGA4Data] = useState<GA4Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [clickedCity, setClickedCity] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [clickedRegion, setClickedRegion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await api.get<AnalyticsResponse>(`/api/analytics/by-slug/${slug}`);

        if (res.ok && res.data) {
          setCampaign(res.data.campaign);
          const analytics = res.data.analytics;
          const regions = analytics.regions?.length
            ? analytics.regions
            : slug === "edwards-infante"
              ? EDWARDS_INFANTE_REGIONS
              : [];
          setGA4Data({
            ...analytics,
            pagesDetailed: analytics.pagesDetailed || [],
            sessionSources: analytics.sessionSources || [],
            events: analytics.events || [],
            regions,
          });
          setError(null);
        } else {
          const statsRes = await api.get<{ ok: boolean; campaign: CampaignInfo }>(`/api/campaigns/${slug}/stats`);
          if (statsRes.ok && statsRes.data?.campaign) {
            setCampaign(statsRes.data.campaign);
          }
          setError(res.error?.message ?? "No hay datos de analytics");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando datos");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [slug]);

  /* ── Loading ─────────────────────────────────────────────────── */
  const fullScreenStyle = isDark
    ? {
      ...FULL_SCREEN,
      backgroundColor: "#090D15",
      "--color-surface": "#090D15",
      "--color-surface-elevated": "#090D15",
      "--color-surface-hover": "#090D15",
      "--color-surface-active": "#1a2738",
      "--color-border": "#1d2f43",
      "--color-border-strong": "#2c425d",
      "--color-text-primary": "#ffffff",
      "--color-text-secondary": "#cbd5e1",
      "--color-text-tertiary": "#94a3b8",
    } as React.CSSProperties
    : FULL_SCREEN;
  const contentStyle = isDark ? { ...S.content, backgroundColor: "#090D15" } : S.content;

  if (loading) {
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <div style={S.loadingContainer}>
          <div style={S.spinner} />
          <span style={S.loadingText}>Cargando datos digitales...</span>
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    );
  }

  /* ── Fatal error ─────────────────────────────────────────────── */
  if (error && !campaign) {
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <div style={S.errorContainer}>
          <div style={S.errorTitle}>No se pudo cargar</div>
          <div style={S.errorMessage}>{error ?? "Candidato no encontrado"}</div>
          <button type="button" onClick={() => router.back()} style={S.backButton}>Volver</button>
        </div>
      </div>
    );
  }

  const pc = isDark ? "#ffffff" : (campaign?.color_primario ?? "#1e40af");
  const sc = campaign?.color_secundario ?? "#fbbf24";

  /* ── No GA4 data ─────────────────────────────────────────────── */
  if (!ga4Data) {
    const placeholderCampaign: CampaignInfo = campaign ?? {
      id: "", name: slug, slug, cargo: null, numero: null,
      partido: null, foto_url: null, color_primario: pc, color_secundario: sc,
    };
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <NoDataHeader campaign={placeholderCampaign} onBack={() => router.back()} />
        <div style={S.emptyContainer}>
          <div style={S.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
          </div>
          <div style={S.emptyTitle}>Sin datos de Google Analytics</div>
          <div style={S.emptyMessage}>Este candidato aun no tiene datos de GA4 configurados.</div>
          <div style={S.emptyHint}>Sube los reportes CSV de GA4 desde la tarjeta del candidato.</div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={fullScreenStyle} className="analytics-page-root">
        <div style={S.errorContainer}>
          <div style={S.errorTitle}>Error de datos</div>
          <div style={S.errorMessage}>Datos de campana incompletos</div>
          <button type="button" onClick={() => router.back()} style={S.backButton}>Volver</button>
        </div>
      </div>
    );
  }

  const hasEvents = ga4Data.events.length > 0;
  const hasPagesDetailed = ga4Data.pagesDetailed.length > 0;
  const hasDailyUsers = ga4Data.dailyUsers.some((d) => d.newUsers > 0 || d.returningUsers > 0);
  const hasRegions = (ga4Data.regions?.length ?? 0) > 0;

  // ── GSC: datos hardcodeados para edwards-infante (única campaña con datos GSC por ahora) ──
  const gscData: GSCData | null = slug === "edwards-infante" ? EDWARDS_INFANTE_GSC : null;

  /* ═══════════════════════════════════════════════════════════════
     UNIFIED DASHBOARD — Single scrollable view
     ─────────────────────────────────────────────────────────────
     Header + KPIs
     Geografia:  Ranking (42%) | Heatmap (58%)
     Adquisicion: Source Quality | Traffic Sources (donut)
     Tendencia:  Daily Chart (full width) — only if data exists
     Contenido:  Pages Table (full or split with PagesDetailed)
     Eventos:    Events Funnel (full width) — only if events exist
     Insights:   Panel (full width)
     ═══════════════════════════════════════════════════════════ */

  return (
    <div style={fullScreenStyle} className="analytics-page-root">
      <DigitalHeader
        campaign={campaign}
        overview={ga4Data.overview}
        primaryColor={pc}
        secondaryColor={sc}
        hasGsc={!!gscData}
      />

      <div style={contentStyle}>
        {/* ── BLOQUE 1: KPIs ─────────────────────────────────────── */}
        <section style={S.section}>
          <KpiCards overview={ga4Data.overview} primaryColor={pc} secondaryColor={sc} />
        </section>

        {/* ── BLOQUE 2: Geografia ────────────────────────────────── */}
        <SectionLabel label={hasRegions ? "Mapa por Region" : "Mapa Geografico"} />
        <section style={S.heroGrid}>
          <div style={S.heroLeft}>
            {hasRegions ? (
              <RegionsRanking
                regions={ga4Data.regions}
                primaryColor={pc}
                onRegionHover={setHoveredRegion}
                onRegionClick={setClickedRegion}
                clickedRegion={clickedRegion}
              />
            ) : (
              <CitiesRanking
                cities={ga4Data.cities}
                primaryColor={pc}
                onCityHover={setHoveredCity}
                onCityClick={setClickedCity}
                clickedCity={clickedCity}
              />
            )}
          </div>
          <div style={S.heroRight}>
            {hasRegions ? (
              <RegionsMap
                regions={ga4Data.regions}
                primaryColor={pc}
                highlightRegion={hoveredRegion}
                clickedRegion={clickedRegion}
              />
            ) : (
              <CitiesHeatmap
                cities={ga4Data.cities}
                primaryColor={pc}
                highlightCity={hoveredCity}
                clickedCity={clickedCity}
              />
            )}
          </div>
        </section>

        {/* ── BLOQUE 2b: Ciudades (si hay regiones Y ciudades, mostrar ciudades tambien) */}
        {hasRegions && ga4Data.cities.length > 0 && (
          <>
            <SectionLabel label="Detalle por Ciudad" />
            <section style={S.heroGrid}>
              <div style={S.heroLeft}>
                <CitiesRanking
                  cities={ga4Data.cities}
                  primaryColor={pc}
                  onCityHover={setHoveredCity}
                  onCityClick={setClickedCity}
                  clickedCity={clickedCity}
                />
              </div>
              <div style={S.heroRight}>
                <CitiesHeatmap
                  cities={ga4Data.cities}
                  primaryColor={pc}
                  highlightCity={hoveredCity}
                  clickedCity={clickedCity}
                />
              </div>
            </section>
          </>
        )}

        {/* ── BLOQUE 3: Adquisicion ──────────────────────────────── */}
        <SectionLabel label="Adquisicion por Canal" />
        <div style={S.grid}>
          <div style={S.column}>
            <SourceQuality
              sources={ga4Data.sources}
              sessionSources={ga4Data.sessionSources}
              primaryColor={pc}
            />
          </div>
          <div style={S.column}>
            <TrafficSources sources={ga4Data.sources} primaryColor={pc} />
          </div>
        </div>

        {/* ── BLOQUE 4: Tendencia Diaria ─────────────────────────── */}
        {hasDailyUsers && (
          <>
            <SectionLabel label="Tendencia Diaria" />
            <section style={S.section}>
              <DailyChart dailyUsers={ga4Data.dailyUsers} primaryColor={pc} secondaryColor={sc} />
            </section>
          </>
        )}

        {/* ── BLOQUE 5: Contenido ────────────────────────────────── */}
        <SectionLabel label="Performance por Pagina" />
        {hasPagesDetailed ? (
          <div style={S.grid}>
            <div style={S.column}>
              <PagesDetailedTable pages={ga4Data.pagesDetailed} primaryColor={pc} />
            </div>
            <div style={S.column}>
              <PagesTable pages={ga4Data.pages} primaryColor={pc} />
            </div>
          </div>
        ) : (
          <section style={S.section}>
            <PagesTable pages={ga4Data.pages} primaryColor={pc} />
          </section>
        )}

        {/* ── BLOQUE 6: Eventos ──────────────────────────────────── */}
        {hasEvents && (
          <>
            <SectionLabel label="Eventos y Actividad" />
            <section style={S.section}>
              <EventsFunnel events={ga4Data.events} primaryColor={pc} />
            </section>
          </>
        )}

        {/* ── BLOQUE 7: Informe Web (SEO Report) ─────────────────── */}
        <SectionLabel label="Informe de Tráfico Web" />
        <section style={S.section}>
          <SeoReport
            data={ga4Data}
            gscData={gscData}
            primaryColor={pc}
            secondaryColor={sc}
            campaignName={campaign.name}
          />
        </section>

        {/* ── BLOQUE 7b: Búsquedas en Google (GSC) — solo si hay datos ── */}
        {gscData && (
          <>
            <SectionLabel label="Búsquedas en Google" />
            <section style={S.section}>
              <GscPanel data={gscData} primaryColor={pc} />
            </section>
          </>
        )}

        {/* ── BLOQUE 8: Insights ─────────────────────────────────── */}
        <SectionLabel label="Insights Accionables" />
        <section style={S.sectionLast}>
          <InsightsPanel data={ga4Data} gscData={gscData} primaryColor={pc} />
        </section>
      </div>
    </div>
  );
}

/* ========== Section Label ========== */

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={S.sectionLabel}>
      <div style={S.sectionLine} />
      <span style={S.sectionText}>{label}</span>
      <div style={S.sectionLine} />
    </div>
  );
}

/* ========== No Data Header ========== */

type NoDataHeaderProps = { campaign: CampaignInfo; onBack: () => void };

function NoDataHeader({ campaign, onBack }: NoDataHeaderProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header style={{ ...S.header, ...(isDark ? { backgroundColor: "#090D15", borderBottom: "1px solid #1d2f43" } : null) }}>
      <div style={S.headerLeft}>
        <button type="button" onClick={onBack} style={{ ...S.headerBackBtn, ...(isDark ? { backgroundColor: "#090D15", border: "1px solid #1d2f43", color: "#cbd5e1" } : null) }} aria-label="Volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={S.headerIdentity}>
          <div style={S.headerName}>{campaign.name}</div>
          <div style={S.headerMeta}>
            <span style={{ ...S.headerBadge, backgroundColor: campaign.color_primario }}>Digital</span>
            {campaign.cargo && <span>{campaign.cargo}</span>}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ========== Styles ========== */

const FULL_SCREEN: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  backgroundColor: "var(--color-surface-hover)",
  flex: 1,
  minHeight: 0,
};

const S: Record<string, React.CSSProperties> = {
  content: {
    flex: 1,
    overflow: "auto",
    padding: 24,
    backgroundColor: "var(--color-surface-hover)",
  },
  section: { marginBottom: 24 },
  sectionLast: { marginBottom: 0 },
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
    marginTop: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: "var(--color-border)",
  },
  sectionText: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    whiteSpace: "nowrap" as const,
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "42% 1fr",
    gap: 24,
    height: 560,
    marginBottom: 24,
  },
  heroLeft: {
    minHeight: 0,
    overflow: "hidden",
  },
  heroRight: {
    minHeight: 0,
    overflow: "hidden",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    marginBottom: 24,
  },
  column: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 24,
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid var(--color-border)",
    borderTopColor: "#1d4ed8",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  loadingText: { fontSize: 14, color: "var(--color-text-secondary)" },
  errorContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
  },
  errorTitle: { fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" },
  errorMessage: { fontSize: 14, color: "var(--color-text-secondary)" },
  backButton: {
    marginTop: 12,
    padding: "8px 20px",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  },
  emptyContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
    padding: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    backgroundColor: "var(--color-surface-active)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" },
  emptyMessage: { fontSize: 14, color: "var(--color-text-secondary)", textAlign: "center" as const },
  emptyHint: { fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" as const, maxWidth: 300 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    padding: "0 16px",
    backgroundColor: "var(--color-surface)",
    borderBottom: "1px solid var(--color-border)",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-surface-hover)",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIdentity: {},
  headerName: { fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" },
  headerMeta: { display: "flex", gap: 8, fontSize: 11, color: "var(--color-text-secondary)", alignItems: "center" },
  headerBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    color: "var(--color-text-on-primary)",
  },
};
