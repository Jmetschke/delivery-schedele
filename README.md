# Delivery Calendar Starter App

This is a starter app for manually entering dispensary deliveries into a calendar and checklist app.

## What it does

- Adds new deliveries from an entry form
- Tracks date, time, dispensary details, delivering companies, display needs, order date, and boarder store status
- Shows deliveries on a calendar
- Shows deliveries in a separate list
- Lets you open a delivery and check off preparation steps
- Automatically marks deliveries as in progress when checklist work starts and completed when all checklist items are done
- Lets you edit delivery details, status, and notes

## Setup

1. Open this folder in VS Code.
2. Open the VS Code terminal.
3. Run:

```bash
npm install
npm start
```

4. Open this in Safari or Chrome:

```text
http://localhost:3000
```

5. Use the New Delivery form to add deliveries.

## Main files

```text
server.js          Backend routes and delivery APIs
db.js              SQLite database setup
public/index.html  App screen
public/app.js      Frontend logic
public/styles.css  App styling
data/              SQLite database is created here
```

## Database persistence

The app stores deliveries in Turso when these environment variables are set:

```text
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-token
```

For local development without Turso credentials, the app falls back to a local SQLite database at:

```text
data/delivery-calendar.sqlite
```

You can override the local development database location with:

```text
DELIVERY_DB_PATH=/path/to/local/delivery-calendar.sqlite
DELIVERY_DATA_DIR=/path/to/persistent/data
```

Database files are ignored by Git so private delivery data is not pushed to GitHub.

## Good next Codex tasks

Ask Codex to:

```text
Add a weekly calendar view and make the delivery cards color-coded by status.
```

```text
Add a company filter to the delivery list.
```

```text
Add an export button that downloads the current delivery list as Excel.
```

```text
Add login protection so only staff can access the delivery calendar.
```

```text
Add required-field highlighting for incomplete delivery records.
```

## Notes

This first version uses FullCalendar from a CDN and SQLite locally. That keeps the app simple and easy to test before making it more advanced.
