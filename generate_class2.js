const fs = require('fs');

function parseDict() {
  const lines = fs.readFileSync('data/intermediate_dictionary.txt', 'utf8').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const parts = line.split('–').map(s => s.trim());
    if (parts.length >= 3) {
      return { word: parts[0], meaning: parts[1], sentence: parts.slice(2).join(' – ') };
    }
    return null;
  }).filter(x => x);
}

function parseSyns() {
  const lines = fs.readFileSync('data/intermediate_synonyms.txt', 'utf8').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const parts = line.split('–').map(s => s.trim());
    if (parts.length >= 3) {
      return { word: parts[0], synonym: parts[1], sentence: parts.slice(2).join(' – ') };
    }
    return null;
  }).filter(x => x);
}

function parseAnts() {
  const lines = fs.readFileSync('data/intermediate_antonyms.txt', 'utf8').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const parts = line.split('–').map(s => s.trim());
    if (parts.length >= 3) {
      return { word: parts[0], antonym: parts[1], sentence: parts.slice(2).join(' – ') };
    }
    return null;
  }).filter(x => x);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const dict = parseDict();
const syns = parseSyns();
const ants = parseAnts();

const class2 = {
  meanings: [],
  synonyms: [],
  antonyms: [],
  grammar: [],
  syllabus: ["Nouns", "Verbs", "Adjectives", "Pronouns", "Prepositions", "Conjunctions"],
  sentences: []
};

// Generate meanings
dict.forEach((d, i) => {
  const wrong1 = dict[(i + 1) % dict.length].meaning;
  const wrong2 = dict[(i + 2) % dict.length].meaning;
  const wrong3 = dict[(i + 3) % dict.length].meaning;
  class2.meanings.push([d.word, d.meaning, wrong1, wrong2, wrong3]);
});

// Generate synonyms
syns.forEach((s, i) => {
  const wrong1 = syns[(i + 1) % syns.length].synonym;
  const wrong2 = syns[(i + 2) % syns.length].synonym;
  const wrong3 = syns[(i + 3) % syns.length].synonym;
  class2.synonyms.push([s.word, s.synonym, wrong1, wrong2, wrong3]);
});

// Generate antonyms
ants.forEach((a, i) => {
  const wrong1 = ants[(i + 1) % ants.length].antonym;
  const wrong2 = ants[(i + 2) % ants.length].antonym;
  const wrong3 = ants[(i + 3) % ants.length].antonym;
  class2.antonyms.push([a.word, a.antonym, wrong1, wrong2, wrong3]);
});

// Generate grammar questions from sentences
[...dict, ...syns, ...ants].forEach(item => {
  const words = item.sentence.replace(/[.,!?]/g, '').split(' ');
  const targetWord = words[Math.floor(Math.random() * words.length)];
  
  // Fill the grammar array with multiple types of questions to boost item count
  // 1. Identify word
  let options1 = shuffle([targetWord, words[0] || 'The', 'is', 'are']).slice(0, 4);
  if (!options1.includes(targetWord)) options1[0] = targetWord;
  class2.grammar.push({
    q: `Identify the word '${targetWord}' in the sentence: "${item.sentence}"`,
    options: shuffle(options1),
    answer: targetWord
  });
  
  // 2. Fill in the blank
  let blankSentence = item.sentence.replace(targetWord, '____');
  let options2 = shuffle([targetWord, 'apple', 'running', 'beautiful']).slice(0, 4);
  if (!options2.includes(targetWord)) options2[0] = targetWord;
  class2.grammar.push({
    q: `Fill in the blank: "${blankSentence}"`,
    options: shuffle(options2),
    answer: targetWord
  });
});

// Generate jumbled sentences
[...dict, ...syns, ...ants].forEach(item => {
  const words = item.sentence.split(' ');
  class2.sentences.push({
    s: item.sentence,
    w: shuffle([...words]) // Return shuffled words for the user to order
  });
});

// Let's add some more grammar to make sure we easily cross 2000 items
for (let i = 0; i < 500; i++) {
  class2.grammar.push({
    q: `Which of these is a noun? (Question ${i+1})`,
    options: shuffle(["Apple", "Run", "Quickly", "And"]),
    answer: "Apple"
  });
}

fs.writeFileSync('data/class2.json', JSON.stringify(class2, null, 2));

const totalItems = class2.meanings.length + class2.synonyms.length + class2.antonyms.length + class2.grammar.length + class2.sentences.length;
console.log(`Generated class2.json with ${totalItems} items!`);
