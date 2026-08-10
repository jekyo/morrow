/**
 * Proves the Camoufox browser can launch and render in this environment.
 * Used locally and as the Docker image verification.
 */
import { Camoufox } from "camoufox-js";

const browser = await Camoufox({ headless: true });
const page = await browser.newPage();
await page.goto("data:text/html,<title>morrow-ok</title>");
const title = await page.title();
await browser.close();

if (title !== "morrow-ok") {
  console.error(`FAIL: unexpected title ${JSON.stringify(title)}`);
  process.exit(1);
}
console.log("camoufox smoke: OK");
