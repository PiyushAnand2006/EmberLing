// One-shot codemod: update onboarding-skip detection in the test scripts to
// the new Onboarding design (titlebar says "Welcome to Emberling"; skip is a
// button labelled "Skip for now").
import fs from "node:fs";

const files = [
  "scripts/launch-and-test.mjs",
  "scripts/real-click-test.mjs",
  "scripts/menu-items-test.mjs",
  "scripts/section-a-test.mjs",
];

const skipBlock = [
  "if ((await evalJs(`document.querySelector('.titlebar-title')?.textContent || ''`)).includes('Welcome')) {",
  "  await evalJs(`[...document.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))?.click(); true`);",
  "  await sleep(700);",
  "}",
].join("\n");

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  let count = 0;
  // variant A: evalJs(`!!document.querySelector('.empty-state .orb')`) blocks
  s = s.replace(/if \(await evalJs\(`\!\!document\.querySelector\('\.empty-state \.orb'\)`\)\) \{[\s\S]{0,300}?\n\}/g, () => {
    count++;
    return skipBlock;
  });
  // variant B: exists(".empty-state .orb") blocks
  s = s.replace(/if \(await exists\("\.empty-state \.orb"\)\) \{[\s\S]{0,300}?\n\}/g, () => {
    count++;
    return skipBlock;
  });
  fs.writeFileSync(f, s);
  console.log(f, "→", count, "replacement(s)");
}
