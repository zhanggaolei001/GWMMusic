import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function main() {
    const outDir = path.resolve(process.cwd(), 'web');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const url = process.env.TARGET_URL || 'http://127.0.0.1:5173';
    const tracePath = path.join(outDir, 'trace.zip');
    const perfPath = path.join(outDir, 'perf.json');
    console.log('Launching Chromium (no-sandbox)...');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext();

    console.log('Starting trace...');
    await context.tracing.start({ screenshots: true, snapshots: true });

    const page = await context.newPage();
    console.log('Navigating to', url);
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (err) {
        console.error('Navigation error:', err.message);
    }

    // wait a little for any async work
    await page.waitForTimeout(1200);

    console.log('Collecting performance timing');
    const perf = await page.evaluate(() => {
        try {
            return { timing: window.performance.timing?.toJSON?.() || window.performance.timing, entries: window.performance.getEntries() };
        } catch (e) {
            return { error: String(e) };
        }
    });

    fs.writeFileSync(perfPath, JSON.stringify(perf, null, 2));
    console.log('Stopping trace to', tracePath);
    await context.tracing.stop({ path: tracePath });

    await browser.close();
    console.log('Done. Artifacts:');
    console.log(' - Trace:', tracePath);
    console.log(' - Perf JSON:', perfPath);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
