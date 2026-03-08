# ErgoAssistPro
ErgoAssist Pro is a specialized AI assistant for occupational therapy
# ErgoAssist Pro – Open Source AI for Occupational Therapy
**Privacy-First | Local LLMs | Clinical Decision Support**

## English Overview
ErgoAssist Pro is a specialized AI assistant for occupational therapy, designed to support the clinical workflow from initial assessment to goal setting. The system is built to meet the strictest data protection standards (GDPR) in the healthcare sector by utilizing a pure Privacy-by-Design approach.

### Key Features
* **Privacy-First (Air-Gapped Potential):** All patient data remains strictly local on the practice's hardware. No sensitive medical data is ever transmitted to external cloud APIs.
* **Autonomous Model Routing:** The assistant automatically selects the most efficient local LLM based on the specific therapeutic task (e.g., complex report synthesis vs. simple clinical tips).
* **Clinical Support:** Helps therapists generate professional, evidence-based reports and provides intervention suggestions.

### Technical Setup & Hardware
To ensure a fluid experience with local models, the following environment is used:
* **Hardware:** Minisforum UM690S (32GB RAM)
* **Backend:** Ollama running locally
* **Frontend:** Open WebUI / React-based interface
* **Local Models:** Qwen 2.5 (3B/Coder), Llama 3.1 (8B), Mistral Small

## 🚨 CRITICAL BUG FIXES & SYSTEM BASICS
- [ ] Fix bug: Settings are not saved upon page reload
- [ ] Fix bug: Patient records cannot be opened or edited
- [ ] Fix bug: Advisor Assistant does not save outputs and loses patient assignment
- [ ] Set up synchronization database (data must be accessible across devices)
- [ ] Adjust responsive design (app must work flawlessly on smartphones and tablets)

## 🤖 AI & GLOBAL ASSISTANT
- [ ] Permanently anchor the AI Assistant in the left main menu under settings
- [ ] Make the AI Assistant accessible cross-menu on every page
- [ ] Integrate AI context recognition (assistant recognizes the current input field and provides targeted help)
- [ ] Implement automatic question generation for anamnesis when creating new patients
- [ ] Create a question library (for recurring patient patterns)
- [ ] Add a "Renew" button to generated AI questions (to prompt more suitable alternatives)

## 📁 PATIENT RECORD & DATA PERSISTENCE (PHASE 2)
- [ ] Finalize patient management (create, load, archive)
- [ ] Implement assessment history with timestamps
- [ ] Create a comparison view for old vs. new assessments with color-coded changes
- [ ] Integrate progress charts (radar chart, timeline, bar chart)
- [ ] Design a motivation dashboard for the patient (positive, simplified visual representation)
- [ ] Ensure data persistence via localStorage and auto-save
- [ ] Integrate JSON export/import functionality

## ⚕️ MEDICAL CONTENT & SPECIALTY MODULES (PHASE 3)
- [ ] Fully integrate ICD-10 codes and provide an automatic update function
- [ ] Implement Orthopedics module (including ROM, strength measurement)
- [ ] Build Hand Therapy module as a separate, dedicated section
- [ ] Implement Neurology module
- [ ] Implement Psychiatry module (add the symptom "increased impulse control")
- [ ] Create modules for Child/Adolescent Psychiatry, Pediatrics, Geriatrics, and Occupational Medicine
- [ ] Integrate measurement methods for motor-functional treatment (including Neutral-Zero Method)
- [ ] Add instructions for well-known treatment concepts (e.g., Bobath) as a reference guide
- [ ] Develop a diagnostic tool for pain (e.g., foot/ankle: AI clarification, measurement instructions, suspected diagnosis, treatment plan, doctor consultation)

## 🌿 ADVANCED TREATMENT METHODS & INNOVATION (PHASE 4)
- [ ] Include Snoezelen room and animal-assisted therapy as official treatment concepts
- [ ] Build an AI function to develop and suggest new, innovative concepts as treatments
- [ ] Develop a separate section for "Occupational Therapy in Nature" (data flows into the project but not into official medical reports)
- [ ] Detail motor-functional, neurophysiological, and adaptive procedures
- [ ] Integrate German Therapeutic Products Guidelines / Heilmittelrichtlinie (prescription management, frequency)

## 👑 PRO FEATURES (PHASE 5)
- [ ] Develop a multi-user system (for multiple therapists with role/rights management)
- [ ] Generate professional PDF reports with embedded charts
- [ ] Set up a practice dashboard and patient statistics
- [ ] Build a template system for custom assessment templates
- [ ] Integrate a knowledge base with an AI-powered search

---

## Deutsche Übersicht
ErgoAssist Pro ist ein spezialisierter KI-Assistent für die Ergotherapie, der den therapeutischen Workflow von der Anamnese bis zur Zielformulierung digital unterstützt. Das System wurde entwickelt, um höchste Datenschutzstandards (DSGVO) im medizinischen Bereich kompromisslos zu erfüllen.

### Hauptmerkmale
* **Privacy-by-Design:** Alle Daten verbleiben lokal auf dem Rechner der Praxis. Es findet keinerlei Übertragung von Patientendaten in die Cloud statt.
* **Intelligentes Model-Routing:** Das System nutzt eine autonome Logik, um je nach Komplexität der Aufgabe automatisch das passende lokale Modell (z.B. Llama 3.1, Mistral oder Qwen) auszuwählen.
* **Therapeutische Entlastung:** Therapeuten sparen wertvolle Zeit bei der Befunddokumentation und erhalten evidenzbasierte Vorschläge für Behandlungsansätze.

## 🚨 AKUTE FEHLERBEHEBUNG & SYSTEMGRUNDLAGEN
- [ ] Fehler beheben: Einstellungen werden beim Neuladen nicht gespeichert
- [ ] Fehler beheben: Patientenakte lässt sich nicht öffnen und bearbeiten
- [ ] Fehler beheben: Berater-Assistent speichert Ausgaben nicht und verliert die Patientenzuordnung
- [ ] Synchronisation Datenbank einrichten (Daten müssen geräteübergreifend verfügbar sein)
- [ ] Responsive Design anpassen (App muss auf Smartphone und Tablet einwandfrei funktionieren)

## 🤖 KI & GLOBALER ASSISTENT
- [ ] KI-Assistent fest im linken Hauptmenü unter Einstellungen verankern
- [ ] KI-Assistent menüübergreifend auf jeder Seite verfügbar machen
- [ ] KI-Kontexterkennung integrieren (Assistent erkennt den aktuellen Eingabeblock und hilft gezielt)
- [ ] Automatische Fragengenerierung für die Befragung bei der Neuanlage von Patienten einbauen
- [ ] Fragen-Bibliothek anlegen (für wiederkehrende Patientenmuster)
- [ ] Renew-Button bei generierten KI-Fragen hinzufügen (für passendere Alternativen)

## 📁 PATIENTENAKTE & DATEN-PERSISTENZ (PHASE 2)
- [ ] Patientenverwaltung fertigstellen (Anlegen, Laden, Archivieren)
- [ ] Befund-Verlauf mit Zeitstempeln implementieren
- [ ] Vergleichs-Ansicht für alte und neue Befunde mit farblichen Markierungen erstellen
- [ ] Fortschritts-Diagramme einbinden (Radar-Chart, Timeline, Balkendiagramm)
- [ ] Motivations-Dashboard für den Patienten entwerfen (positive, vereinfachte Darstellung)
- [ ] Persistenz via localStorage und Auto-Save sichern
- [ ] JSON Export/Import Funktion integrieren

## ⚕️ MEDIZINISCHE INHALTE & FACHMODULE (PHASE 3)
- [ ] ICD-10 komplett einbinden und automatische Update-Funktion vorsehen
- [ ] Modul Orthopädie umsetzen (inklusive ROM, Kraftmessung)
- [ ] Modul Handtherapie als separaten Punkt aufbauen
- [ ] Modul Neurologie umsetzen
- [ ] Modul Psychiatrie umsetzen (Symptom "gesteigerte Impulskontrolle" ergänzen)
- [ ] Module für Kinder-/Jugendpsychiatrie, Pädiatrie, Geriatrie und Arbeitsmedizin anlegen
- [ ] Messverfahren für motorisch-funktionelle Behandlung integrieren (inklusive Neutral-Null-Methode)
- [ ] Anleitungen für bekannte Behandlungskonzepte (wie z.B. Bobath) als Nachschlagewerk einpflegen
- [ ] Diagnose-Tool für Schmerzen entwickeln (z.B. Fuß/Sprunggelenk: KI-Abklärung, Vermessungsanleitung, Verdachtsdiagnose, Behandlungsplan, Arztkonsultation)

## 🌿 ERWEITERTE BEHANDLUNGSVERFAHREN & INNOVATION (PHASE 4)
- [ ] Snoezelraum und tiergestützte Therapie als offizielle Behandlungskonzepte aufnehmen
- [ ] KI-Funktion einbauen, um neue innovative Konzepte zu erarbeiten und als Behandlung vorzuschlagen
- [ ] Separaten Bereich "Ergotherapie in der Natur" entwickeln (Daten fließen in das Projekt ein, aber nicht in offizielle Befunde zurück)
- [ ] Motorisch-funktionelle, neurophysiologische und adaptive Verfahren detailliert ausarbeiten
- [ ] Heilmittelrichtlinie einbinden (Verordnungsmanagement, Frequenz)

## 👑 PROFI-FEATURES (PHASE 5)
- [ ] Multi-User System entwickeln (für mehrere Therapeuten mit Rechteverwaltung)
- [ ] PDF-Reports mit Diagrammen generieren
- [ ] Praxis-Dashboard und Patientenstatistiken einrichten
- [ ] Vorlagen-System für eigene Befund-Templates bauen
- [ ] Wissensdatenbank mit KI-Suche integrieren


## License
This project is licensed under the GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007.

