const fs = require('fs');
const words = JSON.parse(fs.readFileSync('./data/class1_words.json'));
const grammar = JSON.parse(fs.readFileSync('./data/class1_grammar.json'));
const class1 = {
  meanings: words.meanings || [],
  synonyms: words.synonyms || [],
  antonyms: words.antonyms || [],
  grammar: grammar.grammar || [],
  syllabus: [],
  sentences: grammar.sentences || []
};
fs.writeFileSync('./data/class1.json', JSON.stringify(class1, null, 2));

const emptyClass = { meanings: [], synonyms: [], antonyms: [], grammar: [], syllabus: [], sentences: [] };
for(let i=2; i<=6; i++) {
  fs.writeFileSync('./data/class' + i + '.json', JSON.stringify(emptyClass, null, 2));
}
console.log('JSON files created.');
