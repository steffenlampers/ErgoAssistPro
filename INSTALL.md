# ErgoAssist Pro installieren (QNAP Container Station)

Ca. 10 Minuten, ohne Technik-Kenntnisse. Alles läuft in deinem Heimnetz, es gehen keine Patientendaten ins Internet.

## 1. Installieren (mit eigener IP, ohne Port-Konflikte)
1. Im Router (z. B. Fritzbox) notieren: **IP des Routers** (z. B. `192.168.178.1`), **Heimnetz** (z. B. `192.168.178.0/24`) und eine **freie IP** für ErgoAssist (z. B. `192.168.178.60`, außerhalb des DHCP-Bereichs).
2. QNAP **Container Station** → **Anwendungen** → **Erstellen** → Name `ergoassist`.
3. Inhalt von [`docker-compose.yml`](docker-compose.yml) einfügen und die mit `<<< ANPASSEN` markierten Zeilen ändern (IP, Netz, Router, Netzwerkkarte `eth0`/`qvs0`).
4. **Erstellen**. Beim ersten Start werden die Bilder geladen (einige Minuten).
5. Aufrufen: `http://192.168.178.60` – auch mit Smartphone/Tablet im WLAN.

> Technische Eigenheit einer eigenen IP (Macvlan): Das NAS selbst erreicht diese IP nicht, alle anderen Geräte schon. Wenn es gar nicht klappt: [`docker-compose.einfach.yml`](docker-compose.einfach.yml) nutzen (läuft unter `http://<NAS-IP>:8787`).

## 2. KI anbinden
In `docker-compose.yml` bei `LLM_URL` die Adresse deiner KI eintragen. In der App unter **Einstellungen → KI-Engine** wählst du den passenden Typ.

| Deine KI | Engine in der App | `LLM_URL` |
|---|---|---|
| Ollama im Paket (auf dem NAS, langsam ohne GPU) | Ollama | `http://ollama:11434` |
| Ollama auf anderem Rechner (z. B. Minisforum) | Ollama | `http://192.168.178.50:11434` |
| LM Studio, llama.cpp, vLLM, LocalAI, Open WebUI | OpenAI-kompatibel | `http://192.168.178.50:1234/v1` |
| Hermes (Nous Research) | siehe unten | – |

Braucht dein KI-Server einen Schlüssel, trägst du ihn bei `LLM_API_KEY` ein. Er bleibt auf dem Server und gelangt nie in den Browser.

**Ollama im Paket:** Modelle laden über Container Station → `ergoassist-ollama` → Terminal: `ollama pull qwen2.5:3b` und `ollama pull llama3.1:8b`. Bei Ollama auf einem anderen Rechner muss dort `OLLAMA_HOST=0.0.0.0` gesetzt sein.

**Hermes:** Die *Hermes-Modelle* (z. B. `hermes3`) laufen ganz normal über Ollama. Der *Hermes Agent* (Nous Research) bietet eine OpenAI-kompatible Schnittstelle, die du als „OpenAI-kompatibel“ eintragen kannst. Ehrliche Einschätzung: Für Befundtexte und Ziele genügt ein normales Modell. Ein Agent mit Werkzeugen und Dateizugriff bringt in einer Patientenakte-App eher Risiken (Datenschutz, nicht vorhersehbares Verhalten) als Nutzen. Ich empfehle ihn nur, wenn du später echte Automatisierung willst.

## 3. Updates
Automatisch: Der Container `ergoassist-updater` (Watchtower) prüft täglich auf neue Versionen. Manuell: Container Station → Anwendung `ergoassist` → Images aktualisieren und neu erstellen. Deine Daten bleiben im Volume `ergoassist_data` erhalten.

## 4. Daten & Sicherheit
- Alle Daten liegen im Volume `ergoassist_data` mit Tages-Backup (letzte 14 Tage). Zusätzlich QNAP-Snapshots verwenden.
- **Passwort:** `ACCESS_PASSWORD` setzen (Benutzername beliebig). Ohne HTTPS geht es im Heimnetz unverschlüsselt über die Leitung. Die App nicht ins Internet freigeben.

## Für Entwickler: Veröffentlichung
Bei jedem Push auf `main` baut GitHub Actions das Image `ghcr.io/steffenlampers/ergoassistpro:latest` (amd64 + arm64). Beim ersten Mal: GitHub → Profil → *Packages* → `ergoassistpro` → *Package settings* → **Change visibility → Public**, sonst kann das NAS das Image nicht laden.
