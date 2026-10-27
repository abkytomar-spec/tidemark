# Tidemark

*Every day leaves a mark.*

A mobile-first, private PWA for recurring tasks, one-time plans, goals, gym progress, photo memories, streaks, focus, meditation, and reflection. Data syncs through a PHP/MySQL API and photos are stored outside the public web root.

## Highlights

- Daily, weekly, monthly, and one-time tasks with calendar and progress views
- Guided Gym goals, routines, planned or flexible rest, records, live-camera proof, and Gym Streak Anchor
- Separate private photo libraries for Gym, Goals, Tasks, and Daily Snapshots
- Optional Daily Snapshot reminders capped at two per day, plus voluntary camera capture at any time
- Saved workout places, nearby start prompts, and optional time/weather ambience
- Synced app-wide Streak Anchor, Pomodoro presets, guided meditation, and light/dark themes

## Local checks

```sh
npm install
docker compose up -d db
npm test -- --run
npm run test:php
npm run typecheck
npm run build
npm run package:hostinger
```

The generated `release/` folder mirrors the safe Hostinger layout. Copy `public_html/` to the domain root, keep `tidemark-private/` beside it, import `database/schema.sql`, and fill the private `config.php` from its example.

## Training

Tidemark has five primary tabs: Today, Planner, Train, Goals, and Logbook. On the first Gym visit, choose a primary goal, fixed or flexible rest, training weekdays and weekly target, a routine, and metric or imperial units. Fixed rest marks the chosen weekdays; flexible rest can replace a training or open day until its weekly allowance is used.

Completed workouts require a live-camera proof photo. Photos remain private in `tidemark-private/proofs`; there is no device-gallery or file-upload fallback. Each seven qualifying, proof-backed workouts grows at most one Gym Streak Anchor; seven productive days also grow a separate app-wide Anchor.

For an existing installation, back up the database and private proof directory, deploy the new files without replacing `tidemark-private/config.php`, then import every unapplied SQL file in `database/migrations/` in filename order. New installations only need `database/schema.sql`.

## Deploying to Vercel (browser-only)

Vercel can't run the PHP + MySQL backend, so the Vercel build uses **local mode** (`VITE_LOCAL_MODE=1`): the whole app runs in the browser and keeps data, including photos, in that device's IndexedDB. There is no login and no sync between devices. `vercel.json` sets the build, and `.vercelignore` keeps the PHP/database folders out of the upload.

```sh
vercel deploy --prod
```

For the full synced version, deploy the PHP release to a PHP/MySQL host as described above instead.

## Design

Tidemark uses an ocean / nautical-chart look: a cool mist canvas with faint depth lines, Futura-style display type, monospace eyebrows, a docked tab bar with a coral marker, and a **tide gauge** on Today, where water rises around a lighthouse as tasks get done. Tide themes are Coral reef, Lagoon, and Midnight sea.

## Credits

Built on the open-source [DaySpark](https://github.com/dhe-eraj-s/dayspark) project (ISC licence), with a new name, copy, and visual design.
