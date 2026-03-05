// ═══════════════════════════════════════════════════════════════════════════
// ErgoAssist Pro — Patientenakte & Verlaufs-Tracking
// Dieses Modul wird in die bestehende App integriert.
// Es fuegt hinzu: Patientenverwaltung, Befund-Verlauf, Fortschritts-Charts
// ═══════════════════════════════════════════════════════════════════════════

// ─── Storage Service (localStorage fuer QNAP, JSON Export/Import) ────────

class PatientStorage {
  constructor() {
    this.STORE_KEY = "ergoassist_patients";
    this.SETTINGS_KEY = "ergoassist_settings";
  }

  // Get all patients (list overview)
  getPatientList() {
    try {
      const raw = localStorage.getItem(this.STORE_KEY);
      if (!raw) return [];
      const patients = JSON.parse(raw);
      // Return only metadata for the list, not full data
      return patients.map(p => ({
        id: p.id,
        chiffre: p.anamnese?.chiffre || "Unbekannt",
        hauptdiagnose: p.anamnese?.hauptdiagnose || "",
        erstellt: p.erstellt,
        geaendert: p.geaendert,
        befundCount: (p.befunde || []).length,
        letzterBefund: (p.befunde || []).slice(-1)[0]?.datum || null,
        aktiv: p.aktiv !== false
      }));
    } catch { return []; }
  }

  // Get full patient data by ID
  getPatient(id) {
    try {
      const raw = localStorage.getItem(this.STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw).find(p => p.id === id) || null;
    } catch { return null; }
  }

  // Save/update patient
  savePatient(patient) {
    try {
      const raw = localStorage.getItem(this.STORE_KEY);
      let patients = raw ? JSON.parse(raw) : [];
      patient.geaendert = new Date().toISOString();
      const idx = patients.findIndex(p => p.id === patient.id);
      if (idx >= 0) patients[idx] = patient;
      else patients.push(patient);
      localStorage.setItem(this.STORE_KEY, JSON.stringify(patients));
      return true;
    } catch (e) { console.error("Save error:", e); return false; }
  }

  // Delete patient
  deletePatient(id) {
    try {
      const raw = localStorage.getItem(this.STORE_KEY);
      if (!raw) return;
      const patients = JSON.parse(raw).filter(p => p.id !== id);
      localStorage.setItem(this.STORE_KEY, JSON.stringify(patients));
    } catch {}
  }

  // Create new patient
  createPatient() {
    return {
      id: "pat_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
      erstellt: new Date().toISOString(),
      geaendert: new Date().toISOString(),
      aktiv: true,
      anamnese: {},
      befunde: [],
      ziele: {},
      berichte: [],
      fachmodule: {}
    };
  }

  // Add a new befund to a patient
  addBefund(patientId, selections, aiTexts, notes, typ = "Verlaufsbefund") {
    const patient = this.getPatient(patientId);
    if (!patient) return null;
    const befund = {
      id: "bf_" + Date.now(),
      datum: new Date().toISOString(),
      typ: patient.befunde.length === 0 ? "Erstbefund" : typ,
      selections: JSON.parse(JSON.stringify(selections)),
      aiTexts: JSON.parse(JSON.stringify(aiTexts)),
      notes: JSON.parse(JSON.stringify(notes || {}))
    };
    patient.befunde.push(befund);
    this.savePatient(patient);
    return befund;
  }

  // Export all data as JSON
  exportAll() {
    const raw = localStorage.getItem(this.STORE_KEY);
    const settings = localStorage.getItem(this.SETTINGS_KEY);
    const data = {
      version: "ErgoAssist Pro v4",
      exportiert: new Date().toISOString(),
      patienten: raw ? JSON.parse(raw) : [],
      einstellungen: settings ? JSON.parse(settings) : {}
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ErgoAssist_Backup_" + new Date().toISOString().split("T")[0] + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import from JSON
  importAll(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.patienten) {
        localStorage.setItem(this.STORE_KEY, JSON.stringify(data.patienten));
      }
      if (data.einstellungen) {
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(data.einstellungen));
      }
      return { success: true, count: (data.patienten || []).length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Save settings
  saveSettings(settings) {
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
  }

  getSettings() {
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

// ─── Score Calculator (for charts) ──────────────────────────────────────

function calculateBefundScores(befund, kategorien) {
  // Returns a score per category: 0 = alles normal, 100 = alles maximal auffaellig
  const scores = {};
  kategorien.forEach(kat => {
    const sels = befund.selections?.[kat.id];
    if (!sels) { scores[kat.id] = 0; return; }
    let totalItems = kat.items.length;
    let auffScore = 0;
    sels.forEach((val, idx) => {
      const maxOpt = kat.items[idx].opts.length - 1;
      if (maxOpt === 0) return;
      if (Array.isArray(val)) {
        // Multi-select: score based on how many non-normal are selected
        const nonNormal = val.filter(v => v !== 0);
        auffScore += (nonNormal.length / maxOpt);
      } else {
        auffScore += val / maxOpt;
      }
    });
    scores[kat.id] = Math.round((auffScore / totalItems) * 100);
  });
  return scores;
}

function compareBefunde(befundAlt, befundNeu, kategorien) {
  const alt = calculateBefundScores(befundAlt, kategorien);
  const neu = calculateBefundScores(befundNeu, kategorien);
  const changes = {};
  kategorien.forEach(kat => {
    const diff = neu[kat.id] - alt[kat.id];
    changes[kat.id] = {
      vorher: alt[kat.id],
      nachher: neu[kat.id],
      diff: diff,
      trend: diff < -5 ? "verbessert" : diff > 5 ? "verschlechtert" : "stabil"
    };
  });
  return changes;
}

// ─── Export for use in main app ─────────────────────────────────────────

if (typeof window !== "undefined") {
  window.PatientStorage = PatientStorage;
  window.calculateBefundScores = calculateBefundScores;
  window.compareBefunde = compareBefunde;
}
