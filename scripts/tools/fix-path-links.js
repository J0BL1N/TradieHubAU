
const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'pages');
if (!fs.existsSync(pagesDir)) {
    console.error('pages dir not found');
    process.exit(1);
}

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Replace CSS
    // href="/css -> href="../css
    // Quote style might vary, but grep showed double quotes.
    // We'll handle both just in case: href='/css
    
    let newContent = content
        .replace(/href="\/css/g, 'href="../css')
        .replace(/href="\/static/g, 'href="../static') // favicon
        .replace(/src="\/js/g, 'src="../js');
        
    // Also favicon might be /static/favicon.ico -> ../static/favicon.ico
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.log(`Updated ${file}`);
    }
});
console.log('Path fix complete.');
