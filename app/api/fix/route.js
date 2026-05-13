import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    let wordsPath = path.join(process.cwd(), 'data', 'class1_words.json');
    let w = fs.readFileSync(wordsPath, 'utf8');
    w = w.replace(/\]\s*\"grammar\"[\s\S]*/, ']');
    
    let gPath = path.join(process.cwd(), 'data', 'class1_grammar.json');
    let g = fs.readFileSync(gPath, 'utf8');
    
    let finalObj = {
      meanings: JSON.parse(w),
      synonyms: [],
      antonyms: [],
      grammar: JSON.parse(g).grammar || [],
      syllabus: [],
      sentences: JSON.parse(g).sentences || []
    };
    
    fs.writeFileSync(path.join(process.cwd(), 'data', 'class1.json'), JSON.stringify(finalObj, null, 2));
    
    // Attempt to fix class1_words.json by writing back the valid JSON array
    fs.writeFileSync(wordsPath, JSON.stringify(JSON.parse(w), null, 2));
    
    return NextResponse.json({ success: true, meanings: finalObj.meanings.length, grammar: finalObj.grammar.length });
  } catch(e) {
    return NextResponse.json({ error: e.message });
  }
}
