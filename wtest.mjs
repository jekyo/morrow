import { firefox } from "playwright-core";
const KEY="mrw__r5rLTkTemP9wKBmASzTkLocc3mXQIAA";
const b = await firefox.connect(`wss://morrow.jekyo.app/playwright/test?token=${KEY}`);
const page = b.contexts()[0].pages()[0] ?? await b.contexts()[0].newPage();
await page.goto("https://en.wikipedia.org/wiki/Web_browser", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(1000);
await page.evaluate(()=>window.scrollTo(0,0));
console.log("before:", await page.evaluate(()=>window.scrollY));
// A) direct mouse.wheel
await page.mouse.move(640,400);
await page.mouse.wheel(0,600);
await page.waitForTimeout(600);
console.log("after mouse.wheel(0,600):", await page.evaluate(()=>window.scrollY));
// B) reset, try evaluate scroll (sanity: page IS scrollable)
await page.evaluate(()=>window.scrollTo(0,0));
await page.evaluate(()=>window.scrollBy(0,600));
await page.waitForTimeout(300);
console.log("after JS scrollBy(0,600):", await page.evaluate(()=>window.scrollY));
await b.close(); process.exit(0);
