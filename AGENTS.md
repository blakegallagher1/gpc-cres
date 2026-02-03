# Repository Guidelines

## Project Structure & Module Organization
This repository is a Python 3.11+ multi-agent system for CRE workflows. Core code lives in `agents/`, `tools/`, `workflows/`, `models/`, and `config/`. Data and schema assets are in `database/`, while prompts and examples live in `prompts/` and `examples/`. The API entrypoint is `main.py`. Tests are in `tests/` (unit and integration). A `frontend/` directory exists for any UI assets; treat it as a separate surface when making changes.

## Build, Test, and Development Commands
Use the Makefile for standard tasks:
- `make install` installs runtime dependencies from `requirements.txt`.
- `make dev` runs the FastAPI app via `uvicorn` on port 8000.
- `make test` runs unit tests (excludes integration).
- `make test-all` runs the full test suite.
- `make lint` runs `flake8` and `pylint` across core modules.
- `make format` formats with `black` and `isort`.
- `make type-check` runs `mypy` with project settings.
- `make docker-build` / `make docker-run` build and run the container.
Other useful targets: `make install-dev`, `make test-coverage`, `make clean`, `make docker-up`, `make docker-down`, `make docker-logs`, `make env-example`, `make requirements-freeze`, and `make health`. `make docs-serve` / `make docs-build` expect a `docs/` directory.

## Coding Style & Naming Conventions
Follow Black/Isort formatting (line length 100); `flake8` allows up to 120, but prefer 100 for consistency. Keep modules snake_case, classes PascalCase, and constants UPPER_SNAKE_CASE. Use explicit types in new public functions and Pydantic models where practical. Keep imports ordered by isort. Avoid adding dependencies unless needed.

## Testing Guidelines
Tests use `pytest` with async support. Place tests in `tests/` and name files `test_*.py`. Integration tests should be marked with `@pytest.mark.integration` and are included in `make test-all`. For coverage, use `make test-coverage` (outputs `htmlcov/`).

## Commit & Pull Request Guidelines
There is no git history in this workspace. If you create commits, prefer short, imperative summaries (e.g., "Add underwriting validation") and include scope when helpful (e.g., "tools: add flood lookup"). PRs should describe the problem, approach, and testing run; include screenshots when UI changes are involved.

## Security & Configuration
Never commit secrets. Use `.env` populated from `.env.example` for local development. API keys are required for OpenAI, Perplexity, Supabase, Google Maps, and Backblaze B2. Validate that sensitive output is not logged.

## Project Status Tracking
Maintain `PROJECT_STATUS.md` with a brief list of completed changes and remaining tasks whenever significant project updates are made.
