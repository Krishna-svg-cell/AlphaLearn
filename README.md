# ALPHALEARN EdTech Platform

ALPHALEARN is a modern, full-stack educational technology platform designed to facilitate daily learning missions, progress tracking, and school management. It supports multiple user roles including Students, Staff, Parents, Principals, and Admins.

## 🚀 Tech Stack

- **Frontend**: Next.js (App Router), React 18, Tailwind CSS, Framer Motion, Lucide React
- **Backend**: Express.js (Node.js)
- **Database**: PostgreSQL (via `pg` node-postgres)
- **Authentication**: JWT (JSON Web Tokens), bcryptjs
- **Other Tools**: Recharts (Analytics), jsPDF (Report generation), Capacitor (Mobile App wrapper readiness)

## ✨ Services & Features Offered

ALPHALEARN offers a comprehensive suite of educational services tailored to different user roles, providing an end-to-end learning and school management experience.

### 📚 Educational Services (For Students)
- **Daily Learning Missions**: An algorithmic, daily curriculum that prevents burnout while ensuring consistent learning. Modules include:
  - **Vocabulary Building**: Interactive meaning, synonym, and antonym exercises.
  - **Grammar Practice**: Contextual grammar quizzes based on class level.
  - **Sentence Formation**: Drag-and-drop interactive jumbled word exercises to improve syntax.
  - **Syllabus Integration**: School-specific subject quizzes tied directly to classroom lessons.
- **Multi-Subject Academics**: Full support for 20+ academic subjects across Grades 1–12:
  - Mathematics, Science, Physics, Chemistry, Biology, Social Studies, History, Geography, Political Science, Computer Science, Economics, Commerce, Accountancy, Business Studies, Environmental Studies, Hindi, Kannada, General Knowledge, and custom school-specific subjects.
  - Chapter-based quiz navigation with progress tracking per subject.
  - Quick Quiz mode (all chapters) and Chapter-specific quiz modes.
  - Subject-wise accuracy bars, XP tracking, and leaderboard integration.
- **Progress Tracking & Analytics**: Visual donut charts detailing performance across all modules, historical review of past missions, and error analysis.
- **Gamification Engine**: Students earn XP (Experience Points) and maintain daily streaks to unlock custom Badges (e.g., Weekly Warrior, Monthly Master), driving high engagement.
- **Practice Hub**: Access to mock tests, extra syllabus practice, and historical revision modes outside of the daily mission.

### 🏫 Administrative Services (For Admins & Principals)
- **School & Roster Management**: Create and configure schools, manage onboarding, and assign custom branding (logos/colors) per school.
- **Principal Subject Configuration Panel**: Principals can customize the academic experience per school:
  - Enable/disable any of the 20+ subjects per class (Grades 1–12).
  - Assign subject teachers to specific classes.
  - Create custom school-specific subjects with custom icons and colors.
  - Manage chapter/topic structures per subject per grade.
  - Toggle mandatory vs. elective subject status.
- **Data Engine**: A specialized dashboard to securely inject bulk vocabulary, grammar, syllabus, and subject question datasets via UI without needing direct database access.
- **Institution Analytics**: High-level overviews of school performance, total active students, and staff engagement metrics.

### 👩‍🏫 Staff & Parental Tools
- **Staff/Teacher Dashboard**: Monitor class-wide performance, view individual student streaks and XP, subject-wise progress analytics per student, and track daily mission completion rates.
- **Parent Portal**: Real-time insights into their child's learning metrics, subject-wise progress bars with accuracy and XP, completion times, and areas of improvement, coupled with automated alert notifications.

---

## 🛠️ Local Setup Instructions

### 1. Prerequisites
Ensure you have the following installed:
- Node.js (v18 or higher recommended)
- PostgreSQL (Local instance or cloud provider like Neon.tech)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone <repository-url>
cd alphalearn
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory based on the following template:

```env
# Database Connection (Neon DB or Local PostgreSQL)
DATABASE_URL=postgresql://user:password@host:port/dbname?sslmode=require

# JWT Secret for Authentication
JWT_SECRET=your-super-secret-key

# Server Configurations
NODE_ENV=development
PORT=3001 # Backend port (Frontend runs on 3000)
```

### 4. Running the Application
The project is structured as a unified monorepo where Next.js serves the frontend and Express serves the backend APIs.

Start the backend server (runs on port `3001`):
```bash
npm run server
```

In a new terminal window, start the Next.js frontend development server (runs on port `3000`):
```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

> **Note**: On the first run, the backend will automatically initialize the PostgreSQL schema and create a default admin user (`admin` / `admin123`).

---

## 📁 Project Structure

```text
alphalearn/
├── app/                  # Next.js Frontend App Router (Pages, Components, Layouts)
│   ├── admin/            # Admin Dashboard
│   ├── components/       # Shared UI Components (DashboardLayout, etc.)
│   ├── parent/           # Parent Dashboard
│   ├── principal/        # Principal Dashboard
│   ├── staff/            # Staff Dashboard
│   └── student/          # Student Dashboard
├── data/                 # JSON files for algorithmic mission generation
├── public/               # Static assets (images, icons, PWA manifests)
├── server.js             # Express.js Backend Entry Point
├── db.js                 # PostgreSQL Database Connection & Query Wrapper
├── schema.pg.sql         # PostgreSQL Schema Initialization Script
├── tailwind.config.js    # Tailwind CSS Configuration
└── package.json          # Project Dependencies & Scripts
```

## 🔐 Authentication & Security

- **JWT Tokens**: Stored locally and passed via `Authorization: Bearer <token>` header for all API calls.
- **Role-Based Access Control (RBAC)**: Enforced via Express middleware (`requireRole` and `verifySchoolContext`).
- **Rate Limiting**: API endpoints are protected against brute-force attacks (`express-rate-limit`).

## 🗄️ Database Management

The platform uses raw SQL queries executed via a custom PostgreSQL wrapper (`db.js`) that includes:
- Automatic connection retries for serverless database cold starts (e.g., Neon).
- SQLite-to-PostgreSQL syntax compatibility bridging.
- Automatic table migration and schema initialization.

*Built for robust and scalable educational delivery.*
