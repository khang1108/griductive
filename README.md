# Griductive Solver — Logic Deduction Game & AI Solver

Project 2 — **CSC14003: Introduction to Artificial Intelligence**  
Faculty of Information Technology, VNU-HCM University of Science (HCMUS)

---

## 1. Overview

**Griductive** is a grid-deduction mystery game where every character on an $N \times N$ grid is secretly a **Criminal** or **Innocent**. Every revealed clue is completely truthful. The player (or AI Logic Agent) identifies suspects one logically provable verdict at a time without guessing.

This repository features:
- **Core Domain & Engine** (`src/griductive/domain/`, `src/griductive/engine/`): Pure Python domain models, region resolvers, clue specifications, truth-preserving game engine, and puzzle validators.
- **Modern Web Interface** (`frontend/`): Built with **TypeScript**, **React 19**, **Tailwind CSS v4**, and **Vite**. Provides fluid 3D card flips, spotlight clue glowing, verdict modals, pause screen, and confetti victory celebration.
- **FastAPI Backend & Asset Cache** (`src/griductive/server/`): Seamlessly connects the TypeScript frontend to the Python engine with zero Node.js runtime requirement for grading.
- **Logic Solver** (`src/griductive/logic/`): CNF encoding, the team DPLL solver interface, and a refutation-based no-guess deduction agent with trace and metrics.

---

## 2. Requirements & Setup

### Requirements
- Python 3.10+
- Node.js v18+ to install/build the frontend. `frontend/dist/` is generated and is not tracked; build it before serving the interface through Python. Once built, only Python is needed to run the bundled interface.

### Installation
```bash
pip install -r requirements.txt
```

---

## 3. How to Run the Program

### Run Web Interface
Build the frontend once with `cd frontend && npm install && npm run build`, then return to the repository root.

```bash
python main.py
```
> This starts the local server at `http://localhost:8000` and automatically opens the game in your default browser.

### Options
```bash
python main.py --port 8080       # Custom port
python main.py --no-browser      # Do not auto-open browser
```

---

## 4. Running Tests

Run the comprehensive pytest suite covering Domain, Engine, and Server:
```bash
python -m pytest
```

---

## 5. Project Directory Structure

```
.
├── main.py                     # Primary entry point (starts server and opens game)
├── requirements.txt            # Python dependencies (FastAPI, uvicorn, Pillow, pytest)
├── pytest.ini                  # Pytest configuration (pythonpath = src)
├── README.md                   # Project documentation
│
├── src/
│   └── griductive/
│       ├── domain/             # Core models, clues, regions, evaluator, state
│       ├── engine/             # GameEngine, puzzle_loader, puzzle_validator
│       ├── server/             # FastAPI REST API, serializers, avatar cache
│       ├── logic/              # CNF, SAT interface, deductive agent and traces
│       ├── experiments/        # Isolated benchmark runs and result exports
│       └── assets/             # Sprite assets (avt.png)
│
├── frontend/                   # Modern TypeScript frontend
│   ├── src/
│   │   ├── components/         # Header, Board, CardTile, CaseEvidence, Modals
│   │   ├── api/                # API client
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── App.tsx             # Root game application
│   │   └── index.css           # Tailwind CSS & 3D card flip styles
│   ├── dist/                   # Production build bundle served by main.py
│   └── package.json            # Vite & React dependencies
│
├── data/
│   └── puzzle/                 # SQLite database (puzzles.db) & raw sample JSONs
└── tests/                      # Automated test suite (domain, engine, puzzle_db, server)
```

---

## 6. Frontend Development (Optional)

If you modify files inside `frontend/src/`:
```bash
cd frontend
npm install
npm run dev     # Live hot-reloading dev server on http://localhost:5173
npm run build   # Recompile production bundle into frontend/dist/
```

## Development and Integration Checks

Use an isolated Python environment and install the test dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Run the backend with `python main.py --no-browser`. For frontend development,
run `npm install` and `npm run dev` from `frontend/`; Vite proxies `/api` to
port 8000. Run `npm run build` before using the frontend through the backend.

The interactive Auto Solve control requests one proven move at a time. Stop
allows the current request to finish and displays that move, then stops requesting
more. Stop before restarting or changing the puzzle. Pause also stops automatic
solving. A failed mutation is never automatically retried: the UI reloads public
state before allowing another action. The local server uses one shared game
session; separate browser tabs do not have independent games. Run one backend
worker.

API request/response details are in [the API reference](docs/work/API.md).
Browser verification scenarios are in
[GUI acceptance checks](docs/work/GUI_ACCEPTANCE.md).

## Reproducing Benchmarks

```bash
python scripts/run_benchmarks.py --repeats 3 --timeout-ms 10000 --output-dir benchmark-output
python scripts/run_benchmarks.py --size 5 --output-dir benchmark-5x5
```

The benchmark uses the team's CNF encoder, DPLL solver and logic agent directly;
GUI animation delays are excluded. Every attempt has its own process and hard
time limit. CSV, Markdown and JSON metadata preserve solved, stuck, timeout and
error outcomes. A stuck puzzle is a valid no-guess stopping condition.

See [benchmark methodology and findings](docs/work/BENCHMARKS.md) for metric
definitions, commands and the recorded 14-puzzle results.
