# WealthWise

A personal finance web app built with React, TypeScript, and Vite.

## Getting started

### Prerequisites

- Node.js 20+
- npm

### Install and run

```sh
npm i; npm run dev
```

The app runs locally with hot reloading. By default, Vite serves it at `http://localhost:8080`.

## Backend integration (optional, for multi-device sync)

By default, WealthWise stores data in browser local storage.

To sync data across devices, set:

```sh
VITE_API_BASE_URL=https://your-api.example.com
```

When this variable is set, the app will attempt to sync auth/profile/expense data with your API while still maintaining local storage as a fallback cache.

### Expected API endpoints

- `POST /auth/signup` → `{ success, user, token? }`
- `POST /auth/login` → `{ success, user, token? }`
- `POST /auth/reset-password` → `{ success, error? }`
- `GET /auth/me` (with `Authorization: Bearer <token>`) → `{ success, user }`
- `PATCH /users/:id` (with optional bearer token) → `{ success }`
- `GET /expenses?userId=<id>` → `{ expenses: Expense[] }`
- `POST /expenses` body `{ userId, expense }`
- `DELETE /expenses/:id?userId=<id>`
- `DELETE /expenses?userId=<id>`

## Available scripts

- `npm run dev` – start the development server
- `npm run build` – create a production build
- `npm run deploy` – create a production build on the branch gh-pages
- `npm run preview` – preview the production build locally
- `npm run lint` – run ESLint
- `npm run test` – run tests once with Vitest
- `npm run test:watch` – run Vitest in watch mode
- `npm run cap:sync` – build and copy the web app into the native iOS/Android projects
- `npm run cap:ios` – sync then open the iOS project in Xcode
- `npm run cap:android` – sync then open the Android project in Android Studio

## iOS app (Capacitor)

The web app is wrapped as a native iOS shell with [Capacitor](https://capacitorjs.com) —
same React source, no separate codebase. Requires a Mac with Xcode + CocoaPods; this
repo was scaffolded on Linux, so `pod install` hasn't run yet.

```sh
npm install
sudo gem install cocoapods   # one-time, on the Mac
npm run cap:ios              # builds the web app, syncs it, opens Xcode
```

Then build/run from Xcode onto a device or simulator as usual. `npm run cap:ios` again
after any code change to pick it up.

### Quick-log entry points

Two ways into the app's "log an expense fast" overlay, both iOS-only (inert on
web/Android):

- **Home Screen long-press** — shows 4 quick actions (Food & Dining, Transport,
  Shopping, Bills & Utilities), each dropping straight into that category's
  amount entry. Registered automatically at launch, no setup needed.
- **Back Tap** — Apple doesn't expose the back-tap gesture to third-party apps at
  all; there's no API for it. The app registers a `wealthwise://quicklog` URL
  scheme that opens the category-picker overlay, but *wiring Back Tap to it is a
  one-time manual step you do in iOS Settings*, not something the app can do
  for you:
  1. Shortcuts app → **+** → search **Open URLs** → paste `wealthwise://quicklog` → save as e.g. "Quick Log"
  2. Settings → Accessibility → Touch → **Back Tap** → Double Tap (or Triple Tap) → pick "Quick Log"

## Tech stack

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

You can deploy the production build to any static hosting provider.

```sh
npm run deploy 
```

This has to be run after pushing your changes to GitHub, so this runs the pipeline and actually gets deployed

## Troubleshooting npm esbuild version mismatch

If you see an error like:

```text
.../node_modules/esbuild/install.js
Expected "<version>" but got "<version>"
```

try this clean reinstall flow:

```sh
rm -rf node_modules package-lock.json
npm cache clean --force
unset ESBUILD_BINARY_PATH
npm i
```

This project pins `esbuild` via npm `overrides` to reduce version drift across transitive dependencies.