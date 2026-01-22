const fs = require('fs');
const path = require('path');

// Загвар байрлаж буй зам
const root = path.join(__dirname, 'public/models/onnx_tiny_mn_fp32');
const tokPath = path.join(root, 'tokenizer.json');
const mergesPath = path.join(root, 'merges.txt');

if (!fs.existsSync(mergesPath)) {
    console.error('❌ merges.txt олдсонгүй! Замаа шалгана уу.');
    process.exit(1);
}

// 1. merges.txt-ийг уншаад Array of Strings болгох
const mergesTxt = fs
  .readFileSync(mergesPath, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

// 2. tokenizer.json-ийг унших
const tok = JSON.parse(fs.readFileSync(tokPath, 'utf8'));

// 3. Merges-ийг шинэчлэх
tok.model.merges = mergesTxt;

// 4. Хадгалах
fs.writeFileSync(tokPath, JSON.stringify(tok, null, 2));

console.log('✅ Updated merges to string form. (Total merges: ' + mergesTxt.length + ')');
