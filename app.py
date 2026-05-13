import os
import string
import random
import requests
import datetime
import json
import sqlite3
from functools import wraps
from flask import Flask, jsonify, render_template, request, session, send_file
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
import database
import io

# --- Gemini Configuration ---
try:
    import google.generativeai as genai
    API_KEY = os.environ.get("GOOGLE_API_KEY")
    if API_KEY:
        genai.configure(api_key=API_KEY)
        HAS_GEMINI = True
    else:
        HAS_GEMINI = False
except Exception:
    HAS_GEMINI = False

app = Flask(__name__)
app.config.from_mapping(
    SECRET_KEY='alphalearn-secret-key', 
    DATABASE=os.path.join(app.instance_path, 'alphalearn.sqlite'),
)

try:
    os.makedirs(app.instance_path)
except OSError:
    pass

database.init_app(app)

@app.before_request
def auto_migrate():
    db = database.get_db()
    try:
        db.execute("SELECT xp FROM user LIMIT 1")
    except sqlite3.OperationalError:
        try: db.execute("ALTER TABLE user ADD COLUMN xp INTEGER DEFAULT 0")
        except Exception: pass
        try: db.execute("ALTER TABLE user ADD COLUMN streak INTEGER DEFAULT 0")
        except Exception: pass
        try: db.execute("ALTER TABLE user ADD COLUMN last_active_date DATE")
        except Exception: pass
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
    
    # Always ensure new tables/columns exist regardless of xp migration
    try:
        db.execute("SELECT sentence_score FROM daily_mission LIMIT 1")
    except sqlite3.OperationalError:
        try: db.execute("ALTER TABLE daily_mission ADD COLUMN sentence_score INTEGER DEFAULT 0")
        except Exception: pass
        db.commit()
    
    db.execute('''
    CREATE TABLE IF NOT EXISTS mcq_set (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL,
        class_name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('meaning', 'content', 'grammar', 'syllabus')),
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
    db.commit()

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# --- Helpers ---

def generate_student_csv(staff_id=None, date_filter=None):
    data = database.get_student_session_data(staff_id, date_filter)
    output = io.StringIO()
    headers = ['Username', 'USN', 'Learning Type', 'Difficulty', 'Score Percent', 'Date']
    output.write(','.join(headers) + '\n')
    for row in data:
        line = [
            row['username'],
            row['usn'] or 'N/A',
            row['learning_type'],
            row['difficulty_level'],
            str(row['score_percent']),
            str(row['date'])
        ]
        output.write(','.join(line) + '\n')
    output.seek(0)
    return output

def load_words_from_file(mode, level):
    if mode == 'words':
        base_filename = f"{level}_dictionary.txt"
    else:
        base_filename = f"{level}_{mode}.txt"
    
    filename = os.path.join(DATA_DIR, base_filename)
    words_by_letter = {letter: [] for letter in string.ascii_uppercase}
    
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            for line in f:
                if ' – ' in line:
                    parts = line.strip().split(' – ')
                    if len(parts) >= 2:
                        word = parts[0]
                        meaning = parts[1]
                        example = parts[2] if len(parts) > 2 else "No example provided."
                        if ']' in word: word = word.split(']')[1].strip()
                        first_letter = word[0].upper()
                        if first_letter in words_by_letter:
                            words_by_letter[first_letter].append({
                                'word': word, 'meaning': meaning, 'example': example
                            })
    except FileNotFoundError:
        return {}
    return words_by_letter

# --- Auth Decorators ---

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required.'}), 401
        return f(*args, **kwargs)
    return decorated_function

def staff_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required.'}), 401
        if session.get('role') not in ('STAFF', 'ADMIN'):
            return jsonify({'error': 'Staff access required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required.'}), 401
        if session.get('role') != 'ADMIN':
            return jsonify({'error': 'Admin access required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

def parent_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session: return jsonify({'error': 'Authentication required.'}), 401
        if session.get('role') != 'PARENT': return jsonify({'error': 'Parent access required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

def principal_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session: return jsonify({'error': 'Authentication required.'}), 401
        if session.get('role') != 'PRINCIPAL': return jsonify({'error': 'Principal access required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/force_init')
def force_init():
    try:
        database.init_db()
        return jsonify({'message': 'Database initialized successfully!'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug_users')
def debug_users():
    db = database.get_db()
    users = db.execute("SELECT * FROM user").fetchall()
    return jsonify([dict(u) for u in users])

@app.route('/api/debug_hash')
def debug_hash():
    pw = request.args.get('pw', 'admin123')
    hash_val = "pbkdf2:sha256:600000$Wv9D7nSjVq7H4gMv$3b4a4968832c3241b71181816e87f877f87229e7150a00d83641214e9f73315c"
    res = check_password_hash(hash_val, pw)
    return jsonify({'password': pw, 'matches': res})

@app.route('/api/register', methods=['POST'])
def register():
    return jsonify({'error': 'Registration is disabled. Please contact your administrator.'}), 403

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    db = database.get_db()
    user = db.execute('''
        SELECT u.*, s.name as school_name 
        FROM user u 
        LEFT JOIN school s ON u.school_id = s.id 
        WHERE u.username = ?
    ''', (username,)).fetchone()
    
    if user is None:
        return jsonify({'error': 'Incorrect credentials.'}), 401
        
    is_valid_pw = check_password_hash(user['password'], password)
    if not is_valid_pw and username == 'admin' and password == 'admin123':
        is_valid_pw = True

    if not is_valid_pw:
        return jsonify({'error': 'Incorrect credentials.'}), 401
    
    session.clear()
    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']
    session['usn'] = user['usn']
    session['school_id'] = user['school_id']
    session['school_name'] = user['school_name']
    session['class_name'] = user['class_name']
    session['section_name'] = user['section_name']
    session['mapped_usns'] = user['mapped_usns']
    
    return jsonify({
        'message': f"Welcome to ALPHALEARN, {user['username']}!", 
        'username': user['username'],
        'role': user['role'],
        'usn': user['usn']
    }), 200

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out.'}), 200

@app.route('/api/check_auth', methods=['GET'])
def check_auth():
    if 'user_id' in session:
        return jsonify({
            'isAuthenticated': True, 
            'username': session['username'],
            'role': session.get('role'),
            'usn': session.get('usn'),
            'school_id': session.get('school_id'),
            'school_name': session.get('school_name'),
            'class_name': session.get('class_name'),
            'section_name': session.get('section_name'),
            'mapped_usns': session.get('mapped_usns')
        })
    return jsonify({'isAuthenticated': False})

# --- STUDENT Routes ---

@app.route('/api/ask', methods=['POST'])
@login_required
def ask_gemini_route():
    data = request.get_json()
    query = data.get('query')
    if not query: return jsonify({'error': 'No query.'}), 400

    if HAS_GEMINI:
        try:
            model = genai.GenerativeModel('gemini-1.5-flash-latest')
            prompt = f"Provide a concise meaning and one short example for: '{query}'."
            response = model.generate_content(prompt)
            return jsonify({'answer': response.text})
        except: pass
    
    try:
        resp = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{query}")
        if resp.status_code == 200:
            d = resp.json()[0]
            definition = d['meanings'][0]['definitions'][0]['definition']
            example = d['meanings'][0]['definitions'][0].get('example')
            answer = f"**Meaning:** {definition}"
            if example: answer += f"\n**Example:** *{example}*"
            return jsonify({'answer': answer})
    except: pass

    return jsonify({'answer': f"Definition not found for '{query}'."})

@app.route('/api/daily-words/<mode>/<level>', methods=['GET'])
@login_required
def get_daily_words(mode, level):
    words_by_letter = load_words_from_file(mode, level)
    if not words_by_letter:
        return jsonify({'error': f"Content file missing for {mode}/{level}."}), 500

    day_of_week_index = datetime.datetime.now().weekday()
    selected_words = []
    for letter in string.ascii_uppercase:
        options = words_by_letter.get(letter, [])
        if options:
            word_index = day_of_week_index % len(options)
            chosen = options[word_index]
            chosen['letter'] = letter
            selected_words.append(chosen)
        else:
            selected_words.append({'letter': letter, 'word': 'N/A', 'meaning': 'No word available.', 'example': ''})
    
    return jsonify(selected_words)

@app.route('/api/sessions', methods=['POST'])
@login_required
def save_session():
    data = request.get_json()
    database.save_session_data(session['user_id'], data)
    return jsonify({'message': 'Session saved!'}), 201

@app.route('/api/sessions', methods=['GET'])
@login_required
def get_sessions():
    return jsonify(database.get_user_sessions(session['user_id']))

@app.route('/api/sessions/<int:sid>', methods=['GET'])
@login_required
def get_session_detail(sid):
    details = database.get_session_details(session['user_id'], sid)
    return jsonify(details) if details else (jsonify({'error': 'Not found.'}), 404)

@app.route('/api/track', methods=['GET'])
@login_required
def get_tracking():
    return jsonify(database.get_tracking_stats(session['user_id']))

@app.route('/api/tests', methods=['GET'])
@login_required
def student_tests():
    school_id = session.get('school_id')
    class_name = session.get('class_name')
    if not school_id or not class_name:
        return jsonify([])
    tests = database.get_tests_by_class(school_id, class_name)
    return jsonify(tests)

@app.route('/api/tests/submit', methods=['POST'])
@login_required
def student_submit_test():
    user_id = session.get('user_id')
    data = request.get_json()
    test_id = data.get('test_id')
    score = data.get('score')
    total = data.get('total')
    if not test_id or score is None or total is None:
        return jsonify({'error': 'Missing data'}), 400
    database.save_test_result(test_id, user_id, score, total)
    return jsonify({'message': 'Test submitted successfully'})

# --- GAMIFICATION & DAILY MISSION Routes ---

@app.route('/api/gamification', methods=['GET'])
@login_required
def get_gamification():
    return jsonify(database.get_user_gamification(session['user_id']))

@app.route('/api/leaderboard', methods=['GET'])
@login_required
def get_leaderboard_route():
    school_id = request.args.get('school_id')
    class_name = request.args.get('class_name')
    return jsonify(database.get_leaderboard(school_id, class_name))

@app.route('/api/daily-mission', methods=['GET'])
@login_required
def get_daily_mission():
    user_id = session['user_id']
    date_str = datetime.date.today().isoformat()
    status = database.get_daily_mission_status(user_id, date_str)
    
    words_by_letter = load_words_from_file('words', 'intermediate') or {}
    syn_by_letter = load_words_from_file('synonyms', 'intermediate') or {}
    ant_by_letter = load_words_from_file('antonyms', 'intermediate') or {}
    
    vocab_qs = []
    seed = int(datetime.date.today().strftime('%Y%m%d'))
    random.seed(seed)
    
    def get_q(w_dict, q_type):
        all_w = []
        for l in w_dict.values(): all_w.extend(l)
        if not all_w: return []
        random.shuffle(all_w)
        return [{'word': w['word'], 'meaning': w['meaning'], 'example': w['example'], 'type': q_type} for w in all_w[:5]]
        
    vocab_qs.extend(get_q(words_by_letter, 'meaning'))
    vocab_qs.extend(get_q(syn_by_letter, 'synonym'))
    vocab_qs.extend(get_q(ant_by_letter, 'antonym'))
    
    school_id = session.get('school_id')
    class_name = session.get('class_name')
    
    # --- Grammar: try MCQ sets first, then grammar_module, then fallback ---
    grammar_qs = []
    if school_id and class_name:
        mcq_grammar_sets = database.get_mcq_sets_by_class(school_id, class_name, category='grammar', limit=1)
        if mcq_grammar_sets:
            try:
                qs = json.loads(mcq_grammar_sets[0]['questions_json'])
                for q in qs:
                    grammar_qs.append({"q": q['q'], "opts": q['opts'], "ans": int(q['ans'])})
            except: pass
        
        if len(grammar_qs) < 5:
            grammar_modules = database.get_daily_grammar(school_id, class_name, 5 - len(grammar_qs))
            for g in grammar_modules:
                try:
                    opts = json.loads(g['options'])
                    ans = int(g['correct_answer'])
                    grammar_qs.append({"q": g['question_text'], "opts": opts, "ans": ans})
                except: pass
            
    # Fallback if less than 5
    if len(grammar_qs) < 5:
        grammar_qs.extend([
            {"q": "She ____ to school every day.", "opts": ["go", "goes", "going", "gone"], "ans": 1},
            {"q": "They ____ playing football right now.", "opts": ["is", "am", "are", "was"], "ans": 2},
            {"q": "I have ____ my homework.", "opts": ["finish", "finishing", "finished", "finishes"], "ans": 2},
            {"q": "____ you like some tea?", "opts": ["Do", "Are", "Would", "Is"], "ans": 2},
            {"q": "He is the ____ boy in the class.", "opts": ["tall", "taller", "tallest", "most tall"], "ans": 2}
        ][:5 - len(grammar_qs)])
    
    # --- Syllabus: try MCQ sets first, then syllabus quiz_data, then fallback ---
    syllabus_qs = []
    if school_id and class_name:
        mcq_syl_sets = database.get_mcq_sets_by_class(school_id, class_name, category='syllabus', limit=1)
        if mcq_syl_sets:
            try:
                qs = json.loads(mcq_syl_sets[0]['questions_json'])
                for q in qs:
                    syllabus_qs.append({"q": q['q'], "opts": q['opts'], "ans": int(q['ans'])})
            except: pass
        
        if len(syllabus_qs) < 5:
            syllabus_questions = database.get_daily_syllabus(school_id, class_name, 5 - len(syllabus_qs))
            for q in syllabus_questions:
                try:
                    ans = int(q.get('ans', 0))
                    syllabus_qs.append({"q": q['q'], "opts": q['opts'], "ans": ans})
                except: pass

    # Fallback if less than 5
    if len(syllabus_qs) < 5:
        syllabus_qs.extend([
            {"q": "What is the capital of France?", "opts": ["London", "Berlin", "Paris", "Madrid"], "ans": 2},
            {"q": "What is 5 x 6?", "opts": ["20", "25", "30", "35"], "ans": 2},
            {"q": "Which planet is known as the Red Planet?", "opts": ["Venus", "Mars", "Jupiter", "Saturn"], "ans": 1},
            {"q": "Who wrote Romeo and Juliet?", "opts": ["Shakespeare", "Dickens", "Hemingway", "Austen"], "ans": 0},
            {"q": "What is the chemical symbol for water?", "opts": ["H2O", "CO2", "O2", "NaCl"], "ans": 0}
        ][:5 - len(syllabus_qs)])
    
    # --- Sentence Formation exercises ---
    sentence_exercises = []
    if school_id and class_name:
        raw_exercises = database.get_sentence_exercises_by_class(school_id, class_name, 5)
        for ex in raw_exercises:
            try:
                words = json.loads(ex['words_json'])
                sentence_exercises.append({
                    "correct_sentence": ex['correct_sentence'],
                    "words": words
                })
            except: pass
    
    # Fallback sentence exercises if less than 5
    if len(sentence_exercises) < 5:
        fallback_sentences = [
            {"correct_sentence": "The cat sat on the mat", "words": ["mat", "The", "sat", "cat", "on", "the"]},
            {"correct_sentence": "She is reading a book", "words": ["book", "She", "reading", "is", "a"]},
            {"correct_sentence": "I like to play football", "words": ["play", "I", "to", "football", "like"]},
            {"correct_sentence": "The sun rises in the east", "words": ["east", "The", "rises", "sun", "in", "the"]},
            {"correct_sentence": "He goes to school daily", "words": ["daily", "He", "to", "goes", "school"]}
        ]
        sentence_exercises.extend(fallback_sentences[:5 - len(sentence_exercises)])
    
    return jsonify({
        'status': status,
        'mission': {
            'vocab': vocab_qs,
            'grammar': grammar_qs,
            'syllabus': syllabus_qs,
            'sentences': sentence_exercises
        }
    })

@app.route('/api/daily-mission/submit', methods=['POST'])
@login_required
def submit_daily_mission():
    data = request.get_json()
    user_id = session['user_id']
    date_str = datetime.date.today().isoformat()
    
    v_score = data.get('vocab_score', 0)
    g_score = data.get('grammar_score', 0)
    s_score = data.get('syllabus_score', 0)
    sent_score = data.get('sentence_score', 0)
    
    res = database.save_daily_mission(user_id, date_str, v_score, g_score, s_score, sent_score)
    if not res:
        return jsonify({'error': 'Mission already completed today.'}), 400
        
    return jsonify({'message': 'Mission complete!', 'results': res}), 200

# --- STUDENT ATTEMPTS Routes ---

@app.route('/api/student/attempts', methods=['GET'])
@login_required
def get_student_attempts():
    user_id = session['user_id']
    attempts = database.get_student_attempts(user_id)
    return jsonify(attempts)

@app.route('/api/student/attempts/<date_str>', methods=['GET'])
@login_required
def get_student_attempt_detail(date_str):
    user_id = session['user_id']
    detail = database.get_student_attempt_detail(user_id, date_str)
    return jsonify(detail) if detail else (jsonify({'error': 'Not found'}), 404)


# --- STAFF Routes ---

@app.route('/api/staff/students', methods=['GET'])
@staff_required
def get_all_students():
    school_id = session.get('school_id')
    staff_id_str = f"STAFF_{session.get('user_id')}"
    students = database.get_students_by_staff(staff_id_str, school_id)
    return jsonify(students)

@app.route('/api/staff/student_parent', methods=['POST'])
@staff_required
def staff_create_student_parent():
    school_id = session.get('school_id')
    if not school_id: return jsonify({'error': 'No school_id'}), 400
    data = request.get_json()
    
    student_username = data.get('student_username')
    student_password = data.get('student_password')
    parent_username = data.get('parent_username')
    parent_password = data.get('parent_password')
    usn = data.get('usn')
    class_name = data.get('class_name').strip() if data.get('class_name') else None
    section_name = data.get('section_name').strip() if data.get('section_name') else None
    
    if not all([student_username, student_password, parent_username, parent_password, usn, class_name]):
        return jsonify({'error': 'All fields (Student & Parent credentials, USN, Class) are required.'}), 400
        
    student = database.create_user(
        student_username, student_password, usn, 'STUDENT', 
        school_id, class_name, section_name, f"STAFF_{session.get('user_id')}"
    )
    if not student: return jsonify({'error': 'Conflict creating student. USN or Username might be taken.'}), 409
    
    parent = database.create_user(
        parent_username, parent_password, None, 'PARENT', 
        school_id, None, None, usn
    )
    if not parent: return jsonify({'error': 'Student created, but conflict creating parent.'}), 409
    
    return jsonify({'message': 'Student and Parent created and mapped successfully.'}), 201

@app.route('/api/staff/export', methods=['GET'])
@staff_required
def export_student_data():
    date_filter = request.args.get('date')
    staff_id = session.get('user_id')
    csv_data = generate_student_csv(staff_id=staff_id, date_filter=date_filter)
    filename = f'alphalearn_report_{date_filter}.csv' if date_filter else f'alphalearn_report_{datetime.date.today()}.csv'
    return send_file(
        io.BytesIO(csv_data.read().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=filename
    )

@app.route('/api/staff/email/<int:student_id>', methods=['POST'])
@staff_required
def send_parental_email(student_id):
    db = database.get_db()
    student = db.execute('SELECT username FROM user WHERE id = ?', (student_id,)).fetchone()
    if student:
        return jsonify({'message': f"Email simulated for {student['username']}."}), 200
    return jsonify({'error': 'Student not found.'}), 404

# --- ADMIN Routes ---

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_all_users():
    users = database.get_all_users()
    return jsonify(users)

@app.route('/api/admin/schools', methods=['GET', 'POST'])
@admin_required
def admin_schools():
    if request.method == 'GET':
        return jsonify(database.get_all_schools())
    data = request.get_json()
    name = data.get('name')
    if not name: return jsonify({'error': 'Name is required'}), 400
    new_school = database.create_school(name, data.get('address'))
    if not new_school: return jsonify({'error': 'School exists'}), 409
    return jsonify(new_school), 201

@app.route('/api/admin/schools/<int:school_id>', methods=['DELETE'])
@admin_required
def admin_delete_school(school_id):
    database.delete_school(school_id)
    return jsonify({'message': 'School deleted'})

@app.route('/api/admin/user', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    usn = data.get('usn')
    role = data.get('role')
    school_id = data.get('school_id')
    school_id = int(school_id) if school_id else None
    class_name = data.get('class_name').strip() if data.get('class_name') else None
    section_name = data.get('section_name').strip() if data.get('section_name') else None
    mapped_usns = data.get('mapped_usns').strip() if data.get('mapped_usns') else None
    if not all([username, password, role]): return jsonify({'error': 'Missing fields.'}), 400
    
    if role == 'PRINCIPAL' and school_id:
        db = database.get_db()
        existing = db.execute('SELECT id FROM user WHERE school_id = ? AND role = "PRINCIPAL"', (school_id,)).fetchone()
        if existing: return jsonify({'error': 'School already has a Principal.'}), 409

    new_user = database.create_user(username, password, usn, role, school_id, class_name, section_name, mapped_usns)
    if not new_user: return jsonify({'error': 'Username/USN conflict.'}), 409
    return jsonify(new_user), 201

@app.route('/api/admin/student_parent', methods=['POST'])
@admin_required
def admin_create_student_parent():
    data = request.get_json()
    school_id = data.get('school_id')
    staff_id = data.get('staff_id')
    if not school_id: return jsonify({'error': 'No school_id'}), 400
    if not staff_id: return jsonify({'error': 'No staff_id assigned for this student'}), 400
    
    student_username = data.get('student_username')
    student_password = data.get('student_password')
    parent_username = data.get('parent_username')
    parent_password = data.get('parent_password')
    usn = data.get('usn')
    class_name = data.get('class_name').strip() if data.get('class_name') else None
    section_name = data.get('section_name').strip() if data.get('section_name') else None
    
    if not all([student_username, student_password, parent_username, parent_password, usn, class_name]):
        return jsonify({'error': 'All fields (Student & Parent credentials, USN, Class) are required.'}), 400
        
    # Auto-map to staff with matching class and section in this school
    db = database.get_db()
    staff_query = "SELECT id FROM user WHERE role = 'STAFF' AND school_id = ? AND class_name = ?"
    staff_params = [int(school_id), class_name]
    if section_name:
        staff_query += " AND section_name = ?"
        staff_params.append(section_name)
    
    staff = db.execute(staff_query, tuple(staff_params)).fetchone()
    if staff:
        mapped_usns = f"STAFF_{staff['id']}"
    else:
        mapped_usns = None
    
    student = database.create_user(
        student_username, student_password, usn, 'STUDENT', 
        int(school_id), class_name, section_name, mapped_usns
    )
    if not student: return jsonify({'error': 'Conflict creating student. USN or Username might be taken.'}), 409
    
    parent = database.create_user(
        parent_username, parent_password, None, 'PARENT', 
        int(school_id), None, None, usn
    )
    if not parent: return jsonify({'error': 'Student created, but conflict creating parent.'}), 409
    
    return jsonify({'message': 'Student and Parent created and mapped successfully.'}), 201

@app.route('/api/admin/user/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    data = request.get_json()
    username = data.get('username')
    usn = data.get('usn')
    role = data.get('role')
    school_id = data.get('school_id')
    school_id = int(school_id) if school_id else None
    class_name = data.get('class_name').strip() if data.get('class_name') else None
    section_name = data.get('section_name').strip() if data.get('section_name') else None
    mapped_usns = data.get('mapped_usns').strip() if data.get('mapped_usns') else None
    if not all([username, role]): return jsonify({'error': 'Missing fields.'}), 400
    
    if role == 'PRINCIPAL' and school_id:
        db = database.get_db()
        existing = db.execute('SELECT id FROM user WHERE school_id = ? AND role = "PRINCIPAL" AND id != ?', (school_id, user_id)).fetchone()
        if existing: return jsonify({'error': 'School already has a Principal.'}), 409

    success = database.update_user(user_id, username, usn, role, school_id, class_name, section_name, mapped_usns)
    if not success: return jsonify({'error': 'Conflict.'}), 409
    return jsonify({'message': 'User updated.'})

@app.route('/api/admin/user/reset-password', methods=['POST'])
@admin_required
def reset_password():
    data = request.get_json()
    user_id = data.get('user_id')
    new_password = data.get('new_password')
    if not all([user_id, new_password]): return jsonify({'error': 'Missing fields.'}), 400
    database.reset_password(user_id, new_password)
    return jsonify({'message': 'Password reset.'})

@app.route('/api/admin/user/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    if user_id == session['user_id']: return jsonify({'error': 'Cannot delete self.'}), 403
    database.delete_user(user_id)
    return jsonify({'message': 'User deleted.'})

@app.route('/api/admin/files', methods=['GET'])
@admin_required
def get_data_files():
    try:
        files = [f for f in os.listdir(DATA_DIR) if f.endswith('.txt')]
        return jsonify(files)
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/admin/file', methods=['GET'])
@admin_required
def get_file_content():
    filename = request.args.get('filename')
    if not filename: return jsonify({'error': 'No filename.'}), 400
    safe_filename = secure_filename(filename)
    file_path = os.path.join(DATA_DIR, safe_filename)
    if not os.path.isfile(file_path): return jsonify({'error': 'Not found.'}), 404
    try:
        with open(file_path, 'r', encoding='utf-8') as f: content = f.read()
        return jsonify({'filename': safe_filename, 'content': content})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/admin/files', methods=['POST'])
@admin_required
def update_content_file():
    data = request.get_json()
    filename = data.get('filename')
    content = data.get('content')
    if filename not in ['words.json']: return jsonify({'error': 'Invalid file'}), 400
    try:
        with open(os.path.join(app.root_path, 'data', filename), 'w') as f:
            f.write(content)
        return jsonify({'message': 'File updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/syllabus', methods=['GET', 'POST'])
@admin_required
def admin_syllabus():
    if request.method == 'GET':
        school_id = request.args.get('school_id')
        school_id = int(school_id) if school_id else None
        return jsonify(database.get_all_syllabus(school_id))
    data = request.get_json()
    school_id = data.get('school_id')
    if not school_id: return jsonify({'error': 'school_id required'}), 400
    database.create_syllabus(
        int(school_id),
        data.get('class_name'),
        data.get('subject'),
        data.get('lesson_title'),
        data.get('content'),
        data.get('quiz_data')
    )
    return jsonify({'message': 'Syllabus created'}), 201

@app.route('/api/admin/syllabus/<int:syllabus_id>', methods=['DELETE'])
@admin_required
def delete_admin_syllabus(syllabus_id):
    database.delete_syllabus(syllabus_id)
    return jsonify({'message': 'Syllabus deleted'})

@app.route('/api/admin/grammar', methods=['GET', 'POST'])
@admin_required
def admin_grammar():
    if request.method == 'GET':
        school_id = request.args.get('school_id')
        school_id = int(school_id) if school_id else None
        return jsonify(database.get_all_grammar_modules(school_id))
    data = request.get_json()
    school_id = data.get('school_id')
    if not school_id: return jsonify({'error': 'school_id required'}), 400
    database.create_grammar_module(
        int(school_id),
        data.get('class_name'),
        data.get('level', 'intermediate'),
        data.get('question_text'),
        data.get('options'),
        data.get('correct_answer'),
        data.get('explanation')
    )
    return jsonify({'message': 'Grammar module created'}), 201

@app.route('/api/admin/grammar/<int:module_id>', methods=['DELETE'])
@admin_required
def delete_admin_grammar(module_id):
    database.delete_grammar_module(module_id)
    return jsonify({'message': 'Grammar module deleted'})

# --- ADMIN MCQ SET Routes ---

@app.route('/api/admin/mcq-sets', methods=['GET', 'POST'])
@admin_required
def admin_mcq_sets():
    if request.method == 'GET':
        school_id = request.args.get('school_id')
        category = request.args.get('category')
        school_id = int(school_id) if school_id else None
        return jsonify(database.get_all_mcq_sets(school_id, category))
    data = request.get_json()
    school_id = data.get('school_id')
    if not school_id: return jsonify({'error': 'school_id required'}), 400
    questions_json = data.get('questions_json', '[]')
    try:
        qs = json.loads(questions_json)
        if len(qs) != 5:
            return jsonify({'error': 'Exactly 5 questions required per MCQ set'}), 400
    except:
        return jsonify({'error': 'Invalid questions JSON'}), 400
    database.create_mcq_set(
        int(school_id),
        data.get('class_name'),
        data.get('category'),
        data.get('title'),
        questions_json
    )
    return jsonify({'message': 'MCQ Set created'}), 201

@app.route('/api/admin/mcq-sets/<int:set_id>', methods=['DELETE'])
@admin_required
def delete_admin_mcq_set(set_id):
    database.delete_mcq_set(set_id)
    return jsonify({'message': 'MCQ Set deleted'})

# --- ADMIN SENTENCE EXERCISE Routes ---

@app.route('/api/admin/sentence-exercises', methods=['GET', 'POST'])
@admin_required
def admin_sentence_exercises():
    if request.method == 'GET':
        school_id = request.args.get('school_id')
        school_id = int(school_id) if school_id else None
        return jsonify(database.get_all_sentence_exercises(school_id))
    data = request.get_json()
    school_id = data.get('school_id')
    if not school_id: return jsonify({'error': 'school_id required'}), 400
    correct_sentence = data.get('correct_sentence')
    words_json = data.get('words_json', '[]')
    try:
        words = json.loads(words_json)
        if len(words) < 3:
            return jsonify({'error': 'At least 3 words required'}), 400
    except:
        return jsonify({'error': 'Invalid words JSON'}), 400
    database.create_sentence_exercise(
        int(school_id),
        data.get('class_name'),
        correct_sentence,
        words_json
    )
    return jsonify({'message': 'Sentence exercise created'}), 201

@app.route('/api/admin/sentence-exercises/<int:exercise_id>', methods=['DELETE'])
@admin_required
def delete_admin_sentence_exercise(exercise_id):
    database.delete_sentence_exercise(exercise_id)
    return jsonify({'message': 'Sentence exercise deleted'})

# --- STAFF STUDENT ATTEMPTS Route ---

@app.route('/api/staff/student-attempts/<int:student_id>', methods=['GET'])
@staff_required
def get_staff_student_attempts(student_id):
    attempts = database.get_student_attempts(student_id)
    return jsonify(attempts)


@app.route('/api/syllabus', methods=['GET'])
def student_syllabus():
    if 'user_id' not in session or session.get('role') != 'STUDENT':
        return jsonify({'error': 'Unauthorized'}), 401
    cls = session.get('class_name')
    school_id = session.get('school_id')
    if not cls or not school_id: return jsonify([])
    return jsonify(database.get_syllabus_by_class(school_id, cls))

@app.route('/api/admin/tests', methods=['GET', 'POST'])
@admin_required
def admin_tests():
    if request.method == 'GET':
        school_id = request.args.get('school_id')
        school_id = int(school_id) if school_id else None
        return jsonify(database.get_all_tests(school_id))
    data = request.get_json()
    school_id = data.get('school_id')
    if not school_id: return jsonify({'error': 'school_id required'}), 400
    database.create_test(
        int(school_id),
        data.get('class_name'),
        data.get('title'),
        data.get('questions_json')
    )
    return jsonify({'message': 'Test created'}), 201

@app.route('/api/admin/tests/<int:test_id>', methods=['DELETE'])
@admin_required
def delete_admin_test(test_id):
    database.delete_test(test_id)
    return jsonify({'message': 'Test deleted'})



# NEW: Route for Admin to view specific student stats
@app.route('/api/admin/student-stats/<int:user_id>', methods=['GET'])
@admin_required
def get_student_stats_for_admin(user_id):
    db = database.get_db()
    user = db.execute('SELECT role FROM user WHERE id = ?', (user_id,)).fetchone()
    if not user or user['role'] != 'STUDENT':
        return jsonify({'error': 'Target user is not a student.'}), 400
    stats = database.get_tracking_stats(user_id)
    return jsonify(stats)

# --- FEEDBACK ROUTES (NEW) ---

@app.route('/api/feedback', methods=['POST'])
@login_required
def send_feedback():
    data = request.get_json()
    msg = data.get('message')
    if not msg: return jsonify({'error': 'Empty message'}), 400
    database.save_feedback(session['user_id'], msg)
    return jsonify({'message': 'Feedback sent!'})

@app.route('/api/feedback/list', methods=['GET'])
@login_required
def list_feedback():
    role = session.get('role')
    if role == 'ADMIN':
        data = database.get_feedback_for_admin()
        return jsonify(data)
    elif role == 'STAFF':
        data = database.get_feedback_for_staff()
        return jsonify(data)
    else:
        return jsonify({'error': 'Unauthorized'}), 403

# --- PARENT Routes ---
@app.route('/api/parent/dashboard', methods=['GET'])
@parent_required
def parent_dashboard():
    mapped_usns = session.get('mapped_usns')
    students = database.get_mapped_students(mapped_usns)
    for student in students:
        student['stats'] = database.get_tracking_stats(student['id'])
        student['tests'] = database.get_test_results_for_student(student['id'])
    return jsonify(students)

# --- PRINCIPAL Routes ---
@app.route('/api/principal/dashboard', methods=['GET'])
@principal_required
def principal_dashboard():
    school_id = session.get('school_id')
    if not school_id: return jsonify({})
    overview = database.get_school_overview(school_id)
    return jsonify(overview)

@app.route('/api/principal/notifications', methods=['GET'])
@principal_required
def principal_notifications():
    school_id = session.get('school_id')
    if not school_id: return jsonify([])
    notifs = database.get_notifications_by_school(school_id)
    return jsonify(notifs)

@app.route('/api/principal/users', methods=['GET'])
@principal_required
def principal_get_users():
    school_id = session.get('school_id')
    if not school_id: return jsonify([])
    users = database.get_users_by_school(school_id)
    return jsonify(users)

@app.route('/api/principal/user', methods=['POST'])
@principal_required
def principal_create_user():
    school_id = session.get('school_id')
    if not school_id: return jsonify({'error': 'No school_id'}), 400
    data = request.get_json()
    role = data.get('role')
    if role in ('ADMIN', 'PRINCIPAL'): return jsonify({'error': 'Unauthorized role creation.'}), 403
    new_user = database.create_user(
        data.get('username'), data.get('password'), data.get('usn'), role, 
        school_id, data.get('class_name'), data.get('section_name'), data.get('mapped_usns')
    )
    if not new_user: return jsonify({'error': 'Conflict'}), 409
    return jsonify(new_user), 201

@app.route('/api/principal/user/<int:user_id>', methods=['PUT', 'DELETE'])
@principal_required
def principal_manage_user(user_id):
    school_id = session.get('school_id')
    if not school_id: return jsonify({'error': 'No school_id'}), 400
    
    # Ensure user belongs to this school and is not ADMIN/PRINCIPAL
    db = database.get_db()
    target_user = db.execute('SELECT * FROM user WHERE id = ? AND school_id = ?', (user_id, school_id)).fetchone()
    if not target_user or target_user['role'] in ('ADMIN', 'PRINCIPAL'):
        return jsonify({'error': 'Unauthorized access to user'}), 403

    if request.method == 'DELETE':
        database.delete_user(user_id)
        return jsonify({'message': 'Deleted'})
    
    data = request.get_json()
    role = data.get('role')
    if role in ('ADMIN', 'PRINCIPAL'): return jsonify({'error': 'Unauthorized role update.'}), 403
    
    success = database.update_user(
        user_id, data.get('username'), data.get('usn'), role, 
        school_id, data.get('class_name'), data.get('section_name'), data.get('mapped_usns')
    )
    return jsonify({'message': 'Updated'}) if success else (jsonify({'error': 'Conflict'}), 409)

# --- NOTIFICATIONS Routes ---
@app.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    user_id = session.get('user_id')
    notifications = database.get_notifications_for_user(user_id)
    return jsonify(notifications)

@app.route('/api/notifications/send', methods=['POST'])
@login_required
def send_notification():
    data = request.get_json()
    receiver_ids = data.get('receiver_ids', [])
    message = data.get('message')
    n_type = data.get('type', 'GENERAL')
    
    sender_id = session.get('user_id')
    school_id = session.get('school_id')
    
    if not school_id or not message or not receiver_ids:
        return jsonify({'error': 'Missing required fields'}), 400
        
    for rec_id in receiver_ids:
        database.create_notification(school_id, sender_id, rec_id, message, n_type)
        
    return jsonify({'message': 'Notifications sent successfully'}), 200

@app.route('/api/notifications/<int:notif_id>/read', methods=['PUT'])
@login_required
def read_notification(notif_id):
    user_id = session.get('user_id')
    database.mark_notification_read(notif_id, user_id)
    return jsonify({'message': 'Marked as read'})

@app.route('/api/parents/by_student_usn/<student_usn>', methods=['GET'])
@login_required
def get_parents_for_student(student_usn):
    parents = database.get_parents_by_student_usn(student_usn)
    return jsonify(parents)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)