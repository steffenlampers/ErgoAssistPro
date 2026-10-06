# ErgoAssist Pro installieren (QNAP Container Station)

Ohne Technik-Kenntnisse, ca. 5 Minuten. Alles läuft nur in deinem Heimnetz, es gehen keine Patientendaten ins Internet.

## 1. Installieren
1. QNAP: **Container Station** öffnen → links **Anwendungen** → **Erstellen**.
2. Name: `ergoassist`.
3. Den kompletten Inhalt der Datei [`docker-compose.yml`](docker-compose.yml) in das Textfeld einfügen.
4. **Erstellen** klicken. Beim ersten Mal werden die Bilder geladen (einige Minuten).
5. Aufrufen: `http://<IP-deines-NAS>:8080` (auch vom Smartphone/Tablet im WLAN).

## 2. Lokale KI verbinden
**Variante A – KI auf dem NAS (im Paket enthalten):** Der Ollama-Container läuft schon mit. Modelle laden: Container Station → Container `ergoassist-ollama` → **Terminal** →
`ollama pull qwen2.5:3b` und `ollama pull llama3.1:8b`.
(Ohne GPU läuft das auf einem NAS langsam. Empfohlen ist Variante B.)

**Variante B – KI auf einem anderen Rechner (z. B. Minisforum):** In `docker-compose.yml` bei `OLLAMA_URL` die Adresse eintragen, z. B. `http://192.168.1.50:11434`. Den `ollama:`-Block darf man dann löschen. Auf dem KI-Rechner muss Ollama im Netz erreichbar sein (`OLLAMA_HOST=0.0.0.0`).

In der App unter **Einstellungen** wird die Verbindung angezeigt. Die Adresse dort bleibt auf `…/ollama` stehen.

## 3. Eigene IP-Adresse im Heimnetz (optional)
Standard ist `NAS-IP:8080`. Für eine eigene IP (z. B. `192.168.1.60`) in Container Station **Netzwerk → Netzwerk erstellen → Typ „Macvlan“** (Subnetz/Gateway deines Routers, IP-Bereich z. B. `192.168.1.60/32`). Dann im Compose beim Dienst `ergoassist`:
```yaml
    networks:
      ergo_lan:
        ipv4_address: 192.168.1.60
# ... und ganz unten:
networks:
  ergo_lan:
    external: true
    name: <Name des erstellten Netzwerks>
```
und die `ports:`-Zeilen entfernen. Der Dienst muss außerdem weiter `ollama` erreichen: beide Dienste zusätzlich ins Netz `default` aufnehmen. Alternativ: Im Router der NAS eine feste IP geben – das reicht meist.

## 4. Updates
Automatisch: der Container `ergoassist-updater` (Watchtower) prüft täglich auf eine neue Version und aktualisiert. Manuell: Container Station → Anwendung `ergoassist` → **Neu erstellen / Images aktualisieren**. Deine Daten bleiben im Volume `ergoassist_data` erhalten.

## 5. Daten & Sicherheit
- Alle Daten liegen im Volume `ergoassist_data` (`/data`) mit automatischem Tages-Backup (letzte 14 Tage). Das Volume zusätzlich mit QNAP-Snapshots sichern.
- **Passwort:** In `docker-compose.yml` `ACCESS_PASSWORD` setzen (Benutzername beliebig). Hinweis: Ohne HTTPS wird das Passwort im Heimnetz unverschlüsselt übertragen. Die App nicht ins Internet freigeben.
- Das Image wird bei jedem Push auf `main` per GitHub Actions gebaut. Beim ersten Mal in GitHub unter *Packages → ergoassistpro → Package settings* auf **Public** stellen, sonst kann das NAS es nicht laden.
