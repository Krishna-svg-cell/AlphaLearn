# Multi-Subject Academics Module — Implementation Plan

## Goal

Expand ALPHALEARN from an English-only learning platform to a full multi-subject academic system supporting 20+ subjects across Grades 1–12, with Principal-level curriculum customization, while preserving all existing English functionality.

---

> [!IMPORTANT]
> **This is a very large-scale feature.** The scope described below covers database schema changes, 10+ new API endpoints, 3 new/modified frontend pages, and a complete Principal Panel overhaul. It will be implemented in **phases** to ensure stability.

## User Review Required

> [!WARNING]
> **Breaking Change**: The `school` table will get new columns. The `user` table's `class_name` field will be referenced by a new `subject_config` system. Existing data is fully preserved — no destructive migrations.

> [!CAUTION]
> **Scope Clarification Needed**: The request mentions features like "Notes and worksheet uploads" and "Homework and assignments." File upload functionality requires a storage backend (e.g., S3, Cloudinary). **Should we include file uploads in Phase 1, or defer to a later phase?** Currently, the platform has no file upload infrastructure.

## Open Questions

1. **File Uploads**: Should notes/worksheets/homework support actual file uploads (requires cloud storage setup), or should we start with text-based content only?
2. **Subject Data Population**: The request lists 20+ subjects. Should the system ship with pre-populated question banks, or start empty with the Admin Data Engine for content injection?
3. **Curriculum Patterns**: "Create different curriculum patterns for different branches/schools" — should this be CBSE/ICSE/State Board templates, or fully custom?
4. **Academic Year**: Should we implement a full academic calendar (terms, semesters, exam schedules), or a simpler year/term toggle?

---

## Proposed Changes

### Phase 1: Database Schema & Backend APIs

---

#### [MODIFY] [schema.pg.sql](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/schema.pg.sql)

Add 4 new tables:

```sql
-- Subject catalog (master list of all available subjects)
CREATE TABLE IF NOT EXISTS subject (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,           -- e.g. "Mathematics", "Physics"
    code TEXT UNIQUE NOT NULL,    -- e.g. "MATH", "PHY"
    icon TEXT DEFAULT '📚',
    color TEXT DEFAULT '#4f46e5',
    category TEXT DEFAULT 'core', -- 'core', 'language', 'elective'
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT TRUE
);

-- School-level subject configuration (Principal controls)
CREATE TABLE IF NOT EXISTS school_subject (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,         -- e.g. "6", "10"
    section_name TEXT,                -- NULL = all sections
    is_enabled BOOLEAN DEFAULT TRUE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    assigned_teacher_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    academic_year TEXT DEFAULT '2026-27',
    UNIQUE(school_id, subject_id, class_name, COALESCE(section_name, ''))
);

-- Chapter/topic structure per subject per class
CREATE TABLE IF NOT EXISTS subject_chapter (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_title TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0
);

-- Subject quiz questions (generic, works for all subjects)
CREATE TABLE IF NOT EXISTS subject_question (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES subject_chapter(id) ON DELETE SET NULL,
    class_name TEXT NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'mcq' CHECK(question_type IN ('mcq', 'true_false', 'fill_blank', 'short_answer')),
    options_json TEXT,           -- JSON array of options for MCQ
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subject-wise progress tracking (per student per subject)
CREATE TABLE IF NOT EXISTS subject_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES subject_chapter(id) ON DELETE SET NULL,
    total_attempted INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, subject_id, COALESCE(chapter_id, 0))
);
```

Seed default subjects:

```sql
INSERT INTO subject (name, code, icon, color, category, display_order) VALUES
('English', 'ENG', '📖', '#4f46e5', 'language', 1),
('Mathematics', 'MATH', '🔢', '#059669', 'core', 2),
('Science', 'SCI', '🔬', '#0891b2', 'core', 3),
('Physics', 'PHY', '⚡', '#7c3aed', 'core', 4),
('Chemistry', 'CHEM', '🧪', '#dc2626', 'core', 5),
('Biology', 'BIO', '🧬', '#16a34a', 'core', 6),
('Social Studies', 'SST', '🌍', '#ca8a04', 'core', 7),
('History', 'HIST', '🏛️', '#b45309', 'core', 8),
('Geography', 'GEO', '🗺️', '#0d9488', 'core', 9),
('Political Science', 'POL', '⚖️', '#6366f1', 'core', 10),
('Computer Science', 'CS', '💻', '#2563eb', 'core', 11),
('Economics', 'ECO', '📈', '#9333ea', 'core', 12),
('Commerce', 'COM', '🏪', '#ea580c', 'core', 13),
('Accountancy', 'ACC', '📊', '#0284c7', 'core', 14),
('Business Studies', 'BIZ', '💼', '#4338ca', 'core', 15),
('Environmental Studies', 'EVS', '🌱', '#15803d', 'core', 16),
('Hindi', 'HIN', '🇮🇳', '#e11d48', 'language', 17),
('Kannada', 'KAN', '📜', '#b91c1c', 'language', 18),
('General Knowledge', 'GK', '💡', '#f59e0b', 'elective', 19)
ON CONFLICT (code) DO NOTHING;
```

---

#### [MODIFY] [server.js](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/server.js)

Add new API endpoint groups:

**Subject Management (Admin/Principal)**
- `GET /api/subjects` — List all system subjects
- `GET /api/principal/subjects` — Get school's subject configuration
- `POST /api/principal/subjects` — Enable/disable subject for a class
- `PUT /api/principal/subjects/:id` — Update subject config (assign teacher, toggle mandatory)
- `DELETE /api/principal/subjects/:id` — Remove subject from class
- `POST /api/principal/subjects/custom` — Add custom school-specific subject

**Chapter Management (Principal/Staff)**
- `GET /api/principal/chapters?subject_id=X&class_name=Y` — List chapters
- `POST /api/principal/chapters` — Add chapter
- `PUT /api/principal/chapters/:id` — Update chapter
- `DELETE /api/principal/chapters/:id` — Delete chapter

**Subject Questions (Admin/Staff Data Engine)**
- `GET /api/admin/subject-questions?subject_id=X&class_name=Y` — List questions
- `POST /api/admin/subject-questions` — Add question(s)
- `POST /api/admin/subject-questions/bulk` — Bulk add
- `DELETE /api/admin/subject-questions/:id` — Delete question

**Student Subject APIs**
- `GET /api/student/subjects` — Get enabled subjects for student's class
- `GET /api/student/subject-quiz?subject_id=X&chapter_id=Y` — Get quiz questions
- `POST /api/student/subject-quiz/submit` — Submit quiz answers (tracks progress & XP)
- `GET /api/student/subject-progress` — Get subject-wise progress stats

**Staff/Parent Subject APIs**
- `GET /api/staff/subject-progress?student_id=X` — View student's subject progress
- `GET /api/parent/subject-progress` — View child's subject progress

---

#### [MODIFY] [db.js](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/db.js)

Add subject table seeding to `initDb()` function — runs the INSERT for default subjects after schema init.

---

### Phase 2: Frontend — Principal Panel

---

#### [MODIFY] [principal/page.jsx](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/app/principal/page.jsx)

Add a new **"Subjects"** tab to the Principal dashboard:

- **Subject Configuration Grid**: Toggle subjects on/off per class
- **Teacher Assignment**: Dropdown to assign staff to each subject/class combo
- **Chapter Manager**: Add/edit/delete chapters per subject per class
- **Custom Subject Creator**: Form to add school-specific subjects
- **Academic Year Selector**: Simple dropdown to set current academic year

---

### Phase 3: Frontend — Student & Staff Dashboards

---

#### [MODIFY] [student/page.jsx](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/app/student/page.jsx)

Add a **"Subjects"** tab (or integrate into Mission) showing:

- Grid of enabled subjects with icons/colors
- Click into a subject → see chapters → take chapter quiz
- Subject-wise progress bars and XP breakdown
- Subject leaderboard

#### [MODIFY] [staff/page.jsx](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/app/staff/page.jsx)

Add subject progress visibility:

- View subject-wise analytics per student
- See which subjects students are weak in

#### [MODIFY] [parent/page.jsx](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/app/parent/page.jsx)

Add subject progress visibility:

- View child's subject-wise progress
- See performance per chapter

---

### Phase 4: Admin Data Engine Enhancement

---

#### [MODIFY] [admin/page.jsx](file:///c:/Users/rajgo/OneDrive/Desktop/alphalearn-main/app/admin/page.jsx)

Enhance the Data Engine tab:

- Add a **Subject selector** dropdown (currently it only has English module types)
- When a non-English subject is selected, show chapter-based question entry forms
- Support bulk question upload for any subject
- Display question counts per subject per class

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify no compilation errors after all changes
- Start dev server (`npm run dev` + `npm run server`) and test all new endpoints via browser

### Manual Verification
1. Log in as **Principal** → verify Subjects tab appears, can enable/disable subjects
2. Log in as **Admin** → verify Data Engine shows subject dropdown, can add questions
3. Log in as **Student** → verify Subjects grid shows only enabled subjects, can take quiz
4. Log in as **Parent** → verify subject progress is visible
5. Verify existing English missions still work identically (no regressions)

---

> [!NOTE]
> **Existing English functionality is 100% preserved.** The current daily mission system (meanings, synonyms, antonyms, grammar, sentence formation) runs from `data/classX.json` files and is completely independent of the new subject system. No existing tables, APIs, or frontend views are removed — only extended.
