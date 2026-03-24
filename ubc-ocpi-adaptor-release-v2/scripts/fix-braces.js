const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findTsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory() && !['node_modules', 'dist', 'coverage'].includes(file)) {
            findTsFiles(filePath, fileList);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

function fixBraces(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const fixedLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Check if line contains } catch or } else on the same line
        const catchMatch = line.match(/^(\s*)(.*?)\}\s+catch\s*(.*)/);
        const elseMatch = line.match(/^(\s*)(.*?)\}\s+else\s+(.*)/);

        if (catchMatch) {
            const indent = catchMatch[1];
            const beforeBrace = catchMatch[2];
            const catchPart = catchMatch[3].trim();
            // Split into two lines
            fixedLines.push(indent + beforeBrace + '}');
            fixedLines.push(indent + 'catch ' + catchPart);
            continue;
        }

        if (elseMatch) {
            const indent = elseMatch[1];
            const beforeBrace = elseMatch[2];
            const elsePart = elseMatch[3].trim();
            // Split into two lines
            fixedLines.push(indent + beforeBrace + '}');
            fixedLines.push(indent + 'else ' + elsePart);
            continue;
        }

        // Check if current line ends with } and next line starts with catch or else
        if (line.trim().endsWith('}') && !line.includes('catch') && !line.includes('else')) {
            const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
            const indent = line.match(/^(\s*)/)[1];
            const trimmedNext = nextLine.trim();

            if (trimmedNext.startsWith('catch')) {
                // Already on new line, ensure proper indentation
                const catchContent = trimmedNext.replace(/^catch\s*/, '');
                fixedLines.push(line);
                fixedLines.push(indent + 'catch ' + catchContent);
                i++; // Skip the next line since we've processed it
                continue;
            } else if (trimmedNext.startsWith('else')) {
                // Already on new line, ensure proper indentation
                const elseContent = trimmedNext.replace(/^else\s*/, '');
                fixedLines.push(line);
                fixedLines.push(indent + 'else ' + elseContent);
                i++; // Skip the next line since we've processed it
                continue;
            }
        }

        fixedLines.push(line);
    }

    fs.writeFileSync(filePath, fixedLines.join('\n'), 'utf8');
}

const srcDir = path.join(__dirname, '..', 'src');
const testDir = path.join(__dirname, '..', 'tests');

const files = [];
if (fs.existsSync(srcDir)) {
    findTsFiles(srcDir, files);
}
if (fs.existsSync(testDir)) {
    findTsFiles(testDir, files);
}

files.forEach((file) => {
    fixBraces(file);
});

