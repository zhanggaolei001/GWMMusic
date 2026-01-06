import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function run() {
    const out = path.resolve(process.cwd(), 'web', 'mcp-run-mobile');
    fs.mkdirSync(out, { recursive: true });
    const url = process.env.TARGET_URL || 'http://127.0.0.1:5173';
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const iPhone = {
        viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A5341f Safari/604.1'
    };
    const context = await browser.newContext({ viewport: iPhone.viewport, userAgent: iPhone.userAgent, isMobile: true });
    const page = await context.newPage();

    const consoleLogs = [];
    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    const requests = [];
    page.on('request', req => {
        requests.push({ url: req.url(), method: req.method() });
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    fs.writeFileSync(path.join(out, 'initial.html'), await page.content());
    await page.screenshot({ path: path.join(out, 'initial.png'), fullPage: true });

    // try to find a search input
    const searchSelectors = ['input[type="search"]', 'input[placeholder*="搜索"]', 'input[placeholder*="song"]', 'input[name="q"]', 'input[type="text"]'];
    let searchHandle = null;
    for (const sel of searchSelectors) {
        const h = await page.$(sel);
        if (h) {
            searchHandle = h;
            break;
        }
    }

    if (!searchHandle) {
        // fallback: try header input
        searchHandle = await page.$('input');
    }

    if (searchHandle) {
        await searchHandle.fill('王心凌 爱你');
        // prefer clicking a visible search button
        const btnSelectors = ['button[aria-label="search-button"]', '.search-btn', 'button[type="submit"]', 'button'];
        let clicked = false;
        for (const bs of btnSelectors) {
            const b = await page.$(bs);
            if (b) {
                try {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => { }),
                        b.click()
                    ]);
                    clicked = true;
                    break;
                }
                catch (e) {
                    // ignore and try next
                }
            }
        }
        if (!clicked) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => { }),
                searchHandle.press ? searchHandle.press('Enter') : page.keyboard.press('Enter')
            ]);
        }
        await page.waitForTimeout(1000);
        fs.writeFileSync(path.join(out, 'after-search.html'), await page.content());
        await page.screenshot({ path: path.join(out, 'after-search.png'), fullPage: true });
    }

    fs.writeFileSync(path.join(out, 'console.json'), JSON.stringify(consoleLogs, null, 2));
    fs.writeFileSync(path.join(out, 'requests.json'), JSON.stringify(requests.slice(-200), null, 2));

    await browser.close();
    console.log('Artifacts saved to', out);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
