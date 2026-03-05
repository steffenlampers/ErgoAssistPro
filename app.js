const {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo
} = React;

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
const T = {
  ink: "#1B2B34",
  inkSoft: "#3D5466",
  inkMuted: "#7B95A8",
  ocean: "#1B4D5C",
  teal: "#2A9D8F",
  tealDark: "#1E7A6E",
  tealPale: "#E0F5F1",
  amber: "#D4A853",
  amberLight: "#F5E6C0",
  amberDark: "#B8892E",
  rose: "#C45C5C",
  rosePale: "#FDEAEA",
  cream: "#FAFAF5",
  stone: "#F0EDE6",
  sand: "#E8E3D9",
  white: "#FFFFFF",
  serif: "'Source Serif 4','Georgia',serif",
  sans: "'IBM Plex Sans','Segoe UI',sans-serif",
  mono: "'IBM Plex Mono',monospace",
  sm: "0 1px 3px rgba(27,43,52,0.06)",
  r8: 8,
  r12: 12,
  r16: 16
};

// ═══════════════════════════════════════════════════════════════════════════
// OLLAMA SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class OllamaService {
  constructor(url = "http://localhost:11434") {
    this.baseUrl = url.replace(/\/$/, "");
    this.ctrls = new Map();
  }
  async check() {
    try {
      const r = await fetch(this.baseUrl + "/api/tags", {
        signal: AbortSignal.timeout(3000)
      });
      const d = await r.json();
      return {
        ok: true,
        models: (d.models || []).map(m => m.name)
      };
    } catch {
      return {
        ok: false,
        models: []
      };
    }
  }
  abort(id) {
    const c = this.ctrls.get(id);
    if (c) {
      c.abort();
      this.ctrls.delete(id);
    }
  }
  async *stream(prompt, {
    model,
    system = "",
    taskId = "x",
    temperature = 0.7
  } = {}) {
    this.abort(taskId);
    const c = new AbortController();
    this.ctrls.set(taskId, c);
    try {
      const r = await fetch(this.baseUrl + "/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          prompt,
          system,
          stream: true,
          options: {
            temperature,
            num_predict: 2048
          }
        }),
        signal: c.signal
      });
      if (!r.ok) throw new Error("Ollama " + r.status);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        buf += dec.decode(value, {
          stream: true
        });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const l of lines) {
          if (!l.trim()) continue;
          try {
            const j = JSON.parse(l);
            if (j.response) yield j.response;
            if (j.done) return;
          } catch {}
        }
      }
    } finally {
      this.ctrls.delete(taskId);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS (defaults, editable in settings)
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_PROMPTS = {
  befund_synthese: {
    label: "Befundtext-Synthese",
    text: "Du bist ein erfahrener Ergotherapeut. Formuliere aus Stichpunkten einen professionellen Befundtext, 3. Person, Praesens. NUR Befundtext. Deutsch."
  },
  anamnese_assistent: {
    label: "Anamnese-Assistent",
    text: "Du bist Ergotherapie-Dozent. Analysiere bisherige Angaben, stelle 2-3 Vertiefungsfragen. Deutsch."
  },
  befragungs_tipps: {
    label: "Befragungs-Tipps",
    text: "Gib 4-5 konkrete Fragen fuer den Therapeuten. Deutsch."
  },
  beobachtungs_tipps: {
    label: "Beobachtungs-Tipps",
    text: "Gib 4-5 Beobachtungskriterien und Tests. Deutsch."
  },
  berater_chat: {
    label: "Ergo-Berater",
    text: "Du bist ergotherapeutischer Berater. Evidenzbasierte Vorschlaege. SI, Bobath, Perfetti, CO-OP, CMOP-E, MOHO. Deutsch."
  },
  ziel_ableitung: {
    label: "Ziel-Ableitung",
    text: "Leite ab: 1.Rehaziel 2.Fernziel 3.Grobziel 4.Feinziel(SMART). Patientenzentriert, messbar. Deutsch."
  },
  ortho_interpretation: {
    label: "Ortho-Interpretation",
    text: "Du bist Ergotherapeut mit Schwerpunkt Orthopaedie. Interpretiere die Messwerte fachlich und leite Behandlungsempfehlungen ab. Deutsch."
  }
};
const MODEL_PRESETS = [{
  id: "qwen2.5:3b",
  tier: "light"
}, {
  id: "llama3.1:8b",
  tier: "medium"
}, {
  id: "mistral-small",
  tier: "heavy"
}, {
  id: "qwen2.5-coder",
  tier: "heavy"
}];

// ═══════════════════════════════════════════════════════════════════════════
// BEFUND CATEGORIES (15, with multi-select flags)
// ═══════════════════════════════════════════════════════════════════════════
const KAT = [{
  id: "erscheinung",
  t: "Persoenlicher Eindruck",
  icon: "\uD83D\uDC64",
  c: "#4A6FA5",
  items: [{
    id: "kb",
    l: "Koerperbau",
    opts: ["Altersgerecht", "Untergewichtig", "Uebergewichtig", "Schmaechtig"],
    m: false
  }, {
    id: "kl",
    l: "Kleidung",
    opts: ["Gepflegt", "Nachlaessig", "Auffaellig", "Witterung unpassend"],
    m: false
  }, {
    id: "hy",
    l: "Hygiene",
    opts: ["Unauffaellig", "Vernachlaessigt", "Starker Geruch"],
    m: false
  }, {
    id: "al",
    l: "Alter-Eindruck",
    opts: ["Entsprechend", "Juenger", "Aelter"],
    m: false
  }]
}, {
  id: "ausdruck",
  t: "Ausdrucksverhalten",
  icon: "\uD83C\uDFAD",
  c: "#7A5195",
  items: [{
    id: "mi",
    l: "Mimik",
    opts: ["Lebendig", "Starr", "Uebertrieben", "Aengstlich", "Inadaequat"],
    m: true
  }, {
    id: "ge",
    l: "Gestik",
    opts: ["Angemessen", "Sparsam", "Ausladend", "Stereotyp", "Nervoes"],
    m: true
  }, {
    id: "ha",
    l: "Haltung",
    opts: ["Aufrecht", "Gebeugt", "Steif", "Unruhig", "Asymmetrisch"],
    m: true
  }, {
    id: "bl",
    l: "Blickkontakt",
    opts: ["Angemessen", "Vermeidend", "Starr", "Fluechtig"],
    m: false
  }]
}, {
  id: "sicht_tast",
  t: "Sicht-/Tastbefund",
  icon: "\uD83D\uDD0D",
  c: "#C44536",
  items: [{
    id: "ht",
    l: "Haut",
    opts: ["Unauffaellig", "Narben", "Oedeme", "Roetungen", "Haematome"],
    m: true
  }, {
    id: "pa",
    l: "Palpation",
    opts: ["Normotonus", "Hypertonus", "Hypotonus", "Druckschmerz", "Triggerpunkte"],
    m: true
  }, {
    id: "sc",
    l: "Schmerz VAS",
    opts: ["0 Frei", "1-3 Leicht", "4-6 Maessig", "7-9 Stark", "10 Max"],
    m: false
  }, {
    id: "oe",
    l: "Schwellung",
    opts: ["Keine", "Gering", "Maessig", "Ausgepraegt"],
    m: false
  }]
}, {
  id: "funktion",
  t: "Funktionsstatus",
  icon: "\uD83D\uDCAA",
  c: "#2D6A4F",
  items: [{
    id: "ko",
    l: "Koordination",
    opts: ["Unauffaellig", "Leicht eingeschr.", "Deutlich eingeschr.", "Stark"],
    m: false
  }, {
    id: "fm",
    l: "Feinmotorik",
    opts: ["Altersgerecht", "Leicht herab", "Deutlich herab", "Stark eingeschr."],
    m: false
  }, {
    id: "hk",
    l: "Handkraft",
    opts: ["Seitengleich", "Seitendifferenz", "Beidseits herab", "Kaum"],
    m: false
  }, {
    id: "ro",
    l: "ROM",
    opts: ["Frei", "Endgradig eingeschr.", "Deutlich limitiert", "Kontraktur"],
    m: true
  }]
}, {
  id: "affektiv",
  t: "Affektiver Bereich",
  icon: "\u2764\uFE0F",
  c: "#E07A5F",
  items: [{
    id: "fr",
    l: "Frustration",
    opts: ["Angemessen", "Reizbar", "Aufgebend", "Aggressiv", "Weinerlich"],
    m: true
  }, {
    id: "im",
    l: "Impulskontrolle",
    opts: ["Ausreichend", "Gelegentl. impulsiv", "Haeufig", "Fehlend"],
    m: false
  }, {
    id: "st",
    l: "Stimmung",
    opts: ["Ausgeglichen", "Gedrueckt", "Euphorisch", "Aengstlich", "Reizbar"],
    m: true
  }, {
    id: "af",
    l: "Affekt",
    opts: ["Schwingungsfaehig", "Eingeengt", "Labil", "Parathym"],
    m: false
  }]
}, {
  id: "kognitiv",
  t: "Kognitiver Bereich",
  icon: "\uD83E\uDDE0",
  c: "#3D5A80",
  items: [{
    id: "kz",
    l: "Konzentration",
    opts: ["Ausdauernd", "Ablenkbar", "Nur kurz", "Keine"],
    m: false
  }, {
    id: "gd",
    l: "Gedaechtnis",
    opts: ["Unauffaellig", "Leicht eingeschr.", "Deutlich", "Schwer"],
    m: false
  }, {
    id: "hp",
    l: "Handlungsplanung",
    opts: ["Selbststaendig", "Braucht Hilfe", "Deutlich eingeschr.", "Unmoeglich"],
    m: false
  }, {
    id: "or",
    l: "Orientierung",
    opts: ["Voll", "Zeitlich unsicher", "Oertlich", "Situativ", "Person"],
    m: true
  }]
}, {
  id: "sozio",
  t: "Sozio-emotional",
  icon: "\uD83E\uDD1D",
  c: "#5B8C5A",
  items: [{
    id: "kv",
    l: "Kontakt",
    opts: ["Offen", "Zurueckhaltend", "Distanzlos", "Ablehnend"],
    m: true
  }, {
    id: "em",
    l: "Empathie",
    opts: ["Vorhanden", "Eingeschraenkt", "Kaum", "Fehlend"],
    m: false
  }, {
    id: "nd",
    l: "Naehe-Distanz",
    opts: ["Angemessen", "Distanziert", "Zu nah", "Wechselhaft"],
    m: false
  }, {
    id: "kr",
    l: "Kritikfaehigkeit",
    opts: ["Annehmen", "Empfindlich", "Aggressiv", "Ignoriert"],
    m: false
  }]
}, {
  id: "psychomot",
  t: "Psychomotorik",
  icon: "\u26A1",
  c: "#BC4749",
  items: [{
    id: "an",
    l: "Antrieb",
    opts: ["Normal", "Vermindert", "Gesteigert", "Wechselnd"],
    m: false
  }, {
    id: "bf",
    l: "Bewegungsfluss",
    opts: ["Harmonisch", "Abgehackt", "Verlangsamt", "Fahrig"],
    m: false
  }, {
    id: "tp",
    l: "Tempo",
    opts: ["Angemessen", "Verlangsamt", "Ueberhoet", "Wechselhaft"],
    m: false
  }, {
    id: "er",
    l: "Ermuedbarkeit",
    opts: ["Normal", "Schnell", "Kaum belastbar"],
    m: false
  }]
}, {
  id: "motorisch",
  t: "Motorischer Befund",
  icon: "\uD83C\uDFC3",
  c: "#457B9D",
  items: [{
    id: "ga",
    l: "Gang",
    opts: ["Sicher", "Unsicher", "Hinkend", "Hilfsmittel", "Nicht gehfaehig"],
    m: false
  }, {
    id: "gl",
    l: "Gleichgewicht",
    opts: ["Sicher", "Leicht unsicher", "Deutlich eingeschr.", "Nicht haltbar"],
    m: false
  }, {
    id: "mk",
    l: "Muskelkraft",
    opts: ["5 Normal", "4 Reduziert", "3 gg.Schwerkraft", "2 Ohne", "0-1 Keine"],
    m: false
  }, {
    id: "se",
    l: "Sensibilitaet",
    opts: ["Unauffaellig", "Hypaesthesie", "Hyperaesthesie", "Paraesthesien"],
    m: true
  }]
}, {
  id: "adl",
  t: "ADL",
  icon: "\uD83C\uDFE0",
  c: "#D4A853",
  items: [{
    id: "sv",
    l: "Selbstversorgung",
    opts: ["Selbststaendig", "Teilhilfe", "Ueberwiegend", "Abhaengig"],
    m: false
  }, {
    id: "hh",
    l: "Haushalt",
    opts: ["Selbststaendig", "Mit Hilfe", "Teilbereiche", "Nicht moeglich"],
    m: false
  }, {
    id: "mb",
    l: "Mobilitaet",
    opts: ["Frei", "Eingeschraenkt", "Rollstuhl", "Bettlaegerig"],
    m: false
  }, {
    id: "hm",
    l: "Hilfsmittel",
    opts: ["Keine", "Gering", "Umfangreich", "Vollversorgung"],
    m: false
  }]
}, {
  id: "verhalten",
  t: "Verhalten",
  icon: "\uD83D\uDC65",
  c: "#264653",
  items: [{
    id: "kp",
    l: "Kooperation",
    opts: ["Kooperativ", "Passiv", "Widerstaendig", "Verweigernd"],
    m: false
  }, {
    id: "gv",
    l: "Gruppe",
    opts: ["Integriert", "Aussenseiter", "Dominant", "Stoerend"],
    m: false
  }, {
    id: "ra",
    l: "Regeln",
    opts: ["Akzeptiert", "Testet", "Verstoesse", "Ignoriert"],
    m: false
  }, {
    id: "au",
    l: "Autoritaet",
    opts: ["Angemessen", "Ueberangepasst", "Oppositionell", "Vermeidend"],
    m: true
  }]
}, {
  id: "grundarbeit",
  t: "Grundarbeitsfaehigkeit",
  icon: "\u23F0",
  c: "#6D597A",
  items: [{
    id: "ad",
    l: "Ausdauer",
    opts: ["Ausreichend", "Vorzeitig ermuedend", "Nur kurz", "Nicht gegeben"],
    m: false
  }, {
    id: "so",
    l: "Sorgfalt",
    opts: ["Sorgfaeltig", "Fluechtig", "Ungenau", "Nachlaessig"],
    m: false
  }, {
    id: "pu",
    l: "Puenktlichkeit",
    opts: ["Zuverlaessig", "Gelegentl.", "Haeufig", "Unzuverlaessig"],
    m: false
  }, {
    id: "um",
    l: "Umstellung",
    opts: ["Flexibel", "Anlaufzeit", "Schwer", "Rigide"],
    m: false
  }]
}, {
  id: "beruf",
  t: "Berufsspezifisch",
  icon: "\uD83D\uDD27",
  c: "#A68A64",
  items: [{
    id: "bm",
    l: "Motor. Anf.",
    opts: ["Erfuellt", "Teilweise", "Deutlich eingeschr.", "Nicht"],
    m: false
  }, {
    id: "bk",
    l: "Kogn. Anf.",
    opts: ["Erfuellt", "Teilweise", "Deutlich eingeschr.", "Nicht"],
    m: false
  }, {
    id: "bs",
    l: "Soz. Anf.",
    opts: ["Erfuellt", "Teilweise", "Deutlich eingeschr.", "Nicht"],
    m: false
  }, {
    id: "bb",
    l: "Belastbarkeit",
    opts: ["Vollschicht", "Teilzeit", "Stundenweise", "Nicht"],
    m: false
  }]
}, {
  id: "anamnese_kat",
  t: "Eigen-/Fremdanamnese",
  icon: "\uD83D\uDCCB",
  c: "#2A9D8F",
  items: [{
    id: "ke",
    l: "Krankheitseinsicht",
    opts: ["Realistisch", "Teilweise", "Bagatellisierend", "Fehlend"],
    m: false
  }, {
    id: "ld",
    l: "Leidensdruck",
    opts: ["Angemessen", "Gering", "Uebersteigert", "Nicht erkennbar"],
    m: false
  }, {
    id: "mo",
    l: "Motivation",
    opts: ["Hoch", "Vorhanden", "Ambivalent", "Nicht"],
    m: false
  }, {
    id: "co",
    l: "Compliance",
    opts: ["Zuverlaessig", "Wechselhaft", "Gering", "Verweigernd"],
    m: false
  }]
}, {
  id: "zusammenfassung",
  t: "Zusammenfassung",
  icon: "\uD83D\uDCCA",
  c: "#E76F51",
  items: [{
    id: "sb",
    l: "Selbsteinschaetzung",
    opts: ["Realistisch", "Ueberschaetzend", "Unterschaetzend", "Ambivalent"],
    m: false
  }, {
    id: "tz",
    l: "Patientenziel",
    opts: ["Klar", "Vage", "Unrealistisch", "Nicht benennbar"],
    m: false
  }, {
    id: "pr",
    l: "Prognose",
    opts: ["Guenstig", "Verhalten guenstig", "Eingeschraenkt", "Unguenstig"],
    m: false
  }, {
    id: "te",
    l: "Empfehlung",
    opts: ["Fortfuehrung", "Intensivierung", "Reduktion", "Abschluss"],
    m: true
  }]
}];

// ═══════════════════════════════════════════════════════════════════════════
// ORTHOPAEDIC MODULE
// ═══════════════════════════════════════════════════════════════════════════
const ORTHO_JOINTS = [{
  id: "schulter",
  name: "Schulter",
  movements: [{
    id: "flex",
    name: "Flexion",
    norm: 170
  }, {
    id: "ext",
    name: "Extension",
    norm: 40
  }, {
    id: "abd",
    name: "Abduktion",
    norm: 180
  }, {
    id: "add",
    name: "Adduktion",
    norm: 40
  }, {
    id: "iro",
    name: "Innenrotation",
    norm: 70
  }, {
    id: "aro",
    name: "Aussenrotation",
    norm: 90
  }]
}, {
  id: "ellenbogen",
  name: "Ellenbogen",
  movements: [{
    id: "flex",
    name: "Flexion",
    norm: 150
  }, {
    id: "ext",
    name: "Extension",
    norm: 10
  }, {
    id: "pro",
    name: "Pronation",
    norm: 80
  }, {
    id: "sup",
    name: "Supination",
    norm: 80
  }]
}, {
  id: "handgelenk",
  name: "Handgelenk",
  movements: [{
    id: "flex",
    name: "Palmarflexion",
    norm: 80
  }, {
    id: "ext",
    name: "Dorsalextension",
    norm: 70
  }, {
    id: "rad",
    name: "Radialabduktion",
    norm: 20
  }, {
    id: "uln",
    name: "Ulnarabduktion",
    norm: 40
  }]
}, {
  id: "hueft",
  name: "Huefte",
  movements: [{
    id: "flex",
    name: "Flexion",
    norm: 130
  }, {
    id: "ext",
    name: "Extension",
    norm: 15
  }, {
    id: "abd",
    name: "Abduktion",
    norm: 45
  }, {
    id: "add",
    name: "Adduktion",
    norm: 30
  }, {
    id: "iro",
    name: "Innenrotation",
    norm: 35
  }, {
    id: "aro",
    name: "Aussenrotation",
    norm: 45
  }]
}, {
  id: "knie",
  name: "Knie",
  movements: [{
    id: "flex",
    name: "Flexion",
    norm: 140
  }, {
    id: "ext",
    name: "Extension",
    norm: 5
  }]
}, {
  id: "sprung",
  name: "Sprunggelenk",
  movements: [{
    id: "flex",
    name: "Plantarflexion",
    norm: 50
  }, {
    id: "ext",
    name: "Dorsalextension",
    norm: 20
  }, {
    id: "inv",
    name: "Inversion",
    norm: 35
  }, {
    id: "eve",
    name: "Eversion",
    norm: 20
  }]
}];
const JANDA_MUSCLES = [{
  group: "Schulter",
  muscles: ["M. deltoideus", "M. supraspinatus", "M. infraspinatus", "M. subscapularis", "M. trapezius", "M. pectoralis major"]
}, {
  group: "Ellenbogen/Unterarm",
  muscles: ["M. biceps brachii", "M. triceps brachii", "M. brachioradialis", "M. pronator teres", "M. supinator"]
}, {
  group: "Hand",
  muscles: ["Mm. lumbricales", "M. opponens pollicis", "M. abductor pollicis brevis", "Mm. interossei"]
}, {
  group: "Huefte",
  muscles: ["M. iliopsoas", "M. gluteus maximus", "M. gluteus medius", "Adduktoren"]
}, {
  group: "Knie",
  muscles: ["M. quadriceps femoris", "Mm. ischiocrurales"]
}, {
  group: "Fuss",
  muscles: ["M. tibialis anterior", "M. gastrocnemius", "Mm. peronei"]
}];

// ═══════════════════════════════════════════════════════════════════════════
// ANAMNESE SECTIONS
// ═══════════════════════════════════════════════════════════════════════════
const ANAM = [{
  id: "person",
  t: "Persoenliche Daten",
  icon: "\uD83D\uDC64",
  fields: [{
    k: "chiffre",
    l: "Chiffre",
    ph: "z.B. Herr M., 54 J.",
    req: true,
    hint: "Datenschutz!"
  }, {
    k: "alter",
    l: "Alter",
    ph: "54 Jahre"
  }, {
    k: "geschlecht",
    l: "Geschlecht",
    type: "select",
    opt: "--|M|W|Divers"
  }, {
    k: "familienstand",
    l: "Familienstand",
    type: "select",
    opt: "--|Ledig|Verheiratet|Geschieden|Verwitwet"
  }, {
    k: "nationalitaet",
    l: "Nationalitaet",
    ph: "Deutsch"
  }]
}, {
  id: "sozial",
  t: "Sozialanamnese",
  icon: "\uD83C\uDFE0",
  fields: [{
    k: "wohnsituation",
    l: "Wohnsituation",
    ph: "Alleinlebend, WG...",
    rows: 2
  }, {
    k: "soziales_umfeld",
    l: "Soziales Umfeld",
    ph: "Familie, Freunde...",
    rows: 2
  }, {
    k: "freizeit",
    l: "Freizeit",
    ph: "Hobbys, Aktivitaeten...",
    rows: 2
  }]
}, {
  id: "beruf",
  t: "Berufsanamnese",
  icon: "\uD83D\uDCBC",
  fields: [{
    k: "erlernter_beruf",
    l: "Erlernter Beruf",
    ph: "z.B. Schreiner"
  }, {
    k: "letzte_taetigkeit",
    l: "Letzte Taetigkeit",
    ph: "z.B. Lagerarbeiter"
  }, {
    k: "arbeitsstatus",
    l: "Status",
    type: "select",
    opt: "--|Berufstaetig|Arbeitslos|Krankgeschrieben|Berentet"
  }, {
    k: "beruf_besonderheiten",
    l: "Besonderheiten",
    ph: "Konflikte, Mobbing...",
    rows: 2
  }]
}, {
  id: "diagnose",
  t: "Diagnosen",
  icon: "\uD83C\uDFE5",
  fields: [{
    k: "hauptdiagnose",
    l: "Hauptdiagnose (ICD-10)",
    ph: "z.B. F33.1",
    req: true
  }, {
    k: "nebendiagnosen",
    l: "Nebendiagnosen",
    ph: "Weitere ICD-10...",
    rows: 2
  }, {
    k: "krankheitsverlauf",
    l: "Verlauf",
    ph: "Erstmanifestation, Ausloser...",
    rows: 3
  }]
}, {
  id: "therapie",
  t: "Bisherige Therapien",
  icon: "\uD83D\uDC8A",
  fields: [{
    k: "bisherige_therapien",
    l: "Therapien",
    ph: "Psychiatrie, Psychotherapie...",
    rows: 3
  }, {
    k: "medikamente",
    l: "Medikation",
    ph: "Name, Dosis - eine pro Zeile",
    rows: 3
  }]
}];

// ═══════════════════════════════════════════════════════════════════════════
// SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════
function calcScores(selections) {
  const scores = {};
  KAT.forEach(kat => {
    const sels = selections?.[kat.id];
    if (!sels) {
      scores[kat.id] = 0;
      return;
    }
    let total = kat.items.length,
      auff = 0;
    sels.forEach((val, idx) => {
      const mx = kat.items[idx].opts.length - 1;
      if (mx === 0) return;
      if (Array.isArray(val)) {
        auff += val.filter(v => v !== 0).length / mx;
      } else {
        auff += val / mx;
      }
    });
    scores[kat.id] = Math.round(auff / total * 100);
  });
  return scores;
}
function getRadarData(befunde) {
  return KAT.map(kat => {
    const entry = {
      name: kat.t.substring(0, 12),
      fullName: kat.t
    };
    befunde.forEach((bf, i) => {
      const scores = calcScores(bf.selections);
      entry["befund" + i] = scores[kat.id] || 0;
    });
    return entry;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
const Btn = ({
  children,
  onClick,
  v = "primary",
  disabled,
  small,
  style: s = {}
}) => {
  const base = {
    fontFamily: T.sans,
    fontWeight: 600,
    fontSize: small ? 12 : 13,
    cursor: disabled ? "default" : "pointer",
    borderRadius: T.r8,
    transition: "all 0.15s",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: small ? "6px 12px" : "9px 18px",
    opacity: disabled ? 0.5 : 1
  };
  const vs = {
    primary: {
      background: "linear-gradient(135deg," + T.teal + "," + T.tealDark + ")",
      color: T.white
    },
    secondary: {
      background: T.white,
      color: T.inkSoft,
      border: "1.5px solid " + T.sand
    },
    amber: {
      background: "linear-gradient(135deg," + T.amber + "," + T.amberDark + ")",
      color: T.white
    },
    danger: {
      background: T.rosePale,
      color: T.rose,
      border: "1.5px solid " + T.rose + "40"
    },
    ghost: {
      background: "transparent",
      color: T.inkMuted
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    disabled: disabled,
    style: {
      ...base,
      ...(vs[v] || vs.primary),
      ...s
    }
  }, children);
};
const Card = ({
  children,
  style: s
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    background: T.white,
    borderRadius: T.r16,
    padding: 22,
    border: "1px solid " + T.sand,
    boxShadow: T.sm,
    ...s
  }
}, children);
const Field = ({
  label,
  value,
  onChange,
  ph,
  type,
  rows,
  req,
  hint,
  opt
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    marginBottom: 12
  }
}, /*#__PURE__*/React.createElement("label", {
  style: {
    display: "block",
    marginBottom: 5
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: 12,
    fontWeight: 600,
    color: T.inkSoft
  }
}, label, req && /*#__PURE__*/React.createElement("span", {
  style: {
    color: T.rose
  }
}, " *")), hint && /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: 11,
    color: T.inkMuted,
    marginLeft: 6
  }
}, "(", hint, ")")), rows ? /*#__PURE__*/React.createElement("textarea", {
  value: value || "",
  onChange: e => onChange(e.target.value),
  placeholder: ph,
  rows: rows,
  style: {
    width: "100%",
    padding: "9px 13px",
    borderRadius: T.r8,
    border: "1.5px solid " + T.sand,
    fontSize: 13,
    fontFamily: T.sans,
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
    background: T.cream,
    lineHeight: 1.6
  }
}) : type === "select" && opt ? /*#__PURE__*/React.createElement("select", {
  value: value || "",
  onChange: e => onChange(e.target.value),
  style: {
    width: "100%",
    padding: "9px 13px",
    borderRadius: T.r8,
    border: "1.5px solid " + T.sand,
    fontSize: 13,
    fontFamily: T.sans,
    background: T.cream,
    outline: "none",
    boxSizing: "border-box"
  }
}, opt.split("|").map(o => /*#__PURE__*/React.createElement("option", {
  key: o,
  value: o
}, o))) : /*#__PURE__*/React.createElement("input", {
  type: type || "text",
  value: value || "",
  onChange: e => onChange(e.target.value),
  placeholder: ph,
  style: {
    width: "100%",
    padding: "9px 13px",
    borderRadius: T.r8,
    border: "1.5px solid " + T.sand,
    fontSize: 13,
    fontFamily: T.sans,
    outline: "none",
    boxSizing: "border-box",
    background: T.cream
  }
}));
const Badge = ({
  n
}) => n ? /*#__PURE__*/React.createElement("span", {
  style: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: T.rose,
    color: T.white,
    fontSize: 10,
    fontWeight: 700,
    padding: "0 5px"
  }
}, n) : null;
const Pill = ({
  label,
  selected,
  isNormal,
  onClick
}) => /*#__PURE__*/React.createElement("button", {
  onClick: onClick,
  style: {
    padding: "7px 14px",
    borderRadius: T.r8,
    border: selected ? "2px solid " + (isNormal ? T.teal : T.rose) : "1.5px solid " + T.sand,
    background: selected ? isNormal ? T.tealPale : T.rosePale : T.white,
    color: selected ? isNormal ? T.tealDark : T.rose : T.inkSoft,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: T.sans,
    fontWeight: selected ? 600 : 400,
    marginRight: 4,
    marginBottom: 4,
    whiteSpace: "nowrap"
  }
}, selected && (isNormal ? "\u2713 " : "\u26A0 "), label);
const StreamBox = ({
  text,
  loading,
  ph
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    background: T.cream,
    border: "1.5px solid " + T.sand,
    borderRadius: T.r12,
    padding: 16,
    fontSize: 13,
    lineHeight: 1.7,
    color: T.ink,
    minHeight: 52,
    whiteSpace: "pre-wrap"
  }
}, text || (loading ? "" : /*#__PURE__*/React.createElement("span", {
  style: {
    color: T.inkMuted,
    fontStyle: "italic"
  }
}, ph || "KI-Text erscheint hier...")), loading && /*#__PURE__*/React.createElement("span", {
  style: {
    animation: "blink 1s infinite",
    color: T.teal,
    fontWeight: 700
  }
}, "\u2588"));

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT LIST
// ═══════════════════════════════════════════════════════════════════════════
function PatientList({
  storage,
  onSelect,
  onCreate
}) {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);
  useEffect(() => {
    setPatients(storage.getPatientList());
  }, []);
  const refresh = () => setPatients(storage.getPatientList());
  const filtered = patients.filter(p => p.chiffre.toLowerCase().includes(search.toLowerCase()) || p.hauptdiagnose.toLowerCase().includes(search.toLowerCase()));
  const handleImport = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const res = storage.importAll(ev.target.result);
      if (res.success) {
        refresh();
        alert("Import: " + res.count + " Patienten");
      } else alert("Fehler: " + res.error);
    };
    reader.readAsText(file);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 32,
      maxWidth: 780,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 24,
      color: T.ink,
      margin: 0
    }
  }, "\uD83D\uDCC1", " Patientenakten"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    small: true,
    onClick: () => storage.exportAll()
  }, "\uD83D\uDCE4", " Backup"), /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    small: true,
    onClick: () => fileRef.current?.click()
  }, "\uD83D\uDCE5", " Import"), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".json",
    onChange: handleImport,
    style: {
      display: "none"
    }
  }), /*#__PURE__*/React.createElement(Btn, {
    onClick: onCreate
  }, "\u2795", " Neue Akte"))), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Suche nach Chiffre oder Diagnose...",
    style: {
      width: "100%",
      padding: "11px 16px",
      borderRadius: T.r12,
      border: "1.5px solid " + T.sand,
      fontSize: 14,
      fontFamily: T.sans,
      outline: "none",
      background: T.white,
      marginBottom: 16
    }
  }), filtered.length === 0 ? /*#__PURE__*/React.createElement(Card, {
    style: {
      textAlign: "center",
      padding: 48
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 48,
      marginBottom: 12
    }
  }, "\uD83D\uDCC2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: T.serif,
      fontSize: 18,
      color: T.ink,
      marginBottom: 8
    }
  }, patients.length === 0 ? "Noch keine Patienten angelegt" : "Keine Treffer"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: T.inkMuted,
      marginBottom: 16
    }
  }, patients.length === 0 ? "Erstelle eine neue Patientenakte um zu beginnen." : "Passe den Suchbegriff an."), patients.length === 0 && /*#__PURE__*/React.createElement(Btn, {
    onClick: onCreate
  }, "\u2795", " Erste Akte erstellen")) : filtered.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.id,
    style: {
      marginBottom: 10,
      cursor: "pointer",
      transition: "all 0.15s"
    },
    onClick: () => onSelect(p.id)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: T.ink
    }
  }, p.chiffre), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      marginTop: 2
    }
  }, p.hauptdiagnose || "Keine Diagnose")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.inkSoft
    }
  }, p.befundCount, " Befund", p.befundCount !== 1 ? "e" : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.inkMuted
    }
  }, p.letzterBefund ? new Date(p.letzterBefund).toLocaleDateString("de-DE") : "Kein Befund"))))));
}

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT DASHBOARD (Radar Chart + History)
// ═══════════════════════════════════════════════════════════════════════════
function PatientDashboard({
  patient,
  storage,
  onStartBefund,
  onBack
}) {
  const {
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    Legend,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid
  } = window.Recharts || {};
  const befunde = patient.befunde || [];
  const latestScores = befunde.length > 0 ? calcScores(befunde[befunde.length - 1].selections) : null;
  const radarData = getRadarData(befunde.slice(-3)); // Last 3 befunde

  const COLORS = [T.teal, T.amber, T.rose];

  // Timeline data
  const timelineData = befunde.map((bf, i) => {
    const scores = calcScores(bf.selections);
    const avg = Object.values(scores).reduce((s, v) => s + v, 0) / KAT.length;
    return {
      name: new Date(bf.datum).toLocaleDateString("de-DE"),
      avg: Math.round(avg),
      typ: bf.typ,
      idx: i
    };
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 28,
      overflowY: "auto",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 900,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    v: "ghost",
    small: true,
    onClick: onBack
  }, "\u2190"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 22,
      color: T.ink,
      margin: 0
    }
  }, patient.anamnese?.chiffre || "Neue Akte"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      margin: "2px 0 0"
    }
  }, patient.anamnese?.hauptdiagnose || "Keine Diagnose", " | ", befunde.length, " Befund(e)"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    small: true,
    onClick: onStartBefund
  }, befunde.length === 0 ? "\uD83D\uDD0D Erstbefund" : "\uD83D\uDD04 Neuer Befund"), /*#__PURE__*/React.createElement(Btn, {
    small: true,
    onClick: onStartBefund
  }, "\uD83D\uDCCB Assistent starten"))), befunde.length > 0 && RadarChart && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      marginBottom: 20,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      flex: "1 1 420px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean,
      marginBottom: 8
    }
  }, "\uD83D\uDD78\uFE0F", " Befund-Radar"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 300
  }, /*#__PURE__*/React.createElement(RadarChart, {
    data: radarData
  }, /*#__PURE__*/React.createElement(PolarGrid, {
    stroke: T.sand
  }), /*#__PURE__*/React.createElement(PolarAngleAxis, {
    dataKey: "name",
    tick: {
      fontSize: 10,
      fill: T.inkMuted
    }
  }), /*#__PURE__*/React.createElement(PolarRadiusAxis, {
    angle: 30,
    domain: [0, 100],
    tick: {
      fontSize: 9
    }
  }), befunde.slice(-3).map((bf, i) => /*#__PURE__*/React.createElement(Radar, {
    key: i,
    name: new Date(bf.datum).toLocaleDateString("de-DE"),
    dataKey: "befund" + i,
    stroke: COLORS[i],
    fill: COLORS[i],
    fillOpacity: 0.15,
    strokeWidth: 2
  })), /*#__PURE__*/React.createElement(Legend, {
    wrapperStyle: {
      fontSize: 11
    }
  }), /*#__PURE__*/React.createElement(Tooltip, null))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.inkMuted,
      textAlign: "center"
    }
  }, "0 = Normalbefund | 100 = maximale Auffaelligkeit")), befunde.length > 1 && /*#__PURE__*/React.createElement(Card, {
    style: {
      flex: "1 1 320px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean,
      marginBottom: 8
    }
  }, "\uD83D\uDCC8", " Verlauf"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 300
  }, /*#__PURE__*/React.createElement(LineChart, {
    data: timelineData
  }, /*#__PURE__*/React.createElement(CartesianGrid, {
    strokeDasharray: "3 3",
    stroke: T.sand
  }), /*#__PURE__*/React.createElement(XAxis, {
    dataKey: "name",
    tick: {
      fontSize: 10
    }
  }), /*#__PURE__*/React.createElement(YAxis, {
    domain: [0, 100],
    tick: {
      fontSize: 10
    }
  }), /*#__PURE__*/React.createElement(Tooltip, null), /*#__PURE__*/React.createElement(Line, {
    type: "monotone",
    dataKey: "avg",
    stroke: T.teal,
    strokeWidth: 3,
    dot: {
      r: 6,
      fill: T.teal
    },
    name: "Score (Durchschnitt)"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.inkMuted,
      textAlign: "center"
    }
  }, "Abwaertstrend = Verbesserung"))), latestScores && /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean,
      marginBottom: 12
    }
  }, "\uD83D\uDCCA", " Aktueller Befund - Detailwerte"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: 8
    }
  }, KAT.map(kat => {
    const score = latestScores[kat.id] || 0;
    const color = score === 0 ? T.teal : score < 30 ? T.amber : T.rose;
    return /*#__PURE__*/React.createElement("div", {
      key: kat.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14
      }
    }, kat.icon), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: T.inkSoft,
        marginBottom: 2
      }
    }, kat.t), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 6,
        background: T.stone,
        borderRadius: 3,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: score + "%",
        background: color,
        borderRadius: 3,
        transition: "width 0.5s"
      }
    }))), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color,
        minWidth: 30,
        textAlign: "right"
      }
    }, score, "%"));
  }))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean,
      marginBottom: 12
    }
  }, "\uD83D\uDCC5", " Befund-Historie"), befunde.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: 24,
      color: T.inkMuted
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 8
    }
  }, "\uD83D\uDD0D"), "Noch kein Befund erfasst. Starte den Assistenten um den Erstbefund zu erheben.") : befunde.map((bf, i) => {
    const scores = calcScores(bf.selections);
    const avg = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / KAT.length);
    const prev = i > 0 ? Math.round(Object.values(calcScores(befunde[i - 1].selections)).reduce((s, v) => s + v, 0) / KAT.length) : null;
    const diff = prev !== null ? avg - prev : null;
    return /*#__PURE__*/React.createElement("div", {
      key: bf.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 0",
        borderBottom: i < befunde.length - 1 ? "1px solid " + T.stone : "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 42,
        height: 42,
        borderRadius: 12,
        background: i === befunde.length - 1 ? T.tealPale : T.stone,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        flexShrink: 0
      }
    }, bf.typ === "Erstbefund" ? "\uD83D\uDCCB" : "\uD83D\uDD04"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 600,
        color: T.ink
      }
    }, bf.typ), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: T.inkMuted
      }
    }, new Date(bf.datum).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: avg < 20 ? T.teal : avg < 50 ? T.amber : T.rose
      }
    }, avg, "%"), diff !== null && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: diff < 0 ? T.teal : diff > 0 ? T.rose : T.inkMuted
      }
    }, diff < 0 ? "\u2193" + Math.abs(diff) + "% besser" : diff > 0 ? "\u2191" + diff + "% schlechter" : "\u2194 stabil")));
  }))));
}

// ═══════════════════════════════════════════════════════════════════════════
// ORTHO MODULE
// ═══════════════════════════════════════════════════════════════════════════
function OrthoModule({
  data,
  setData,
  ollama,
  conn,
  getModel,
  prompts
}) {
  const [activeJoint, setActiveJoint] = useState(0);
  const [activeTab, setActiveTab] = useState("rom"); // rom | janda | kraft
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const rom = data.ortho_rom || {};
  const janda = data.ortho_janda || {};
  const kraft = data.ortho_kraft || {};
  const setRom = (jointId, movId, side, val) => {
    const key = jointId + "_" + movId + "_" + side;
    setData(prev => ({
      ...prev,
      ortho_rom: {
        ...prev.ortho_rom,
        [key]: val
      }
    }));
  };
  const setJanda = (muscleKey, side, val) => {
    const key = muscleKey + "_" + side;
    setData(prev => ({
      ...prev,
      ortho_janda: {
        ...prev.ortho_janda,
        [key]: val
      }
    }));
  };
  const setKraft = (key, val) => {
    setData(prev => ({
      ...prev,
      ortho_kraft: {
        ...prev.ortho_kraft,
        [key]: val
      }
    }));
  };
  const genInterpretation = async () => {
    if (!conn.ok) return;
    setAiLoading(true);
    setAiText("");
    // Build summary of all ROM data
    let summary = "Orthopaedie-Befund:\n\n";
    ORTHO_JOINTS.forEach(j => {
      const entries = j.movements.map(m => {
        const l = rom[j.id + "_" + m.id + "_L"] || "-";
        const r = rom[j.id + "_" + m.id + "_R"] || "-";
        if (l === "-" && r === "-") return null;
        return m.name + ": L=" + l + " R=" + r + " (Norm: " + m.norm + ")";
      }).filter(Boolean);
      if (entries.length) summary += j.name + ":\n" + entries.join("\n") + "\n\n";
    });
    summary += "Griffstaerke: L=" + (kraft.grip_L || "-") + "kg R=" + (kraft.grip_R || "-") + "kg\n";
    summary += "Spitzgriff: L=" + (kraft.pinch_L || "-") + "kg R=" + (kraft.pinch_R || "-") + "kg\n";
    const prompt = summary + "\nInterpretiere die Werte und leite Behandlungsempfehlungen ab.";
    try {
      for await (const c of ollama.current.stream(prompt, {
        model: getModel("befund_text"),
        system: prompts.ortho_interpretation?.text || DEFAULT_PROMPTS.ortho_interpretation.text,
        taskId: "ortho",
        temperature: 0.5
      })) {
        setAiText(prev => prev + c);
      }
    } catch (e) {
      if (e.name !== "AbortError") setAiText("Fehler: " + e.message);
    }
    setAiLoading(false);
  };
  const joint = ORTHO_JOINTS[activeJoint];
  const inputStyle = {
    width: 60,
    padding: "5px 8px",
    borderRadius: T.r8,
    border: "1.5px solid " + T.sand,
    fontSize: 13,
    fontFamily: T.mono,
    textAlign: "center",
    outline: "none",
    background: T.cream
  };
  const thStyle = {
    padding: "8px 10px",
    textAlign: "left",
    background: T.stone,
    borderBottom: "2px solid " + T.sand,
    fontSize: 11,
    fontWeight: 700,
    color: T.inkSoft,
    textTransform: "uppercase"
  };
  const tdStyle = {
    padding: "6px 10px",
    borderBottom: "1px solid " + T.stone,
    fontSize: 13
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 28,
      overflowY: "auto",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 860,
      margin: "0 auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: T.r16,
      background: "#E8F0F5",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 28
    }
  }, "\uD83E\uDDB4"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 22,
      color: T.ink,
      margin: 0
    }
  }, "Orthopaedie-Modul"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: T.inkMuted,
      margin: "2px 0 0"
    }
  }, "ROM, Muskelfunktion (Janda), Griffstaerke"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      marginBottom: 16,
      background: T.stone,
      padding: 4,
      borderRadius: T.r12
    }
  }, [{
    id: "rom",
    label: "\uD83D\uDD04 ROM (Bewegungsumfang)"
  }, {
    id: "janda",
    label: "\uD83D\uDCAA Muskelfunktion (Janda)"
  }, {
    id: "kraft",
    label: "\uD83E\uDD1C Griffstaerke"
  }].map(tab => /*#__PURE__*/React.createElement("button", {
    key: tab.id,
    onClick: () => setActiveTab(tab.id),
    style: {
      flex: 1,
      padding: "10px 14px",
      borderRadius: T.r8,
      border: "none",
      background: activeTab === tab.id ? T.white : "transparent",
      color: activeTab === tab.id ? T.ocean : T.inkMuted,
      fontWeight: activeTab === tab.id ? 600 : 400,
      fontSize: 13,
      fontFamily: T.sans,
      cursor: "pointer",
      boxShadow: activeTab === tab.id ? T.sm : "none"
    }
  }, tab.label))), activeTab === "rom" && /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, ORTHO_JOINTS.map((j, i) => /*#__PURE__*/React.createElement("button", {
    key: j.id,
    onClick: () => setActiveJoint(i),
    style: {
      padding: "6px 14px",
      borderRadius: T.r8,
      border: activeJoint === i ? "2px solid " + T.ocean : "1.5px solid " + T.sand,
      background: activeJoint === i ? T.ocean : T.white,
      color: activeJoint === i ? T.white : T.inkSoft,
      fontSize: 12,
      fontFamily: T.sans,
      fontWeight: activeJoint === i ? 600 : 400,
      cursor: "pointer"
    }
  }, j.name))), /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: thStyle
  }, "Bewegung"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...thStyle,
      textAlign: "center"
    }
  }, "Links"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...thStyle,
      textAlign: "center"
    }
  }, "Rechts"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...thStyle,
      textAlign: "center"
    }
  }, "Norm"), /*#__PURE__*/React.createElement("th", {
    style: thStyle
  }, "Status"))), /*#__PURE__*/React.createElement("tbody", null, joint.movements.map(mov => {
    const lVal = parseInt(rom[joint.id + "_" + mov.id + "_L"]) || 0;
    const rVal = parseInt(rom[joint.id + "_" + mov.id + "_R"]) || 0;
    const lPct = lVal / mov.norm * 100;
    const rPct = rVal / mov.norm * 100;
    const getColor = pct => pct >= 90 ? T.teal : pct >= 70 ? T.amber : T.rose;
    return /*#__PURE__*/React.createElement("tr", {
      key: mov.id
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        ...tdStyle,
        fontWeight: 500
      }
    }, mov.name), /*#__PURE__*/React.createElement("td", {
      style: {
        ...tdStyle,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: rom[joint.id + "_" + mov.id + "_L"] || "",
      onChange: e => setRom(joint.id, mov.id, "L", e.target.value),
      style: {
        ...inputStyle,
        borderColor: lVal > 0 ? getColor(lPct) : T.sand
      },
      placeholder: "-"
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        ...tdStyle,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: rom[joint.id + "_" + mov.id + "_R"] || "",
      onChange: e => setRom(joint.id, mov.id, "R", e.target.value),
      style: {
        ...inputStyle,
        borderColor: rVal > 0 ? getColor(rPct) : T.sand
      },
      placeholder: "-"
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        ...tdStyle,
        textAlign: "center",
        color: T.inkMuted,
        fontFamily: T.mono
      }
    }, mov.norm, "\u00B0"), /*#__PURE__*/React.createElement("td", {
      style: tdStyle
    }, (lVal > 0 || rVal > 0) && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 4
      }
    }, lVal > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 4,
        background: getColor(lPct) + "20",
        color: getColor(lPct),
        fontWeight: 600
      }
    }, "L: ", Math.round(lPct), "%"), rVal > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 4,
        background: getColor(rPct) + "20",
        color: getColor(rPct),
        fontWeight: 600
      }
    }, "R: ", Math.round(rPct), "%"))));
  })))), activeTab === "janda" && /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      marginBottom: 12
    }
  }, "Muskelfunktionstestung nach Janda: 0 = keine Aktivitaet | 5 = volle Kraft gegen Widerstand"), JANDA_MUSCLES.map(group => /*#__PURE__*/React.createElement("div", {
    key: group.group,
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: T.ocean,
      marginBottom: 8
    }
  }, group.group), /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: thStyle
  }, "Muskel"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...thStyle,
      textAlign: "center",
      width: 80
    }
  }, "Links"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...thStyle,
      textAlign: "center",
      width: 80
    }
  }, "Rechts"))), /*#__PURE__*/React.createElement("tbody", null, group.muscles.map(muscle => {
    const key = muscle.replace(/\s/g, "_").replace(/\./g, "");
    return /*#__PURE__*/React.createElement("tr", {
      key: key
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        ...tdStyle,
        fontSize: 12
      }
    }, muscle), ["L", "R"].map(side => /*#__PURE__*/React.createElement("td", {
      key: side,
      style: {
        ...tdStyle,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("select", {
      value: janda[key + "_" + side] || "",
      onChange: e => setJanda(key, side, e.target.value),
      style: {
        width: 50,
        padding: "4px 2px",
        borderRadius: 4,
        border: "1px solid " + T.sand,
        fontSize: 13,
        fontFamily: T.mono,
        textAlign: "center",
        background: T.cream
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "-"), [0, 1, 2, 3, 4, 5].map(v => /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, v))))));
  })))))), activeTab === "kraft" && /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean,
      marginBottom: 16
    }
  }, "Griffstaerke-Messung (Dynamometer)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      marginBottom: 20
    }
  }, [{
    id: "grip",
    label: "Grobgriff (kg)",
    icon: "\u270A"
  }, {
    id: "pinch",
    label: "Spitzgriff (kg)",
    icon: "\uD83E\uDD0F"
  }, {
    id: "lateral",
    label: "Schluesselgriff (kg)",
    icon: "\uD83D\uDD11"
  }, {
    id: "three_jaw",
    label: "3-Punkt-Griff (kg)",
    icon: "\u270B"
  }].map(test => /*#__PURE__*/React.createElement("div", {
    key: test.id,
    style: {
      background: T.cream,
      borderRadius: T.r12,
      padding: 16,
      border: "1px solid " + T.sand
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: T.ink,
      marginBottom: 10
    }
  }, test.icon, " ", test.label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, ["L", "R"].map(side => /*#__PURE__*/React.createElement("div", {
    key: side,
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.inkMuted,
      marginBottom: 4
    }
  }, side === "L" ? "Links" : "Rechts"), /*#__PURE__*/React.createElement("input", {
    value: kraft[test.id + "_" + side] || "",
    onChange: e => setKraft(test.id + "_" + side, e.target.value),
    placeholder: "0.0",
    style: {
      ...inputStyle,
      width: "100%"
    }
  }))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      padding: 12,
      background: T.stone,
      borderRadius: T.r8
    }
  }, /*#__PURE__*/React.createElement("strong", null, "Normwerte Grobgriff:"), " Maenner ca. 40-50 kg | Frauen ca. 25-35 kg (dominante Hand ca. 10% staerker)")), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginTop: 16,
      borderColor: T.teal + "30"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean
    }
  }, "\uD83E\uDD16", " KI-Interpretation"), /*#__PURE__*/React.createElement(Btn, {
    small: true,
    onClick: genInterpretation,
    disabled: aiLoading || !conn.ok
  }, aiLoading ? "Analysiere..." : "\uD83E\uDD16 Werte interpretieren (" + getModel("befund_text") + ")")), /*#__PURE__*/React.createElement(StreamBox, {
    text: aiText,
    loading: aiLoading,
    ph: "Die KI analysiert ROM-Werte, Muskelfunktion und Griffstaerke..."
  }))));
}

// ═══════════════════════════════════════════════════════════════════════════
// GUIDED ASSISTANT (simplified for space — same concept as v3)
// ═══════════════════════════════════════════════════════════════════════════
function GuidedAssistant({
  data,
  setData,
  selections,
  setSelections,
  aiTexts,
  setAiTexts,
  notes,
  setNotes,
  ollama,
  conn,
  getModel,
  prompts,
  onFinish
}) {
  const [phase, setPhase] = useState("anamnese");
  const [anamStep, setAnamStep] = useState(0);
  const [befundKat, setBefundKat] = useState(0);
  const [aiLoading, setAiLoading] = useState({});
  const [tippsType, setTippsType] = useState(null);
  const [aiTipps, setAiTipps] = useState({});
  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [phase, anamStep, befundKat]);
  const u = key => val => setData(p => ({
    ...p,
    [key]: val
  }));
  const kat = KAT[befundKat];
  const handleSelect = (katId, iIdx, oIdx) => {
    const item = KAT.find(k => k.id === katId).items[iIdx];
    setSelections(prev => {
      const up = {
        ...prev
      };
      const arr = [...up[katId]];
      if (item.m) {
        let cur = Array.isArray(arr[iIdx]) ? [...arr[iIdx]] : [arr[iIdx]];
        if (oIdx === 0) cur = [0];else {
          cur = cur.filter(v => v !== 0);
          const idx = cur.indexOf(oIdx);
          if (idx >= 0) cur.splice(idx, 1);else cur.push(oIdx);
          if (!cur.length) cur = [0];
        }
        arr[iIdx] = cur;
      } else arr[iIdx] = oIdx;
      up[katId] = arr;
      return up;
    });
  };
  const isSel = (katId, iIdx, oIdx) => {
    const v = selections[katId]?.[iIdx];
    return Array.isArray(v) ? v.includes(oIdx) : v === oIdx;
  };
  const isAuff = (katId, iIdx) => {
    const v = selections[katId]?.[iIdx];
    return Array.isArray(v) ? !(v.length === 1 && v[0] === 0) : v !== 0;
  };
  const auffCount = kid => (selections[kid] || []).filter((v, i) => isAuff(kid, i)).length;
  const genBefundText = async kid => {
    if (!conn.ok) return;
    const k = KAT.find(x => x.id === kid);
    const sels = selections[kid];
    setAiLoading(p => ({
      ...p,
      [kid]: true
    }));
    setAiTexts(p => ({
      ...p,
      [kid]: ""
    }));
    const items = k.items.map((it, i) => {
      const val = sels[i];
      const sel = Array.isArray(val) ? val.map(v => it.opts[v]).join(", ") : it.opts[val];
      const isN = Array.isArray(val) ? val.length === 1 && val[0] === 0 : val === 0;
      return "- " + it.l + ": " + sel + (isN ? " (Normal)" : " (AUFFAELLIG)") + (notes[kid + "_" + i] ? " Anm: " + notes[kid + "_" + i] : "");
    }).join("\n");
    try {
      for await (const c of ollama.current.stream("Kategorie: " + k.t + "\n\n" + items + "\n\nBefundtext:", {
        model: getModel("befund_text"),
        system: prompts.befund_synthese.text,
        taskId: "bf-" + kid,
        temperature: 0.5
      })) {
        setAiTexts(p => ({
          ...p,
          [kid]: (p[kid] || "") + c
        }));
      }
    } catch (e) {
      if (e.name !== "AbortError") setAiTexts(p => ({
        ...p,
        [kid]: "Fehler: " + e.message
      }));
    }
    setAiLoading(p => ({
      ...p,
      [kid]: false
    }));
  };
  const totalAuff = KAT.reduce((s, k) => s + auffCount(k.id), 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "100%",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 220,
      minWidth: 220,
      background: T.white,
      borderRight: "1px solid " + T.sand,
      overflowY: "auto",
      padding: "12px 0",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 12px 10px",
      borderBottom: "1px solid " + T.stone
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 2,
      color: T.inkMuted,
      textTransform: "uppercase"
    }
  }, "Assistent"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: T.stone,
      borderRadius: 2,
      marginTop: 6,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: (phase === "anamnese" ? anamStep : phase === "befund" ? ANAM.length + befundKat : ANAM.length + KAT.length) / (ANAM.length + KAT.length) * 100 + "%",
      background: "linear-gradient(90deg," + T.teal + "," + T.amber + ")",
      borderRadius: 2,
      transition: "width 0.3s"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6px 8px 2px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1,
      color: phase === "anamnese" ? T.teal : T.inkMuted
    }
  }, "ANAMNESE"), ANAM.map((sec, i) => /*#__PURE__*/React.createElement("button", {
    key: sec.id,
    onClick: () => {
      setPhase("anamnese");
      setAnamStep(i);
    },
    style: {
      width: "100%",
      padding: "7px 12px",
      border: "none",
      background: phase === "anamnese" && anamStep === i ? T.tealPale : "transparent",
      borderLeft: phase === "anamnese" && anamStep === i ? "3px solid " + T.teal : "3px solid transparent",
      cursor: "pointer",
      textAlign: "left",
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      color: T.inkSoft,
      fontFamily: T.sans
    }
  }, /*#__PURE__*/React.createElement("span", null, sec.icon), " ", sec.t)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 8px 2px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1,
      color: phase === "befund" ? T.amber : T.inkMuted
    }
  }, "BEFUNDUNG"), KAT.map((k, i) => /*#__PURE__*/React.createElement("button", {
    key: k.id,
    onClick: () => {
      setPhase("befund");
      setBefundKat(i);
    },
    style: {
      width: "100%",
      padding: "5px 12px",
      border: "none",
      background: phase === "befund" && befundKat === i ? k.c + "0D" : "transparent",
      borderLeft: phase === "befund" && befundKat === i ? "3px solid " + k.c : "3px solid transparent",
      cursor: "pointer",
      textAlign: "left",
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      color: T.inkSoft,
      fontFamily: T.sans
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, k.icon), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, k.t), /*#__PURE__*/React.createElement(Badge, {
    n: auffCount(k.id)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 8px"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setPhase("review"),
    style: {
      width: "100%",
      padding: "10px",
      borderRadius: T.r8,
      border: "none",
      background: phase === "review" ? "linear-gradient(135deg," + T.teal + "," + T.ocean + ")" : T.stone,
      color: phase === "review" ? T.white : T.inkSoft,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "\uD83D\uDCE4", " Abschliessen (", totalAuff, " Auff.)"))), /*#__PURE__*/React.createElement("main", {
    ref: scrollRef,
    style: {
      flex: 1,
      overflowY: "auto",
      padding: 24,
      background: T.cream
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: "0 auto"
    }
  }, phase === "anamnese" && ANAM[anamStep] && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: T.r16,
      background: T.tealPale,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24
    }
  }, ANAM[anamStep].icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 19,
      color: T.ink,
      margin: 0
    }
  }, "Schritt ", anamStep + 1, ": ", ANAM[anamStep].t), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      margin: 0
    }
  }, "Anamnese ", anamStep + 1, "/", ANAM.length))), /*#__PURE__*/React.createElement(Card, null, ANAM[anamStep].fields.map(f => /*#__PURE__*/React.createElement(Field, {
    key: f.k,
    label: f.l,
    value: data[f.k],
    onChange: u(f.k),
    ph: f.ph,
    type: f.type,
    rows: f.rows,
    req: f.req,
    hint: f.hint,
    opt: f.opt
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    onClick: () => setAnamStep(Math.max(0, anamStep - 1)),
    disabled: anamStep === 0
  }, "\u2190", " Zurueck"), /*#__PURE__*/React.createElement(Btn, {
    onClick: () => {
      if (anamStep < ANAM.length - 1) setAnamStep(anamStep + 1);else {
        setPhase("befund");
        setBefundKat(0);
      }
    }
  }, anamStep === ANAM.length - 1 ? "Zur Befundung \u2192" : "Weiter \u2192"))), phase === "befund" && kat && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: T.r16,
      background: kat.c + "12",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24
    }
  }, kat.icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 19,
      color: T.ink,
      margin: 0
    }
  }, befundKat + 1, ". ", kat.t), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      margin: 0
    }
  }, kat.items.length, " Items | ", auffCount(kat.id), " Auffaellig", kat.items.some(it => it.m) ? " | Mehrfachauswahl" : ""))), kat.items.map((item, idx) => {
    const auff = isAuff(kat.id, idx);
    return /*#__PURE__*/React.createElement(Card, {
      key: item.id,
      style: {
        marginBottom: 10,
        borderColor: auff ? T.rose + "40" : T.sand
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 600,
        color: auff ? T.rose : T.ink
      }
    }, auff ? "\u26A0 " : "", item.l, item.m ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: T.inkMuted,
        fontWeight: 400,
        marginLeft: 6
      }
    }, "(Mehrfach)") : null), auff && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: T.rose,
        background: T.rosePale,
        padding: "2px 8px",
        borderRadius: 4
      }
    }, "Auffaellig")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap"
      }
    }, item.opts.map((opt, oi) => /*#__PURE__*/React.createElement(Pill, {
      key: oi,
      label: opt,
      isNormal: oi === 0,
      selected: isSel(kat.id, idx, oi),
      onClick: () => handleSelect(kat.id, idx, oi)
    }))), auff && /*#__PURE__*/React.createElement("input", {
      placeholder: "Anmerkung...",
      value: notes[kat.id + "_" + idx] || "",
      onChange: e => setNotes(p => ({
        ...p,
        [kat.id + "_" + idx]: e.target.value
      })),
      style: {
        width: "100%",
        padding: "7px 12px",
        borderRadius: T.r8,
        marginTop: 8,
        border: "1px solid " + T.rose + "40",
        background: T.rosePale + "80",
        fontSize: 13,
        fontFamily: T.sans,
        outline: "none",
        boxSizing: "border-box"
      }
    }));
  }), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginTop: 16,
      borderColor: T.teal + "30"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.ocean
    }
  }, "\uD83D\uDCDD", " KI-Befundtext"), /*#__PURE__*/React.createElement(Btn, {
    small: true,
    onClick: () => genBefundText(kat.id),
    disabled: aiLoading[kat.id] || !conn.ok
  }, aiLoading[kat.id] ? "Generiere..." : "\uD83E\uDD16 Generieren (" + getModel("befund_text") + ")")), /*#__PURE__*/React.createElement(StreamBox, {
    text: aiTexts[kat.id],
    loading: !!aiLoading[kat.id]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    onClick: () => {
      if (befundKat === 0) {
        setPhase("anamnese");
        setAnamStep(ANAM.length - 1);
      } else setBefundKat(befundKat - 1);
    }
  }, "\u2190", " Zurueck"), /*#__PURE__*/React.createElement(Btn, {
    onClick: () => {
      if (befundKat < KAT.length - 1) setBefundKat(befundKat + 1);else setPhase("review");
    }
  }, befundKat === KAT.length - 1 ? "Abschliessen \u2192" : "Naechste \u2192"))), phase === "review" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: T.r16,
      background: "linear-gradient(135deg," + T.teal + "," + T.amber + ")",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      color: T.white
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 22,
      color: T.ink,
      margin: 0
    }
  }, "Befund abgeschlossen"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: T.inkMuted,
      margin: "2px 0 0"
    }
  }, totalAuff, " Auffaelligkeiten in ", KAT.filter(k => auffCount(k.id) > 0).length, " Kategorien"))), conn.ok && /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16,
      background: T.tealPale,
      borderColor: T.teal + "40"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: T.tealDark
    }
  }, "Alle KI-Texte generieren"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.inkSoft
    }
  }, "Fuer alle 15 Kategorien automatisch")), /*#__PURE__*/React.createElement(Btn, {
    onClick: async () => {
      for (const k of KAT) await genBefundText(k.id);
    }
  }, "Alle generieren"))), KAT.map(k => /*#__PURE__*/React.createElement(Card, {
    key: k.id,
    style: {
      marginBottom: 8,
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, k.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: k.c
    }
  }, k.t), /*#__PURE__*/React.createElement(Badge, {
    n: auffCount(k.id)
  }), aiTexts[k.id] ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: T.teal,
      marginLeft: "auto"
    }
  }, "\u2713", " Text") : conn.ok && /*#__PURE__*/React.createElement(Btn, {
    v: "ghost",
    small: true,
    onClick: () => genBefundText(k.id),
    disabled: aiLoading[k.id],
    style: {
      marginLeft: "auto"
    }
  }, aiLoading[k.id] ? "..." : "Text")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "linear-gradient(135deg,#2D6A4F," + T.teal + ")",
      borderRadius: T.r16,
      padding: 24,
      color: T.white,
      textAlign: "center",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      marginBottom: 8
    }
  }, "\uD83C\uDF89"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: T.serif,
      fontSize: 20,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "Daten komplett!"), /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    style: {
      background: T.white,
      color: "#2D6A4F",
      fontWeight: 700
    },
    onClick: onFinish
  }, "\uD83D\uDCBE", " Befund speichern & zur Akte"))))));
}

// ═══════════════════════════════════════════════════════════════════════════
// BERATER CHAT (same as v3 but receives prompts)
// ═══════════════════════════════════════════════════════════════════════════
function BeraterChat({
  ollama,
  conn,
  getModel,
  prompts
}) {
  const [msgs, setMsgs] = useState([{
    role: "ai",
    text: "Hallo! Beschreibe mir Symptome oder ein Krankheitsbild - ich schlage dir evidenzbasierte Behandlungsansaetze vor."
  }]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [msgs]);
  const send = async () => {
    if (!input.trim() || streaming || !conn.ok) return;
    const q = input.trim();
    setInput("");
    setMsgs(p => [...p, {
      role: "user",
      text: q
    }]);
    setStreaming(true);
    const ctx = msgs.slice(-6).map(m => m.role === "user" ? "Frage: " + m.text : "Berater: " + m.text).join("\n") + "\nFrage: " + q + "\nBerater:";
    let ai = "";
    setMsgs(p => [...p, {
      role: "ai",
      text: ""
    }]);
    try {
      for await (const c of ollama.current.stream(ctx, {
        model: getModel("chat"),
        system: prompts.berater_chat.text,
        taskId: "chat",
        temperature: 0.6
      })) {
        ai += c;
        setMsgs(p => {
          const u = [...p];
          u[u.length - 1] = {
            role: "ai",
            text: ai
          };
          return u;
        });
      }
    } catch (e) {
      if (e.name !== "AbortError") setMsgs(p => {
        const u = [...p];
        u[u.length - 1] = {
          role: "ai",
          text: "Fehler: " + e.message
        };
        return u;
      });
    }
    setStreaming(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: T.cream
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 22px",
      background: "linear-gradient(135deg," + T.ocean + "," + T.teal + ")",
      color: T.white
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: T.serif,
      fontSize: 17,
      fontWeight: 700
    }
  }, "\uD83E\uDD16", " Ergo-Berater"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      opacity: 0.8
    }
  }, "Modell: ", getModel("chat"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
      maxWidth: "82%",
      padding: "11px 15px",
      borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
      background: m.role === "user" ? T.ocean : T.white,
      color: m.role === "user" ? T.white : T.ink,
      fontSize: 13,
      lineHeight: 1.65,
      fontFamily: T.sans,
      whiteSpace: "pre-wrap",
      boxShadow: m.role !== "user" ? T.sm : "none"
    }
  }, m.text, streaming && i === msgs.length - 1 && m.role === "ai" && /*#__PURE__*/React.createElement("span", {
    style: {
      animation: "blink 1s infinite",
      color: T.teal
    }
  }, " ", "\u2588"))), /*#__PURE__*/React.createElement("div", {
    ref: endRef
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 18px",
      borderTop: "1px solid " + T.sand,
      background: T.white,
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: input,
    onChange: e => setInput(e.target.value),
    onKeyDown: e => e.key === "Enter" && send(),
    placeholder: conn.ok ? "Symptome oder Frage..." : "Offline",
    disabled: !conn.ok,
    style: {
      flex: 1,
      padding: "10px 14px",
      borderRadius: T.r12,
      border: "1.5px solid " + T.sand,
      fontSize: 13,
      fontFamily: T.sans,
      outline: "none",
      background: T.cream
    }
  }), /*#__PURE__*/React.createElement(Btn, {
    onClick: send,
    disabled: streaming || !conn.ok || !input.trim()
  }, streaming ? "..." : "Senden")));
}

// ═══════════════════════════════════════════════════════════════════════════
// ZIEL-ASSISTENT
// ═══════════════════════════════════════════════════════════════════════════
function ZielAssistent({
  selections,
  ollama,
  conn,
  getModel,
  prompts
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const defizite = useMemo(() => {
    const d = [];
    KAT.forEach(k => {
      (selections[k.id] || []).forEach((v, i) => {
        const isA = Array.isArray(v) ? !(v.length === 1 && v[0] === 0) : v !== 0;
        if (isA) {
          const sel = Array.isArray(v) ? v.map(x => k.items[i].opts[x]).join(", ") : k.items[i].opts[v];
          d.push(k.t + " - " + k.items[i].l + ": " + sel);
        }
      });
    });
    return d;
  }, [selections]);
  const gen = async () => {
    if (!conn.ok || !defizite.length) return;
    setLoading(true);
    setText("");
    try {
      for await (const c of ollama.current.stream("Defizite:\n" + defizite.join("\n") + "\n\nZielhierarchie:", {
        model: getModel("ziele"),
        system: prompts.ziel_ableitung.text,
        taskId: "ziele",
        temperature: 0.5
      })) setText(p => p + c);
    } catch (e) {
      if (e.name !== "AbortError") setText("Fehler: " + e.message);
    }
    setLoading(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: T.cream
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 22px",
      background: "linear-gradient(135deg," + T.rose + "," + T.amber + ")",
      color: T.white
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: T.serif,
      fontSize: 17,
      fontWeight: 700
    }
  }, "\uD83C\uDFAF", " Ziel-Assistent"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      opacity: 0.85
    }
  }, defizite.length, " Auffaelligkeiten | ", getModel("ziele"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: 22
    }
  }, defizite.length > 0 && /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: T.inkSoft,
      marginBottom: 6
    }
  }, "Defizite:"), defizite.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontSize: 12,
      color: T.rose,
      padding: "2px 0"
    }
  }, "\u26A0", " ", d))), /*#__PURE__*/React.createElement(StreamBox, {
    text: text,
    loading: loading,
    ph: "Klicke unten auf Generieren..."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 18px",
      borderTop: "1px solid " + T.sand,
      background: T.white
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    onClick: gen,
    disabled: loading || !conn.ok || !defizite.length,
    style: {
      width: "100%"
    }
  }, loading ? "Generiere..." : !defizite.length ? "Erst Befund ausfuellen" : "Ziele ableiten")));
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
function Settings({
  cfg,
  setCfg,
  conn,
  setConn,
  ollama,
  modelMap,
  setModelMap,
  prompts,
  setPrompts
}) {
  const [testing, setTesting] = useState(false);
  const [editP, setEditP] = useState(null);
  const test = async () => {
    setTesting(true);
    ollama.current = new OllamaService(cfg.url);
    const r = await ollama.current.check();
    setConn(r);
    setTesting(false);
  };
  useEffect(() => {
    test();
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 28,
      maxWidth: 720,
      margin: "0 auto",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: T.serif,
      fontSize: 22,
      color: T.ink,
      margin: "0 0 20px"
    }
  }, "\u2699\uFE0F", " Einstellungen"), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16,
      borderColor: conn.ok ? T.teal + "40" : T.amber + "40",
      background: conn.ok ? T.tealPale + "80" : T.amberLight
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 5,
      background: conn.ok ? T.teal : T.rose
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, conn.ok ? "Verbunden" : "Nicht verbunden")), /*#__PURE__*/React.createElement(Btn, {
    v: "secondary",
    small: true,
    onClick: test,
    disabled: testing
  }, testing ? "..." : "Testen")), /*#__PURE__*/React.createElement(Field, {
    label: "Ollama URL",
    value: cfg.url,
    onChange: v => setCfg(p => ({
      ...p,
      url: v
    }))
  }), conn.ok && conn.models?.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.inkSoft,
      fontFamily: T.mono
    }
  }, "Modelle: ", conn.models.join(", "))), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: T.ocean,
      fontFamily: T.serif,
      marginBottom: 12
    }
  }, "Modell-Zuordnung"), [{
    id: "tipps",
    l: "Tipps",
    w: "light"
  }, {
    id: "befund_text",
    l: "Befundtext",
    w: "heavy"
  }, {
    id: "chat",
    l: "Berater",
    w: "heavy"
  }, {
    id: "ziele",
    l: "Ziele",
    w: "heavy"
  }, {
    id: "anamnese",
    l: "Anamnese-KI",
    w: "heavy"
  }].map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid " + T.stone
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13,
      fontWeight: 500,
      color: T.ink
    }
  }, t.l, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: t.w === "light" ? T.teal : T.amber
    }
  }, "[", t.w, "]")), /*#__PURE__*/React.createElement("select", {
    value: modelMap[t.id] || "",
    onChange: e => setModelMap(p => ({
      ...p,
      [t.id]: e.target.value
    })),
    style: {
      padding: "5px 8px",
      borderRadius: 6,
      border: "1px solid " + T.sand,
      fontSize: 12,
      fontFamily: T.sans,
      background: T.white,
      minWidth: 160
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Auto"), MODEL_PRESETS.map(m => /*#__PURE__*/React.createElement("option", {
    key: m.id,
    value: m.id
  }, m.id)), (conn.models || []).filter(m => !MODEL_PRESETS.find(d => d.id === m)).map(m => /*#__PURE__*/React.createElement("option", {
    key: m,
    value: m
  }, m)))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: T.ocean,
      fontFamily: T.serif,
      marginBottom: 4
    }
  }, "System-Prompts"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: T.inkMuted,
      marginBottom: 12
    }
  }, "Vorkonfiguriert. Bei Bedarf anpassen."), Object.entries(prompts).map(([key, p]) => /*#__PURE__*/React.createElement("div", {
    key: key,
    style: {
      padding: "10px 0",
      borderBottom: "1px solid " + T.stone
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, p.label), /*#__PURE__*/React.createElement(Btn, {
    v: "ghost",
    small: true,
    onClick: () => setEditP(editP === key ? null : key)
  }, editP === key ? "Einklappen" : "Bearbeiten")), editP === key && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    value: p.text,
    onChange: e => setPrompts(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        text: e.target.value
      }
    })),
    rows: 5,
    style: {
      width: "100%",
      padding: "8px 12px",
      borderRadius: T.r8,
      border: "1.5px solid " + T.sand,
      fontSize: 12,
      fontFamily: T.mono,
      resize: "vertical",
      outline: "none",
      boxSizing: "border-box",
      background: T.cream
    }
  }), /*#__PURE__*/React.createElement(Btn, {
    v: "ghost",
    small: true,
    onClick: () => setPrompts(prev => ({
      ...prev,
      [key]: DEFAULT_PROMPTS[key]
    }))
  }, "Zuruecksetzen"))))));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
window.ErgoAssistPro = function ErgoAssistPro() {
  const [view, setView] = useState("patients"); // patients | dashboard | assistant | chat | ziele | ortho | settings
  const [cfg, setCfg] = useState({
    url: "http://localhost:11434"
  });
  const [conn, setConn] = useState({
    ok: false,
    models: []
  });
  const ollama = useRef(new OllamaService());
  const [collapsed, setCollapsed] = useState(false);
  const [modelMap, setModelMap] = useState({});
  const [prompts, setPrompts] = useState(JSON.parse(JSON.stringify(DEFAULT_PROMPTS)));
  const storage = useMemo(() => new PatientStorage(), []);
  const getModel = useCallback(taskId => {
    if (modelMap[taskId]) return modelMap[taskId];
    const weights = {
      tipps: "light",
      befund_text: "heavy",
      chat: "heavy",
      ziele: "heavy",
      anamnese: "heavy"
    };
    const tier = weights[taskId] || "heavy";
    const avail = conn.models || [];
    for (const p of MODEL_PRESETS.filter(m => m.tier === tier)) {
      if (avail.includes(p.id)) return p.id;
    }
    return avail[0] || (tier === "light" ? "qwen2.5:3b" : "mistral-small");
  }, [modelMap, conn.models]);

  // Patient state
  const [currentPatientId, setCurrentPatientId] = useState(null);
  const [data, setData] = useState({});
  const [selections, setSelections] = useState(() => {
    const init = {};
    KAT.forEach(k => {
      init[k.id] = k.items.map(it => it.m ? [0] : 0);
    });
    return init;
  });
  const [aiTexts, setAiTexts] = useState({});
  const [notes, setNotes] = useState({});
  const loadPatient = id => {
    const p = storage.getPatient(id);
    if (!p) return;
    setCurrentPatientId(id);
    setData(p.anamnese || {});
    // Load latest befund if exists
    const latest = p.befunde?.[p.befunde.length - 1];
    if (latest) {
      setSelections(latest.selections || {});
      setAiTexts(latest.aiTexts || {});
      setNotes(latest.notes || {});
    } else {
      const init = {};
      KAT.forEach(k => {
        init[k.id] = k.items.map(it => it.m ? [0] : 0);
      });
      setSelections(init);
      setAiTexts({});
      setNotes({});
    }
    setView("dashboard");
  };
  const createNewPatient = () => {
    const p = storage.createPatient();
    storage.savePatient(p);
    setCurrentPatientId(p.id);
    setData({});
    setAiTexts({});
    setNotes({});
    const init = {};
    KAT.forEach(k => {
      init[k.id] = k.items.map(it => it.m ? [0] : 0);
    });
    setSelections(init);
    setView("assistant");
  };
  const saveBefund = () => {
    if (!currentPatientId) return;
    const patient = storage.getPatient(currentPatientId);
    if (!patient) return;
    patient.anamnese = {
      ...data
    };
    storage.addBefund(currentPatientId, selections, aiTexts, notes);
    storage.savePatient(patient);
    setView("dashboard");
  };

  // Auto-save anamnese data
  useEffect(() => {
    if (!currentPatientId) return;
    const timer = setTimeout(() => {
      const p = storage.getPatient(currentPatientId);
      if (p) {
        p.anamnese = {
          ...data
        };
        storage.savePatient(p);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [data, currentPatientId]);
  const currentPatient = currentPatientId ? storage.getPatient(currentPatientId) : null;
  const NAV = [{
    id: "patients",
    icon: "\uD83D\uDCC1",
    label: "Akten"
  }, {
    id: "dashboard",
    icon: "\uD83D\uDCCA",
    label: "Dashboard",
    show: !!currentPatientId
  }, {
    id: "assistant",
    icon: "\uD83D\uDCCB",
    label: "Assistent",
    show: !!currentPatientId
  }, {
    id: "ortho",
    icon: "\uD83E\uDDB4",
    label: "Orthopaedie",
    show: !!currentPatientId
  }, {
    id: "chat",
    icon: "\uD83E\uDD16",
    label: "Berater"
  }, {
    id: "ziele",
    icon: "\uD83C\uDFAF",
    label: "Ziele",
    show: !!currentPatientId
  }, {
    id: "settings",
    icon: "\u2699\uFE0F",
    label: "Einstellungen"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "100vh",
      display: "flex",
      fontFamily: T.sans,
      background: T.cream,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: collapsed ? 56 : 190,
      minWidth: collapsed ? 56 : 190,
      background: "linear-gradient(180deg,#0F2830 0%," + T.ocean + " 60%,#163D4D 100%)",
      display: "flex",
      flexDirection: "column",
      padding: collapsed ? "18px 6px" : "18px 10px",
      transition: "all 0.3s"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 4px",
      marginBottom: 24,
      minHeight: 38
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: T.r12,
      flexShrink: 0,
      background: "linear-gradient(135deg," + T.teal + "," + T.amber + ")",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      fontWeight: 700,
      color: T.white
    }
  }, "E"), !collapsed && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: T.serif,
      fontSize: 14,
      fontWeight: 700,
      color: "#F0EDE6",
      whiteSpace: "nowrap"
    }
  }, "ErgoAssist Pro"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: T.teal + "AA",
      letterSpacing: 1.5
    }
  }, "v4 PATIENTEN"))), !collapsed && currentPatient && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 10px",
      marginBottom: 12,
      borderRadius: T.r8,
      background: "rgba(255,255,255,0.06)",
      fontSize: 11,
      color: "rgba(255,255,255,0.7)"
    }
  }, "\uD83D\uDC64", " ", currentPatient.anamnese?.chiffre || "Neue Akte"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flex: 1
    }
  }, NAV.filter(n => n.show !== false).map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    onClick: () => setView(n.id),
    title: collapsed ? n.label : undefined,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 10px",
      borderRadius: T.r12,
      border: "none",
      background: view === n.id ? T.teal + "25" : "transparent",
      color: view === n.id ? T.white : "rgba(255,255,255,0.45)",
      cursor: "pointer",
      fontFamily: T.sans,
      fontWeight: view === n.id ? 600 : 400,
      fontSize: 12,
      justifyContent: collapsed ? "center" : "flex-start"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, n.icon), !collapsed && /*#__PURE__*/React.createElement("span", null, n.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid rgba(255,255,255,0.08)",
      paddingTop: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setCollapsed(!collapsed),
    style: {
      width: "100%",
      padding: 6,
      borderRadius: T.r8,
      border: "none",
      background: "rgba(255,255,255,0.05)",
      color: "rgba(255,255,255,0.3)",
      cursor: "pointer",
      fontSize: 11
    }
  }, collapsed ? "\u2192" : "\u2190"), !collapsed && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      padding: "4px 8px",
      borderRadius: T.r8,
      background: "rgba(255,255,255,0.04)",
      fontSize: 10,
      display: "flex",
      alignItems: "center",
      gap: 4,
      color: conn.ok ? "#81C784" : "#FF8A65"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 5,
      height: 5,
      borderRadius: 3,
      background: conn.ok ? T.teal : T.rose
    }
  }), conn.ok ? getModel("chat") : "Offline"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      minWidth: 0
    }
  }, view === "patients" && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement(PatientList, {
    storage: storage,
    onSelect: loadPatient,
    onCreate: createNewPatient
  })), view === "dashboard" && currentPatient && /*#__PURE__*/React.createElement(PatientDashboard, {
    patient: currentPatient,
    storage: storage,
    onStartBefund: () => setView("assistant"),
    onBack: () => {
      setCurrentPatientId(null);
      setView("patients");
    }
  }), view === "assistant" && /*#__PURE__*/React.createElement(GuidedAssistant, {
    data: data,
    setData: setData,
    selections: selections,
    setSelections: setSelections,
    aiTexts: aiTexts,
    setAiTexts: setAiTexts,
    notes: notes,
    setNotes: setNotes,
    ollama: ollama,
    conn: conn,
    getModel: getModel,
    prompts: prompts,
    onFinish: saveBefund
  }), view === "ortho" && /*#__PURE__*/React.createElement(OrthoModule, {
    data: data,
    setData: setData,
    ollama: ollama,
    conn: conn,
    getModel: getModel,
    prompts: prompts
  }), view === "chat" && /*#__PURE__*/React.createElement(BeraterChat, {
    ollama: ollama,
    conn: conn,
    getModel: getModel,
    prompts: prompts
  }), view === "ziele" && /*#__PURE__*/React.createElement(ZielAssistent, {
    selections: selections,
    ollama: ollama,
    conn: conn,
    getModel: getModel,
    prompts: prompts
  }), view === "settings" && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      background: T.cream
    }
  }, /*#__PURE__*/React.createElement(Settings, {
    cfg: cfg,
    setCfg: setCfg,
    conn: conn,
    setConn: setConn,
    ollama: ollama,
    modelMap: modelMap,
    setModelMap: setModelMap,
    prompts: prompts,
    setPrompts: setPrompts
  }))), /*#__PURE__*/React.createElement("style", null, `
        @keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}
        input:focus,textarea:focus,select:focus{border-color:${T.teal}!important;box-shadow:0 0 0 3px ${T.teal}15;outline:none}
        button:hover:not(:disabled){filter:brightness(.97)}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:${T.sand};border-radius:3px}
      `));
};