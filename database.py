import sqlite3
import json
from flask import current_app, g
from werkzeug.security import generate_password_hash

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(
            current_app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.db.row_factory = sqlite3.Row
    return g.db

def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = get_db()
    with current_app.open_resource('schema.sql') as f:
        db.executescript(f.read().decode('utf8'))

def init_app(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        db = get_db()
        try:
            db.execute("SELECT role FROM user LIMIT 1")
        except sqlite3.OperationalError:
            init_db()
            
        # Migration for Gamification & New Modules
        try:
            db.execute("SELECT xp FROM user LIMIT 1")
        except sqlite3.OperationalError:
            db.execute("ALTER TABLE user ADD COLUMN xp INTEGER DEFAULT 0")
            db.execute("ALTER TABLE user ADD COLUMN streak INTEGER DEFAULT 0")
            db.execute("ALTER TABLE user ADD COLUMN last_active_date DATE")
            db.execute('''
            CREATE TABLE IF NOT EXISTS daily_mission (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                date DATE NOT NULL,
                vocab_score INTEGER,
                grammar_score INTEGER,
                syllabus_score INTEGER,
                is_completed BOOLEAN DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
                UNIQUE(user_id, date)
            )''')
            db.execute('''
            CREATE TABLE IF NOT EXISTS badge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                badge_name TEXT NOT NULL,
                earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
            )''')
            db.execute('''
            CREATE TABLE IF NOT EXISTS grammar_module (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                school_id INTEGER NOT NULL,
                class_name TEXT NOT NULL,
                level TEXT NOT NULL CHECK(level IN ('beginner', 'intermediate', 'proficient')),
                question_text TEXT NOT NULL,
                options TEXT NOT NULL,
                correct_answer TEXT NOT NULL,
                explanation TEXT,
                FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
            )''')
            db.execute('''
            CREATE TABLE IF NOT EXISTS syllabus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                school_id INTEGER NOT NULL,
                class_name TEXT NOT NULL,
                subject TEXT NOT NULL,
                lesson_title TEXT NOT NULL,
                content TEXT NOT NULL,
                quiz_data TEXT,
                FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
            )''')
            db.execute('''
            CREATE TABLE IF NOT EXISTS test (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                school_id INTEGER NOT NULL,
                class_name TEXT NOT NULL,
                title TEXT NOT NULL,
                questions_json TEXT NOT NULL,
                FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
            )''')
            db.execute('''
            CREATE TABLE IF NOT EXISTS test_result (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                score INTEGER NOT NULL,
                total INTEGER NOT NULL,
                date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (test_id) REFERENCES test (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
            )''')
            db.commit()

        # Migration for MCQ Sets, Sentence Exercises, and daily_mission.sentence_score
        db.execute('''
        CREATE TABLE IF NOT EXISTS mcq_set (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            school_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('meaning','content','grammar','syllabus')),
            title TEXT NOT NULL,
            questions_json TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
        )''')
        db.execute('''
        CREATE TABLE IF NOT EXISTS sentence_exercise (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            school_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            correct_sentence TEXT NOT NULL,
            words_json TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (school_id) REFERENCES school (id) ON DELETE CASCADE
        )''')
        try:
            db.execute("SELECT sentence_score FROM daily_mission LIMIT 1")
        except sqlite3.OperationalError:
            try: db.execute("ALTER TABLE daily_mission ADD COLUMN sentence_score INTEGER DEFAULT 0")
            except Exception: pass
        db.commit()

# --- CORE Functions ---

def save_session_data(user_id, session_data):
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        '''INSERT INTO session (user_id, learning_type, difficulty_level, score_percent, date) 
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)''',
        (user_id, session_data['mode'], session_data['level'], session_data['scorePercent'])
    )
    session_id = cursor.lastrowid
    
    words_to_insert = [
        (session_id, w['letter'], w['word'], w['meaning'], w['example'])
        for w in session_data['words']
    ]
    cursor.executemany(
        'INSERT INTO word (session_id, letter, word_text, definition, example) VALUES (?, ?, ?, ?, ?)',
        words_to_insert
    )

    quiz_json = json.dumps(session_data['quiz'])
    cursor.execute('INSERT INTO quiz (session_id, quiz_data) VALUES (?, ?)', (session_id, quiz_json))
    db.commit()

def get_user_sessions(user_id):
    db = get_db()
    sessions = db.execute(
        '''SELECT id, learning_type, difficulty_level, score_percent, date
           FROM session WHERE user_id = ? ORDER BY date DESC''',
        (user_id,)
    ).fetchall()
    return [dict(row) for row in sessions]

def get_session_details(user_id, session_id):
    db = get_db()
    session = db.execute('SELECT * FROM session WHERE id = ? AND user_id = ?', (session_id, user_id)).fetchone()
    if not session: return None

    words = db.execute('SELECT letter, word_text, definition as meaning, example FROM word WHERE session_id = ?', (session_id,)).fetchall()
    quiz_data = db.execute('SELECT quiz_data FROM quiz WHERE session_id = ?', (session_id,)).fetchone()

    return {
        'id': session['id'],
        'mode': session['learning_type'],
        'level': session['difficulty_level'],
        'scorePercent': session['score_percent'],
        'dateISO': session['date'].isoformat(),
        'words': [dict(row) for row in words],
        'quiz': json.loads(quiz_data['quiz_data']) if quiz_data else []
    }

def get_tracking_stats(user_id):
    db = get_db()
    stats = {}
    modes = ['words', 'synonyms', 'antonyms']
    for mode in modes:
        stats[mode] = {}
        levels = ['beginner', 'intermediate', 'proficient']
        for level in levels:
            result = db.execute(
                '''SELECT AVG(score_percent) as average, COUNT(id) as count 
                   FROM session WHERE user_id = ? AND learning_type = ? AND difficulty_level = ?''',
                (user_id, mode, level)
            ).fetchone()
            stats[mode][level] = {
                'average': round(result['average']) if result['average'] is not None else 0,
                'count': result['count'] if result['count'] is not None else 0
            }
    return stats

def get_all_student_details():
    db = get_db()
    students = db.execute(
        '''SELECT u.id, u.username, u.usn, 
                  COALESCE(AVG(s.score_percent), 0) as average_score, 
                  COUNT(s.id) as session_count
           FROM user u
           LEFT JOIN session s ON u.id = s.user_id
           WHERE u.role = 'STUDENT'
           GROUP BY u.id, u.username, u.usn
           ORDER BY u.username
        '''
    ).fetchall()
    return [dict(row) for row in students]

def get_student_session_data(staff_id=None, date_filter=None):
    db = get_db()
    query = '''SELECT u.username, u.usn, s.learning_type, s.difficulty_level, s.score_percent, s.date
               FROM user u
               JOIN session s ON u.id = s.user_id
               WHERE u.role = 'STUDENT'
            '''
    params = []
    if staff_id:
        query += " AND u.mapped_usns LIKE ?"
        params.append(f"%STAFF_{staff_id}%")
    if date_filter:
        query += " AND date(s.date) = ?"
        params.append(date_filter)
        
    query += " ORDER BY u.username, s.date DESC"
    data = db.execute(query, params).fetchall()
    return [dict(row) for row in data]

def get_all_users():
    db = get_db()
    users = db.execute('''
        SELECT u.id, u.username, u.usn, u.role, u.school_id, s.name as school_name, u.class_name, u.section_name, u.mapped_usns,
               AVG(sess.score_percent) as average_score, u.xp, u.streak
        FROM user u
        LEFT JOIN school s ON u.school_id = s.id
        LEFT JOIN session sess ON u.id = sess.user_id
        GROUP BY u.id
        ORDER BY u.role, u.username
    ''').fetchall()
    return [dict(row) for row in users]

def create_user(username, password, usn, role, school_id=None, class_name=None, section_name=None, mapped_usns=None):
    db = get_db()
    try:
        db.execute(
            'INSERT INTO user (username, password, usn, role, school_id, class_name, section_name, mapped_usns) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (username, generate_password_hash(password), usn, role, school_id, class_name, section_name, mapped_usns)
        )
        db.commit()
    except db.IntegrityError:
        return None 
    user = db.execute('SELECT * FROM user WHERE username = ?', (username,)).fetchone()
    return dict(user)

def update_user(user_id, username, usn, role, school_id=None, class_name=None, section_name=None, mapped_usns=None):
    db = get_db()
    try:
        db.execute(
            'UPDATE user SET username = ?, usn = ?, role = ?, school_id = ?, class_name = ?, section_name = ?, mapped_usns = ? WHERE id = ?',
            (username, usn, role, school_id, class_name, section_name, mapped_usns, user_id)
        )
        db.commit()
    except db.IntegrityError:
        return False
    return True

def reset_password(user_id, new_password):
    db = get_db()
    db.execute(
        'UPDATE user SET password = ? WHERE id = ?',
        (generate_password_hash(new_password), user_id)
    )
    db.commit()
    return True

def delete_user(user_id):
    db = get_db()
    db.execute('DELETE FROM user WHERE id = ?', (user_id,))
    db.commit()
    return True

# --- SCHOOL FUNCTIONS (NEW) ---

def create_school(name, address=None):
    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute('INSERT INTO school (name, address) VALUES (?, ?)', (name, address))
        db.commit()
        return {'id': cursor.lastrowid, 'name': name, 'address': address}
    except db.IntegrityError:
        return False

def get_all_schools():
    db = get_db()
    schools = db.execute('SELECT * FROM school ORDER BY name').fetchall()
    return [dict(row) for row in schools]

def delete_school(school_id):
    db = get_db()
    db.execute('DELETE FROM school WHERE id = ?', (school_id,))
    db.commit()
    return True

# --- FEEDBACK FUNCTIONS (NEW) ---

def save_feedback(user_id, message):
    db = get_db()
    db.execute('INSERT INTO feedback (user_id, message) VALUES (?, ?)', (user_id, message))
    db.commit()

def get_feedback_for_staff():
    """Staff can only see feedback from Students"""
    db = get_db()
    rows = db.execute('''
        SELECT f.id, f.message, f.date, u.username, u.role 
        FROM feedback f 
        JOIN user u ON f.user_id = u.id 
        WHERE u.role = 'STUDENT'
        ORDER BY f.date DESC
    ''').fetchall()
    return [dict(row) for row in rows]

def get_feedback_for_admin():
    """Admin sees feedback from everyone (Students and Staff)"""
    db = get_db()
    rows = db.execute('''
        SELECT f.id, f.message, f.date, u.username, u.role 
        FROM feedback f 
        JOIN user u ON f.user_id = u.id 
        ORDER BY f.date DESC
    ''').fetchall()
    return [dict(row) for row in rows]

# --- PARENT & PRINCIPAL FUNCTIONS (UPDATED) ---

def _get_usns_list(mapped_usns_str):
    if not mapped_usns_str: return []
    return [u.strip() for u in mapped_usns_str.split(',') if u.strip()]

def get_users_by_school(school_id):
    db = get_db()
    users = db.execute('''
        SELECT u.id, u.username, u.usn, u.role, u.school_id, u.class_name, u.section_name, u.mapped_usns,
               AVG(s.score_percent) as average_score, u.xp, u.streak
        FROM user u
        LEFT JOIN session s ON u.id = s.user_id
        WHERE u.school_id = ? 
        GROUP BY u.id
        ORDER BY u.role, u.username
    ''', (school_id,)).fetchall()
    return [dict(row) for row in users]

def get_school_stats(school_id):
    db = get_db()
    stats = db.execute('''
        SELECT u.class_name, COUNT(DISTINCT u.id) as student_count, AVG(s.score_percent) as average_score
        FROM user u
        LEFT JOIN session s ON u.id = s.user_id
        WHERE u.school_id = ? AND u.role = 'STUDENT'
        GROUP BY u.class_name
    ''', (school_id,)).fetchall()
    return [dict(row) for row in stats]

def get_school_overview(school_id):
    db = get_db()
    
    total_staff = db.execute("SELECT COUNT(id) FROM user WHERE school_id = ? AND role = 'STAFF'", (school_id,)).fetchone()[0]
    total_students = db.execute("SELECT COUNT(id) FROM user WHERE school_id = ? AND role = 'STUDENT'", (school_id,)).fetchone()[0]
    total_classes = db.execute("SELECT COUNT(DISTINCT class_name) FROM user WHERE school_id = ? AND role = 'STUDENT'", (school_id,)).fetchone()[0]
    
    class_stats = get_school_stats(school_id)
    
    return {
        'total_staff': total_staff or 0,
        'total_students': total_students or 0,
        'total_classes': total_classes or 0,
        'class_stats': class_stats
    }

def get_students_by_staff(staff_id_str, school_id):
    db = get_db()
    staff_marker = f"%{staff_id_str}%"
    base_query = '''
        SELECT u.id, u.username, u.usn, u.class_name, u.section_name, AVG(s.score_percent) as average_score, u.xp, u.streak
        FROM user u
        LEFT JOIN session s ON u.id = s.user_id
        WHERE u.school_id = ? AND u.role = 'STUDENT' AND u.mapped_usns LIKE ?
        GROUP BY u.id
    '''
    students = db.execute(base_query, (school_id, staff_marker)).fetchall()
    return [dict(row) for row in students]

def get_mapped_students(mapped_usns_str, school_id=None, class_name=None):
    db = get_db()
    usns = _get_usns_list(mapped_usns_str)
    
    base_query = '''
        SELECT u.id, u.username, u.usn, u.class_name, u.section_name, AVG(s.score_percent) as average_score, u.xp, u.streak
        FROM user u
        LEFT JOIN session s ON u.id = s.user_id
    '''
    
    if usns:
        placeholders = ','.join('?' * len(usns))
        query = f"{base_query} WHERE u.usn IN ({placeholders}) AND u.role = 'STUDENT' GROUP BY u.id"
        students = db.execute(query, usns).fetchall()
        return [dict(row) for row in students]
    elif school_id and class_name:
        query = f"{base_query} WHERE u.school_id = ? AND u.class_name = ? AND u.role = 'STUDENT' GROUP BY u.id"
        students = db.execute(query, (school_id, class_name)).fetchall()
        return [dict(row) for row in students]
    return []

def get_mapped_student_stats(mapped_usns_str, school_id=None, class_name=None):
    db = get_db()
    usns = _get_usns_list(mapped_usns_str)
    
    if usns:
        placeholders = ','.join('?' * len(usns))
        stats = db.execute(f'''
            SELECT u.class_name, COUNT(DISTINCT u.id) as student_count, AVG(s.score_percent) as average_score
            FROM user u
            LEFT JOIN session s ON u.id = s.user_id
            WHERE u.usn IN ({placeholders}) AND u.role = 'STUDENT'
            GROUP BY u.class_name
        ''', usns).fetchall()
        return [dict(row) for row in stats]
    elif school_id and class_name:
        stats = db.execute('''
            SELECT u.class_name, COUNT(DISTINCT u.id) as student_count, AVG(s.score_percent) as average_score
            FROM user u
            LEFT JOIN session s ON u.id = s.user_id
            WHERE u.school_id = ? AND u.class_name = ? AND u.role = 'STUDENT'
            GROUP BY u.class_name
        ''', (school_id, class_name)).fetchall()
        return [dict(row) for row in stats]
    return []

# --- SYLLABUS FUNCTIONS (NEW) ---

def create_syllabus(school_id, class_name, subject, lesson_title, content, quiz_data):
    db = get_db()
    db.execute('''
        INSERT INTO syllabus (school_id, class_name, subject, lesson_title, content, quiz_data)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (school_id, class_name, subject, lesson_title, content, quiz_data))
    db.commit()

def get_all_syllabus(school_id=None):
    db = get_db()
    if school_id:
        rows = db.execute('SELECT * FROM syllabus WHERE school_id = ? ORDER BY class_name, subject', (school_id,)).fetchall()
    else:
        rows = db.execute('SELECT * FROM syllabus ORDER BY class_name, subject').fetchall()
    return [dict(row) for row in rows]

def get_syllabus_by_class(school_id, class_name):
    db = get_db()
    rows = db.execute('SELECT * FROM syllabus WHERE school_id = ? AND class_name = ? ORDER BY subject', (school_id, class_name)).fetchall()
    return [dict(row) for row in rows]

def delete_syllabus(syllabus_id):
    db = get_db()
    db.execute('DELETE FROM syllabus WHERE id = ?', (syllabus_id,))
    db.commit()

# --- GRAMMAR MODULE FUNCTIONS (NEW) ---

def create_grammar_module(school_id, class_name, level, question_text, options, correct_answer, explanation):
    db = get_db()
    db.execute('''
        INSERT INTO grammar_module (school_id, class_name, level, question_text, options, correct_answer, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (school_id, class_name, level, question_text, options, correct_answer, explanation))
    db.commit()

def get_all_grammar_modules(school_id=None):
    db = get_db()
    if school_id:
        rows = db.execute('SELECT * FROM grammar_module WHERE school_id = ? ORDER BY class_name, level', (school_id,)).fetchall()
    else:
        rows = db.execute('SELECT * FROM grammar_module ORDER BY class_name, level').fetchall()
    return [dict(row) for row in rows]

def delete_grammar_module(module_id):
    db = get_db()
    db.execute('DELETE FROM grammar_module WHERE id = ?', (module_id,))
    db.commit()

def get_daily_grammar(school_id, class_name, limit=5):
    db = get_db()
    rows = db.execute('SELECT * FROM grammar_module WHERE school_id = ? AND class_name = ? ORDER BY RANDOM() LIMIT ?', (school_id, class_name, limit)).fetchall()
    return [dict(row) for row in rows]

def get_daily_syllabus(school_id, class_name, limit=5):
    db = get_db()
    rows = db.execute('SELECT quiz_data FROM syllabus WHERE school_id = ? AND class_name = ?', (school_id, class_name)).fetchall()
    all_qs = []
    import json
    import random
    for row in rows:
        if row['quiz_data']:
            try:
                qdata = json.loads(row['quiz_data'])
                all_qs.extend(qdata)
            except:
                pass
    random.shuffle(all_qs)
    return all_qs[:limit]

# --- TEST MODULE FUNCTIONS (NEW) ---

def create_test(school_id, class_name, title, questions_json):
    db = get_db()
    db.execute('INSERT INTO test (school_id, class_name, title, questions_json) VALUES (?, ?, ?, ?)', (school_id, class_name, title, questions_json))
    db.commit()

def get_all_tests(school_id=None):
    db = get_db()
    if school_id:
        rows = db.execute('SELECT * FROM test WHERE school_id = ? ORDER BY class_name, title', (school_id,)).fetchall()
    else:
        rows = db.execute('SELECT * FROM test ORDER BY class_name, title').fetchall()
    return [dict(row) for row in rows]

def get_tests_by_class(school_id, class_name):
    db = get_db()
    rows = db.execute('SELECT * FROM test WHERE school_id = ? AND class_name = ? ORDER BY title', (school_id, class_name)).fetchall()
    return [dict(row) for row in rows]

def delete_test(test_id):
    db = get_db()
    db.execute('DELETE FROM test WHERE id = ?', (test_id,))
    db.commit()

def save_test_result(test_id, user_id, score, total):
    db = get_db()
    db.execute('''
        INSERT INTO test_result (test_id, user_id, score, total)
        VALUES (?, ?, ?, ?)
    ''', (test_id, user_id, score, total))
    db.commit()

def get_test_results_for_student(user_id):
    db = get_db()
    results = db.execute('''
        SELECT tr.id, tr.score, tr.total, tr.date, t.title 
        FROM test_result tr
        JOIN test t ON tr.test_id = t.id
        WHERE tr.user_id = ?
        ORDER BY tr.date DESC
    ''', (user_id,)).fetchall()
    return [dict(row) for row in results]

# --- NOTIFICATION & PARENT UTILS (NEW) ---

def get_parents_by_student_usn(student_usn):
    db = get_db()
    # Find parents whose mapped_usns contain this usn
    rows = db.execute('SELECT id, username FROM user WHERE role = "PARENT" AND mapped_usns LIKE ?', (f'%{student_usn}%',)).fetchall()
    return [dict(row) for row in rows]

def create_notification(school_id, sender_id, receiver_id, message, type='GENERAL'):
    db = get_db()
    db.execute('''
        INSERT INTO notification (school_id, sender_id, receiver_id, message, type)
        VALUES (?, ?, ?, ?, ?)
    ''', (school_id, sender_id, receiver_id, message, type))
    db.commit()

def get_notifications_for_user(user_id):
    db = get_db()
    rows = db.execute('''
        SELECT n.id, n.message, n.type, n.is_read, n.created_at, u.username as sender_name, u.role as sender_role
        FROM notification n
        JOIN user u ON n.sender_id = u.id
        WHERE n.receiver_id = ?
        ORDER BY n.created_at DESC
    ''', (user_id,)).fetchall()
    return [dict(row) for row in rows]

def get_notifications_by_school(school_id):
    db = get_db()
    rows = db.execute('''
        SELECT n.id, n.message, n.type, n.is_read, n.created_at, 
               s.username as sender_name, s.role as sender_role,
               r.username as receiver_name, r.role as receiver_role
        FROM notification n
        JOIN user s ON n.sender_id = s.id
        JOIN user r ON n.receiver_id = r.id
        WHERE n.school_id = ?
        ORDER BY n.created_at DESC
    ''', (school_id,)).fetchall()
    return [dict(row) for row in rows]

def mark_notification_read(notification_id, user_id):
    db = get_db()
    db.execute('UPDATE notification SET is_read = 1 WHERE id = ? AND receiver_id = ?', (notification_id, user_id))
    db.commit()

# --- GAMIFICATION & DAILY MISSION FUNCTIONS (NEW) ---

def get_daily_mission_status(user_id, date_str):
    db = get_db()
    mission = db.execute('SELECT * FROM daily_mission WHERE user_id = ? AND date = ?', (user_id, date_str)).fetchone()
    return dict(mission) if mission else None

def save_daily_mission(user_id, date_str, vocab_score, grammar_score, syllabus_score, sentence_score=0):
    db = get_db()
    
    # Check if mission already exists for today
    existing = get_daily_mission_status(user_id, date_str)
    if existing:
        return False # Already completed
        
    db.execute('''
        INSERT INTO daily_mission (user_id, date, vocab_score, grammar_score, syllabus_score, sentence_score, is_completed)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    ''', (user_id, date_str, vocab_score, grammar_score, syllabus_score, sentence_score))
    
    # Calculate XP (10 per correct vocab, 20 per correct grammar/syllabus, 15 per sentence) + 50 bonus for completion
    xp_gained = (vocab_score * 10) + (grammar_score * 20) + (syllabus_score * 20) + (sentence_score * 15) + 50
    
    # Update user XP and Streak
    user = db.execute('SELECT xp, streak, last_active_date FROM user WHERE id = ?', (user_id,)).fetchone()
    
    current_xp = user['xp'] or 0
    current_streak = user['streak'] or 0
    last_active = user['last_active_date']
    
    import datetime
    today_date = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
    
    # Streak logic
    if last_active:
        last_active_date = datetime.datetime.strptime(last_active, '%Y-%m-%d').date()
        delta = (today_date - last_active_date).days
        if delta == 1:
            current_streak += 1
        elif delta > 1:
            current_streak = 1
        else:
            # If delta == 0, they already played today, streak remains the same.
            pass
    else:
        current_streak = 1
        
    new_xp = current_xp + xp_gained
    
    db.execute('''
        UPDATE user 
        SET xp = ?, streak = ?, last_active_date = ? 
        WHERE id = ?
    ''', (new_xp, current_streak, date_str, user_id))
    
    # Evaluate Badges
    badges_earned = []
    
    def award_badge(badge_name):
        existing_badge = db.execute('SELECT id FROM badge WHERE user_id = ? AND badge_name = ?', (user_id, badge_name)).fetchone()
        if not existing_badge:
            db.execute('INSERT INTO badge (user_id, badge_name, earned_at) VALUES (?, ?, CURRENT_TIMESTAMP)', (user_id, badge_name))
            badges_earned.append(badge_name)

    if new_xp > 0:
        award_badge("First Mission")
    if current_streak >= 5:
        award_badge("5-Day Streak 🔥")
    if current_streak >= 10:
        award_badge("10-Day Streak 🔥🔥")
    if current_streak >= 30:
        award_badge("30-Day Streak 🔥🔥🔥")
    if new_xp >= 500:
        award_badge("500 XP ⭐")
    if new_xp >= 1000:
        award_badge("1000 XP 🌟")
    if vocab_score == 15 and grammar_score == 5 and syllabus_score == 5 and sentence_score == 5:
        award_badge("Perfectionist 🎯")
    if sentence_score == 5:
        award_badge("Sentence Master 📝")

    db.commit()
    
    return {
        'xp_gained': xp_gained,
        'new_xp': new_xp,
        'new_streak': current_streak,
        'badges_earned': badges_earned
    }

def get_leaderboard(school_id=None, class_name=None):
    db = get_db()
    query = '''
        SELECT u.id, u.username, u.class_name, u.xp, u.streak 
        FROM user u 
        WHERE u.role = 'STUDENT'
    '''
    params = []
    if school_id:
        query += ' AND u.school_id = ?'
        params.append(school_id)
    if class_name:
        query += ' AND u.class_name = ?'
        params.append(class_name)
        
    query += ' ORDER BY u.xp DESC LIMIT 50'
    
    rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]
    
def get_user_gamification(user_id):
    db = get_db()
    user = db.execute('SELECT xp, streak, last_active_date FROM user WHERE id = ?', (user_id,)).fetchone()
    badges = db.execute('SELECT badge_name, earned_at FROM badge WHERE user_id = ? ORDER BY earned_at DESC', (user_id,)).fetchall()
    return {
        'xp': user['xp'] or 0,
        'streak': user['streak'] or 0,
        'last_active_date': user['last_active_date'],
        'badges': [dict(b) for b in badges]
    }

# --- MCQ SET FUNCTIONS ---

def create_mcq_set(school_id, class_name, category, title, questions_json):
    db = get_db()
    db.execute('''
        INSERT INTO mcq_set (school_id, class_name, category, title, questions_json)
        VALUES (?, ?, ?, ?, ?)
    ''', (school_id, class_name, category, title, questions_json))
    db.commit()

def get_all_mcq_sets(school_id=None, category=None):
    db = get_db()
    query = 'SELECT ms.*, s.name as school_name FROM mcq_set ms LEFT JOIN school s ON ms.school_id = s.id WHERE 1=1'
    params = []
    if school_id:
        query += ' AND ms.school_id = ?'
        params.append(school_id)
    if category:
        query += ' AND ms.category = ?'
        params.append(category)
    query += ' ORDER BY ms.category, ms.class_name, ms.created_at DESC'
    rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]

def get_mcq_sets_by_class(school_id, class_name, category=None, limit=5):
    db = get_db()
    query = 'SELECT * FROM mcq_set WHERE school_id = ? AND class_name = ?'
    params = [school_id, class_name]
    if category:
        query += ' AND category = ?'
        params.append(category)
    query += ' ORDER BY RANDOM() LIMIT ?'
    params.append(limit)
    rows = db.execute(query, params).fetchall()
    return [dict(row) for row in rows]

def delete_mcq_set(set_id):
    db = get_db()
    db.execute('DELETE FROM mcq_set WHERE id = ?', (set_id,))
    db.commit()

# --- SENTENCE EXERCISE FUNCTIONS ---

def create_sentence_exercise(school_id, class_name, correct_sentence, words_json):
    db = get_db()
    db.execute('''
        INSERT INTO sentence_exercise (school_id, class_name, correct_sentence, words_json)
        VALUES (?, ?, ?, ?)
    ''', (school_id, class_name, correct_sentence, words_json))
    db.commit()

def get_all_sentence_exercises(school_id=None):
    db = get_db()
    if school_id:
        rows = db.execute('SELECT se.*, s.name as school_name FROM sentence_exercise se LEFT JOIN school s ON se.school_id = s.id WHERE se.school_id = ? ORDER BY se.class_name, se.created_at DESC', (school_id,)).fetchall()
    else:
        rows = db.execute('SELECT se.*, s.name as school_name FROM sentence_exercise se LEFT JOIN school s ON se.school_id = s.id ORDER BY se.class_name, se.created_at DESC').fetchall()
    return [dict(row) for row in rows]

def get_sentence_exercises_by_class(school_id, class_name, limit=5):
    db = get_db()
    rows = db.execute('SELECT * FROM sentence_exercise WHERE school_id = ? AND class_name = ? ORDER BY RANDOM() LIMIT ?', (school_id, class_name, limit)).fetchall()
    return [dict(row) for row in rows]

def delete_sentence_exercise(exercise_id):
    db = get_db()
    db.execute('DELETE FROM sentence_exercise WHERE id = ?', (exercise_id,))
    db.commit()

# --- STUDENT ATTEMPTS FUNCTIONS ---

def get_student_attempts(user_id):
    """Returns all daily mission attempts for a student with date/time and category scores."""
    db = get_db()
    rows = db.execute('''
        SELECT id, date, vocab_score, grammar_score, syllabus_score, 
               COALESCE(sentence_score, 0) as sentence_score, is_completed
        FROM daily_mission 
        WHERE user_id = ? 
        ORDER BY date DESC
    ''', (user_id,)).fetchall()
    return [dict(row) for row in rows]

def get_student_attempt_detail(user_id, date_str):
    """Returns category-wise breakdown for a specific attempt date."""
    db = get_db()
    row = db.execute('''
        SELECT id, date, vocab_score, grammar_score, syllabus_score,
               COALESCE(sentence_score, 0) as sentence_score, is_completed
        FROM daily_mission 
        WHERE user_id = ? AND date = ?
    ''', (user_id, date_str)).fetchone()
    return dict(row) if row else None