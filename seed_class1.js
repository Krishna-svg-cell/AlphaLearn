const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { getPool, initDb } = require('./db.js');

async function seed() {
  const pool = getPool();
  await initDb();

  // Ensure a default school exists
  let schoolId;
  const existing = await pool.query("SELECT id FROM school WHERE name = 'Default School'");
  if (existing.rows.length > 0) {
    schoolId = existing.rows[0].id;
  } else {
    const r = await pool.query("INSERT INTO school (name, address) VALUES ('Default School', 'India') RETURNING id");
    schoolId = r.rows[0].id;
  }
  console.log('School ID:', schoolId);

  // ==================== VOCABULARY (class_name = '1') ====================
  const vocabData = [
    // --- MEANING ---
    { word: 'Apple', meaning: 'A round fruit', options: ['A vegetable','A round fruit','A bird','A toy'], correct_index: 1, type: 'meaning' },
    { word: 'Ball', meaning: 'A round object used in games', options: ['A round object used in games','A type of food','A plant','A tool'], correct_index: 0, type: 'meaning' },
    { word: 'Cat', meaning: 'A small pet animal', options: ['A big animal','A small pet animal','A fruit','A vehicle'], correct_index: 1, type: 'meaning' },
    { word: 'Dog', meaning: 'A loyal pet animal', options: ['A bird','A fish','A loyal pet animal','An insect'], correct_index: 2, type: 'meaning' },
    { word: 'Egg', meaning: 'Laid by a hen', options: ['A fruit','Laid by a hen','A flower','A toy'], correct_index: 1, type: 'meaning' },
    { word: 'Fish', meaning: 'An animal that lives in water', options: ['Lives on land','An animal that lives in water','A bird','A plant'], correct_index: 1, type: 'meaning' },
    { word: 'Garden', meaning: 'A place where plants grow', options: ['A kitchen','A place where plants grow','A school','A shop'], correct_index: 1, type: 'meaning' },
    { word: 'House', meaning: 'A place where people live', options: ['A vehicle','A place where people live','A toy','A tree'], correct_index: 1, type: 'meaning' },
    { word: 'Ice', meaning: 'Frozen water', options: ['Hot water','Frozen water','Milk','Juice'], correct_index: 1, type: 'meaning' },
    { word: 'Jug', meaning: 'A container for liquids', options: ['A container for liquids','A fruit','A toy','A book'], correct_index: 0, type: 'meaning' },
    { word: 'Kite', meaning: 'A toy that flies in the sky', options: ['A toy that flies in the sky','A fruit','An animal','A tool'], correct_index: 0, type: 'meaning' },
    { word: 'Lamp', meaning: 'Gives us light', options: ['Gives us food','Gives us water','Gives us light','Gives us air'], correct_index: 2, type: 'meaning' },
    { word: 'Moon', meaning: 'Shines at night in the sky', options: ['Shines in the morning','Shines at night in the sky','A fruit','A toy'], correct_index: 1, type: 'meaning' },
    { word: 'Nest', meaning: 'A home for birds', options: ['A home for birds','A home for fish','A type of food','A vehicle'], correct_index: 0, type: 'meaning' },
    { word: 'Orange', meaning: 'A citrus fruit', options: ['A vegetable','A citrus fruit','A toy','A bird'], correct_index: 1, type: 'meaning' },
    { word: 'Pen', meaning: 'Used to write', options: ['Used to eat','Used to write','Used to play','Used to sleep'], correct_index: 1, type: 'meaning' },
    { word: 'Queen', meaning: 'A female ruler', options: ['A male ruler','A female ruler','A bird','A flower'], correct_index: 1, type: 'meaning' },
    { word: 'Rain', meaning: 'Water falling from clouds', options: ['Snow','Water falling from clouds','Wind','Sunshine'], correct_index: 1, type: 'meaning' },
    { word: 'Sun', meaning: 'Gives us light and heat', options: ['Gives us light and heat','Gives us rain','A fruit','A toy'], correct_index: 0, type: 'meaning' },
    { word: 'Tree', meaning: 'A tall plant', options: ['A small insect','A tall plant','A toy','A vehicle'], correct_index: 1, type: 'meaning' },
    // --- SYNONYM ---
    { word: 'Big', meaning: 'Large', options: ['Small','Large','Tiny','Short'], correct_index: 1, type: 'synonym' },
    { word: 'Happy', meaning: 'Glad', options: ['Sad','Angry','Glad','Tired'], correct_index: 2, type: 'synonym' },
    { word: 'Fast', meaning: 'Quick', options: ['Slow','Quick','Lazy','Heavy'], correct_index: 1, type: 'synonym' },
    { word: 'Small', meaning: 'Little', options: ['Big','Huge','Little','Tall'], correct_index: 2, type: 'synonym' },
    { word: 'Pretty', meaning: 'Beautiful', options: ['Ugly','Beautiful','Dark','Rough'], correct_index: 1, type: 'synonym' },
    { word: 'Sad', meaning: 'Unhappy', options: ['Joyful','Unhappy','Excited','Calm'], correct_index: 1, type: 'synonym' },
    { word: 'Start', meaning: 'Begin', options: ['End','Stop','Begin','Finish'], correct_index: 2, type: 'synonym' },
    { word: 'Angry', meaning: 'Mad', options: ['Happy','Calm','Mad','Gentle'], correct_index: 2, type: 'synonym' },
    { word: 'Cold', meaning: 'Cool', options: ['Hot','Warm','Cool','Burning'], correct_index: 2, type: 'synonym' },
    { word: 'Loud', meaning: 'Noisy', options: ['Quiet','Silent','Noisy','Soft'], correct_index: 2, type: 'synonym' },
    { word: 'Brave', meaning: 'Courageous', options: ['Scared','Courageous','Shy','Weak'], correct_index: 1, type: 'synonym' },
    { word: 'Clean', meaning: 'Tidy', options: ['Dirty','Messy','Tidy','Dusty'], correct_index: 2, type: 'synonym' },
    { word: 'Clever', meaning: 'Smart', options: ['Dull','Smart','Slow','Foolish'], correct_index: 1, type: 'synonym' },
    { word: 'Kind', meaning: 'Nice', options: ['Mean','Rude','Nice','Cruel'], correct_index: 2, type: 'synonym' },
    { word: 'Shut', meaning: 'Close', options: ['Open','Close','Break','Lock'], correct_index: 1, type: 'synonym' },
    // --- ANTONYM ---
    { word: 'Big', meaning: 'Small', options: ['Large','Huge','Small','Tall'], correct_index: 2, type: 'antonym' },
    { word: 'Happy', meaning: 'Sad', options: ['Glad','Joyful','Excited','Sad'], correct_index: 3, type: 'antonym' },
    { word: 'Hot', meaning: 'Cold', options: ['Warm','Cold','Burning','Boiling'], correct_index: 1, type: 'antonym' },
    { word: 'Up', meaning: 'Down', options: ['High','Above','Over','Down'], correct_index: 3, type: 'antonym' },
    { word: 'Day', meaning: 'Night', options: ['Morning','Afternoon','Evening','Night'], correct_index: 3, type: 'antonym' },
    { word: 'Fast', meaning: 'Slow', options: ['Quick','Rapid','Slow','Swift'], correct_index: 2, type: 'antonym' },
    { word: 'Good', meaning: 'Bad', options: ['Nice','Fine','Great','Bad'], correct_index: 3, type: 'antonym' },
    { word: 'Old', meaning: 'New', options: ['Ancient','New','Aged','Worn'], correct_index: 1, type: 'antonym' },
    { word: 'Open', meaning: 'Close', options: ['Wide','Unlock','Close','Free'], correct_index: 2, type: 'antonym' },
    { word: 'Tall', meaning: 'Short', options: ['High','Long','Short','Big'], correct_index: 2, type: 'antonym' },
    { word: 'Light', meaning: 'Dark', options: ['Bright','Shiny','Glowing','Dark'], correct_index: 3, type: 'antonym' },
    { word: 'Clean', meaning: 'Dirty', options: ['Tidy','Neat','Dirty','Fresh'], correct_index: 2, type: 'antonym' },
    { word: 'Hard', meaning: 'Soft', options: ['Tough','Strong','Firm','Soft'], correct_index: 3, type: 'antonym' },
    { word: 'Wet', meaning: 'Dry', options: ['Moist','Damp','Soaked','Dry'], correct_index: 3, type: 'antonym' },
    { word: 'Loud', meaning: 'Quiet', options: ['Noisy','Quiet','Harsh','Shrill'], correct_index: 1, type: 'antonym' },
  ];

  console.log('Seeding vocabulary...');
  for (const v of vocabData) {
    await pool.query(
      "INSERT INTO vocabulary (class_name, word, meaning, options, correct_index, type) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      ['1', v.word, v.meaning, JSON.stringify(v.options), v.correct_index, v.type]
    );
  }
  console.log(`✅ ${vocabData.length} vocabulary items seeded`);

  // ==================== GRAMMAR (CBSE / ICSE / State Board) ====================
  const grammarData = [
    // --- Nouns ---
    { topic:'Nouns (CBSE)', content:'A noun is a naming word.', question_text:'Which word is a noun?', options:['Run','Cat','Quickly','Under'], correct_answer:'0', explanation:'Cat is a noun — it names an animal.' },
    { topic:'Nouns (CBSE)', content:'A noun names a person, place, animal, or thing.', question_text:'Which is a naming word?', options:['Beautiful','School','Happily','Jump'], correct_answer:'1', explanation:'School is a noun — it names a place.' },
    { topic:'Nouns (ICSE)', content:'Nouns can be common or proper.', question_text:'Which is a proper noun?', options:['boy','Delhi','city','river'], correct_answer:'1', explanation:'Delhi is a proper noun — it is a specific place name.' },
    { topic:'Nouns (ICSE)', content:'Common nouns are general names.', question_text:'Which is a common noun?', options:['Ravi','Mumbai','book','Ganga'], correct_answer:'2', explanation:'Book is a common noun.' },
    { topic:'Nouns (State Board)', content:'Name words tell us who or what.', question_text:'Pick the name word:', options:['mango','eat','red','slowly'], correct_answer:'0', explanation:'Mango is a naming word (noun).' },
    // --- Action Words / Verbs ---
    { topic:'Verbs (CBSE)', content:'A verb is a doing word.', question_text:'Which word shows action?', options:['Table','Runs','Blue','Happy'], correct_answer:'1', explanation:'Runs is a verb — it shows an action.' },
    { topic:'Verbs (CBSE)', content:'Verbs tell us what someone does.', question_text:'Find the action word:', options:['Eat','Chair','Pretty','Tall'], correct_answer:'0', explanation:'Eat is a verb.' },
    { topic:'Verbs (ICSE)', content:'Doing words are verbs.', question_text:'Which is a doing word?', options:['Flower','Sings','Red','Big'], correct_answer:'1', explanation:'Sings is a doing word (verb).' },
    { topic:'Verbs (State Board)', content:'Action words tell what we do.', question_text:'Pick the action word:', options:['play','book','green','soft'], correct_answer:'0', explanation:'Play is an action word.' },
    // --- Describing Words / Adjectives ---
    { topic:'Adjectives (CBSE)', content:'An adjective describes a noun.', question_text:'Which word describes "ball"?', options:['Big','Run','Under','And'], correct_answer:'0', explanation:'Big describes the ball — it is an adjective.' },
    { topic:'Adjectives (ICSE)', content:'Describing words tell us more about nouns.', question_text:'Find the describing word: "The red rose is pretty."', options:['rose','is','red','pretty'], correct_answer:'2', explanation:'Red describes the rose.' },
    { topic:'Adjectives (State Board)', content:'We use describing words to say how things look, feel, or taste.', question_text:'Which word describes the mango?', options:['sweet','eat','tree','green'], correct_answer:'0', explanation:'Sweet tells us how the mango tastes.' },
    // --- Articles ---
    { topic:'Articles (CBSE)', content:'A, An, The are articles.', question_text:'Fill in: ___ apple is red.', options:['A','An','The','Is'], correct_answer:'1', explanation:'We use "An" before words starting with a vowel sound.' },
    { topic:'Articles (ICSE)', content:'Use "a" before consonant sounds, "an" before vowel sounds.', question_text:'Fill in: ___ elephant is big.', options:['A','An','The','Is'], correct_answer:'1', explanation:'"An" is used before "elephant" because it starts with a vowel.' },
    { topic:'Articles (State Board)', content:'Articles come before nouns.', question_text:'Choose: I have ___ bat.', options:['a','an','the','is'], correct_answer:'0', explanation:'"A" is used before consonant sounds like "b".' },
    // --- Prepositions ---
    { topic:'Prepositions (CBSE)', content:'Prepositions tell us where something is.', question_text:'The cat is ___ the table.', options:['under','run','big','eat'], correct_answer:'0', explanation:'Under tells us where the cat is.' },
    { topic:'Prepositions (ICSE)', content:'In, on, under, behind are position words.', question_text:'The book is ___ the bag.', options:['eat','in','run','tall'], correct_answer:'1', explanation:'In tells the position of the book.' },
    // --- Singular & Plural ---
    { topic:'Singular & Plural (CBSE)', content:'One = singular, many = plural.', question_text:'What is the plural of "cat"?', options:['cat','cats','cates','catis'], correct_answer:'1', explanation:'We add "s" to make plurals: cat → cats.' },
    { topic:'Singular & Plural (ICSE)', content:'Add -es to words ending in s, sh, ch, x.', question_text:'Plural of "box"?', options:['boxs','boxies','boxes','boxen'], correct_answer:'2', explanation:'Words ending in "x" take "-es": box → boxes.' },
    { topic:'Singular & Plural (State Board)', content:'One thing is singular. More than one is plural.', question_text:'Plural of "ball"?', options:['ball','balls','balles','balling'], correct_answer:'1', explanation:'ball → balls (add "s").' },
    // --- Sentence types ---
    { topic:'Sentences (CBSE)', content:'A sentence starts with a capital letter and ends with a full stop.', question_text:'Which is a correct sentence?', options:['the cat sits','The cat sits.','cat the sits.','Sits cat the.'], correct_answer:'1', explanation:'Capital letter at start, full stop at end.' },
    { topic:'Sentences (ICSE)', content:'A question ends with a question mark (?).', question_text:'Which is a question?', options:['I like mangoes.','She runs fast.','Where is the ball?','The sun is bright.'], correct_answer:'2', explanation:'Questions end with "?".' },
  ];

  console.log('Seeding grammar...');
  for (const g of grammarData) {
    await pool.query(
      'INSERT INTO grammar_module (school_id, class_name, level, topic, content, question_text, options, correct_answer, explanation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [schoolId, '1', 'beginner', g.topic, g.content, g.question_text, JSON.stringify(g.options), g.correct_answer, g.explanation]
    );
  }
  console.log(`✅ ${grammarData.length} grammar items seeded`);

  // ==================== SYLLABUS (Board-wise) ====================
  const syllabusData = [
    // --- CBSE English ---
    { subject:'English (CBSE)', lesson_title:'The Alphabet Song', content:'Learn all 26 letters A to Z. Each letter has a name and a sound.',
      quiz_data:[{q:'How many letters are in the English alphabet?',opts:['24','25','26','27'],ans:2},{q:'Which is the first letter?',opts:['B','A','Z','C'],ans:1},{q:'Which letter comes after D?',opts:['C','E','F','B'],ans:1}] },
    { subject:'English (CBSE)', lesson_title:'Three Little Pigs', content:'A story about three pigs who build houses of straw, sticks, and bricks.',
      quiz_data:[{q:'How many pigs were there?',opts:['2','3','4','5'],ans:1},{q:'Which house was the strongest?',opts:['Straw','Sticks','Bricks','Mud'],ans:2}] },
    { subject:'English (CBSE)', lesson_title:'My Family', content:'Family members: mother, father, brother, sister, grandparents.',
      quiz_data:[{q:"Your mother's mother is your ___",opts:['aunt','grandmother','sister','cousin'],ans:1},{q:"Your father's brother is your ___",opts:['uncle','brother','cousin','nephew'],ans:0}] },
    // --- CBSE Maths ---
    { subject:'Maths (CBSE)', lesson_title:'Numbers 1 to 20', content:'Learn counting from 1 to 20. Understand number names.',
      quiz_data:[{q:'What comes after 9?',opts:['8','10','11','7'],ans:1},{q:'Write in words: 15',opts:['Thirteen','Fourteen','Fifteen','Sixteen'],ans:2},{q:'Which is the biggest? 12, 8, 19, 5',opts:['12','8','19','5'],ans:2}] },
    { subject:'Maths (CBSE)', lesson_title:'Addition (1-digit)', content:'Adding two small numbers together. 2 + 3 = 5',
      quiz_data:[{q:'2 + 3 = ?',opts:['4','5','6','7'],ans:1},{q:'4 + 1 = ?',opts:['3','4','5','6'],ans:2},{q:'1 + 1 = ?',opts:['1','2','3','0'],ans:1}] },
    { subject:'Maths (CBSE)', lesson_title:'Shapes', content:'Basic shapes: circle, square, triangle, rectangle.',
      quiz_data:[{q:'How many sides does a triangle have?',opts:['2','3','4','5'],ans:1},{q:'A shape with 4 equal sides is a ___',opts:['Circle','Triangle','Square','Rectangle'],ans:2}] },
    // --- CBSE EVS ---
    { subject:'EVS (CBSE)', lesson_title:'My Body', content:'Our body has head, hands, legs, eyes, ears, nose, and mouth.',
      quiz_data:[{q:'We see with our ___',opts:['Ears','Eyes','Nose','Mouth'],ans:1},{q:'How many hands do we have?',opts:['1','2','3','4'],ans:1}] },
    { subject:'EVS (CBSE)', lesson_title:'Animals Around Us', content:'Animals can be pets (dog, cat) or wild (lion, tiger).',
      quiz_data:[{q:'Which is a pet animal?',opts:['Lion','Dog','Tiger','Bear'],ans:1},{q:'Which animal lives in water?',opts:['Cat','Cow','Fish','Dog'],ans:2}] },
    // --- ICSE English ---
    { subject:'English (ICSE)', lesson_title:'Rhyming Words', content:'Words that sound alike at the end: cat-bat, sun-fun, dog-log.',
      quiz_data:[{q:'Which word rhymes with "cat"?',opts:['Dog','Bat','Sun','Pen'],ans:1},{q:'Which word rhymes with "sun"?',opts:['Moon','Fun','Star','Bun'],ans:1}] },
    { subject:'English (ICSE)', lesson_title:'Vowels and Consonants', content:'Vowels: A, E, I, O, U. All other letters are consonants.',
      quiz_data:[{q:'How many vowels are there?',opts:['4','5','6','7'],ans:1},{q:'Which is a vowel?',opts:['B','C','E','D'],ans:2}] },
    // --- ICSE Maths ---
    { subject:'Maths (ICSE)', lesson_title:'Before, After, Between', content:'Numbers have an order. 5 comes after 4 and before 6.',
      quiz_data:[{q:'What comes between 7 and 9?',opts:['6','8','10','7'],ans:1},{q:'What comes before 5?',opts:['3','4','6','7'],ans:1}] },
    { subject:'Maths (ICSE)', lesson_title:'Subtraction (1-digit)', content:'Taking away: 5 - 2 = 3',
      quiz_data:[{q:'5 - 2 = ?',opts:['2','3','4','5'],ans:1},{q:'7 - 3 = ?',opts:['3','4','5','2'],ans:1}] },
    // --- State Board English ---
    { subject:'English (State Board)', lesson_title:'My School', content:'School is where we learn. We have a teacher, friends, and classrooms.',
      quiz_data:[{q:'Where do we study?',opts:['Market','School','Park','Home'],ans:1},{q:'Who teaches us in school?',opts:['Doctor','Teacher','Driver','Chef'],ans:1}] },
    { subject:'English (State Board)', lesson_title:'Fruits and Vegetables', content:'Fruits: apple, banana, mango. Vegetables: carrot, potato, tomato.',
      quiz_data:[{q:'Which is a fruit?',opts:['Carrot','Potato','Mango','Onion'],ans:2},{q:'Which is a vegetable?',opts:['Apple','Banana','Carrot','Grapes'],ans:2}] },
    // --- State Board Maths ---
    { subject:'Maths (State Board)', lesson_title:'Counting Objects', content:'Count objects around you: 1 pen, 2 books, 3 balls.',
      quiz_data:[{q:'Count: 🍎🍎🍎🍎 How many apples?',opts:['3','4','5','2'],ans:1},{q:'Count: ⭐⭐⭐ How many stars?',opts:['2','3','4','5'],ans:1}] },
    // --- State Board EVS ---
    { subject:'EVS (State Board)', lesson_title:'My Helpers', content:'People who help us: doctor, teacher, policeman, farmer.',
      quiz_data:[{q:'Who grows food for us?',opts:['Doctor','Farmer','Teacher','Pilot'],ans:1},{q:'Who keeps us safe?',opts:['Chef','Driver','Policeman','Painter'],ans:2}] },
  ];

  console.log('Seeding syllabus...');
  for (const s of syllabusData) {
    await pool.query(
      'INSERT INTO syllabus (school_id, class_name, subject, lesson_title, content, quiz_data) VALUES ($1,$2,$3,$4,$5,$6)',
      [schoolId, '1', s.subject, s.lesson_title, s.content, JSON.stringify(s.quiz_data)]
    );
  }
  console.log(`✅ ${syllabusData.length} syllabus items seeded`);

  // ==================== SENTENCE EXERCISES ====================
  const sentenceData = [
    { correct_sentence:'The cat sat on the mat.', words:['mat.','sat','The','on','cat','the'] },
    { correct_sentence:'I love my mother.', words:['mother.','my','I','love'] },
    { correct_sentence:'The sun is bright.', words:['bright.','The','is','sun'] },
    { correct_sentence:'Birds fly in the sky.', words:['the','Birds','in','fly','sky.'] },
    { correct_sentence:'I go to school.', words:['school.','go','I','to'] },
    { correct_sentence:'She has a red ball.', words:['ball.','red','has','She','a'] },
    { correct_sentence:'The dog is big.', words:['big.','dog','The','is'] },
    { correct_sentence:'We play in the park.', words:['park.','in','play','the','We'] },
    { correct_sentence:'My father reads a book.', words:['book.','reads','My','a','father'] },
    { correct_sentence:'The fish swims in water.', words:['water.','swims','The','in','fish'] },
    { correct_sentence:'I drink milk every day.', words:['day.','drink','every','I','milk'] },
    { correct_sentence:'The flower is beautiful.', words:['beautiful.','flower','The','is'] },
    { correct_sentence:'He runs very fast.', words:['fast.','runs','He','very'] },
    { correct_sentence:'The moon shines at night.', words:['night.','at','shines','The','moon'] },
    { correct_sentence:'I like to eat mangoes.', words:['mangoes.','eat','I','to','like'] },
  ];

  console.log('Seeding sentence exercises...');
  for (const s of sentenceData) {
    await pool.query(
      'INSERT INTO sentence_exercise (school_id, class_name, correct_sentence, words_json) VALUES ($1,$2,$3,$4)',
      [schoolId, '1', s.correct_sentence, JSON.stringify(s.words)]
    );
  }
  console.log(`✅ ${sentenceData.length} sentence exercises seeded`);

  // ==================== SUMMARY ====================
  console.log('\n========================================');
  console.log('🎉 CLASS 1 SEED DATA COMPLETE!');
  console.log('========================================');
  console.log(`Vocabulary:  ${vocabData.length} items (meaning/synonym/antonym)`);
  console.log(`Grammar:     ${grammarData.length} items (CBSE/ICSE/State Board)`);
  console.log(`Syllabus:    ${syllabusData.length} lessons (CBSE/ICSE/State Board)`);
  console.log(`Sentences:   ${sentenceData.length} exercises`);
  console.log(`Total:       ${vocabData.length + grammarData.length + syllabusData.length + sentenceData.length} items`);
  console.log('========================================\n');

  await pool.end();
  process.exit(0);
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
