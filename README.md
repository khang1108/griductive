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
- **Logic Solver Extension Point** (`src/griductive/logic/`): Reserved folder for team members to implement Propositional Logic Encoding, CNF, and DPLL SAT Solver.

---

## 2. Requirements & Setup

### Requirements
- Python 3.10+
- (Optional) Node.js v18+ (only needed if modifying frontend source in `frontend/`). The pre-built production bundle is already included in `frontend/dist/`.

### Installation
```bash
pip install -r requirements.txt
```

---

## 3. How to Run the Program

### Run Web Interface
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
│       ├── logic/              # (Reserved for team) CNF encoder & DPLL SAT solver
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
