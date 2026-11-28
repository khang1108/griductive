# Repository Guidelines

## Project Structure & Module Organization

Griductive is a logic-deduction game with a Python backend and React frontend.

- `main.py` starts the web server.
- `src/griductive/domain/` contains models, clues, regions, and evaluation rules; `engine/` handles game state, puzzle validation, loading, and SQLite persistence.
- `src/griductive/server/` contains FastAPI routes, serializers, and avatar caching; `assets/` holds sprite images.
- `frontend/src/` contains React components grouped by feature, API helpers, shared types, and Tailwind CSS styles.
- `data/puzzle/` holds puzzle JSON files and `puzzles.db`; `docs/work/` contains API and task documentation.
- `pytest.ini` targets `tests/`, but that directory is absent from this checkout.

## Build, Test, and Development Commands

Run backend commands from the repository root with Python 3.10+:

- `pip install -r requirements.txt` installs backend and pytest dependencies.
- `python main.py --no-browser` serves the application at `http://localhost:8000`; use `--port 8080` to change ports.
- `python -m pytest` runs tests once a `tests/` suite is available.

For frontend work, run `cd frontend`, then:

- `npm install` installs dependencies.
- `npm run dev` starts Vite on port 5173, proxying `/api` to port 8000. Run the backend separately.
- `npm run build` checks TypeScript and creates `frontend/dist/`, which FastAPI serves. Build it before running the bundled interface; this checkout has no prebuilt bundle.
- `npm run preview` previews the frontend build.

## Coding Style & Naming Conventions

Follow existing styles: four-space Python indentation, type annotations, `snake_case` functions/modules, and `PascalCase` classes. Use two-space TypeScript indentation, double quotes, semicolons, `PascalCase` component files, and `camelCase` variables. Keep API shapes aligned with `frontend/src/types.ts`. TypeScript uses strict checking; no dedicated formatter or linter is configured.

## Testing Guidelines

Add pytest files as `tests/test_*.py`, with `test_*` functions covering changed behavior, invalid puzzles, and API errors. Pytest adds `src/` to the import path. No coverage threshold or frontend test runner is configured. Validate frontend changes with the build and browser checks.

## Commit & Pull Request Guidelines

The available Git history contains one `feat:` commit; follow that prefix style with concise, imperative subjects. PRs should explain behavior changes, link relevant issues, report validation results, and include screenshots for visible UI changes. Mention puzzle-data or API changes explicitly.
