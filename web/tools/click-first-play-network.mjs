import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
    const out = path.resolve(process.cwd(), 'web', 'mcp-click-net');
    fs.mkdirSync(out, { recursive: true });
    const executablePath = process.env.CHROME_PATH || undefined;
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        executablePath,
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    const logs = [];
    const responses = [];
    page.on('console', m => logs.push({ type: m.type(), text: m.text() }));
    page.on('response', async resp => {
        try {
            const url = resp.url();
            const status = resp.status();
            const headers = resp.headers();
            let text = '';
            try { text = await resp.text(); } catch (e) { text = '<binary-or-no-body>'; }
            responses.push({ url, status, headers, body: text.slice(0, 2000) });
        } catch (e) { }
    });

    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    const input = await page.$('input[aria-label="search-input"]');
    if (input) {
        await input.fill('王心凌 爱你');
        await input.press('Enter');
        const btn = await page.$('button[aria-label="search-button"]') || await page.$('.search-btn');
        if (btn) {
            await Promise.all([
                page.waitForResponse(r => r.url().includes('/api/search') && r.status() === 200).catch(() => { }),
                btn.click(),
            ]);
        }
    }
    await page.waitForSelector('button.result-play', { timeout: 8000 }).catch(() => null);
    const playBtn = await page.$('button.result-play');
    if (playBtn) {
        await playBtn.click();
        await page.waitForTimeout(2000);
    }

    fs.writeFileSync(path.join(out, 'console.json'), JSON.stringify(logs, null, 2));
    fs.writeFileSync(path.join(out, 'responses.json'), JSON.stringify(responses, null, 2));
    await browser.close();
    console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
