# Gallagher Property Company - AI Agent System
# Makefile for common development tasks

.PHONY: help install dev test lint format clean docker-build docker-run

# Default target
help:
	@echo "Gallagher Property Company - AI Agent System"
	@echo ""
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Run development server"
	@echo "  make test         - Run tests"
	@echo "  make test-all     - Run all tests including integration"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo "  make type-check   - Run type checking"
	@echo "  make clean        - Clean temporary files"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-run   - Run Docker container"
	@echo "  make docker-up    - Start with docker-compose"
	@echo "  make docker-down  - Stop docker-compose"

# Installation
install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements.txt
	pip install pytest pytest-asyncio pytest-cov black isort mypy

# Development
dev:
	uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Testing
test:
	pytest tests/ -v --ignore=tests/integration

test-all:
	pytest tests/ -v

test-coverage:
	pytest tests/ --cov=. --cov-report=html --cov-report=term

# Code quality
lint:
	flake8 gpc_agents/ tools/ workflows/ models/ config/ --max-line-length=120
	pylint gpc_agents/ tools/ workflows/ models/ config/ --disable=C,R

format:
	black .
	isort .

type-check:
	mypy gpc_agents/ tools/ workflows/ models/ config/ --ignore-missing-imports

# Cleaning
clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.egg-info" -exec rm -rf {} +
	rm -rf build/ dist/ .eggs/
	rm -rf .pytest_cache/ .coverage htmlcov/
	rm -rf .mypy_cache/

# Docker
docker-build:
	docker build -t gallagher-cres .

docker-run:
	docker run -p 8000:8000 --env-file .env gallagher-cres

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Database
db-migrate:
	@echo "Run schema.sql in Supabase SQL Editor"

db-reset:
	@echo "Reset database - implement as needed"

# Documentation
docs-serve:
	cd docs && mkdocs serve

docs-build:
	cd docs && mkdocs build

# Deployment
deploy-staging:
	@echo "Deploy to staging - implement as needed"

deploy-production:
	@echo "Deploy to production - implement as needed"

# Utilities
env-example:
	cp .env.example .env
	@echo "Created .env file - please edit with your API keys"

requirements-freeze:
	pip freeze > requirements.lock

# Health check
health:
	curl http://localhost:8000/health | python -m json.tool
