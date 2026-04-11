## To-do's
1. Add help center to as feature of how-to guides
2. allow users to specificy which days they would like to trade and if they are accepting trades. - system falls back to allow requesting users to send request to people who have desired dates although they are not willing to trade as indicated
3. system to update all affected calenders
4. 

   
# Excel Shift Sync

A secure, GDPR-compliant web application for syncing Excel shift schedules to Google Calendar.

## Phase 3 Calendar Sync Engine

ShiftSync now runs calendar synchronization through a dedicated Phase 3 sync engine with deterministic diffing.

### How Sync Works

1. Parse/upload creates active shift data.
2. ShiftSync computes a stable shift identity (`shift_uid`) and event fingerprint.
3. Sync compares current active shifts against tracked sync records.
4. Diff actions are generated:
  - `create`: local shift exists but no tracked calendar event
  - `update`: tracked event exists and fingerprint changed
  - `delete`: tracked event exists but shift no longer active/in scope
  - `noop`: fingerprint unchanged
5. Actions are applied to Google Calendar through an adapter layer.

### Update Detection

Updates are triggered when fingerprint fields change, including:

- date
- start/end time
- title
- description/notes
- location

If a shift key drifts between imports, fallback reconciliation matches by day/title and nearest start-time to avoid duplicate creates.

### Delete Detection

A tracked event is deleted when it is stale relative to the current active schedule set in the selected sync window (or in full resync mode).

### Full Resync

Full resync recalculates all actions for the selected range and can:

- create missing tracked events
- update changed tracked events
- delete stale tracked events

### Safety Rule

Only ShiftSync-tracked events are deleted. Untracked calendar events are never removed.

## Setup

### 1. Google OAuth Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application**
6. Add **Authorized JavaScript origins**:
   - `http://localhost:5173` (for local development)
   - `https://a958bff7-dff0-4399-a431-e9332f8df429.canvases.tempo.build` (Tempo preview)
   - Your deployed domain
7. Click **Create** and copy the **Client ID**

### 2. Enable Google Calendar API

1. In Google Cloud Console, navigate to **APIs & Services** > **Library**
2. Search for "Google Calendar API"
3. Click **Enable**

### 3. Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```
VITE_GOOGLE_CLIENT_ID="YOUR_GOOGLE_OAUTH_CLIENT_ID"
```

Replace `YOUR_GOOGLE_OAUTH_CLIENT_ID` with the Client ID from step 1.

### 4. Run the Application

```bash
npm install
npm run dev
```

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- @react-oauth/google for OAuth
- xlsx for Excel parsing

## Original Vite Template Info

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default {
  // other rules...
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
}
```

- Replace `plugin:@typescript-eslint/recommended` to `plugin:@typescript-eslint/recommended-type-checked` or `plugin:@typescript-eslint/strict-type-checked`
- Optionally add `plugin:@typescript-eslint/stylistic-type-checked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and add `plugin:react/recommended` & `plugin:react/jsx-runtime` to the `extends` list


