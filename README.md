# Whisker & Heat

Real cats. Wild recipes. Four fictional cat chefs — Luna, Simba, Nico and Milo — a lost recipe book, and real recipes for your kitchen.

## What it does

- **Discover** — featured episode and recipe, the four characters, the original kitchen film, eight collections, picks that follow your preferences
- **Cook** — search by recipe or ingredient; filter by collection, category, total time, difficulty, budget and meat-free; reset
- **Recipe pages** — introduction, time, servings, difficulty, ingredient checklist, numbered method, allergen notes, a servings control that rescales quantities, step-by-step cooking mode with timers
- **My Kitchen** — saved recipes, a seven-day planner with breakfast/lunch/dinner, a shopping list grouped by aisle that adds up ingredients across meals (different units are never added together), tick/remove/clear, and cooking preferences
- **Characters and story** — profiles from the story bible, season one episode pages with previous/next, related recipes and cast
- **Community** — clearly labelled as coming later; nothing pretends to be live
- **Studio** (`/studio`, admin emails only) — video job queue for an n8n workflow

My Kitchen works without an account (kept in the browser). Signing in moves it into the account so it follows you across devices.

All recipes are labelled as editorial sample content. Allergen notes come from the ingredient lists; there is no invented nutrition data.

## Adding content

- Recipes: `content/recipes.json` — `id`, `title`, `description`, `servings`, `totalMinutes`, `difficulty`, `categories`, `ingredients` (metric, "amount unit name" so the shopping list can add them up), `steps`, `allergens`, `editorialStatus`, optional `image`.
- Characters, collections, episodes and page words: `content/site.json`.
- Product events go through `src/track.js`; nothing is collected until an analytics tool is connected there.

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
