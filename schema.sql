-- Drop tables if they exist to ensure a clean slate
DROP TABLE IF EXISTS monthly_report;
DROP TABLE IF EXISTS sentence_exercise;
DROP TABLE IF EXISTS mcq_set;
DROP TABLE IF EXISTS syllabus;
DROP TABLE IF EXISTS grammar_module;
DROP TABLE IF EXISTS quiz;
DROP TABLE IF EXISTS word;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS school;
DROP TABLE IF EXISTS test;

-- School Table (NEW)
CREATE TABLE school (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    address TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User Table (Updated with gamification fields)
CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    usn TEXT UNIQUE, 
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK(role IN ('STUDENT', 'STAFF', 'ADMIN', 'PARENT', 'PRINCIPAL')),
    school_id INTEGER,
    class_name TEXT,
    section_name TEXT,
    mapped_usns TEXT,
    xp INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_active_date DATE,
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
);

-- Test Table (NEW)
CREATE TABLE test (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    title TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
);

-- Test Result Table (NEW)
CREATE TABLE test_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_id) REFERENCES test (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

-- Daily Mission Table (NEW)
CREATE TABLE daily_mission (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    vocab_score INTEGER,
    grammar_score INTEGER,
    syllabus_score INTEGER,
    is_completed BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

-- Badge Table (NEW)
CREATE TABLE badge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    badge_name TEXT NOT NULL,
    earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

-- Session Table
CREATE TABLE session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    learning_type TEXT NOT NULL,
    difficulty_level TEXT NOT NULL,
    score_percent INTEGER NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

-- Word Table (Stores words learned in a session)
CREATE TABLE word (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    letter TEXT NOT NULL,
    word_text TEXT NOT NULL,
    definition TEXT NOT NULL,
    example TEXT,
    FOREIGN KEY (session_id) REFERENCES session (id) ON DELETE CASCADE
);

-- Quiz Table (Stores quiz details for review)
CREATE TABLE quiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    quiz_data TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES session (id) ON DELETE CASCADE
);

-- Feedback Table
CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

-- Grammar Module Table (NEW)
CREATE TABLE grammar_module (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('beginner', 'intermediate', 'proficient')),
    question_text TEXT NOT NULL,
    options TEXT NOT NULL, -- JSON string of options
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
);

-- Syllabus Table (NEW)
CREATE TABLE syllabus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    lesson_title TEXT NOT NULL,
    content TEXT NOT NULL,
    quiz_data TEXT, -- JSON string for lesson quiz
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
);

-- Monthly Report Table (NEW)
CREATE TABLE monthly_report (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    report_month TEXT NOT NULL,
    report_data TEXT NOT NULL, -- JSON string
    date_sent TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES user (id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES user (id) ON DELETE CASCADE
);

-- Notification Table (NEW)
CREATE TABLE notification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES user (id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES user (id) ON DELETE CASCADE
);

-- Default Admin (Password: admin123)
INSERT INTO user (username, password, usn, role) 
VALUES (
    'admin', 
    'pbkdf2:sha256:600000$Wv9D7nSjVq7H4gMv$3b4a4968832c3241b71181816e87f877f87229e7150a00d83641214e9f73315c', 
    'ADMIN001', 
    'ADMIN'
);

-- MCQ Set Table (5-question sets per category)
CREATE TABLE mcq_set (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('meaning','content','grammar','syllabus')),
    title TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
);

-- Sentence Formation Exercise Table
CREATE TABLE sentence_exercise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    correct_sentence TEXT NOT NULL,
    words_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
);