# Code2MC

A modern, lightweight Arduino IDE clone with a built-in **Library Manager** and support for **Arduino, ESP32, and Raspberry Pi Pico (RP2040)**.

Made by **Atharva Phadnis**.

---

## ✨ Features

- Monaco-based code editor (VS Code engine) with `.ino` / `.cpp` / `.h` syntax highlighting, dark theme, line numbers, auto-indent
- File explorer for local sketches (stored under `sketches/`)
- **Board selector**: Arduino Uno, ESP32 Dev Module, Raspberry Pi Pico
- **Port selector** with auto-detect (`arduino-cli board list`)
- **Compile & Upload** using `arduino-cli`
- **Library Manager** — search / install / list / uninstall libraries
- **Auto-install missing libraries** when a compile error reports `No such file or directory` for a header
- Serial-style console output panel
- Clean dark modern UI

---

## 📦 Requirements

1. **Node.js 18+** — https://nodejs.org
2. **Arduino CLI** installed and in your `PATH` — https://arduino.github.io/arduino-cli/latest/installation/

Verify:
```bash
arduino-cli version
```

### Install ESP32 core
```bash
arduino-cli core update-index --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli core install esp32:esp32 --additional-urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
```

### Install Raspberry Pi Pico (RP2040) core
```bash
arduino-cli core update-index --additional-urls https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
arduino-cli core install rp2040:rp2040 --additional-urls https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
```

### Install Arduino AVR core
```bash
arduino-cli core install arduino:avr
```

---

## 🚀 Run

```bash
npm install
npm start
```

Open http://localhost:3000

---

## 🧠 Using the Library Manager

1. Click the **Libraries** panel on the right.
2. Type a query (e.g. `DHT`) and press **Search**.
3. Click **Install** on any result.
4. The **Installed** list shows currently installed libraries with an **Uninstall** button.
5. When compiling, if the CLI reports a missing header, Code2MC will prompt you to auto-install the matching library.

---

## 🧩 Boards

| Board | FQBN |
|---|---|
| Arduino Uno | `arduino:avr:uno` |
| ESP32 Dev Module | `esp32:esp32:esp32` |
| Raspberry Pi Pico | `rp2040:rp2040:rpipico` |

---

## 📁 API

| Route | Description |
|---|---|
| `GET  /api/boards` | List supported boards |
| `GET  /api/ports` | Detected serial ports |
| `POST /api/compile` | `{ code, board, sketchName }` |
| `POST /api/upload`  | `{ code, board, port, sketchName }` |
| `GET  /api/lib/search?q=` | Search libraries |
| `POST /api/lib/install` | `{ name }` |
| `GET  /api/lib/list` | Installed libraries |
| `POST /api/lib/uninstall` | `{ name }` |
| `GET  /api/files` | List sketches |
| `GET  /api/files/:name` | Read a sketch |
| `POST /api/files/:name` | Save a sketch |

---

## 🪪 License

MIT © Atharva Phadnis
