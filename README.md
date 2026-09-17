# Security Occurrence Management System (SOMS)

A real-time security occurrence management platform built with React, TypeScript, Supabase, and Express. Designed for security officers, station managers, and administrators to log, track, and manage security incidents across multiple stations.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 6 |
| Backend | Express, tsx |
| Database | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth |
| PWA | vite-plugin-pwa |

---

## Features

- **Real-time Dashboard** — Live metrics, station overview, and occurrence stream
- **Multi-role Access** — Admin, Manager, Officer portals with role-based views
- **Station Management** — Create, edit, delete stations with manager assignment
- **Personnel Directory** — Full CRUD for managers and officers with badge IDs
- **Duty Sessions** — Start/end shifts with real-time tracking
- **Occurrence Logging** — Officers log incidents with descriptions and timestamps
- **Report Workflow** — Officer submit → Manager review → Admin finalize
- **Audit Trail** — Immutable system-wide event logging
- **PWA Support** — Installable on mobile and desktop devices

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- A [Supabase](https://supabase.com/) project

### 1. Clone the repository

```bash
git clone https://github.com/resolvehub3-rgb/security-occurrence-system.git
cd security-occurrence-system
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Run the database migration

Go to your Supabase SQL Editor and run:

```
supabase/migrations/20260916_init_schema.sql
```

This creates all tables, RLS policies, triggers, and realtime publications.

### 5. Start the development server

```bash
pnpm dev
```

The app runs at `http://localhost:3000`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build frontend + bundle server for production |
| `pnpm start` | Run production server |
| `pnpm preview` | Preview production build |
| `pnpm lint` | Type-check with TypeScript |

---

## Project Structure

```
├── public/
│   ├── logo.png            # System logo
│   ├── auth-bg.png         # Login page background
│   └── icon.svg            # App icon
├── src/
│   ├── components/
│   │   ├── admin/          # Admin portal (dashboard, stations, users, reports, audit)
│   │   ├── manager/        # Manager portal (dashboard, officers, occurrences)
│   │   ├── officer/        # Officer portal (home, history, profile)
│   │   ├── auth/           # Login page
│   │   └── common/         # Shared components (header, PWA, offline indicator)
│   ├── context/            # React context (auth, notifications)
│   ├── lib/                # Utilities (Supabase client, safe fetch, personnel storage)
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Timezone helpers
├── supabase/
│   └── migrations/         # Database schema & RLS policies
├── server.ts               # Express backend API
├── vite.config.ts          # Vite configuration
└── tsconfig.json           # TypeScript configuration
```

---

## Server API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/create-user` | Create manager or officer account |
| POST | `/api/admin/toggle-user-status` | Activate/deactivate user |
| POST | `/api/admin/update-badge` | Update officer badge ID |
| POST | `/api/admin/save-station` | Create or update a station |
| POST | `/api/admin/delete-station` | Deactivate a station |
| POST | `/api/admin/update-user` | Update user profile details |
| POST | `/api/admin/delete-user` | Delete user profile and auth account |
| GET | `/api/admin/dashboard-stats` | Get dashboard metrics |
| GET | `/api/admin/sidebar-counts` | Get sidebar badge counts |

---

## Database Schema

- **profiles** — User profiles linked to Supabase Auth
- **stations** — Security posts with manager assignment
- **station_officers** — Officer-to-station assignments
- **duty_sessions** — Shift tracking with status workflow
- **occurrences** — Security incident logs
- **occurrence_evidence** — File attachments for occurrences
- **duty_reports** — Manager-reviewed duty reports
- **notifications** — User notification inbox
- **audit_logs** — Immutable system event trail

All tables use Row Level Security (RLS) with role-based policies.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |

---

## License

Private — All rights reserved.
