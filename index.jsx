import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* =========================================================================================
   WBR — Weekly Business Review · Team Gena (Restaurantes Rappi MX)
   -----------------------------------------------------------------------------------------
   Prototipo funcional. Arquitectura modular pensada para producción:

   1) dataService  → capa ÚNICA de acceso a datos. Hoy usa GoogleSheetsAdapter (mock con
      datos reales de la "Biblia Kams JR"). Mañana se cambia el adapter por BigQuery /
      Snowflake SIN tocar las vistas.  ← única costura de migración.
   2) annotationStore → persistencia SEPARADA de comentarios/compromisos (window.storage).
      Nunca se sobrescribe al "Actualizar datos". Clave = Módulo + Marca/KAM + Semana.
   3) campaignRules → motor de reglas por configuración. Agregar campaña = agregar un objeto.
   4) Componentes reutilizables: Kpi, DeltaBadge, DataTable, EditableNote, Progress, Compare.
   5) Vistas independientes: Home, Performance, Turbo, Marketing, Densificación.

   Regla de negocio TURBO: todo el detalle se calcula con Team Gena. CDMX es sólo benchmark.
   ========================================================================================= */

/* ----------------------------------------------------------------------------------------
   THEME (identidad Rappi)
---------------------------------------------------------------------------------------- */
const T = {
  neon1: "#fe663d", neon2: "#ff3d55",           // gradient primario
  ink: "#1c1917", ink2: "#57534e", ink3: "#8b8681",
  line: "#eee9e2", card: "#ffffff", bg: "#f7f4ef",
  turboBg: "#eafce6", turboInk: "#083410",       // submarca Turbo
  proBg: "#131517", proGold: "#F7A54E",
  up: "#12854a", down: "#d1242f", flat: "#8b8681",
  chipBg: "#fff0dd",
};
const GRAD = `linear-gradient(-45deg, ${T.neon1}, ${T.neon2})`;
const FONT = `"Inter","Helvetica Neue",-apple-system,"Segoe UI",system-ui,sans-serif`;

/* ----------------------------------------------------------------------------------------
   FORMAT HELPERS
---------------------------------------------------------------------------------------- */
const nf = new Intl.NumberFormat("es-MX");
const fInt = (n) => (n == null ? "—" : nf.format(Math.round(n)));
const fUsd = (n) => (n == null ? "—" : "$" + nf.format(Math.round(n)));
const fUsd2 = (n) => (n == null ? "—" : "$" + n.toFixed(2));
const fPct = (n, d = 1) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(d) + "%");
const fPct0 = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");

/* ========================================================================================
   1) DATA LAYER  — GoogleSheetsAdapter (mock con datos reales) + dataService
   ----------------------------------------------------------------------------------------
   >>> PRODUCCIÓN: reemplazar el cuerpo de cada método del adapter por una llamada al
       endpoint (Apps Script Web App / Sheets API v4) o, más adelante, a BigQuery/Snowflake.
       Las vistas NO cambian porque sólo consumen dataService.*
======================================================================================== */
const SHEET_ID = "1gnemNqQRVrTi-X0V-9uCcDCsZkwXvIq0LJ3xpVf_y-Y";

// Datos reales derivados de la hoja (última semana completa: W32 · 2026-08-03).
const RAW = {
  team: "Team Gena",
  leader: "gdelarosa@rappi.com",
  weeks: [
    { id: "2026-W32", label: "W32 · 03 ago 2026", current: true },
    { id: "2026-W31", label: "W31 · 27 jul 2026" },
    { id: "2026-W30", label: "W30 · 20 jul 2026" },
    { id: "2026-W29", label: "W29 · 13 jul 2026" },
  ],
  kams: ["Francisco Saavedra", "Jorge Urbina", "Marien García", "Zuriel Ramírez", "C. Sánchez"],

  performance: {
    kpis: {
      orders: { v: 12054, prev: 12208, l4: 49552, p4: 51030, yoy: 12894 },
      gmv: { v: 244964, prev: 257137, l4: 1009800, p4: 1041300, yoy: 240442 },
      aov: { v: 20.32, prev: 21.06, l4: 20.38, p4: 20.41, yoy: 18.65 },
    },
    topGrowth: [
      ["Caldos de Gallina Luis", 249, 65, 35, "Zuriel Ramírez"], ["Pizzalianni's Express", 182, 58, 47, "Zuriel Ramírez"],
      ["Neverías Frody", 262, 58, 28, "Francisco Saavedra"], ["Las Quekas Factory", 139, 51, 58, "Francisco Saavedra"],
      ["Taquería el Trompo", 109, 43, 65, "Marien García"], ["Tortas Paty Provi", 39, 39, null, "Zuriel Ramírez"],
      ["Fonda de Barrio", 209, 38, 22, "Zuriel Ramírez"], ["La Buena Birria Mx", 106, 28, 36, "Zuriel Ramírez"],
    ],
    worst: [
      ["Monkey Papas", 726, -187, -20, "Jorge Urbina"], ["Taquería los Primos", 144, -111, -44, "Zuriel Ramírez"],
      ["Tacos San Burgos", 81, -51, -39, "Marien García"], ["Carnitas Alfonso Desde 1966", 213, -50, -19, "C. Sánchez"],
      ["Pastes Kikos", 250, -40, -14, "C. Sánchez"], ["Tokyo House By Mr. Sushi", 326, -39, -11, "Marien García"],
      ["Taquería Los Originales", 68, -38, -36, "Francisco Saavedra"], ["Kowloon Delight", 144, -36, -20, "Jorge Urbina"],
      ["Hamburguesas Al Carbon Atizapan Edomex", 54, -31, -36, "Marien García"], ["Montparnasse", 5, -26, -84, "Jorge Urbina"],
    ],
    perKam: [
      ["Francisco Saavedra", 3337, 3.5, 64155], ["Jorge Urbina", 2783, -7.9, 52227],
      ["Marien García", 2343, -3.3, 54887], ["Zuriel Ramírez", 2162, 8.5, 43120],
      ["C. Sánchez", 1429, -6.2, 30574],
    ],
    // Zoom: top 10 marcas en caída por KAM (unificadas, W vs W−1)
    zoomByKam: {
      "Francisco Saavedra": [["Taquería Los Originales", 68, -38, -36], ["Las Fresu Kiss Del Ajusco", 254, -23, -8], ["La Pantera Fresca", 87, -17, -16], ["Kingu Sushi Ks", 212, -15, -7], ["Tacos los Chavos", 100, -12, -11], ["Pollíssimo", 25, -10, -29], ["Las de Barranca Tortas Yburritos", 428, -9, -2], ["La Michoacana Express", 10, -7, -41], ["El Agasajo Carnitas", 26, -6, -19], ["Taquería Los Milanesos", 67, -5, -7]],
      "Jorge Urbina": [["Monkey Papas", 726, -187, -20], ["Kowloon Delight", 144, -36, -20], ["Montparnasse", 5, -26, -84], ["Taquería Los Encinos", 44, -23, -34], ["Tlacoyería la Mexicana", 45, -21, -32], ["Chilaquiles Del Parque", 21, -19, -48], ["Taquería Aldama", 63, -18, -22], ["La Casa del Huarache", 25, -16, -39], ["Route 66 Burger&Beer", 25, -13, -34], ["Taquería la Diez", 16, -11, -41]],
      "Marien García": [["Tacos San Burgos", 81, -51, -39], ["Tokyo House By Mr. Sushi", 326, -39, -11], ["Hamburguesas Al Carbón Atizapán", 54, -31, -36], ["El Mexiquense Barbacoa de Horno", 62, -19, -23], ["Tortas Gigantes Sur 12 - Pantitlán", 65, -17, -21], ["El Villamelón", 73, -16, -18], ["Tortas Gigantes Sur 12", 181, -15, -8], ["Chilaquilito", 283, -13, -4], ["Lima Limón Frutería", 204, -5, -2], ["Gorditas Lagunerass", 63, -5, -7]],
      "Zuriel Ramírez": [["Taquería los Primos", 144, -111, -44], ["Day Light Salads", 62, -14, -18], ["Kolobok", 17, -13, -43], ["Drink Me", 6, -12, -67], ["Gorditas y Carnitas Zacazonapan", 134, -11, -8], ["La Posta Mx", 14, -9, -39], ["Cosecha Oaxaca", 18, -9, -33], ["Restaurante El Amigo", 28, -7, -20], ["Këbabnation", 5, -7, -58], ["Kikiripizza", 47, -5, -10]],
      "C. Sánchez": [["Carnitas Alfonso Desde 1966", 213, -50, -19], ["Pastes Kikos", 250, -40, -14], ["Señor Taco", 174, -15, -8], ["Tamalería Flor de Lis", 29, -12, -29], ["La Parrilla Suiza", 38, -11, -22], ["Deleite Shop Mx", 14, -11, -44], ["Tortas Qm", 16, -5, -24], ["Lima Mía Comedor", 6, -4, -40], ["Jugoterapia", 7, -4, -36], ["Mi Café", 8, -4, -33]],
    },
    // ===== MENSUAL (hoja "Tabla dinámica Month", marcas unificadas). Medimos Julio vs Junio; Agosto va corriendo. =====
    monthly: {
      period: { label: "Julio 2026", id: "2026-M07", caption: "Jul vs Jun · Agosto en curso" },
      kpis: {
        orders: { v: 55577, lm: 55044, mly: 56315, ytd: 404087, ytdPrev: 382827 },
        gmv: { v: 1185982, lm: 1177706, mly: 1038830, ytd: 8192125, ytdPrev: 6834457 },
        aov: { v: 21.34, lm: 21.40, mly: 18.45, ytd: 20.27, ytdPrev: 17.85 },
      },
      topGrowth: [
        ["Monkey Papas", 4993, 575, 13, "Jorge Urbina"], ["Tokyo House By Mr. Sushi", 1511, 325, 27, "Marien García"],
        ["Kingu Sushi Ks", 838, 259, 45, "Francisco Saavedra"], ["Taquería los Primos", 673, 186, 38, "Zuriel Ramírez"],
        ["New York Burgers Cdmx", 561, 157, 39, "Jorge Urbina"], ["Caldos de Gallina los 2 Carnales", 1839, 144, 8, "Francisco Saavedra"],
        ["Taquería Los Milanesos", 396, 135, 52, "Francisco Saavedra"], ["Monterrey Burritos", 222, 111, 100, "Jorge Urbina"],
      ],
      worst: [
        ["Carnitas Alfonso Desde 1966", 1071, -397, -27, "C. Sánchez"], ["La Chinampa Auténtica Taquería", 101, -211, -68, "Francisco Saavedra"],
        ["Caldos de Gallina Luis", 1163, -161, -12, "Zuriel Ramírez"], ["La Universal", 597, -136, -19, "Marien García"],
        ["Pizzalianni's Express", 621, -133, -18, "Zuriel Ramírez"], ["Taquería Ramón", 237, -129, -35, "Francisco Saavedra"],
        ["Tortas Paty Provi", 48, -122, -72, "Zuriel Ramírez"], ["Cookie D-oh", 215, -113, -34, "Jorge Urbina"],
        ["Fonda de Barrio", 841, -111, -12, "Zuriel Ramírez"], ["Chilaquilito", 1326, -98, -7, "Marien García"],
      ],
      perKam: [
        ["Jorge Urbina", 14861, 2.5, 298702], ["Francisco Saavedra", 14133, 6.7, 280755],
        ["Marien García", 10364, 2.2, 257223], ["Zuriel Ramírez", 9116, -3.1, 192032], ["C. Sánchez", 7103, -8.3, 157271],
      ],
      zoomByKam: {
        "Francisco Saavedra": [["La Chinampa Auténtica Taquería", 101, -211, -68], ["Taquería Ramón", 237, -129, -35], ["Las de Barranca Tortas Yburritos", 2046, -46, -2], ["Taquería Los Tioss", 259, -22, -8], ["Karrubis", 587, -17, -3], ["Ono Poke House", 661, -12, -2], ["Wok Express Comida China", 178, -10, -5], ["El Lobo Taquería", 30, -2, -6]],
        "Jorge Urbina": [["Cookie D-oh", 215, -113, -34], ["Montparnasse", 135, -87, -39], ["Chicken Burger Cdmx", 50, -80, -62], ["Ricas Tortas Gigantes Clavería", 433, -75, -15], ["Chilaquiles Del Parque", 187, -55, -23], ["Potato Burger", 105, -54, -34], ["Taquería Parrilla Sierravista", 490, -50, -9], ["Kowloon Delight", 680, -41, -6], ["Mr. Jocho", 135, -36, -21], ["Ventura", 295, -30, -9]],
        "Marien García": [["La Universal", 597, -136, -19], ["Chilaquilito", 1326, -98, -7], ["Don Kebab", 448, -56, -11], ["Veganísimo Lonchería Vegana", 91, -43, -32], ["Café Murano", 83, -28, -25], ["Oro Negro Desayunos", 69, -27, -28], ["Gino's", 142, -24, -14], ["Tacos Árabes del Trompo", 86, -17, -17], ["Wabu", 82, -13, -14], ["Tacos y Caldos la Villa", 33, -10, -23]],
        "Zuriel Ramírez": [["Caldos de Gallina Luis", 1163, -161, -12], ["Pizzalianni's Express", 621, -133, -18], ["Tortas Paty Provi", 48, -122, -72], ["Fonda de Barrio", 841, -111, -12], ["Day Light Salads", 305, -68, -18], ["Kikiripizza", 217, -47, -18], ["Perros & Burros", 362, -39, -10], ["Rincón Chino Vallejo", 266, -38, -12], ["Antonoff Bread Co", 209, -32, -13], ["La Buena Birria Mx", 436, -15, -3]],
        "C. Sánchez": [["Carnitas Alfonso Desde 1966", 1071, -397, -27], ["Alchef", 280, -77, -22], ["Los Pastores", 344, -75, -18], ["La Catrina Churrería", 24, -70, -74], ["Pastes Kikos", 1446, -66, -4], ["Tamales Flor de Lis", 661, -43, -6], ["El Rey Del Falafel", 81, -38, -32], ["Tortas Qm", 112, -37, -25], ["Paletería La Michoacana", 262, -22, -8], ["Deleite Shop Mx", 87, -15, -15]],
      },
    },
  },

  turbo: {
    // CDMX = benchmark de ciudad (siempre mayor, solo referencia).
    // Δ = Team Gena esta semana vs Team Gena semana pasada (WoW). lw = valor semana pasada; null = sin dato WoW.
    // kind: int | dec1 | pp1 | pp2 | pct1(sin Gena). invert:true → bajar es mejor (tiempos).
    kpis: [
      { label: "Active Stores", cdmx: 464, gena: 141, lw: 138, kind: "int" },
      { label: "Orders / Store", cdmx: 15.5, gena: 13.6, lw: 12.3, kind: "dec1" },
      { label: "Markdown %", cdmx: 6.69, gena: 8.39, lw: 8.31, kind: "pp2" },
    ],
    orders: [
      { label: "Total Orders", cdmx: 7171, gena: 1919, lw: 1694, kind: "int" },
      { label: "Organic Orders", cdmx: 5002, gena: 1356, lw: 1184, kind: "int" },
      { label: "Inorganic Orders", cdmx: 2169, gena: 563, lw: 510, kind: "int" },
      { label: "% vs Restaurants", cdmx: 7.4, gena: 11.0, lw: 9.6, kind: "pp1" },
    ],
    times: [
      { label: "ATAS (min)", cdmx: 18.0, gena: 18.4, lw: 17.9, kind: "dec1", invert: true },
      { label: "RTWT (min)", cdmx: 3.8, gena: 3.8, lw: 4.2, kind: "dec1", invert: true },
      { label: "Orders < 20 min", cdmx: 71.2, gena: null, lw: null, kind: "pct1" },
      { label: "Orders < 15 min", cdmx: 42.5, gena: null, lw: null, kind: "pct1" },
    ],
    topPerf: [
      ["Frody - Turbo", 151, 52, 53], ["Las Quekas Factory Mier y Pesado - Turbo", 85, 43, 102],
      ["Caldos de Gallina Luis Puebla - Turbo", 65, 29, 81], ["Tortas Locas Hipocampo - Turbo", 43, 24, 126],
      ["Taquería los Tioss - Turbo", 41, 22, 116],
    ],
    worst: [
      ["Monkey Papas - Turbo", 23, -40, -63], ["Taquería los Primos - Turbo", 1, -13, -93],
      ["La Pantera Fresca - Turbo", 34, -8, -19], ["Las de Barranca Tortas - Turbo", 34, -7, -17],
      ["Pollíssimo - Turbo", 2, -5, -71],
    ],
    woRtwt: [
      ["Pollíssimo - Turbo", 18.18, 2, "Francisco Saavedra"], ["El Mexiquense Barbacoa - Turbo", 14.9, 3, "Marien García"],
      ["Taquería los Primos - Turbo", 10.47, 4, "Zuriel Ramírez"], ["Hotdog Factory Mx - Turbo", 10.17, 2, "Jorge Urbina"],
      ["Tacos los Chavos - Turbo", 9.62, 29, "Francisco Saavedra"], ["Kowloon Delight - Turbo", 9.3, 6, "Jorge Urbina"],
      ["Kolobok - Turbo", 7.94, 3, "Zuriel Ramírez"], ["Tortas Gigantes Grey - Turbo", 7.22, 10, "Francisco Saavedra"],
      ["Rocking Burgers - Turbo", 7.21, 5, "Jorge Urbina"], ["Pizzalianni's Express - Turbo", 6.68, 60, "Zuriel Ramírez"],
      ["Sandwich Brown Cdmx - Turbo", 6.38, 4, "Jorge Urbina"], ["Las de Barranca Tortas - Turbo", 5.72, 34, "Francisco Saavedra"],
    ],
  },

  marketing: {
    // [kam, orders, md, mdPro, ads, gmv]
    perKam: [
      ["Francisco Saavedra", 3337, 9381, 5492, 4195, 64155],
      ["Marien García", 2343, 6060, 3530, 6801, 54887],
      ["Jorge Urbina", 2783, 3993, 1896, 3636, 52227],
      ["Zuriel Ramírez", 2162, 3653, 2155, 4761, 43120],
      ["C. Sánchez", 1429, 882, 465, 1380, 30574],
    ],
    prevMd: { "Francisco Saavedra": 13.1, "Marien García": 9.8, "Jorge Urbina": 8.1, "Zuriel Ramírez": 9.2, "C. Sánchez": 3.4 },
    // vs W−1 en USD (de las pivotes)
    prevMdUsd: { "Francisco Saavedra": 9821, "Jorge Urbina": 5757, "Marien García": 6604, "Zuriel Ramírez": 3552, "C. Sánchez": 1079 },
    adsPrev: { "Francisco Saavedra": 4405, "Jorge Urbina": 4050, "Marien García": 6543, "Zuriel Ramírez": 4744, "C. Sánchez": 1293 },
    // New to Brand (Participación comercial): [kam, marcasPriorizadas, conTarjeta, %avance]
    newToBrand: [
      ["Francisco Saavedra", 37, 16, 0.432], ["Zuriel Ramírez", 27, 4, 0.148],
      ["Marien García", 22, 2, 0.091], ["Jorge Urbina", 19, 2, 0.105], ["C. Sánchez", 14, 0, 0],
    ],
    // Bottom Brands markdown: [brand, markdown% actual, Δ pp vs W−1] — mayor caída de MD%
    bottomMd: {
      "Francisco Saavedra": [["Italian Kitchen", 9.0, -24.8], ["Karrubis - Turbo", 6.3, -8.0], ["Taquería Ramón - Turbo", 3.7, -3.5], ["El Agasajo Carnitas - Turbo", 14.4, -1.3], ["Taquería Don Carnelio - Turbo", 5.9, -0.3]],
      "Jorge Urbina": [["Hola Burrito Cdmx", 0.0, -19.5], ["Hello Slider", 0.0, -17.0], ["Chilaquiles Su Majestad Cdmx", 0.0, -15.8], ["Ricas Tortas Gigantes Clavería - Turbo", 0.4, -10.7], ["Monkey Papas - Turbo", 17.6, -5.1]],
      "Marien García": [["Gino's - Patriotismo", 0.0, -1.6]],
      "Zuriel Ramírez": [["Taquería los Primos - Turbo", 0.0, -7.8], ["Rincón Chino Vallejo - Turbo", 16.6, -1.6]],
      "C. Sánchez": [["Mi Café", 4.6, -15.5]],
    },
    // Detalle por marca — Pivot Mkt MD Total (MD_TOTAL_USD) y Pivot Mkt ADS (ADS_USD), W32
    mdByKam: {
      "Francisco Saavedra": [["Kingu Sushi Ks", 2179, 664, -140, -6], ["Taquería Don Carnelio", 1500, 1268, -220, -13], ["Las de Barranca Tortas Hamburguesas Yburritos", 1030, 578, -89, -8], ["Caldos de Gallina los 2 Carnales", 606, 341, 70, 13], ["Las Fresu Kiss Del Ajusco", 576, 307, -45, -7], ["Karrubis", 470, 254, 23, 5], ["Taqueria Los Tioss", 387, 279, 71, 23], ["Caldos de Gallina los 2 Carnales Turbo", 327, 241, 55, 20], ["Taquería Los Milanesos", 200, 153, -44, -18], ["Cocina Ma Isabel", 185, 118, 41, 28], ["El Charco de Los Sapos", 182, 139, -36, -17], ["Las Fresu Kiss Del Ajusco - Turbo", 178, 112, -9, -5], ["Taqueria los Tioss - Turbo", 173, 124, 90, 110], ["Wok Express Comida China", 166, 84, -61, -27], ["Cocina Paloma ", 151, 105, 84, 125], ["El Lobo Taquería", 113, 73, 50, 79], ["Taquería Los Originales", 100, 69, -124, -55], ["La Michoacana Express", 90, 45, -66, -43], ["Las de Barranca Tortas Hamburguesas Yburritos - Turbo", 88, 57, -13, -13], ["Cocina Madheline", 76, 62, -106, -58], ["Sopes Lupíta", 76, 32, 16, 26], ["Alitas y Hamburguesas el Conejo de la Luna", 74, 74, 30, 66], ["el Agasajo Carnitas - Turbo", 56, 48, 12, 27], ["Tortas Gigantes Grey", 54, 28, -20, -27], ["Taquería Ramón", 52, 34, -1, -2], ["Las Quekas Factory", 51, 40, 24, 90], ["El Camarón Guasaveño", 51, 30, -18, -26], ["El Agasajo Carnitas", 47, 37, -17, -27], ["Tortas Gigantes Grey - Turbo", 40, 32, 39, 3587], ["Las Quekas Factory Mier y Pesado - Turbo", 32, 15, 32, null], ["el Lobo Taquería - Turbo", 22, 16, 19, 623], ["Ono Poke House", 22, 13, 7, 45], ["Taqueria Don Carnelio - Turbo", 8, 6, 4, 119], ["Frody - Turbo", 5, 2, 2, 48], ["Italian Kitchen", 5, 5, -54, -92], ["Tacos El Cuñado La 2", 4, 2, -22, -85], ["Taquería Ramón - Turbo", 3, 2, 2, 191], ["Karrubis - Turbo", 2, 2, -1, -31]],
      "Jorge Urbina": [["Monkey Papas   ", 2080, 793, -1622, -44], ["Johnny Rockets", 371, 164, -35, -9], ["Spicy Wings Alitas y Boneless", 291, 148, 109, 60], ["Pollo Fiel Xola Tajin", 174, 166, 7, 4], ["Rocking Burgers", 113, 55, -29, -20], ["Cassava Roots", 94, 49, -34, -27], ["New York Burgers Cdmx", 83, 56, -25, -23], ["Elotes y Eskites San Juditas los Originales de Lindavista", 78, 34, 75, 2427], ["We Love Burgers", 78, 0, 18, 31], ["Monkey Papas - Turbo", 78, 56, -236, -75], ["Potato Burger", 65, 53, 37, 131], ["Ventura", 56, 45, -14, -20], ["Hotdog Factory Mx", 50, 39, 17, 54], ["Chilaquiles Su Majestad Cdmx", 49, 38, 3, 7], ["Ricas Tortas Gigantes Claveria", 43, 31, 42, 4892], ["Chilaquiles Del Parque", 39, 25, -52, -57], ["We Love Burgers Turbo", 36, 15, -21, -37], ["Los Perrines", 29, 22, 29, null], ["Chicken Burger Cdmx", 27, 13, -19, -42], ["Hola Burrito Cdmx", 26, 25, -18, -41], ["Taqueria Parrilla Sierravista", 23, 10, 22, 1582], ["los Perrines - Turbo", 19, 15, 10, 116], ["La Torteria Mx", 19, 8, 15, 379], ["Spicy Wings Mx", 16, 9, 16, null], ["Taqueria la Diez", 16, 6, 0, -2], ["Cassava Roots - Turbo", 11, 7, 2, 18], ["Burrito Sabanero Cdmx", 9, 4, 9, null], ["Sandwich Brown Cdmx", 7, 2, -5, -43], ["Hello Slider", 4, 3, 2, 104], ["American Burger Mx", 3, 3, 3, null], ["Mr Jocho Cdmx", 2, 1, 1, 50], ["El Compa \"Y\" Taquería", 2, 0, -1, -37], ["Potato Burger - Turbo", 1, 1, 1, null]],
      "Marien García": [["Tokyo House By Mr. Sushi", 3128, 1558, -253, -7], ["Don Kebab", 1381, 961, -133, -9], ["El Super Taco Bombas", 309, 161, 19, 7], ["Taqueria el Trompo", 222, 165, 26, 13], ["Wabu", 210, 169, 105, 100], ["El Villamelon", 188, 119, -16, -8], ["Tacos Arabes del Trompo", 186, 106, -7, -4], ["Tortas Gigantes Sur 12 - Av. Pantitlán", 162, 87, -57, -26], ["Quesadillas Abuelita Coni-", 90, 62, 28, 45], ["Gorditas Lagunerass", 61, 44, -96, -61], ["Tacos San Burgos", 49, 46, -59, -55], ["Café Emir", 43, 29, -1, -2], ["Lima Limón Frutería & Loncheria", 10, 6, -40, -80], ["Don Kebab - Turbo", 8, 7, 8, null], ["Taqueria la Perla Tapatia", 5, 5, -11, -68], ["Tortas Gigantes La Villa", 4, 1, -1, -21], ["Delichurros Pabellon Cuauhtémoc", 3, 3, -4, -59], ["The Fogones", 1, 1, 0, 46], ["Gino's - Patriotismo", 1, 0, -2, -74]],
      "Zuriel Ramírez": [["Caldos de Gallina Luis", 665, 409, 41, 7], ["Pizzalianni's Express", 541, 306, 179, 50], ["Fonda de Barrio", 322, 247, 52, 19], ["Taquería los Primos", 242, 115, -376, -61], ["Pizzalianni's Express - Turbo", 240, 157, 73, 44], ["Caldos de Gallina Luis Puebla Puebla 188 - Turbo", 239, 139, 77, 47], ["Toki Maki", 224, 110, -6, -2], ["Tortas Paty Provi", 175, 90, 175, null], ["Kikiripizza", 136, 67, -38, -22], ["Gorditas y Carnitas Zacazonapan", 98, 45, 15, 18], ["Los Burritos de Fuentes", 97, 62, -13, -12], ["Rincon Chino Vallejo", 88, 27, 20, 29], ["Caldos de Gallina el Corral", 86, 66, 1, 1], ["Verde Amor ", 84, 30, 23, 38], ["Tacos Sarita Los Famosos De La 8", 81, 67, -6, -7], ["Restaurante El Amigo", 51, 41, -14, -22], ["Caldos de Gallina el Corral - Turbo", 47, 39, 5, 11], ["Cosecha Oaxaca", 41, 22, -35, -46], ["Nutri Light", 39, 16, 19, 93], ["Big Jimmys Pizza", 38, 12, 9, 33], ["Kikiripizza - Turbo", 36, 29, -23, -39], ["Rincon Chino Vallejo - Turbo", 30, 19, 26, 668], ["Super Tacos de Guisado Matriz", 28, 22, 20, 272], ["Sushi Yun Yun", 17, 17, 17, null], ["Antonoff Bread Co", 6, 2, -6, -52], ["Day Light Salads", 2, 1, -86, -98]],
      "C. Sánchez": [["Carnitas Alfonso Desde 1966", 300, 173, -58, -16], ["Lucky Bones", 263, 107, 6, 2], ["Du Chef Lomas Estrella", 79, 50, 9, 13], ["Alchef", 55, 51, -54, -50], ["Pollinsky", 45, 8, 15, 52], ["La Barranca Pescados Carnes y Mariscos", 35, 21, -17, -32], ["La Parrilla Suiza", 30, 18, -33, -53], ["Paleteria La Michoacana", 26, 11, 8, 40], ["Lima Mia Comedor de Los Milagros", 24, 16, -22, -48], ["Tortas Qm", 14, 8, -14, -49], ["Pastes Kikos ", 5, 0, -2, -25], ["Mi Café", 3, 0, -18, -84], ["La Carajita (Cdmx)", 2, 0, -18, -90], ["Buen Pollo", 1, 1, 1, null]],
    },
    adsByKam: {
      "Francisco Saavedra": [["Caldos de Gallina los 2 Carnales", 872, -23, -3], ["Ono Poke House", 613, -45, -7], ["Las Fresu Kiss Del Ajusco", 510, -37, -7], ["Las de Barranca Tortas Hamburguesas Yburritos", 247, -15, -6], ["Taqueria Los Tioss", 219, -72, -25], ["Taquería Los Originales", 208, -4, -2], ["Kingu Sushi Ks", 166, -4, -2], ["Karrubis", 163, 19, 14], ["Cocina Paloma ", 130, 22, 20], ["Wok Express Comida China", 127, 1, 1], ["El Camarón Guasaveño", 125, -9, -6], ["El Charco de Los Sapos", 121, -2, -1], ["Caldos de Gallina los 2 Carnales Turbo", 111, -3, -2], ["Taquería Don Carnelio", 106, -39, -27], ["Sopes Lupíta", 96, -9, -8], ["El Lobo Taquería", 96, -12, -11], ["Taquería Los Milanesos", 71, 9, 14], ["Fonda Socorrito", 69, -16, -19], ["Tacos El Cuñado La 2", 36, -8, -19], ["Taqueria los Tioss - Turbo", 29, 1, 4], ["La Michoacana Echegaray", 21, 0, -2], ["Cocina Madheline", 19, 19, null], ["Las Quekas Factory", 15, 6, 68], ["Italian Kitchen", 14, 14, null], ["La Michoacana Express", 11, 0, -2]],
      "Jorge Urbina": [["Rocking Burgers", 565, 7, 1], ["Kowloon Delight", 470, -87, -16], ["Monkey Papas   ", 421, -7, -2], ["Taquería Don Pedro e Hijos", 339, -34, -9], ["Route 66 Burger&Beer", 265, -78, -23], ["Cookie D-oh", 232, -26, -10], ["Monkey Papas - Turbo", 156, -63, -29], ["Cassava Roots", 155, -155, -50], ["Taqueria Parrilla Sierravista", 145, 28, 23], ["Ricas Tortas Gigantes Claveria", 145, -2, -2], ["La Casa del Huarache_", 114, -5, -4], ["Taquería Los Encinos", 102, -2, -2], ["Elotes y Eskites San Juditas los Originales de Lindavista", 87, -2, -2], ["Pollo Fiel Xola Tajin", 85, -6, -7], ["Spicy Wings Alitas y Boneless", 63, 7, 12], ["Cassava Roots - Turbo", 56, -3, -5], ["Ricas Tortas Gigantes Claveria - Turbo", 42, 19, 81], ["Los Perrines", 28, 9, 49], ["Las Milanesas.", 24, -31, -56], ["We Love Burgers Turbo", 20, 0, -1], ["los Perrines - Turbo", 18, 10, 123], ["Sr. Chapata", 17, 5, 39], ["Chicken Burger Cdmx", 17, 6, 56], ["Burritos Monterrrey", 13, -12, -46], ["La Cazona", 11, -9, -44], ["Potato Burger - Turbo", 9, 9, null], ["We Love Burgers", 7, 0, 3], ["American Burger Mx", 6, 6, null], ["La Torteria Mx", 6, 6, null], ["Chilaquiles Del Parque", 5, 0, -3], ["Spicy Wings Mx", 5, 5, null], ["Chilaquiles Su Majestad Cdmx", 5, 0, -7], ["Hola Burrito Cdmx", 3, 3, null], ["Sandwich Brown Cdmx", 2, 2, null]],
      "Marien García": [["Tokyo House By Mr. Sushi", 3188, 624, 24], ["Lima Limón Frutería & Loncheria", 1391, 4, 0], ["Tortas Gigantes Sur 12 - Av. Pantitlán", 624, -40, -6], ["Quesadillas Abuelita Coni-", 212, 13, 7], ["Hamburguesas Al Carbon Atizapan Edomex", 211, -9, -4], ["El Villamelon", 186, 4, 2], ["El Saboree", 175, -38, -18], ["Don Kebab", 163, -283, -63], ["Taqueria el Trompo", 146, 19, 15], ["Tacos San Burgos", 111, -1, -1], ["Oro Negro Desayunos", 73, -6, -8], ["Wabu", 71, -15, -17], ["Santas Conchas", 58, 11, 24], ["Veganisimo Loncheria Vegana", 57, -1, -2], ["El Super Taco Bombas", 26, 0, 0], ["La Universal ", 21, 0, 0], ["Oro Negro Parrilla", 21, 2, 12], ["Gino's - Patriotismo", 13, 4, 43], ["The Fogones", 11, 3, 29], ["Pasteleria y Panaderia Xochimilco", 11, -2, -12], ["Las Ramonas", 11, 0, 0], ["Mandrake Café", 8, 0, -3], ["Taqueria la Perla Tapatia", 7, -2, -23], ["Panadería el Fresno", 6, 5, 331]],
      "Zuriel Ramírez": [["Gorditas y Carnitas Zacazonapan", 970, -102, -9], ["Fonda de Barrio", 487, -74, -13], ["Toki Maki", 487, 18, 4], ["Caldos de Gallina Luis", 390, -2, -1], ["Los Burritos de Fuentes", 380, -7, -2], ["La Buena Birria Mx", 281, 84, 43], ["Taquería los Primos", 240, -40, -14], ["Caldos de Gallina Luis Puebla Puebla 188 - Turbo", 240, 111, 87], ["Rincon Chino Vallejo", 147, -8, -5], ["Antonoff Bread Co", 146, -4, -2], ["Pizzalianni's Express", 141, -3, -2], ["Tacos Sarita Los Famosos De La 8", 120, -27, -18], ["Big Jimmys Pizza", 114, 0, 0], ["Super Tacos de Guisado Matriz", 105, 4, 3], ["Caldos de Gallina el Corral", 104, -2, -2], ["Tortas Paty Provi", 93, 93, null], ["Day Light Salads", 80, 7, 9], ["Nutri Light", 54, -1, -2], ["Kikiripizza", 46, -23, -34], ["Cosecha Oaxaca", 40, -6, -12], ["Caldos de Gallina el Corral - Turbo", 32, -2, -5], ["Afl Desayunos, Comidas y Cenas", 22, 3, 16], ["Rincon Chino Vallejo - Turbo", 19, 9, 93], ["Pollos Ranchicken ", 12, -3, -18], ["Kolobok", 11, -8, -42]],
      "C. Sánchez": [["Carnitas Alfonso Desde 1966", 550, 75, 16], ["La Barranca Pescados Carnes y Mariscos", 185, 45, 32], ["Café KA´LOC", 130, 35, 37], ["Alchef", 104, -32, -23], ["Paleteria La Michoacana", 87, -49, -36], ["los Pastores.", 64, 0, 0], ["Deleite Shop Mx", 54, 4, 8], ["Tamalería Flor de Lis", 51, 17, 50], ["Du Chef Lomas Estrella", 48, 0, 0], ["Tamales Flor de Lis ", 35, -2, -5], ["Tortas Qm", 25, 4, 20], ["Pastes Kikos ", 20, -1, -3], ["La Catrina Churrería", 19, -14, -42], ["La Carajita (Cdmx)", 6, 3, 114]],
    },
    // Tarjetas (Participación comercial)
    tarjetas: [
      ["Francisco Saavedra", 59, 18, 0.305, 3, 0.051],
      ["Jorge Urbina", 86, 10, 0.116, 10, 0.116],
      ["Marien García", 62, 8, 0.129, 4, 0.065],
      ["Zuriel Ramírez", 52, 5, 0.096, 6, 0.115],
      ["C. Sánchez", 37, 1, 0.027, 2, 0.054],
    ],
  },

  densification: {
    // [kam, total, cargadas]
    perKam: [
      ["Francisco Saavedra", 31, 3], ["Jorge Urbina", 23, 8], ["Marien García", 11, 0],
      ["C. Sánchez", 2, 0], ["Zuriel Ramírez", 2, 0],
    ],
    stores: [
      ["Lucky Bones - The Landmark Tijuana", "Lucky Bones", "3. LOCAL HERO", "PRIORIZADO", "C. Sánchez", "No"],
      ["Señor Taco - Prueba No Prender", "Señor Taco", "3. LOCAL HERO", "PRIORIZADO", "C. Sánchez", "No"],
      ["Caldos de Gallina los 2 Carnales - Miramontes", "Caldos de Gallina los 2 Carnales", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Caldos de Gallina los 2 Carnales Turbo - Miram", "Caldos de Gallina los 2 Carnales Turbo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["El Agasajo Carnitas", "El Agasajo Carnitas", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["El Agasajo Carnitas - Turbo", "el Agasajo Carnitas - Turbo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["El Lobo Taquería Miramontes", "El Lobo Taquería", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "Sí"],
      ["Frody Calzada Del Hueso - Turbo", "Frody - Turbo", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Garita - Turbo", "Frody - Turbo", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody (hospital Naval) - Turbo", "Frody - Turbo", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Rancho Vista Hermosa - Turbo", "Frody - Turbo", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Kingu Sushi (santa María)", "Kingu Sushi Ks", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Frody Garita", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Prado Coapa", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Calzada del Hueso", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Rancho Vista Hermosa", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Los Ángeles Iztapalapa", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody Iztapalapa Centro", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody (lomas Estrella)", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody (xochimilco)", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody (hospital Naval)", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Frody (espartaco)", "Neverías Frody", "3. LOCAL HERO", "ADJUSTED", "Francisco Saavedra", "No"],
      ["Pollíssimo División del Norte", "Pollíssimo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Pollìssimo Acoxpa", "Pollíssimo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Pollissimo la Noria", "Pollíssimo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Pollíssimo Santa Cruz", "Pollíssimo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Pollissimo la Noria - Turbo", "Pollíssimo - Turbo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Tacos los Chavos", "Tacos los Chavos", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Tacos los Chavos - Turbo", "Tacos los Chavos - Turbo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["taqueria los tioss", "Taqueria Los Tioss", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Taqueria los Tioss - Turbo", "Taqueria los Tioss - Turbo", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "No"],
      ["Wok Express Estadio", "Wok Express Comida China", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "Sí"],
      ["Wok Express Plaza Mexicana Del Sur", "Wok Express Comida China", "3. LOCAL HERO", "PRIORIZADO", "Francisco Saavedra", "Sí"],
      ["American Burger (av Arneses )", "American Burger Mx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["Burger Suprem (arneses )", "Burger Suprem", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Burrito Sabanero (av Arneses )", "Burrito Sabanero Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["Chicken Burger (av Arneses )", "Chicken Burger Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Chilaquiles Del Parque (Av Arneses )", "Chilaquiles Del Parque", "3. LOCAL HERO", "PRIORIZADO", "Jorge Urbina", "No"],
      ["Chilaquiles Su Majestad Av Arneses", "Chilaquiles Su Majestad Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Hello Slider Av Arneses", "Hello Slider", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["Hola Burrito (Av Arneses )", "Hola Burrito Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["Hotdog Factory (Av Arneses )", "Hotdog Factory Mx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Johnny Rockets (antenas)", "Johnny Rockets", "3. LOCAL HERO", "PRIORIZADO", "Jorge Urbina", "No"],
      ["La Torteria (Arneses)", "La Torteria Mx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["Las Milanesas (av Arneses )", "Las Milanesas Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["los Perrines (calz Del Hueso)", "Los Perrines", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["los Perrines (división Del Norte)", "Los Perrines", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["los Perrines (división Del Norte) - Turbo", "los Perrines - Turbo", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Mr Jocho (san Antonio)", "Mr Jocho Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["New York Burgers (av Arneses )", "New York Burgers Cdmx", "3. LOCAL HERO", "PRIORIZADO", "Jorge Urbina", "No"],
      ["Rocking Burgers Santa Ana - Turbo", "Rocking Burgers - Turbo", "3. LOCAL HERO", "PRIORIZADO", "Jorge Urbina", "No"],
      ["Sandwich Brown Av Arneses", "Sandwich Brown Cdmx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Spicy Av. Arneses", "Spicy Wings Mx", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "Sí"],
      ["Taquería Aldama", "Taquería Aldama.", "3. LOCAL HERO", "PRIORIZADO", "Jorge Urbina", "No"],
      ["Taqueria la Diez", "Taqueria la Diez", "3. LOCAL HERO", "PRIORIZADO", "Jorge Urbina", "No"],
      ["Tortas Fabrica de Pollo Av. Arneses", "Tortas Fabrica de Pollo", "3. LOCAL HERO", "ADJUSTED", "Jorge Urbina", "No"],
      ["Chilaquilito - Santa Anna", "Chilaquilito", "3. LOCAL HERO", "PRIORIZADO", "Marien García", "No"],
      ["Chilaquilito Caucel C. 62 656", "Chilaquilito", "3. LOCAL HERO", "PRIORIZADO", "Marien García", "No"],
      ["Chilaquilito", "Chilaquilito", "3. LOCAL HERO", "PRIORIZADO", "Marien García", "No"],
      ["Chilaquilito Caucel", "Chilaquilito", "3. LOCAL HERO", "PRIORIZADO", "Marien García", "No"],
      ["el Super Taco Taqueria", "El Super Taco Bombas", "3. LOCAL HERO", "PRIORIZADO", "Marien García", "No"],
      ["El Villamelon - Acoxpa", "El Villamelon", "3. LOCAL HERO", "PRIORIZADO", "Marien García", "No"],
      ["Tortas Gigantes Sur 12 - Xochimilco", "Tortas Gigantes Sur 12", "3. LOCAL HERO", "ADJUSTED", "Marien García", "No"],
      ["Tortas Gigantes Sur 12 Coapa", "Tortas Gigantes Sur 12", "3. LOCAL HERO", "ADJUSTED", "Marien García", "No"],
      ["Tortas Gigantes Sur 12 - Santa Cruz", "Tortas Gigantes Sur 12", "3. LOCAL HERO", "ADJUSTED", "Marien García", "No"],
      ["Tortas Gigantes Sur 12 Xochimilco", "Tortas Gigantes Sur 12", "3. LOCAL HERO", "ADJUSTED", "Marien García", "No"],
      ["Tortas Gigantes Sur 12 Coapa - Turbo", "Tortas Gigantes Sur 12 - Turbo", "3. LOCAL HERO", "ADJUSTED", "Marien García", "No"],
      ["Crepalandia", "Crepalandia.", "3. LOCAL HERO", "PRIORIZADO", "Zuriel Ramírez", "No"],
      ["Rincon Chino - Price Iztapalapa", "Rincon Chino Vallejo", "3. LOCAL HERO", "PRIORIZADO", "Zuriel Ramírez", "No"],
    ],
  },

  // Contexto para el motor de reglas
  prioritized: ["Caldos de Gallina Luis", "Señor Taco", "Lucky Bones", "El Agasajo Carnitas",
    "Tacos los Chavos", "Monkey Papas", "Kowloon Delight", "Tortas Gigantes Grey",
    "Tokyo House By Mr. Sushi", "Tacos San Burgos", "Kolobok"],
  densifyList: ["Lucky Bones", "Señor Taco", "Caldos de Gallina Luis", "El Agasajo Carnitas",
    "Tacos los Chavos", "Monkey Papas", "Kowloon Delight", "Hotdog Factory Mx",
    "Tortas Gigantes Grey", "Tokyo House By Mr. Sushi", "Tacos San Burgos", "Kolobok"],
};

const DEFAULT_WEEK = "2026-W32";

// ===== Datasets por semana (W29–W32) — el selector de semana consume esto =====
const PERF_BY_WEEK = {
  "2026-W29": {
    kpis: { orders: {"v": 12990.0, "prev": 12958.0, "l4": 51218, "p4": 51922, "yoy": 13291}, gmv: {"v": 277890, "prev": 276291, "l4": 1107184, "p4": 1095567, "yoy": 247846}, aov: {"v": 21.39, "prev": 21.32, "l4": 21.62, "p4": 21.1, "yoy": 18.65} },
    declineCount: 80,
    topGrowth: [["Neverías Frody", 286, 68, 31, "Francisco Saavedra"], ["Pastes Kikos", 345, 62, 22, "C. Sánchez"], ["Cassava Roots", 422, 50, 13, "Jorge Urbina"], ["La Chinampa Auténtica Taquería", 45, 44, 4400, "Francisco Saavedra"], ["Monkey Papas", 1221, 40, 3, "Jorge Urbina"], ["Carnitas Alfonso Desde 1966", 256, 38, 17, "C. Sánchez"], ["La Universal", 166, 27, 19, "Marien García"], ["Las Fresu Kiss Del Ajusco", 301, 26, 9, "Francisco Saavedra"]],
    worst: [["Caldos de Gallina los 2 Carnales", 401, -88, -18, "Francisco Saavedra"], ["Caldos de Gallina Luis", 246, -51, -17, "Zuriel Ramírez"], ["La Buena Birria Mx", 80, -48, -38, "Zuriel Ramírez"], ["Taquería Ramón", 18, -48, -73, "Francisco Saavedra"], ["Ricas Tortas Gigantes Claveria", 74, -44, -37, "Jorge Urbina"], ["Tokyo House By Mr. Sushi", 308, -31, -9, "Marien García"], ["Las de Barranca Tortas Hamburguesas Yburritos", 492, -29, -6, "Francisco Saavedra"], ["Tamales Flor de Lis", 139, -29, -17, "C. Sánchez"], ["Chilaquilito", 308, -21, -6, "Marien García"], ["Pizzalianni's Express", 146, -20, -12, "Zuriel Ramírez"]],
    perKam: [["Jorge Urbina", 3539, 1.1, 72338], ["Francisco Saavedra", 3288, 0.1, 63163], ["Marien García", 2403, 2.0, 60055], ["Zuriel Ramírez", 2114, -3.9, 45576], ["C. Sánchez", 1646, 2.3, 36758]],
    zoomByKam: {
      "Francisco Saavedra": [["Caldos de Gallina los 2 Carnales", 401, -88, -18], ["Taquería Ramón", 18, -48, -73], ["Las de Barranca Tortas Hamburguesas Yburritos", 492, -29, -6], ["El Charco de Los Sapos", 60, -18, -23], ["Tacos los Chavos", 72, -16, -18], ["Wok Express Comida China", 33, -13, -28], ["El Lobo Taquería", 39, -12, -24], ["Karrubis", 127, -9, -7], ["Carnitas Cazo de Oro", 22, -9, -29], ["Taquería Los Milanesos", 86, -6, -7]],
      "Jorge Urbina": [["Ricas Tortas Gigantes Claveria", 74, -44, -37], ["Rocking Burgers", 147, -18, -11], ["Tlacoyeria la Mexicana", 69, -15, -18], ["Pollo Fiel Xola Tajin", 98, -14, -12], ["Chilaquiles Su Majestad Cdmx", 29, -14, -33], ["Monterrey Burritos", 58, -11, -16], ["Potato Burger", 13, -11, -46], ["Mr. Jocho", 23, -11, -32], ["Taqueria Parrilla Sierravista", 102, -8, -7], ["Taquería Aldama", 77, -8, -9]],
      "Marien García": [["Tokyo House By Mr. Sushi", 308, -31, -9], ["Chilaquilito", 308, -21, -6], ["Tortas Gigantes Sur 12 - Av. Pantitlán", 55, -18, -25], ["El Mexiquense Barbacoa de Horno", 69, -12, -15], ["Gorditas Lagunerass", 55, -11, -17], ["Arnoldi", 41, -11, -21], ["Tortas Gigantes Sur 12", 193, -10, -5], ["El Villamelon", 109, -9, -8], ["Lima Limón Frutería & Loncheria", 195, -7, -3], ["Café Murano", 13, -7, -35]],
      "Zuriel Ramírez": [["Caldos de Gallina Luis", 246, -51, -17], ["La Buena Birria Mx", 80, -48, -38], ["Pizzalianni's Express", 146, -20, -12], ["Fonda de Barrio", 190, -18, -9], ["Taquería los Primos", 120, -14, -10], ["Toki Maki", 76, -12, -14], ["Nutri Light", 51, -9, -15], ["Super Tacos de Guisado Matriz", 28, -7, -20], ["Tacos Sarita Los Famosos De La 8", 63, -5, -7], ["Tan Deli Restaurante y Café", 14, -5, -26]],
      "C. Sánchez": [["Tamales Flor de Lis", 139, -29, -17], ["Tortas Qm", 19, -18, -49], ["El Rey Del Falafel", 15, -14, -48], ["Señor Taco", 206, -10, -5], ["Alchef", 67, -10, -13], ["Paleteria La Michoacana", 49, -9, -16], ["Tamalería Flor de Lis", 23, -8, -26], ["los Pastores", 76, -5, -6], ["Deleite Shop Mx", 18, -5, -22], ["La Parrilla Suiza", 50, -3, -6]]
    },
  },
  "2026-W30": {
    kpis: { orders: {"v": 12300.0, "prev": 12990.0, "l4": 50909, "p4": 51856, "yoy": 12818}, gmv: {"v": 261266, "prev": 277890, "l4": 1095048, "p4": 1108528, "yoy": 235370}, aov: {"v": 21.24, "prev": 21.39, "l4": 21.51, "p4": 21.38, "yoy": 18.36} },
    declineCount: 99,
    topGrowth: [["Caldos de Gallina Luis", 312, 66, 27, "Zuriel Ramírez"], ["Tokyo House By Mr. Sushi", 355, 47, 15, "Marien García"], ["Taquería Don Carnelio", 123, 41, 50, "Francisco Saavedra"], ["Taquería los Primos", 159, 39, 32, "Zuriel Ramírez"], ["Ricas Tortas Gigantes Claveria", 113, 39, 53, "Jorge Urbina"], ["Cocina Madheline", 44, 32, 267, "Francisco Saavedra"], ["Taquería Ramón", 50, 32, 178, "Francisco Saavedra"], ["Ono Poke House", 175, 28, 19, "Francisco Saavedra"]],
    worst: [["Monkey Papas", 1054, -167, -14, "Jorge Urbina"], ["Las de Barranca Tortas Hamburguesas Yburritos", 402, -90, -18, "Francisco Saavedra"], ["La Universal", 115, -51, -31, "Marien García"], ["Las Fresu Kiss Del Ajusco", 254, -47, -16, "Francisco Saavedra"], ["Neverías Frody", 244, -42, -15, "Francisco Saavedra"], ["Caldos de Gallina los 2 Carnales", 370, -31, -8, "Francisco Saavedra"], ["Kowloon Delight", 138, -31, -18, "Jorge Urbina"], ["Taqueria el Trompo", 63, -29, -32, "Marien García"], ["El Charco de Los Sapos", 33, -27, -45, "Francisco Saavedra"], ["Chilaquilito", 282, -26, -8, "Marien García"]],
    perKam: [["Jorge Urbina", 3242, -8.1, 64162], ["Francisco Saavedra", 3197, -2.6, 65380], ["Marien García", 2284, -4.9, 55998], ["Zuriel Ramírez", 1992, -4.9, 40456], ["C. Sánchez", 1585, -3.7, 35271]],
    zoomByKam: {
      "Francisco Saavedra": [["Las de Barranca Tortas Hamburguesas Yburritos", 402, -90, -18], ["Las Fresu Kiss Del Ajusco", 254, -47, -16], ["Neverías Frody", 244, -42, -15], ["Caldos de Gallina los 2 Carnales", 370, -31, -8], ["El Charco de Los Sapos", 33, -27, -45], ["El Agasajo Carnitas", 11, -22, -67], ["Taqueria los Tioss", 15, -22, -59], ["La Chinampa Auténtica Taquería", 27, -18, -40], ["Taquería Los Originales", 77, -13, -14], ["Las Quekas Factory", 112, -10, -8]],
      "Jorge Urbina": [["Monkey Papas", 1054, -167, -14], ["Kowloon Delight", 138, -31, -18], ["Monterrey Burritos", 36, -22, -38], ["Taquería Aldama", 56, -21, -27], ["Cookie D-oh", 37, -20, -35], ["Spicy Wings Alitas y Boneless", 118, -19, -14], ["Montparnasse", 22, -19, -46], ["New York Burgers Cdmx", 129, -18, -12], ["La Torteria Mx", 15, -12, -44], ["Elotes y Eskites San Juditas los Originales de Lindavista", 82, -11, -12]],
      "Marien García": [["La Universal", 115, -51, -31], ["Taqueria el Trompo", 63, -29, -32], ["Chilaquilito", 282, -26, -8], ["Hamburguesas Al Carbon Atizapan Edomex", 60, -20, -25], ["El Villamelon", 94, -15, -14], ["Gino's", 22, -15, -41], ["Wabu", 21, -15, -42], ["El Saboree", 41, -12, -23], ["Oro Negro Desayunos", 11, -8, -42], ["Quesadillas Abuelita Coni-", 121, -7, -5]],
      "Zuriel Ramírez": [["Fonda de Barrio", 165, -25, -13], ["Perros & Burros", 74, -25, -25], ["Day Light Salads", 51, -22, -30], ["Pizzalianni's Express", 125, -21, -14], ["Kolobok", 14, -18, -56], ["Kikiripizza", 36, -18, -33], ["Super Tacos de Guisado Matriz", 14, -14, -50], ["La Buena Birria Mx", 67, -13, -16], ["Big Jimmys Pizza", 66, -12, -15], ["Rincon Chino Vallejo", 60, -12, -17]],
      "C. Sánchez": [["Señor Taco", 180, -26, -13], ["Café KA´LOC", 98, -23, -19], ["La Barranca Pescados Carnes y Mariscos", 47, -10, -18], ["Carnitas Alfonso Desde 1966", 247, -9, -4], ["Du Chef Lomas Estrella", 32, -7, -18], ["Jugoterapia", 7, -7, -50], ["La Parrilla Suiza", 45, -5, -10], ["Tortas Qm", 14, -5, -26], ["Alchef", 63, -4, -6], ["Deleite Shop Mx", 14, -4, -22]]
    },
  },
  "2026-W31": {
    kpis: { orders: {"v": 12208.0, "prev": 12300.0, "l4": 50456, "p4": 51567, "yoy": 13383}, gmv: {"v": 257136, "prev": 261266, "l4": 1072584, "p4": 1119996, "yoy": 247307}, aov: {"v": 21.06, "prev": 21.24, "l4": 21.26, "p4": 21.72, "yoy": 18.48} },
    declineCount: 69,
    topGrowth: [["Taquería los Primos", 255, 96, 60, "Zuriel Ramírez"], ["Kowloon Delight", 180, 42, 30, "Jorge Urbina"], ["Las de Barranca Tortas Hamburguesas Yburritos", 437, 35, 9, "Francisco Saavedra"], ["Taquería Los Originales", 106, 29, 38, "Francisco Saavedra"], ["Cookie D-oh", 65, 28, 76, "Jorge Urbina"], ["Hamburguesas Al Carbon Atizapan Edomex", 85, 25, 42, "Marien García"], ["Day Light Salads", 76, 25, 49, "Zuriel Ramírez"], ["Taquería Aldama", 81, 25, 45, "Jorge Urbina"]],
    worst: [["Monkey Papas", 913, -141, -13, "Jorge Urbina"], ["Caldos de Gallina Luis", 184, -128, -41, "Zuriel Ramírez"], ["Cassava Roots", 343, -76, -18, "Jorge Urbina"], ["Pastes Kikos", 290, -58, -17, "C. Sánchez"], ["Neverías Frody", 204, -40, -16, "Francisco Saavedra"], ["New York Burgers Cdmx", 96, -33, -26, "Jorge Urbina"], ["Ricas Tortas Gigantes Claveria", 86, -27, -24, "Jorge Urbina"], ["Quesadillas Abuelita Coni-", 96, -25, -21, "Marien García"], ["Las Quekas Factory", 88, -24, -21, "Francisco Saavedra"], ["Los Burritos de Fuentes", 30, -24, -44, "Zuriel Ramírez"]],
    perKam: [["Francisco Saavedra", 3223, 0.9, 64099], ["Jorge Urbina", 3046, -5.8, 60386], ["Marien García", 2423, 6.3, 59107], ["Zuriel Ramírez", 1992, 0.0, 40999], ["C. Sánchez", 1524, -3.8, 32546]],
    zoomByKam: {
      "Francisco Saavedra": [["Neverías Frody", 204, -40, -16], ["Las Quekas Factory", 88, -24, -21], ["Cocina Madheline", 25, -19, -43], ["Taquería Los Milanesos", 72, -18, -20], ["Crêpe Corner", 23, -15, -39], ["Ono Poke House", 165, -10, -6], ["La Michoacana Echegaray", 30, -9, -23], ["Tacos El Cuñado La 2", 12, -8, -40], ["La Pantera Fresca", 104, -7, -6], ["Carnitas Cazo de Oro", 19, -7, -27]],
      "Jorge Urbina": [["Monkey Papas", 913, -141, -13], ["Cassava Roots", 343, -76, -18], ["New York Burgers Cdmx", 96, -33, -26], ["Ricas Tortas Gigantes Claveria", 86, -27, -24], ["Pollo Fiel Xola Tajin", 73, -20, -22], ["Taquería Don Pedro e Hijos", 30, -18, -38], ["Taqueria Parrilla Sierravista", 106, -7, -6], ["Hotdog Factory Mx", 9, -7, -44], ["Mr. Jocho", 27, -6, -18], ["Sandwich Brown Cdmx", 31, -5, -14]],
      "Marien García": [["Quesadillas Abuelita Coni-", 96, -25, -21], ["El Saboree", 32, -9, -22], ["Tortas Gigantes La Villa", 12, -9, -43], ["Wabu", 14, -7, -33], ["El Villamelon", 89, -5, -5], ["Tortas Gigantes la No 1", 5, -3, -38]],
      "Zuriel Ramírez": [["Caldos de Gallina Luis", 184, -128, -41], ["Los Burritos de Fuentes", 30, -24, -44], ["La Cabaña de Fuentes", 21, -20, -49], ["Big Jimmys Pizza", 49, -17, -26], ["Toki Maki", 64, -13, -17], ["Antonoff Bread Co", 36, -12, -25], ["Super Tacos de Guisado Matriz", 5, -9, -64], ["Afl Desayunos, Comidas y Cenas", 9, -7, -44], ["Verde Amor", 36, -6, -14], ["Tan Deli Restaurante y Café", 9, -6, -40]],
      "C. Sánchez": [["Pastes Kikos", 290, -58, -17], ["Alchef", 48, -15, -24], ["Pollo Fiel", 20, -14, -41], ["Café KA´LOC", 86, -12, -12], ["Tamales Flor de Lis", 130, -11, -8], ["La Carajita (Cdmx)", 6, -11, -65], ["los Pastores", 68, -10, -13], ["Don Paste", 10, -9, -47], ["Lucky Bones", 40, -4, -9], ["La Barranca Pescados Carnes y Mariscos", 43, -4, -9]]
    },
  },
  "2026-W32": {
    kpis: { orders: {"v": 12054.0, "prev": 12208.0, "l4": 49552, "p4": 51030, "yoy": 12894}, gmv: {"v": 244963, "prev": 257136, "l4": 1041256, "p4": 1108425, "yoy": 240442}, aov: {"v": 20.32, "prev": 21.06, "l4": 21.01, "p4": 21.72, "yoy": 18.65} },
    declineCount: 79,
    topGrowth: [["Caldos de Gallina Luis", 249, 65, 35, "Zuriel Ramírez"], ["Pizzalianni's Express", 182, 58, 47, "Zuriel Ramírez"], ["Neverías Frody", 262, 58, 28, "Francisco Saavedra"], ["Las Quekas Factory", 139, 51, 58, "Francisco Saavedra"], ["Taqueria el Trompo", 109, 43, 65, "Marien García"], ["Tortas Paty Provi", 39, 39, null, "Zuriel Ramírez"], ["Fonda de Barrio", 209, 38, 22, "Zuriel Ramírez"], ["La Buena Birria Mx", 106, 28, 36, "Zuriel Ramírez"]],
    worst: [["Monkey Papas", 726, -187, -20, "Jorge Urbina"], ["Taquería los Primos", 144, -111, -44, "Zuriel Ramírez"], ["Tacos San Burgos", 81, -51, -39, "Marien García"], ["Carnitas Alfonso Desde 1966", 213, -50, -19, "C. Sánchez"], ["Pastes Kikos", 250, -40, -14, "C. Sánchez"], ["Tokyo House By Mr. Sushi", 326, -39, -11, "Marien García"], ["Taquería Los Originales", 68, -38, -36, "Francisco Saavedra"], ["Kowloon Delight", 144, -36, -20, "Jorge Urbina"], ["Hamburguesas Al Carbon Atizapan Edomex", 54, -31, -36, "Marien García"], ["Montparnasse", 5, -26, -84, "Jorge Urbina"]],
    perKam: [["Francisco Saavedra", 3337, 3.5, 64155], ["Jorge Urbina", 2783, -7.9, 52227], ["Marien García", 2343, -3.3, 54887], ["Zuriel Ramírez", 2162, 8.5, 43120], ["C. Sánchez", 1429, -6.2, 30574]],
    zoomByKam: {
      "Francisco Saavedra": [["Taquería Los Originales", 68, -38, -36], ["Las Fresu Kiss Del Ajusco", 254, -23, -8], ["La Pantera Fresca", 87, -17, -16], ["Kingu Sushi Ks", 212, -15, -7], ["Tacos los Chavos", 100, -12, -11], ["Pollíssimo", 25, -10, -29], ["Las de Barranca Tortas Hamburguesas Yburritos", 428, -9, -2], ["La Michoacana Express", 10, -7, -41], ["El Agasajo Carnitas", 26, -6, -19], ["Taquería Los Milanesos", 67, -5, -7]],
      "Jorge Urbina": [["Monkey Papas", 726, -187, -20], ["Kowloon Delight", 144, -36, -20], ["Montparnasse", 5, -26, -84], ["Taquería Los Encinos", 44, -23, -34], ["Tlacoyeria la Mexicana", 45, -21, -32], ["Chilaquiles Del Parque", 21, -19, -48], ["Taquería Aldama", 63, -18, -22], ["La Casa del Huarache_", 25, -16, -39], ["Route 66 Burger&Beer", 25, -13, -34], ["Taqueria la Diez", 16, -11, -41]],
      "Marien García": [["Tacos San Burgos", 81, -51, -39], ["Tokyo House By Mr. Sushi", 326, -39, -11], ["Hamburguesas Al Carbon Atizapan Edomex", 54, -31, -36], ["El Mexiquense Barbacoa de Horno", 62, -19, -23], ["Tortas Gigantes Sur 12 - Av. Pantitlán", 65, -17, -21], ["El Villamelon", 73, -16, -18], ["Tortas Gigantes Sur 12", 181, -15, -8], ["Chilaquilito", 283, -13, -4], ["Lima Limón Frutería & Loncheria", 204, -5, -2], ["Gorditas Lagunerass", 63, -5, -7]],
      "Zuriel Ramírez": [["Taquería los Primos", 144, -111, -44], ["Day Light Salads", 62, -14, -18], ["Kolobok", 17, -13, -43], ["Drink Me", 6, -12, -67], ["Gorditas y Carnitas Zacazonapan", 134, -11, -8], ["La Posta Mx", 14, -9, -39], ["Cosecha Oaxaca", 18, -9, -33], ["Restaurante El Amigo", 28, -7, -20], ["Këbabnation", 5, -7, -58], ["Kikiripizza", 47, -5, -10]],
      "C. Sánchez": [["Carnitas Alfonso Desde 1966", 213, -50, -19], ["Pastes Kikos", 250, -40, -14], ["Señor Taco", 174, -15, -8], ["Tamalería Flor de Lis", 29, -12, -29], ["La Parrilla Suiza", 38, -11, -22], ["Deleite Shop Mx", 14, -11, -44], ["Tortas Qm", 16, -5, -24], ["Lima Mia Comedor de Los Milagros", 6, -4, -40], ["Jugoterapia", 7, -4, -36], ["Mi Café", 8, -4, -33]]
    },
  },
};

const TURBO_BY_WEEK = {
  "2026-W29": {
    kpis: [
      { label: "Active Stores", cdmx: 467, cdmxLw: 482, gena: 138, lw: 153, kind: "int" },
      { label: "Orders / Store", cdmx: 17.30, cdmxLw: 16.48, gena: 14.88, lw: 14.43, kind: "dec1" },
      { label: "Markdown %", cdmx: 8.09, cdmxLw: 7.26, gena: 9.03, lw: 8.62, kind: "pp2" },
    ],
    orders: [
      { label: "Total Orders", cdmx: 8079, cdmxLw: 7944, gena: 2054, lw: 2208, kind: "int" },
      { label: "Organic Orders", cdmx: 5088, cdmxLw: 5482, gena: 1378, lw: 1532, kind: "int" },
      { label: "Inorganic Orders", cdmx: 2991, cdmxLw: 2462, gena: 676, lw: 676, kind: "int" },
      { label: "% vs Restaurants", cdmx: 8.19, cdmxLw: 8.19, gena: 10.83, lw: 11.67, kind: "pp1" },
    ],
    times: [
      { label: "ATAS (min)", cdmx: 18.50, cdmxLw: 19.50, gena: 19, lw: 20.40, kind: "dec1", invert: true },
      { label: "RTWT (min)", cdmx: 3.80, cdmxLw: 4.10, gena: 4, lw: 4.30, kind: "dec1", invert: true },
      { label: "Orders < 20 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
      { label: "Orders < 15 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
    ],
  },
  "2026-W30": {
    kpis: [
      { label: "Active Stores", cdmx: 452, cdmxLw: 467, gena: 133, lw: 138, kind: "int" },
      { label: "Orders / Store", cdmx: 17.15, cdmxLw: 17.30, gena: 13.45, lw: 14.88, kind: "dec1" },
      { label: "Markdown %", cdmx: 9.17, cdmxLw: 8.09, gena: 9.23, lw: 9.03, kind: "pp2" },
    ],
    orders: [
      { label: "Total Orders", cdmx: 7751, cdmxLw: 8079, gena: 1789, lw: 2054, kind: "int" },
      { label: "Organic Orders", cdmx: 4441, cdmxLw: 5088, gena: 1171, lw: 1378, kind: "int" },
      { label: "Inorganic Orders", cdmx: 3310, cdmxLw: 2991, gena: 618, lw: 676, kind: "int" },
      { label: "% vs Restaurants", cdmx: 7.87, cdmxLw: 8.19, gena: 10.06, lw: 10.83, kind: "pp1" },
    ],
    times: [
      { label: "ATAS (min)", cdmx: 18.40, cdmxLw: 18.50, gena: 18.50, lw: 19, kind: "dec1", invert: true },
      { label: "RTWT (min)", cdmx: 4.07, cdmxLw: 3.80, gena: 4.30, lw: 4, kind: "dec1", invert: true },
      { label: "Orders < 20 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
      { label: "Orders < 15 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
    ],
  },
  "2026-W31": {
    kpis: [
      { label: "Active Stores", cdmx: 451, cdmxLw: 452, gena: 138, lw: 133, kind: "int" },
      { label: "Orders / Store", cdmx: 16.65, cdmxLw: 17.15, gena: 12.28, lw: 13.45, kind: "dec1" },
      { label: "Markdown %", cdmx: 7.52, cdmxLw: 9.17, gena: 8.31, lw: 9.23, kind: "pp2" },
    ],
    orders: [
      { label: "Total Orders", cdmx: 7511, cdmxLw: 7751, gena: 1694, lw: 1789, kind: "int" },
      { label: "Organic Orders", cdmx: 4447, cdmxLw: 4441, gena: 1184, lw: 1171, kind: "int" },
      { label: "Inorganic Orders", cdmx: 3064, cdmxLw: 3310, gena: 510, lw: 618, kind: "int" },
      { label: "% vs Restaurants", cdmx: 7.50, cdmxLw: 7.87, gena: 9.60, lw: 10.06, kind: "pp1" },
    ],
    times: [
      { label: "ATAS (min)", cdmx: 18.20, cdmxLw: 18.40, gena: 17.90, lw: 18.50, kind: "dec1", invert: true },
      { label: "RTWT (min)", cdmx: 4.28, cdmxLw: 4.07, gena: 4.20, lw: 4.30, kind: "dec1", invert: true },
      { label: "Orders < 20 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
      { label: "Orders < 15 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
    ],
  },
  "2026-W32": {
    kpis: [
      { label: "Active Stores", cdmx: 464, cdmxLw: 451, gena: 141, lw: 138, kind: "int" },
      { label: "Orders / Store", cdmx: 15.45, cdmxLw: 16.65, gena: 13.61, lw: 12.28, kind: "dec1" },
      { label: "Markdown %", cdmx: 6.69, cdmxLw: 7.52, gena: 8.39, lw: 8.31, kind: "pp2" },
    ],
    orders: [
      { label: "Total Orders", cdmx: 7171, cdmxLw: 7511, gena: 1919, lw: 1694, kind: "int" },
      { label: "Organic Orders", cdmx: 5002, cdmxLw: 4447, gena: 1356, lw: 1184, kind: "int" },
      { label: "Inorganic Orders", cdmx: 2169, cdmxLw: 3064, gena: 563, lw: 510, kind: "int" },
      { label: "% vs Restaurants", cdmx: 7.40, cdmxLw: 7.50, gena: 11.04, lw: 9.60, kind: "pp1" },
    ],
    times: [
      { label: "ATAS (min)", cdmx: 18, cdmxLw: 18.20, gena: 18.40, lw: 17.90, kind: "dec1", invert: true },
      { label: "RTWT (min)", cdmx: 3.80, cdmxLw: 4.28, gena: 3.80, lw: 4.20, kind: "dec1", invert: true },
      { label: "Orders < 20 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
      { label: "Orders < 15 min", cdmx: null, cdmxLw: null, gena: null, lw: null, kind: "pct1" },
    ],
  },
};

const GoogleSheetsAdapter = {
  source: () => `Google Sheets · Biblia Kams JR (${SHEET_ID.slice(0, 8)}…)`,
  // Cada método simula latencia de red. En producción → fetch(endpoint).
  async fetchAll() {
    await new Promise((r) => setTimeout(r, 700));
    return RAW;
  },
};

const dataService = (() => {
  let cache = null;
  let lastSync = null;
  return {
    sourceLabel: GoogleSheetsAdapter.source(),
    async refresh() {
      cache = await GoogleSheetsAdapter.fetchAll();
      lastSync = new Date();
      return { data: cache, lastSync };
    },
    data: () => cache,
    lastSync: () => lastSync,
    // getters por módulo — las vistas sólo tocan esto
    weeks: () => cache?.weeks || [],
    kams: () => cache?.kams || [],
    // Órdenes = hoja "Tabla dinámica week/month" (marcas unificadas). Week-aware: el selector define la semana.
    performance: (weekId) => ({ ...(PERF_BY_WEEK[weekId] || PERF_BY_WEEK[DEFAULT_WEEK]), monthly: RAW.performance.monthly }),
    turbo: (weekId) => ({ ...(TURBO_BY_WEEK[weekId] || TURBO_BY_WEEK[DEFAULT_WEEK]), topPerf: RAW.turbo.topPerf, worst: RAW.turbo.worst, woRtwt: RAW.turbo.woRtwt }),
    marketing: () => cache?.marketing,
    densification: () => cache?.densification,
    rulesContext: () => ({
      prioritized: new Set(cache?.prioritized || []),
      densifyList: new Set(cache?.densifyList || []),
    }),
  };
})();

/* ========================================================================================
   2) ANNOTATION STORE  — persistencia SEPARADA (window.storage, colaborativa)
      Clave: wbr:note:{module}:{entityId} → { byWeek: { weekId: {text, updatedAt, author} } }
      Nunca se sobrescribe con "Actualizar datos".
======================================================================================== */
const mem = new Map();
const annotationStore = {
  async read(key) {
    try {
      const r = await window.storage.get(key, true);
      return r ? JSON.parse(r.value) : mem.has(key) ? JSON.parse(mem.get(key)) : null;
    } catch {
      return mem.has(key) ? JSON.parse(mem.get(key)) : null;
    }
  },
  async write(key, obj) {
    const s = JSON.stringify(obj);
    mem.set(key, s);
    try { await window.storage.set(key, s, true); } catch { /* fallback en memoria */ }
  },
};

function useAnnotation(module, entityId, weekId, author = "KAM") {
  const key = `wbr:note:${module}:${entityId}`;
  const [record, setRecord] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    annotationStore.read(key).then((r) => alive && setRecord(r || { byWeek: {} }));
    return () => { alive = false; };
  }, [key]);

  const current = record?.byWeek?.[weekId]?.text ?? "";
  const updatedAt = record?.byWeek?.[weekId]?.updatedAt;

  const save = useCallback((text) => {
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const rec = (await annotationStore.read(key)) || { byWeek: {} };
      rec.byWeek[weekId] = { text, updatedAt: new Date().toISOString(), author };
      await annotationStore.write(key, rec);
      setRecord({ ...rec });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1400);
    }, 550);
  }, [key, weekId, author]);

  const history = record
    ? Object.entries(record.byWeek).filter(([w]) => w !== weekId).sort((a, b) => b[0].localeCompare(a[0]))
    : [];

  return { current, updatedAt, status, save, history };
}

/* ========================================================================================
   3) RULES ENGINE  — agregar campaña = agregar objeto (sin tocar el core)
======================================================================================== */
const campaignRules = [
  {
    id: "new_to_brand", name: "New to Brand", color: "#4C2B8C", bg: "#F4F0FC",
    rule: "Solo marcas priorizadas (PRIORIZADO).",
    applies: (brand, ctx) => ctx.prioritized.has(brand),
  },
  {
    id: "densificacion", name: "Densificación", color: T.turboInk, bg: T.turboBg,
    rule: "Solo marcas en la hoja «Stores a Densificar».",
    applies: (brand, ctx) => ctx.densifyList.has(brand),
  },
  // + Nueva campaña → { id, name, color, bg, rule, applies:(brand,ctx)=>… }
];
const campaignsFor = (brand, ctx) => campaignRules.filter((c) => c.applies(brand, ctx));

/* ========================================================================================
   REUSABLE COMPONENTS
======================================================================================== */
function DeltaBadge({ value, pct, suffix = "" }) {
  const positive = value > 0, negative = value < 0;
  const color = positive ? T.up : negative ? T.down : T.flat;
  const arrow = positive ? "▲" : negative ? "▼" : "—";
  return (
    <span style={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" }}>
      {arrow} {value > 0 ? "+" : ""}{typeof value === "number" ? fInt(value) : value}{suffix}
      {pct != null && <span style={{ opacity: 0.75, marginLeft: 5 }}>({fPct(pct, 0)})</span>}
    </span>
  );
}

function Kpi({ label, value, sub, tint }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "16px 18px", flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", color: T.ink3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 800, marginTop: 6, color: tint || T.ink, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>{sub}</div>}
    </div>
  );
}

function SubDelta({ label, value, pct }) {
  return (
    <span style={{ fontSize: 11.5, color: T.ink3 }}>
      {label} <DeltaBadge value={value} pct={pct} />
    </span>
  );
}

function Panel({ title, right, children, tint, note }) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: `1px solid ${T.line}`, background: tint || "transparent" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: T.ink }}>{title}</h3>
          {note && <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{note}</div>}
        </div>
        {right}
      </header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function DataTable({ columns, rows, renderCell }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: c.align || "left", padding: "9px 12px", color: T.ink3, fontWeight: 600, fontSize: 11.5,
                textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap",
                width: c.width,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: `1px solid ${T.bg}` }}>
              {columns.map((c, ci) => (
                <td key={ci} style={{ padding: "10px 12px", textAlign: c.align || "left", color: T.ink, verticalAlign: "top", fontVariantNumeric: "tabular-nums" }}>
                  {renderCell ? renderCell(row, c, ri) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ value, max = 1, color = T.neon1 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 7, background: T.line, borderRadius: 99, overflow: "hidden", minWidth: 60 }}>
        <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 12, color: T.ink2, fontVariantNumeric: "tabular-nums", minWidth: 42, textAlign: "right" }}>{fPct0(value / max)}</span>
    </div>
  );
}

// Nota editable: multilínea, autosave, historial semanal
function EditableNote({ module, entityId, weekId, placeholder = "Escribe el análisis…", rows = 2 }) {
  const { current, updatedAt, status, save, history } = useAnnotation(module, entityId, weekId);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showHist, setShowHist] = useState(false);

  useEffect(() => { setText(current); setLoaded(true); }, [current, entityId, weekId]);

  return (
    <div style={{ minWidth: 220 }}>
      <textarea
        value={loaded ? text : ""}
        onChange={(e) => { setText(e.target.value); save(e.target.value); }}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: "100%", resize: "vertical", border: `1px solid ${T.line}`, borderRadius: 9, padding: "8px 10px",
          fontSize: 13, fontFamily: FONT, color: T.ink, background: text ? "#fffdfa" : T.card, lineHeight: 1.45,
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = T.neon1)}
        onBlur={(e) => (e.target.style.borderColor = T.line)}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, fontSize: 11 }}>
        <span style={{ color: status === "saving" ? T.ink3 : status === "saved" ? T.up : T.ink3 }}>
          {status === "saving" ? "Guardando…" : status === "saved" ? "✓ Guardado" : updatedAt ? "Guardado " + new Date(updatedAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
        {history.length > 0 && (
          <button onClick={() => setShowHist((s) => !s)} style={{ border: "none", background: "none", color: T.neon2, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0 }}>
            Historial ({history.length})
          </button>
        )}
      </div>
      {showHist && (
        <div style={{ marginTop: 6, border: `1px solid ${T.line}`, borderRadius: 8, background: T.bg, padding: 8 }}>
          {history.map(([w, o]) => (
            <div key={w} style={{ fontSize: 12, marginBottom: 6 }}>
              <b style={{ color: T.ink2 }}>{w.replace("2026-", "")}</b> · <span style={{ color: T.ink }}>{o.text || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignBadges({ brand, ctx }) {
  const cs = campaignsFor(brand, ctx);
  if (!cs.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
      {cs.map((c) => (
        <span key={c.id} title={c.rule} style={{ fontSize: 9.5, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap" }}>{c.name}</span>
      ))}
    </span>
  );
}

/* ========================================================================================
   VIEWS
======================================================================================== */
function HomeView({ week, lastSync }) {
  const p = dataService.performance(week.id);
  const t = dataService.turbo(week.id);
  const woCount = t.woRtwt.length;
  const worstCount = p.worst.length;
  const kpi = p.kpis;
  const ordersDelta = kpi.orders.v - kpi.orders.prev;
  return (
    <div>
      <div style={{ borderRadius: 18, padding: "26px 28px", color: "#fff", background: GRAD, marginBottom: 22 }}>
        <div style={{ fontSize: 12.5, opacity: 0.9, fontWeight: 600, letterSpacing: 0.5 }}>WEEKLY BUSINESS REVIEW · {RAW.team.toUpperCase()}</div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>{week.label}</div>
        <div style={{ fontSize: 13, opacity: 0.92, marginTop: 6 }}>
          Última sincronización: {lastSync ? lastSync.toLocaleString("es-MX", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"} · Fuente: {dataService.sourceLabel}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="Orders (semana)" value={fInt(kpi.orders.v)} sub={[<SubDelta key="a" label="vs W−1" value={ordersDelta} pct={(ordersDelta / kpi.orders.prev) * 100} />]} />
        <Kpi label="GMV (semana)" value={fUsd(kpi.gmv.v)} sub={[<SubDelta key="a" label="vs W−1" value={kpi.gmv.v - kpi.gmv.prev} pct={((kpi.gmv.v - kpi.gmv.prev) / kpi.gmv.prev) * 100} />]} />
        <Kpi label="AOV" value={fUsd2(kpi.aov.v)} tint={T.neon1} sub={[(() => {
          const d = kpi.aov.v - kpi.aov.prev, pct = (d / kpi.aov.prev) * 100, col = d > 0 ? T.up : d < 0 ? T.down : T.flat;
          return <span key="a" style={{ fontSize: 11.5, color: T.ink3 }}>vs W−1 <span style={{ color: col, fontWeight: 600 }}>{d > 0 ? "▲" : d < 0 ? "▼" : "—"} {d > 0 ? "+" : ""}{d.toFixed(2)} ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span></span>;
        })()]} />
        <Kpi label="Marcas en caída" value={p.declineCount ?? worstCount} tint={T.down} sub={[<span key="a" style={{ fontSize: 11.5, color: T.ink3 }}>a revisar en Zoom</span>]} />
        <Kpi label="Turbo · WO RTWT >4′" value={woCount} tint={T.turboInk} sub={[<span key="a" style={{ fontSize: 11.5, color: T.ink3 }}>marcas fuera de rango</span>]} />
      </div>

      <Panel title="Pendientes de esta semana" note="Lo que cada KAM debe documentar antes de la reunión">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {[
            ["Performance · Zoom", `${worstCount} marcas en caída con «¿Por qué?» por llenar`, T.neon1],
            ["Turbo · WO RTWT", `${woCount} marcas >4′ con «¿Por qué?» y plan de acción`, T.turboInk],
            ["Marketing · Bottom Brands", "Comentar caídas de markdown y ads por KAM", "#4C2B8C"],
            ["Marketing · Compromisos", "Marcas a cargar esta semana por KAM", T.neon2],
          ].map(([a, b, c]) => (
            <div key={a} style={{ border: `1px solid ${T.line}`, borderLeft: `3px solid ${c}`, borderRadius: 10, padding: "12px 14px", background: T.bg }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: T.ink }}>{a}</div>
              <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>{b}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PerformanceView({ week }) {
  const p = dataService.performance(week.id);
  const ctx = dataService.rulesContext();
  const [mode, setMode] = useState("week"); // week | month
  const [zoomKam, setZoomKam] = useState(RAW.kams[0]);
  const isMonth = mode === "month";
  const M = p.monthly;

  // Fuente según modo
  const src = isMonth
    ? { topGrowth: M.topGrowth, worst: M.worst, zoomByKam: M.zoomByKam, periodId: M.period.id, noteModule: "perf.zoom.month", periodWord: M.period.label }
    : { topGrowth: p.topGrowth, worst: p.worst, zoomByKam: p.zoomByKam, periodId: week.id, noteModule: "perf.zoom", periodWord: week.label };
  const zoomRows = src.zoomByKam[zoomKam] || [];

  const KpiCard = ({ label, value, tint, deltas }) => (
    <Kpi label={label} value={value} tint={tint} sub={deltas.map((d, i) => <SubDelta key={i} label={d.label} value={d.value} pct={d.pct} />)} />
  );

  // KPIs semanales vs mensuales
  const weekKpis = () => {
    const k = p.kpis;
    const row = (kk, fmt, tint) => (
      <KpiCard label={kk.label} value={fmt(kk.v)} tint={tint} deltas={[
        { label: "W−1", value: kk.v - kk.prev, pct: ((kk.v - kk.prev) / kk.prev) * 100 },
        { label: "U4S", value: Math.round(kk.l4 / 4) - Math.round(kk.p4 / 4), pct: ((kk.l4 - kk.p4) / kk.p4) * 100 },
        { label: "YoY", value: kk.v - kk.yoy, pct: ((kk.v - kk.yoy) / kk.yoy) * 100 },
      ]} />
    );
    return <>
      {row({ ...k.orders, label: "Orders" }, fInt)}
      {row({ ...k.gmv, label: "GMV" }, fUsd)}
      {row({ ...k.aov, label: "AOV" }, fUsd2, T.neon1)}
    </>;
  };
  const monthKpis = () => {
    const k = M.kpis;
    const row = (kk, fmt, tint) => (
      <KpiCard label={kk.label} value={fmt(kk.v)} tint={tint} deltas={[
        { label: "vs LM", value: Math.round(kk.v - kk.lm), pct: ((kk.v - kk.lm) / kk.lm) * 100 },
        { label: "vs MLY", value: Math.round(kk.v - kk.mly), pct: ((kk.v - kk.mly) / kk.mly) * 100 },
        { label: "Acum 26v25", value: Math.round(kk.ytd - kk.ytdPrev), pct: ((kk.ytd - kk.ytdPrev) / kk.ytdPrev) * 100 },
      ]} />
    );
    return <>
      {row({ ...k.orders, label: "Orders · Julio" }, fInt)}
      {row({ ...k.gmv, label: "GMV · Julio" }, fUsd)}
      {row({ ...k.aov, label: "AOV · Julio" }, fUsd2, T.neon1)}
    </>;
  };

  const brandCols = [
    { label: "Brand", key: "b" }, { label: "Orders", key: "o", align: "right" },
    { label: "Δ Orders", key: "d", align: "right" }, { label: "Δ %", key: "p", align: "right" },
  ];
  const renderBrand = (row, c) => {
    if (c.key === "b") return <span>{row[0]}<CampaignBadges brand={row[0]} ctx={ctx} /></span>;
    if (c.key === "o") return fInt(row[1]);
    if (c.key === "d") return <DeltaBadge value={row[2]} />;
    if (c.key === "p") return <span style={{ color: row[3] > 0 ? T.up : row[3] < 0 ? T.down : T.flat, fontWeight: 600 }}>{fPct(row[3], 0)}</span>;
  };

  const lastLabel = isMonth ? "Last Month Performance" : "Last Week Performance";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2 style={h2}>Performance</h2>
        <div style={{ display: "flex", gap: 4, background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: 3 }}>
          {[["week", "Semanal"], ["month", "Mensual"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{
              border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              color: mode === k ? "#fff" : T.ink2, background: mode === k ? GRAD : "transparent",
            }}>{l}</button>
          ))}
        </div>
      </div>
      <p style={sub}>
        {isMonth
          ? <>Desempeño <b>mensual</b> de {RAW.team} — <b>{M.period.label}</b>. Comparamos <b>Jul vs Jun</b>, Jul 26 vs Jul 25 y acumulado ene–jul 26 vs 25. Agosto va corriendo. Marcas unificadas (hoja «Tabla dinámica Month»).</>
          : <>Desempeño <b>semanal</b> de {RAW.team} — {week.label}. Órdenes por marca unificada (hoja «Tabla dinámica week»): cada marca agrupa su versión regular y Turbo.</>}
      </p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        {isMonth ? monthKpis() : weekKpis()}
      </div>

      <h3 style={h3}>{lastLabel}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <Panel title="Top Performance" note="Marcas con mayor crecimiento" tint="#f4fbf6">
          <DataTable columns={brandCols} rows={src.topGrowth} renderCell={renderBrand} />
        </Panel>
        <Panel title="Worst Performance" note="Marcas con mayor caída" tint="#fdf3f3">
          <DataTable columns={brandCols} rows={src.worst} renderCell={renderBrand} />
        </Panel>
      </div>

      <h3 style={h3}>Zoom · marcas en caída por KAM {isMonth && <span style={{ fontWeight: 500, color: T.ink3, fontSize: 13 }}>· {M.period.label}</span>}</h3>
      <Panel
        title={`Top 10 caídas de ${zoomKam}`}
        note={isMonth
          ? "Cada KAM documenta el porqué de sus caídas del mes · autosave · historial (Marca + Mes)"
          : "Cada KAM documenta el porqué de sus caídas de la semana · autosave · historial (Marca + Semana)"}
        right={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {RAW.kams.map((k) => {
              const n = (src.zoomByKam[k] || []).length;
              return <button key={k} onClick={() => setZoomKam(k)} style={pill(zoomKam === k)}>{k.split(" ")[0]} <span style={{ opacity: 0.6 }}>({n})</span></button>;
            })}
          </div>
        }
      >
        {zoomRows.length === 0 ? (
          <Empty>{zoomKam} no tiene marcas en caída en este periodo. 🎉</Empty>
        ) : (
          <DataTable
            columns={[
              { label: "Brand", key: "b", width: "24%" }, { label: "Orders", key: "o", align: "right" },
              { label: "Δ Orders", key: "d", align: "right" }, { label: "Δ %", key: "p", align: "right" },
              { label: "¿Por qué?", key: "why", width: "36%" },
            ]}
            rows={zoomRows}
            renderCell={(row, c) => {
              if (c.key === "b") return <span style={{ fontWeight: 600 }}>{row[0]}<CampaignBadges brand={row[0]} ctx={ctx} /></span>;
              if (c.key === "o") return fInt(row[1]);
              if (c.key === "d") return <DeltaBadge value={row[2]} />;
              if (c.key === "p") return <span style={{ color: T.down, fontWeight: 600 }}>{fPct(row[3], 0)}</span>;
              if (c.key === "why") return <EditableNote module={src.noteModule} entityId={row[0]} weekId={src.periodId} placeholder="¿Por qué cayó? Contexto, hipótesis, siguiente paso…" />;
            }}
          />
        )}
      </Panel>
    </div>
  );
}

function TurboView({ week }) {
  const t = dataService.turbo(week.id);
  const [tab, setTab] = useState("kpis");
  const rtwtColor = (v) => (v <= 4 ? T.up : v <= 5 ? "#c98a00" : T.down);
  const rtwtDot = (v) => (v <= 4 ? "🟢" : v <= 5 ? "🟡" : "🔴");

  const fmtVal = (v, kind) => {
    if (v == null) return "—";
    if (kind === "int") return fInt(v);
    if (kind === "dec1") return v.toFixed(1);
    if (kind === "pp2") return v.toFixed(2) + "%";
    return v.toFixed(1) + "%"; // pp1 / pct1
  };
  const fmtDelta = (d, kind) => {
    const s = d > 0 ? "+" : "";
    if (kind === "int") return s + fInt(d);
    if (kind === "dec1") return s + d.toFixed(1);
    if (kind === "pp2") return s + d.toFixed(2) + " pp";
    return s + d.toFixed(1) + " pp"; // pp1
  };

  // Δ = valor de esta semana vs semana pasada (WoW), para CDMX y para Team Gena.
  const deltaCell = (cur, prev, kind, invert) => {
    if (cur == null || prev == null) return <span style={{ color: T.ink3, fontSize: 12 }}>n/d</span>;
    const diff = cur - prev;
    const better = invert ? diff < 0 : diff > 0;
    const color = diff === 0 ? T.flat : better ? T.up : T.down;
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
    const showPct = (kind === "int" || kind === "dec1") && prev !== 0;
    const pct = showPct ? (diff / prev) * 100 : null;
    return (
      <span style={{ color, fontWeight: 600, fontSize: 12.5 }}>
        {arrow} {fmtDelta(diff, kind)}
        {pct != null && <span style={{ opacity: 0.8 }}> ({pct > 0 ? "+" : ""}{pct.toFixed(0)}%)</span>}
      </span>
    );
  };
  const Compare = ({ rows }) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
      <thead><tr>
        <th style={thc("left")}>Indicador</th>
        <th style={thc("right")}>CDMX</th>
        <th style={thc("right")}>Δ vs LW</th>
        <th style={thc("right")}>Team Gena</th>
        <th style={thc("right")}>Δ vs LW</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${T.bg}` }}>
            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.label}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", color: T.ink2, fontVariantNumeric: "tabular-nums" }}>{fmtVal(r.cdmx, r.kind)}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{deltaCell(r.cdmx, r.cdmxLw, r.kind, r.invert)}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: T.turboInk, fontVariantNumeric: "tabular-nums" }}>{fmtVal(r.gena, r.kind)}</td>
            <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{deltaCell(r.gena, r.lw, r.kind, r.invert)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const brandCols = [
    { label: "Brand", key: "b" }, { label: "Orders", key: "o", align: "right" },
    { label: "Δ Orders", key: "d", align: "right" }, { label: "Δ %", key: "p", align: "right" },
  ];
  const renderBrand = (row, c) => {
    if (c.key === "b") return row[0];
    if (c.key === "o") return fInt(row[1]);
    if (c.key === "d") return <DeltaBadge value={row[2]} />;
    if (c.key === "p") return <span style={{ color: row[3] > 0 ? T.up : T.down, fontWeight: 600 }}>{fPct(row[3], 0)}</span>;
  };

  return (
    <div>
      <h2 style={h2}>Turbo</h2>
      <p style={sub}>
        Análisis del equipo con <b style={{ color: T.turboInk }}>Team Gena</b>. <b>CDMX</b> se muestra como comparativo de ciudad. El <b>Δ compara cada columna contra su semana anterior</b> (WoW). Nunca se mezcla información de otros equipos.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {[["kpis", "KPIs"], ["orders", "Orders"], ["times", "Times"], ["last", "Desempeño"], ["wo", "WO RTWT"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k, T.turboInk)}>{l}</button>
        ))}
      </div>

      {tab === "kpis" && (
        <Panel title="KPIs · CDMX vs Team Gena" note="Δ = esta semana vs semana pasada (WoW)" tint={T.turboBg}>
          <Compare rows={t.kpis} />
        </Panel>
      )}

      {tab === "orders" && (
        <Panel title="Orders · CDMX vs Team Gena" note="Δ = esta semana vs semana pasada (WoW)" tint={T.turboBg}>
          <Compare rows={t.orders} />
        </Panel>
      )}

      {tab === "times" && (
        <Panel title="Times · CDMX vs Team Gena" note="Δ = WoW · en tiempos, bajar es mejor · <15/<20 min sin desglose por equipo en la hoja" tint={T.turboBg}>
          <Compare rows={t.times} />
        </Panel>
      )}

      {tab === "last" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
          <Panel title="Top Performance" note="Sólo Team Gena" tint={T.turboBg}><DataTable columns={brandCols} rows={t.topPerf} renderCell={renderBrand} /></Panel>
          <Panel title="Worst Performance" note="Sólo Team Gena" tint={T.turboBg}><DataTable columns={brandCols} rows={t.worst} renderCell={renderBrand} /></Panel>
        </div>
      )}

      {tab === "wo" && (
        <Panel title="WO RTWT · marcas fuera de rango" note="Sólo marcas con RTWT > 4 min · 🟢 ≤4′ · 🟡 4–5′ · 🔴 >5′ · campos editables con autosave e historial" tint={T.turboBg}>
          <DataTable
            columns={[
              { label: "Marca", key: "b", width: "20%" }, { label: "RTWT", key: "r", align: "right" },
              { label: "Orders", key: "o", align: "right" }, { label: "KAM", key: "k" },
              { label: "¿Por qué?", key: "why", width: "26%" }, { label: "Plan de acción", key: "plan", width: "26%" },
            ]}
            rows={t.woRtwt}
            renderCell={(row, c) => {
              if (c.key === "b") return <span style={{ fontWeight: 600 }}>{row[0]}</span>;
              if (c.key === "r") return <span style={{ color: rtwtColor(row[1]), fontWeight: 700 }}>{rtwtDot(row[1])} {row[1].toFixed(2)}′</span>;
              if (c.key === "o") return fInt(row[2]);
              if (c.key === "k") return <span style={{ color: T.ink2, fontSize: 12.5 }}>{row[3]}</span>;
              if (c.key === "why") return <EditableNote module="turbo.wortwt.why" entityId={row[0]} weekId={week.id} placeholder="Causa raíz del RTWT alto…" />;
              if (c.key === "plan") return <EditableNote module="turbo.wortwt.plan" entityId={row[0]} weekId={week.id} placeholder="Acción concreta + responsable + fecha…" />;
            }}
          />
        </Panel>
      )}
    </div>
  );
}

function DetailByKam({ title, note, data, open, toggle, columns, render }) {
  return (
    <Panel title={title} note={note}>
      {RAW.kams.map((kam) => {
        const rows = data[kam] || [];
        const isOpen = !!open[kam];
        const total = rows.reduce((a, r) => a + (r[1] || 0), 0);
        return (
          <div key={kam} style={{ marginBottom: 10, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
            <button onClick={() => toggle(kam)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", border: "none", background: isOpen ? T.bg : T.card, cursor: "pointer", fontFamily: FONT }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: T.ink }}>{isOpen ? "▾" : "▸"} {kam} <span style={{ color: T.ink3, fontWeight: 500 }}>· {rows.length} marcas</span></span>
              <span style={{ fontWeight: 700, color: T.neon1, fontVariantNumeric: "tabular-nums" }}>{fUsd(total)}</span>
            </button>
            {isOpen && (rows.length ? <div style={{ padding: "2px 6px 8px" }}><DataTable columns={columns} rows={rows} renderCell={render} /></div> : <div style={{ padding: "10px 14px", color: T.ink3, fontSize: 13 }}>Sin marcas con monto esta semana.</div>)}
          </div>
        );
      })}
    </Panel>
  );
}

function MarketingView({ week }) {
  const m = dataService.marketing();
  const ctx = dataService.rulesContext();
  const [tab, setTab] = useState("markdown");
  const [openKam, setOpenKam] = useState({});
  const toggle = (k) => setOpenKam((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div>
      <h2 style={h2}>Marketing</h2>
      <p style={sub}>Markdown, Ads, Tarjetas y New to Brand por KAM. Datos de la última semana sincronizada.</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {[["markdown", "Markdown"], ["ads", "Ads"], ["tarjetas", "Tarjetas"], ["newtobrand", "New to Brand"], ["compromisos", "Compromisos"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k, T.neon1)}>{l}</button>
        ))}
      </div>

      {tab === "markdown" && (
        <>
          <Panel title="Resumen por KAM · Pivot Mkt MD Total" note="MD Total y MD PRO en USD · MD/GMV % · variación vs semana anterior">
            <DataTable
              columns={[
                { label: "KAM", key: "k" }, { label: "MD Total", key: "md", align: "right" },
                { label: "vs W−1", key: "mdd", align: "right" }, { label: "MD PRO", key: "pro", align: "right" },
                { label: "MD / GMV", key: "mdg", align: "right" }, { label: "MD PRO / GMV", key: "pg", align: "right" },
              ]}
              rows={m.perKam}
              renderCell={(row, c) => {
                const [kam, , md, mdPro, , gmv] = row;
                if (c.key === "k") return <b>{kam}</b>;
                if (c.key === "md") return <span style={{ fontWeight: 700 }}>{fUsd(md)}</span>;
                if (c.key === "mdd") { const prev = m.prevMdUsd[kam]; const dd = md - prev; return <DeltaBadge value={Math.round(dd)} pct={prev ? (dd / prev) * 100 : null} />; }
                if (c.key === "pro") return fUsd(mdPro);
                if (c.key === "mdg") return <span style={{ fontWeight: 600 }}>{((md / gmv) * 100).toFixed(1)}%</span>;
                if (c.key === "pg") return ((mdPro / gmv) * 100).toFixed(1) + "%";
              }}
            />
          </Panel>
          <DetailByKam
            title="Detalle por marca · Pivot Mkt MD Total"
            note="Todas las marcas con markdown > 0 esta semana (MD_TOTAL_USD) · Δ vs semana anterior"
            data={m.mdByKam} open={openKam} toggle={toggle} ctx={ctx}
            columns={[
              { label: "Brand", key: "b", width: "38%" }, { label: "MD Total", key: "v", align: "right" },
              { label: "MD PRO", key: "p", align: "right" }, { label: "Δ vs LW", key: "d", align: "right", width: "24%" },
            ]}
            render={(row, c) => {
              if (c.key === "b") return <span>{row[0]}<CampaignBadges brand={row[0]} ctx={ctx} /></span>;
              if (c.key === "v") return <span style={{ fontWeight: 600 }}>{fUsd(row[1])}</span>;
              if (c.key === "p") return fUsd(row[2]);
              if (c.key === "d") {
                const d = row[3], pct = row[4];
                if (d === 0) return <span style={{ color: T.flat, fontSize: 12.5 }}>—</span>;
                return <span style={{ color: d > 0 ? T.up : T.down, fontWeight: 600, fontSize: 12.5 }}>{d > 0 ? "▲ +" : "▼ "}{fUsd(Math.abs(d))}{pct != null && <span style={{ opacity: 0.8 }}> ({pct > 0 ? "+" : ""}{pct}%)</span>}{pct == null && <span style={{ opacity: 0.8 }}> (nuevo)</span>}</span>;
              }
            }}
          />
          <Panel title="Bottom Brands · markdown" note="Marcas con mayor caída de % markdown (MD/GMV) vs W−1 · «¿Por qué?» editable">
            {RAW.kams.map((kam) => {
              const rows = m.bottomMd[kam] || [];
              if (!rows.length) return null;
              return (
                <div key={kam} style={{ marginBottom: 18 }}>
                  <div style={kamHead}>{kam}</div>
                  <DataTable
                    columns={[
                      { label: "Brand", key: "b", width: "24%" }, { label: "Markdown %", key: "md", align: "right" },
                      { label: "Δ vs W−1", key: "d", align: "right" }, { label: "¿Por qué?", key: "why", width: "44%" },
                    ]}
                    rows={rows}
                    renderCell={(row, c) => {
                      if (c.key === "b") return <span>{row[0]}<CampaignBadges brand={row[0]} ctx={ctx} /></span>;
                      if (c.key === "md") return <span style={{ fontWeight: 600 }}>{row[1].toFixed(1)}%</span>;
                      if (c.key === "d") return <span style={{ color: T.down, fontWeight: 600, fontSize: 12.5 }}>▼ {row[2].toFixed(1)} pp</span>;
                      if (c.key === "why") return <EditableNote module="mkt.md.why" entityId={row[0]} weekId={week.id} placeholder="¿Por qué bajó el markdown? ¿Se apagó una campaña?…" />;
                    }}
                  />
                </div>
              );
            })}
          </Panel>
        </>
      )}

      {tab === "ads" && (
        <>
          <Panel title="Revenue Ads por KAM · Pivot Mkt ADS" note="Revenue (ADS_USD) y variación vs semana anterior">
            <DataTable
              columns={[
                { label: "KAM", key: "k" }, { label: "Revenue", key: "rev", align: "right" },
                { label: "vs W−1", key: "d", align: "right" },
              ]}
              rows={m.perKam}
              renderCell={(row, c) => {
                const [kam, , , , ads] = row;
                const prev = m.adsPrev[kam];
                if (c.key === "k") return <b>{kam}</b>;
                if (c.key === "rev") return <span style={{ fontWeight: 700 }}>{fUsd(ads)}</span>;
                if (c.key === "d") { const dd = ads - prev; return <DeltaBadge value={Math.round(dd)} pct={prev ? (dd / prev) * 100 : null} />; }
              }}
            />
          </Panel>
          <DetailByKam
            title="Detalle por marca · Pivot Mkt ADS"
            note="Todas las marcas con Revenue Ads > 0 esta semana (ADS_USD) · Δ vs semana anterior"
            data={m.adsByKam} open={openKam} toggle={toggle} ctx={ctx}
            columns={[
              { label: "Brand", key: "b", width: "46%" }, { label: "Revenue Ads", key: "v", align: "right" },
              { label: "Δ vs LW", key: "d", align: "right", width: "26%" },
            ]}
            render={(row, c) => {
              if (c.key === "b") return <span>{row[0]}<CampaignBadges brand={row[0]} ctx={ctx} /></span>;
              if (c.key === "v") return <span style={{ fontWeight: 600 }}>{fUsd(row[1])}</span>;
              if (c.key === "d") {
                const d = row[2], pct = row[3];
                if (d === 0) return <span style={{ color: T.flat, fontSize: 12.5 }}>—</span>;
                return <span style={{ color: d > 0 ? T.up : T.down, fontWeight: 600, fontSize: 12.5 }}>{d > 0 ? "▲ +" : "▼ "}{fUsd(Math.abs(d))}{pct != null && <span style={{ opacity: 0.8 }}> ({pct > 0 ? "+" : ""}{pct}%)</span>}{pct == null && <span style={{ opacity: 0.8 }}> (nuevo)</span>}</span>;
              }
            }}
          />
        </>
      )}

      {tab === "tarjetas" && (
        <Panel title="Tarjetas por KAM" note="Participación en Comida ($179) y Desayuno ($119)">
          <DataTable
            columns={[
              { label: "KAM", key: "k" }, { label: "Marcas", key: "m", align: "right" },
              { label: "Comida x179", key: "c", align: "right" }, { label: "% Comida", key: "cp", width: "24%" },
              { label: "Desayuno x119", key: "d", align: "right" }, { label: "% Desayuno", key: "dp", width: "24%" },
            ]}
            rows={m.tarjetas}
            renderCell={(row, c) => {
              const [kam, marcas, comida, comidaP, desayuno, desayunoP] = row;
              if (c.key === "k") return <b>{kam}</b>;
              if (c.key === "m") return fInt(marcas);
              if (c.key === "c") return fInt(comida);
              if (c.key === "cp") return <Progress value={comidaP} color={T.neon1} />;
              if (c.key === "d") return fInt(desayuno);
              if (c.key === "dp") return <Progress value={desayunoP} color={T.neon2} />;
            }}
          />
        </Panel>
      )}

      {tab === "compromisos" && (
        <Panel title="Compromisos de marcas a cargar esta semana" note="Un cuadro por KAM · multilínea · autosave · historial semanal">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
            {RAW.kams.map((kam) => (
              <div key={kam} style={{ border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, background: T.bg }}>
                <div style={{ ...kamHead, marginBottom: 8 }}>{kam}</div>
                <EditableNote module="mkt.compromisos" entityId={kam} weekId={week.id} placeholder="Marcas y campañas que este KAM se compromete a cargar…" rows={4} />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === "newtobrand" && (
        <Panel title="New to Brand por KAM" note="Marcas priorizadas · cuántas ya tienen tarjeta New to Brand · % de avance (Participación comercial)">
          <DataTable
            columns={[
              { label: "KAM", key: "k" }, { label: "Marcas priorizadas", key: "pri", align: "right" },
              { label: "Con tarjeta NtB", key: "ntb", align: "right" }, { label: "% avance", key: "adv", width: "34%" },
            ]}
            rows={m.newToBrand}
            renderCell={(row, c) => {
              const [kam, pri, ntb, adv] = row;
              if (c.key === "k") return <b>{kam}</b>;
              if (c.key === "pri") return fInt(pri);
              if (c.key === "ntb") return <span style={{ fontWeight: 600, color: T.turboInk }}>{fInt(ntb)}</span>;
              if (c.key === "adv") return <Progress value={adv} color="#4C2B8C" />;
            }}
          />
          <div style={{ marginTop: 12, fontSize: 12.5, color: T.ink3, background: T.bg, borderRadius: 8, padding: "10px 12px" }}>
            New to Brand aplica sólo a marcas <b style={{ color: "#4C2B8C" }}>priorizadas</b>. El avance es cuántas de esas marcas ya tienen tarjeta cargada.
          </div>
        </Panel>
      )}
    </div>
  );
}

function DensificationView({ week }) {
  const d = dataService.densification();
  const ctx = dataService.rulesContext();
  const totalTotal = d.perKam.reduce((a, r) => a + r[1], 0);
  const totalDone = d.perKam.reduce((a, r) => a + r[2], 0);

  return (
    <div>
      <h2 style={h2}>Densificación</h2>
      <p style={sub}>Stores a densificar del portafolio priorizado. Datos de la última semana sincronizada.</p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="Stores a densificar" value={fInt(totalTotal)} />
        <Kpi label="Stores activas" value={fInt(totalDone)} tint={T.up} />
        <Kpi label="% Avance" value={fPct0(totalDone / totalTotal)} tint={T.neon1} />
        <Kpi label="Missing stores" value={fInt(totalTotal - totalDone)} tint={T.down} />
      </div>

      <Panel title="Avance por KAM">
        <DataTable
          columns={[
            { label: "KAM", key: "k" }, { label: "Total", key: "t", align: "right" },
            { label: "Activas", key: "c", align: "right" }, { label: "Avance", key: "a", width: "40%" },
          ]}
          rows={d.perKam}
          renderCell={(row, c) => {
            if (c.key === "k") return <b>{row[0]}</b>;
            if (c.key === "t") return fInt(row[1]);
            if (c.key === "c") return fInt(row[2]);
            if (c.key === "a") return <Progress value={row[2]} max={row[1]} color={T.turboInk} />;
          }}
        />
      </Panel>

      {(() => {
        const active = d.stores.filter((s) => s[5] === "Sí");
        const missing = d.stores.filter((s) => s[5] !== "Sí");
        const storeCols = [
          { label: "Store", key: "s", width: "26%" }, { label: "Brand", key: "b" },
          { label: "Segmento", key: "seg" }, { label: "LTOR", key: "l" }, { label: "KAM", key: "k" },
        ];
        const renderStore = (row, c) => {
          const [store, brand, seg, ltor, kam] = row;
          if (c.key === "s") return <span style={{ fontSize: 12.8 }}>{store}</span>;
          if (c.key === "b") return <span style={{ fontWeight: 600 }}>{brand}<CampaignBadges brand={brand} ctx={ctx} /></span>;
          if (c.key === "seg") return <span style={{ fontSize: 12, color: T.ink2 }}>{seg}</span>;
          if (c.key === "l") return <span style={{ fontSize: 11, fontWeight: 700, color: ltor === "PRIORIZADO" ? "#4C2B8C" : T.ink3, background: ltor === "PRIORIZADO" ? "#F4F0FC" : T.bg, padding: "2px 7px", borderRadius: 5 }}>{ltor}</span>;
          if (c.key === "k") return <span style={{ fontSize: 12.5, color: T.ink2 }}>{kam}</span>;
        };
        return (
          <>
            <Panel title={`Stores activas (${active.length})`} note="Ya densificadas / cargadas" tint="#f4fbf6">
              {active.length ? <DataTable columns={storeCols} rows={active} renderCell={renderStore} /> : <Empty>Aún no hay stores activas.</Empty>}
            </Panel>
            <Panel title={`Missing stores (${missing.length})`} note="Pendientes de densificar · badge Densificación / New to Brand" tint="#fdf3f3">
              {missing.length ? <DataTable columns={storeCols} rows={missing} renderCell={renderStore} /> : <Empty>No hay stores pendientes. 🎉</Empty>}
            </Panel>
          </>
        );
      })()}
    </div>
  );
}

/* ========================================================================================
   SHELL  — sidebar + top bar (Actualizar datos, semana, última sync)
======================================================================================== */
const NAV = [
  { id: "home", label: "Home", icon: "◵" },
  { id: "performance", label: "Performance", icon: "▤" },
  { id: "turbo", label: "Turbo", icon: "⚡" },
  { id: "marketing", label: "Marketing", icon: "◈" },
  { id: "densificacion", label: "Densificación", icon: "⊞" },
];

export default function App() {
  const [route, setRoute] = useState("home");
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [weekId, setWeekId] = useState("2026-W32");
  const [tick, setTick] = useState(0);

  const doSync = useCallback(async () => {
    setSyncing(true);
    const { lastSync } = await dataService.refresh();
    setLastSync(lastSync);
    setSyncing(false);
    setReady(true);
    setTick((t) => t + 1); // fuerza re-render de vistas con nuevos datos
  }, []);

  useEffect(() => { doSync(); }, [doSync]);

  const weeks = dataService.weeks();
  const week = weeks.find((w) => w.id === weekId) || weeks[0] || { id: weekId, label: weekId };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: FONT, color: T.ink }}>
      {/* Sidebar */}
      <aside style={{ width: 224, background: "#161311", color: "#fff", padding: "22px 14px", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 8px 20px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: GRAD }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.3 }}>WBR</div>
            <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: -1 }}>{RAW.team}</div>
          </div>
        </div>
        {NAV.map((n) => {
          const active = route === n.id;
          return (
            <button key={n.id} onClick={() => setRoute(n.id)} style={{
              display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
              padding: "10px 12px", marginBottom: 3, borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 13.5, fontWeight: active ? 700 : 500, fontFamily: FONT,
              color: active ? "#fff" : "rgba(255,255,255,.62)",
              background: active ? GRAD : "transparent",
            }}>
              <span style={{ width: 16, textAlign: "center", opacity: active ? 1 : 0.8 }}>{n.icon}</span>{n.label}
            </button>
          );
        })}
        <div style={{ position: "absolute", bottom: 18, left: 14, right: 14, fontSize: 10.5, color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>
          Fuente única: Google Sheets.<br />Sin importar/exportar archivos.
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(247,244,239,.9)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.line}`, padding: "12px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontSize: 11.5, color: T.ink3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Semana</label>
            <select value={weekId} onChange={(e) => setWeekId(e.target.value)} style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: "7px 12px", fontSize: 13.5, fontFamily: FONT, fontWeight: 600, color: T.ink, background: T.card, cursor: "pointer" }}>
              {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 11.5, color: T.ink3 }}>
              Última sync: {lastSync ? lastSync.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
            </span>
            <button onClick={doSync} disabled={syncing} style={{
              border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 700, fontSize: 13,
              fontFamily: FONT, cursor: syncing ? "default" : "pointer", background: GRAD, opacity: syncing ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>⟳</span>
              {syncing ? "Actualizando…" : "Actualizar datos"}
            </button>
          </div>
        </div>

        <div style={{ padding: "26px 26px 60px", maxWidth: 1180, margin: "0 auto" }}>
          {!ready ? (
            <div style={{ padding: 80, textAlign: "center", color: T.ink3 }}>Sincronizando desde Google Sheets…</div>
          ) : (
            <div key={tick + route + weekId}>
              {route === "home" && <HomeView week={week} lastSync={lastSync} />}
              {route === "performance" && <PerformanceView week={week} />}
              {route === "turbo" && <TurboView week={week} />}
              {route === "marketing" && <MarketingView week={week} />}
              {route === "densificacion" && <DensificationView week={week} />}
            </div>
          )}
        </div>
      </main>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} *{box-sizing:border-box} button:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid ${T.neon1};outline-offset:1px}`}</style>
    </div>
  );
}

/* shared inline style tokens */
const h2 = { fontSize: 23, fontWeight: 800, margin: "0 0 2px", letterSpacing: -0.5 };
const h3 = { fontSize: 15, fontWeight: 700, margin: "24px 0 12px", color: T.ink };
const sub = { fontSize: 13.5, color: T.ink2, margin: "0 0 20px", lineHeight: 1.5 };
const kamHead = { fontSize: 13, fontWeight: 700, color: T.ink, padding: "2px 0 6px", borderBottom: `2px solid ${T.neon1}`, display: "inline-block", marginBottom: 8 };
const thc = (align) => ({ textAlign: align, padding: "9px 12px", color: T.ink3, fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${T.line}` });
const pill = (active) => ({ border: `1px solid ${active ? T.neon1 : T.line}`, background: active ? T.chipBg : T.card, color: active ? T.neon1 : T.ink2, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT });
const tabBtn = (active, color) => ({ border: `1px solid ${active ? color : T.line}`, background: active ? color : T.card, color: active ? "#fff" : T.ink2, borderRadius: 9, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT });
function Empty({ children }) { return <div style={{ padding: "24px", textAlign: "center", color: T.ink3, fontSize: 13.5, background: T.bg, borderRadius: 10 }}>{children}</div>; }
