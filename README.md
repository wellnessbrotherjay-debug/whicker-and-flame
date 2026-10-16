# Whisker & Heat

Real cats. Wild recipes. Four fictional cat chefs — Luna, Simba, Nico and Milo — a lost recipe book, and real recipes for your kitchen.

## What it does

- Recipe library with ingredient search and eight collections
- Recipe pages with an ingredient checklist and step-by-step cooking mode with timers
- Accounts: saved recipes, a dated meal plan, and a shopping list that adds up ingredients across meals and scales by servings
- Season one story outlines, each linked to a recipe
- Video studio (`/studio`, admin emails only) with a job queue for an n8n video workflow

## Stack

React + Vite front end, a small Node server (`server/`), and Postgres. Content lives in `content/recipes.json` and `content/site.json`.

## Run locally

```bash
createdb whisker_dev && createdb whisker_test
cp .env.example .env
npm install
npm test
npx vite build && npm start
```

Then open http://localhost:4317.

## Deploy

`compose.yml` runs the app, Postgres and a nightly database backup behind a Coolify/Traefik proxy. Put `DOMAIN`, `POSTGRES_PASSWORD`, `ADMIN_EMAILS` and `WF_WORKFLOW_TOKEN` in `.env.production` next to it, then:

```bash
docker compose --env-file .env.production up -d --build
```
