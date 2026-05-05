# HexGlyph

A React/TypeScript web app for generating and scanning HexGlyph codes, with optional Android deployment via Capacitor.

## Requirements

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) v8+ (`npm install -g pnpm`)

## Getting Started (Local)

```bash
# Install dependencies
pnpm install

# Start the dev server (http://localhost:5173)
pnpm dev

# Build for production
pnpm build

# Preview the production build
pnpm serve

# Type-check without emitting
pnpm typecheck
```

## Android (Capacitor)

```bash
# Build the web assets first
pnpm build

# Sync to Android project
pnpm cap sync android

# Open in Android Studio
pnpm cap open android
```

> **Note:** Requires [Android Studio](https://developer.android.com/studio) with SDK 34+.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS** + **shadcn/ui** components
- **Capacitor** (optional Android packaging)
