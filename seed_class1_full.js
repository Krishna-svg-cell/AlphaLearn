// seed_class1_full.js — Seeds 2000+ items for Class 1 (batch mode)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { getPool, initDb } = require('./db.js');
const words = require('./data/class1_words.json');
const grammarData = require('./data/class1_grammar.json');

async function batchInsert(pool, sql, rows) {
  // Insert in chunks of 20 using a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const params of rows) {
      await client.query(sql, params);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function seed() {
  const pool = getPool();
  await initDb();

  let schoolId;
  const ex = await pool.query("SELECT id FROM school WHERE name = 'Default School'");
  if (ex.rows.length > 0) schoolId = ex.rows[0].id;
  else {
    const r = await pool.query("INSERT INTO school (name, address) VALUES ('Default School', 'India') RETURNING id");
    schoolId = r.rows[0].id;
  }
  console.log('School ID:', schoolId);

  let total = 0;

  // Build all vocab rows
  const vocabRows = [];
  const addVocab = (items, type) => {
    for (const m of items) {
      const [word, correct, w1, w2, w3] = m;
      const ci = Math.floor(Math.random() * 4);
      const opts = [w1, w2, w3];
      opts.splice(ci, 0, correct);
      vocabRows.push(['1', word, correct, JSON.stringify(opts), ci, type]);
    }
  };
  addVocab(words.meanings, 'meaning');
  addVocab(words.synonyms, 'synonym');
  addVocab(words.antonyms, 'antonym');

  console.log(`Seeding ${vocabRows.length} vocabulary items...`);
  await batchInsert(pool,
    "INSERT INTO vocabulary (class_name, word, meaning, options, correct_index, type) VALUES ($1,$2,$3,$4,$5,$6)",
    vocabRows);
  console.log(`  ✅ ${vocabRows.length} vocabulary items`);
  total += vocabRows.length;

  // Grammar
  const grammarRows = grammarData.grammar.map(g =>
    [schoolId, '1', 'beginner', g.t, g.c, g.q, JSON.stringify(g.o), g.a, g.c]
  );
  console.log(`Seeding ${grammarRows.length} grammar questions...`);
  await batchInsert(pool,
    'INSERT INTO grammar_module (school_id, class_name, level, topic, content, question_text, options, correct_answer, explanation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    grammarRows);
  console.log(`  ✅ ${grammarRows.length} grammar questions`);
  total += grammarRows.length;

  // Sentences
  const sentRows = grammarData.sentences.map(s =>
    [schoolId, '1', s.s, JSON.stringify(s.w)]
  );
  console.log(`Seeding ${sentRows.length} sentence exercises...`);
  await batchInsert(pool,
    'INSERT INTO sentence_exercise (school_id, class_name, correct_sentence, words_json) VALUES ($1,$2,$3,$4)',
    sentRows);
  console.log(`  ✅ ${sentRows.length} sentence exercises`);
  total += sentRows.length;

  // Syllabus
  const syllabusItems = [
    {sub:'English (CBSE)',title:'The Alphabet Song',content:'Learn all 26 letters A-Z.',qz:[{q:'How many letters?',opts:['24','25','26','27'],ans:2}]},
    {sub:'English (CBSE)',title:'Three Little Pigs',content:'Story about three pigs.',qz:[{q:'How many pigs?',opts:['2','3','4','5'],ans:1}]},
    {sub:'English (CBSE)',title:'My Family',content:'Family members.',qz:[{q:"Mother's mother?",opts:['aunt','grandmother','sister','cousin'],ans:1}]},
    {sub:'Maths (CBSE)',title:'Numbers 1-20',content:'Counting 1-20.',qz:[{q:'After 9?',opts:['8','10','11','7'],ans:1},{q:'Spell 15',opts:['Thirteen','Fourteen','Fifteen','Sixteen'],ans:2}]},
    {sub:'Maths (CBSE)',title:'Addition',content:'2+3=5.',qz:[{q:'2+3=?',opts:['4','5','6','7'],ans:1}]},
    {sub:'Maths (CBSE)',title:'Shapes',content:'Circle, square, triangle.',qz:[{q:'Triangle sides?',opts:['2','3','4','5'],ans:1}]},
    {sub:'EVS (CBSE)',title:'My Body',content:'Body parts.',qz:[{q:'We see with?',opts:['Ears','Eyes','Nose','Mouth'],ans:1}]},
    {sub:'EVS (CBSE)',title:'Animals',content:'Pets and wild.',qz:[{q:'Which pet?',opts:['Lion','Dog','Tiger','Bear'],ans:1}]},
    {sub:'English (ICSE)',title:'Rhyming Words',content:'Cat-bat, sun-fun.',qz:[{q:'Rhymes with cat?',opts:['Dog','Bat','Sun','Pen'],ans:1}]},
    {sub:'English (ICSE)',title:'Vowels',content:'A,E,I,O,U.',qz:[{q:'How many vowels?',opts:['4','5','6','7'],ans:1}]},
    {sub:'Maths (ICSE)',title:'Before After Between',content:'Number order.',qz:[{q:'Between 7 and 9?',opts:['6','8','10','7'],ans:1}]},
    {sub:'Maths (ICSE)',title:'Subtraction',content:'5-2=3.',qz:[{q:'5-2=?',opts:['2','3','4','5'],ans:1}]},
    {sub:'English (State Board)',title:'My School',content:'School life.',qz:[{q:'Where study?',opts:['Market','School','Park','Home'],ans:1}]},
    {sub:'English (State Board)',title:'Fruits & Vegetables',content:'Fruits and veggies.',qz:[{q:'Which fruit?',opts:['Carrot','Potato','Mango','Onion'],ans:2}]},
    {sub:'Maths (State Board)',title:'Counting',content:'Count objects.',qz:[{q:'🍎🍎🍎🍎=?',opts:['3','4','5','2'],ans:1}]},
    {sub:'EVS (State Board)',title:'My Helpers',content:'Community helpers.',qz:[{q:'Who grows food?',opts:['Doctor','Farmer','Teacher','Pilot'],ans:1}]},
    {sub:'EVS (CBSE)',title:'Plants',content:'Root, stem, leaf, flower.',qz:[{q:'Underground part?',opts:['Leaf','Flower','Root','Stem'],ans:2}]},
    {sub:'EVS (ICSE)',title:'Good Habits',content:'Hygiene and health.',qz:[{q:'When brush teeth?',opts:['After lunch','Morning & night','Only night','Never'],ans:1}]},
    {sub:'Maths (CBSE)',title:'Comparison',content:'Greater, less, equal.',qz:[{q:'Greater: 7 or 3?',opts:['3','7','Equal','Neither'],ans:1}]},
    {sub:'Maths (ICSE)',title:'Patterns',content:'Repeating patterns.',qz:[{q:'🔴🔵🔴🔵🔴?',opts:['🔴','🔵','🟢','🟡'],ans:1}]},
  ];
  const sylRows = syllabusItems.map(s =>
    [schoolId, '1', s.sub, s.title, s.content, JSON.stringify(s.qz)]
  );
  console.log(`Seeding ${sylRows.length} syllabus lessons...`);
  await batchInsert(pool,
    'INSERT INTO syllabus (school_id, class_name, subject, lesson_title, content, quiz_data) VALUES ($1,$2,$3,$4,$5,$6)',
    sylRows);
  console.log(`  ✅ ${sylRows.length} syllabus lessons`);
  total += sylRows.length;

  console.log('\n========================================');
  console.log('🎉 CLASS 1 FULL SEED COMPLETE!');
  console.log(`  TOTAL: ${total} items`);
  console.log('========================================\n');

  await pool.end();
  process.exit(0);
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
