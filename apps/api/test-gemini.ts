import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { generateDesign, editDesign } from './src/services/gemini.js';

async function testGemini() {
    console.log('--- Testing Gemini Service ---');

    try {
        console.log('\n[1/2] Testing generateDesign...');
        const design = await generateDesign({
            prompt: 'A premium coffee shop mobile app with a warm, cozy theme',
            platform: 'mobile',
            stylePreset: 'premium'
        });

        console.log('Success! Generated design:');
        console.log(`ID: ${design.id}`);
        console.log(`Name: ${design.name}`);
        const description = design.description || '';
        console.log(`Description (${description.length} chars): "${description.split('\n')[0]}..."`);

        // The generation system parses the XML blocks into the object, 
        // but if the model outputs them twice, it might cause issues or tokens waste.
        // We can't easily check the raw stream here, but we can verify the parsed description quality.

        const descLen = description.length;
        const isConcise = descLen > 0 && descLen < 800;
        const startsWithStandard = description.includes('The designs for your') || description.includes('The designs have been generated');
        const hasBullets = description.includes('- ');

        console.log(`    - description concise: ${isConcise ? '✅' : '❌'} (${descLen} chars)`);
        console.log(`    - description standard start: ${startsWithStandard ? '✅' : '❌'}`);
        console.log(`    - description has bullets: ${hasBullets ? '✅' : '❌'}`);

        if (!isConcise || !startsWithStandard || !hasBullets) {
            console.warn('    ⚠️ Description does not follow the concise standard!');
        }

        console.log(`Screens: ${design.screens.length}`);

        design.screens.forEach(s => {
            console.log(` - ${s.name} (${s.html.length} chars)`);
            const html = s.html.toLowerCase();
            const lowerName = s.name.toLowerCase();

            // Heuristic to check if content matches name
            const nameInContent = html.includes(lowerName) ||
                (lowerName === 'splash' && html.includes('welcome')) ||
                (html.includes('<title>') && html.toLowerCase().includes(lowerName));

            const hasDoctype = html.includes('<!doctype html>');
            const hasHtml = html.includes('<html') && html.includes('</html>');
            const hasBody = html.includes('<body') && html.includes('</body>');
            const hasTailwind = html.includes('cdn.tailwindcss.com');
            const hasMaterial = html.includes('material-symbols-rounded') || html.includes('material+symbols+rounded');
            const hasBrokenImages = html.includes('source.unsplash.com');

            console.log(`    - name/content match: ${nameInContent ? '✅' : '⚠️'} (Searched for "${s.name}")`);
            console.log(`    - doctype: ${hasDoctype ? '✅' : '❌'}`);
            console.log(`    - html structure: ${hasHtml ? '✅' : '❌'}`);
            console.log(`    - body structure: ${hasBody ? '✅' : '❌'}`);
            console.log(`    - tailwind: ${hasTailwind ? '✅' : '❌'}`);
            console.log(`    - material symbols: ${hasMaterial ? '✅' : '❌'}`);
            console.log(`    - no broken images: ${!hasBrokenImages ? '✅' : '❌'}`);

            // Premium design pattern checks
            const hasBackdropBlur = html.includes('backdrop-blur');
            const hasRounded2xl = html.includes('rounded-2xl') || html.includes('rounded-3xl') || html.includes('rounded-full');
            const hasGradient = html.includes('gradient') || html.includes('bg-gradient');
            const hasSemiTransparent = /bg-\w+\/\d+/.test(html) || html.includes('bg-white/') || html.includes('bg-black/');

            console.log(`    - glassmorphism (backdrop-blur): ${hasBackdropBlur ? '✅' : '⚠️'}`);
            console.log(`    - modern rounding (2xl/3xl/full): ${hasRounded2xl ? '✅' : '⚠️'}`);
            console.log(`    - gradients used: ${hasGradient ? '✅' : '⚠️'}`);
            console.log(`    - semi-transparent layers: ${hasSemiTransparent ? '✅' : '⚠️'}`);

            if (!hasDoctype || !hasHtml || !hasBody || !hasTailwind || !hasMaterial || hasBrokenImages) {
                console.warn('    ⚠️ Screen is missing critical boilerplate or uses broken images!');
            }
        });

        if (design.screens.length > 0) {
            console.log('\n[2/2] Testing editDesign...');
            const originalHtml = design.screens[0].html;
            const updatedHtml = await editDesign({
                instruction: 'Change the primary button color to emerald green',
                html: originalHtml,
                screenId: design.screens[0].screenId
            });

            console.log('Success! Edited HTML length:', updatedHtml.length);
            if (updatedHtml.includes('emerald') || updatedHtml.includes('green') || updatedHtml !== originalHtml) {
                console.log('Verification: HTML seems updated.');
            } else {
                console.log('Warning: HTML might not have been updated significantly.');
            }
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testGemini();
