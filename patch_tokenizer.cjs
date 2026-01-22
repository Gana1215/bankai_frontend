const fs = require('fs');
const path = require('path');

// 1. Зам тохируулах (Өөрийн замтайгаа тулгаарай)
const tokenizerPath = path.join(__dirname, 'public/models/onnx_tiny_mn_fp32/tokenizer.json');

if (!fs.existsSync(tokenizerPath)) {
    console.error("❌ tokenizer.json олдсонгүй!");
    process.exit(1);
}

console.log("📖 Tokenizer уншиж байна...");
const tokenizer = JSON.parse(fs.readFileSync(tokenizerPath, 'utf8'));

// 2. added_tokens-ийг цэвэрлэх (e.split алдаанаас сэргийлэх)
// Transformers.js-д зориулж энгийн жагсаалт болгоно
if (tokenizer.added_tokens) {
    tokenizer.added_tokens = tokenizer.added_tokens.map(token => {
        if (typeof token === 'object') {
            return {
                id: token.id,
                content: token.content,
                special: true,
                single_word: false,
                lstrip: false,
                rstrip: false,
                normalized: false
            };
        }
        return token;
    });
}

// 3. Монгол хэлний токен байгаа эсэхийг баталгаажуулах
// Хэрэв байхгүй бол нэмнэ
const MN_TOKEN_ID = 50314;
const hasMN = tokenizer.added_tokens.some(t => t.id === MN_TOKEN_ID || t.content === '<|mn|>');

if (!hasMN) {
    console.log("➕ Монгол хэлний токен нэмж байна...");
    tokenizer.added_tokens.push({
        id: MN_TOKEN_ID,
        content: "<|mn|>",
        special: true,
        single_word: false,
        lstrip: false,
        rstrip: false,
        normalized: false
    });
}

// 4. Хадгалах
fs.writeFileSync(tokenizerPath, JSON.stringify(tokenizer, null, 2));
console.log("✅ Tokenizer амжилттай засварлагдлаа!");
