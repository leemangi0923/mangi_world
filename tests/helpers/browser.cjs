const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

function createBrowserHarness({before, after}) {
  let server, browser, origin;
  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fs.readFileSync(path.join(__dirname, '../../index.html')));
      } else { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless:true, args:['--no-sandbox']});
  });
  after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  });
  return {
    async run(fn, {init, scene} = {}) {
      const context = await browser.newContext({viewport:{width:1600,height:1000}, acceptDownloads:true});
      try {
        if (init) await context.addInitScript(init);
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('https://fonts.googleapis.com/**', route => route.abort());
        await page.goto(origin);
        if (scene) await page.evaluate(value => { gameState = value; }, scene);
        await fn(page);
        assert.deepEqual(errors, [], 'No unhandled page errors');
      } finally { await context.close(); }
    }
  };
}
async function startNewAdventure(page) {
  await page.getByRole('button',{name:'게임 시작',exact:true}).click();
  await page.getByRole('button',{name:'새로운 모험 시작',exact:true}).first().click();
  for (let i=0; i<100 && await page.locator('#story-screen').isVisible(); i++) await page.locator('#story-screen').click();
  await page.waitForFunction(()=>isPlaying && !isPaused && gameState==='village');
}
module.exports = {createBrowserHarness, startNewAdventure};
