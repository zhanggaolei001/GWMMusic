import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
    const out = path.resolve(process.cwd(), 'web', 'mcp-click-net');
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    const logs = [];
    const responses = [];
    page.on('console', m => logs.push({ type: m.type(), text: m.text() }));
    page.on('response', async resp => {
        try {
            const url = resp.url();
            const status = resp.status();
            // For streaming/binary endpoints avoid reading body (may be large/streaming).
            if (url.includes('/api/songs/') && url.includes('/stream')) {
                const headers = resp.headers();
                responses.push({ url, status, headers });
                return;
            }
            let text = '';
            try { text = await resp.text(); } catch (e) { text = '<binary-or-no-body>'; }
            responses.push({ url, status, body: text.slice(0, 2000) });
        } catch (e) { }
    });

    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
    const input = await page.$('input[aria-label="search-input"]');
    if (input) {
        await input.fill('王心凌 爱你');
        const btn = await page.$('button[aria-label="search-button"]') || await page.$('.search-btn');
        if (btn) {
            await Promise.all([page.waitForResponse(r => r.url().includes('/api/search') && r.status() === 200).catch(() => { }), btn.click()]);
        }
    }
    await page.waitForTimeout(800);
    const playBtn = await page.$('button[aria-label^="play-"]');
    if (playBtn) {
        await playBtn.click();
        await page.waitForTimeout(800);
    }

    fs.writeFileSync(path.join(out, 'console.json'), JSON.stringify(logs, null, 2));
    fs.writeFileSync(path.join(out, 'responses.json'), JSON.stringify(responses, null, 2));
    await browser.close();
    console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
