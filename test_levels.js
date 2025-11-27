import { restApiLevels } from './src/data/restApiLevels.js';

console.log("Levels count:", restApiLevels.length);
const level2 = restApiLevels.find(l => l.id === 2);
console.log("Level 2 found:", !!level2);
if (level2) {
    console.log("Level 2 title:", level2.title);
    console.log("Level 2 tutorialContent:", !!level2.tutorialContent);
    console.log("Level 2 keyPoints:", Array.isArray(level2.tutorialContent?.keyPoints));
    console.log("Level 2 walkthrough:", Array.isArray(level2.tutorialContent?.walkthrough));
}
