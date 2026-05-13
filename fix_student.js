const fs = require('fs');
const f = require('path').join(__dirname, 'app', 'student', 'page.jsx');
const lines = fs.readFileSync(f, 'utf8').split('\n');
console.log('Before fix - lines:', lines.length);
console.log('548:', lines[547]);
console.log('549:', lines[548]);

// Insert the 4 missing lines after line 548 (index 547)
const missing = [
  '        </>) : (<>',
  '          {reviewAnswers.length > 0 && (() => {',
  '            const correct = reviewAnswers.filter(a=>a.is_correct).length;',
];
lines.splice(548, 0, ...missing);

console.log('\nAfter fix - lines:', lines.length);
console.log('548:', lines[547]);
console.log('549:', lines[548]);
console.log('550:', lines[549]);
console.log('551:', lines[550]);
console.log('552:', lines[551]);

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('DONE');
