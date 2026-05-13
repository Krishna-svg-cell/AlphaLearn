-- ============================================================
-- ALPHALEARN PostgreSQL Schema
-- Designed for cloud deployment (Neon, Supabase, Railway, etc.)
-- ============================================================

-- Schools
CREATE TABLE IF NOT EXISTS school (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    address TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#4f46e5',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users (all roles: ADMIN, PRINCIPAL, STAFF, STUDENT, PARENT)
CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    usn TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK(role IN ('STUDENT', 'STAFF', 'ADMIN', 'PARENT', 'PRINCIPAL')),
    school_id INTEGER REFERENCES school(id) ON DELETE CASCADE,
    class_name TEXT,
    section_name TEXT,
    mapped_student_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    xp INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_active_date DATE
);

-- Daily Mission tracking
CREATE TABLE IF NOT EXISTS daily_mission (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    vocab_score INTEGER,
    grammar_score INTEGER,
    syllabus_score INTEGER,
    sentence_score INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, date)
);

-- Badges (gamification)
CREATE TABLE IF NOT EXISTS badge (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    badge_name TEXT NOT NULL,
    earned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Grammar module questions
CREATE TABLE IF NOT EXISTS grammar_module (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('beginner', 'intermediate', 'proficient')),
    topic TEXT,
    content TEXT,
    question_text TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT
);

-- Syllabus lessons and quizzes
CREATE TABLE IF NOT EXISTS syllabus (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    lesson_title TEXT NOT NULL,
    content TEXT NOT NULL,
    quiz_data TEXT
);

-- Vocabulary questions (meaning, synonym, antonym)
CREATE TABLE IF NOT EXISTS vocabulary (
    id SERIAL PRIMARY KEY,
    class_name TEXT NOT NULL DEFAULT '1',
    word TEXT NOT NULL,
    meaning TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('meaning', 'synonym', 'antonym'))
);

-- Custom tests created by admin
CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    school_id INTEGER,
    class_name TEXT NOT NULL,
    section_name TEXT,
    title TEXT NOT NULL,
    questions TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Per-question answer tracking for daily missions
CREATE TABLE IF NOT EXISTS mission_answers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    section TEXT NOT NULL,
    question_text TEXT NOT NULL,
    selected_index TEXT NOT NULL,
    correct_index TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    options_json TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notification (
    id SERIAL PRIMARY KEY,
    target_role TEXT,
    target_user_id INTEGER,
    school_id INTEGER,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- MCQ question sets (per category)
CREATE TABLE IF NOT EXISTS mcq_set (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('meaning', 'content', 'grammar', 'syllabus')),
    title TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sentence formation exercises
CREATE TABLE IF NOT EXISTS sentence_exercise (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    correct_sentence TEXT NOT NULL,
    words_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Test submissions by students
CREATE TABLE IF NOT EXISTS test_submission (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    answers_json TEXT,
    submitted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, test_id)
);

-- ============================================================
-- NEW PREMIUM FEATURES (COMMUNICATION & ATTENDANCE)
-- ============================================================

-- Communication / Doubts
CREATE TABLE IF NOT EXISTS communication (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late')),
    remarks TEXT,
    recorded_by INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, date)
);

-- ============================================================
-- MULTI-SUBJECT ACADEMICS MODULE
-- ============================================================

-- Subject catalog (master list of all available subjects)
CREATE TABLE IF NOT EXISTS subject (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '📚',
    color TEXT DEFAULT '#4f46e5',
    category TEXT DEFAULT 'core' CHECK(category IN ('core', 'language', 'elective')),
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- School-level subject configuration (Principal controls)
CREATE TABLE IF NOT EXISTS school_subject (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    section_name TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    assigned_teacher_id INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    academic_year TEXT DEFAULT '2026-27',
    created_at TIMESTAMP DEFAULT NOW()
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
    content TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subject quiz questions (generic, works for all subjects)
CREATE TABLE IF NOT EXISTS subject_question (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    chapter_id INTEGER REFERENCES subject_chapter(id) ON DELETE SET NULL,
    class_name TEXT NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'mcq' CHECK(question_type IN ('mcq', 'true_false', 'fill_blank')),
    options_json TEXT,
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
    last_activity TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE INDEXES (critical for 1000+ concurrent users)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_school ON "user"(school_id);
CREATE INDEX IF NOT EXISTS idx_user_role ON "user"(role);
CREATE INDEX IF NOT EXISTS idx_user_class ON "user"(class_name);
CREATE INDEX IF NOT EXISTS idx_user_usn ON "user"(usn);
CREATE INDEX IF NOT EXISTS idx_daily_mission_user_date ON daily_mission(user_id, date);
CREATE INDEX IF NOT EXISTS idx_mission_answers_user_date ON mission_answers(user_id, date);
CREATE INDEX IF NOT EXISTS idx_mission_answers_correct ON mission_answers(user_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_notification_target_user ON notification(target_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_target_role ON notification(target_role, school_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_class_type ON vocabulary(class_name, type);
CREATE INDEX IF NOT EXISTS idx_grammar_class ON grammar_module(class_name);
CREATE INDEX IF NOT EXISTS idx_syllabus_class ON syllabus(class_name);
CREATE INDEX IF NOT EXISTS idx_sentence_class ON sentence_exercise(class_name);
CREATE INDEX IF NOT EXISTS idx_badge_user ON badge(user_id);
CREATE INDEX IF NOT EXISTS idx_test_submission_user ON test_submission(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_class ON tests(class_name);
CREATE INDEX IF NOT EXISTS idx_communication_sender ON communication(sender_id);
CREATE INDEX IF NOT EXISTS idx_communication_receiver ON communication(receiver_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, date);

-- Multi-subject indexes
CREATE INDEX IF NOT EXISTS idx_school_subject_school ON school_subject(school_id, class_name);
CREATE INDEX IF NOT EXISTS idx_school_subject_teacher ON school_subject(assigned_teacher_id);
CREATE INDEX IF NOT EXISTS idx_subject_chapter_subject ON subject_chapter(subject_id, class_name);
CREATE INDEX IF NOT EXISTS idx_subject_question_subject ON subject_question(subject_id, class_name);
CREATE INDEX IF NOT EXISTS idx_subject_question_chapter ON subject_question(chapter_id);
CREATE INDEX IF NOT EXISTS idx_subject_progress_user ON subject_progress(user_id, subject_id);

