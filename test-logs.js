const { stripVTControlCharacters } = require('util');

function cleanAnsiLog(data) {
  // 1. Handle carriage returns properly. 
  // If a chunk contains multiple \r, it's often overwriting itself.
  // We take the final state within this chunk.
  const segments = data.split('\r');
  let text = segments[segments.length - 1];

  // 2. Strip non-color ANSI sequences (CSI sequences not ending in 'm')
  // Pattern: \x1b[ ... parameter chars ... intermediate chars ... final char
  // Parameter chars: 0x30-0x3F, Intermediate chars: 0x20-0x2F, Final char: 0x40-0x7E
  // We want to KEEP sequences ending in 'm' (color)
  // We want to STRIP sequences ending in other chars like A-L, N-Z etc.
  
  // This regex matches CSI sequences and replaces them IF the last char is not 'm'
  return text.replace(/\x1b\[[0-9;]*([A-LN-Z])/g, '');
}

const test1 = '\x1b[31mRed\x1b[0m \x1b[HHome';
const test2 = 'Loading...\rDone';
const test3 = '\x1b[?25l✻\r\x1b[?25h◐';

console.log('Test 1 (Strip Home):', JSON.stringify(cleanAnsiLog(test1)));
console.log('Test 2 (R-Overwrite):', JSON.stringify(cleanAnsiLog(test2)));
console.log('Test 3 (Spinner-R):', JSON.stringify(cleanAnsiLog(test3)));

function isSpam(str) {
  const cleanText = stripVTControlCharacters(str).trim();
  const spinners = ['✻', '◐', '◓', '◑', '◒', '...', 'Loading'];
  return spinners.some(s => cleanText.includes(s)) && cleanText.length < 15;
}

console.log('Is Spam ✻:', isSpam('\x1b[33m✻\x1b[0m'));
