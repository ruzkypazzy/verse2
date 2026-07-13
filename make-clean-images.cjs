// Generate text-free avatar and OG image for VERSE2 ASP.
// OKX rejected the previous ones because they contained "VERSE2" / "V2" text.
import { chromium } from '/workspace/.tools/node_modules/playwright/index.mjs';

(async () => {
  const browser = await chromium.launch();

  // ---- 1. AVATAR (512x512, no text, just the gradient V mark) ----
  {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    await page.setContent(`<!doctype html><html><head><style>
body { margin: 0; width: 512px; height: 512px; background: #0a0a0a; display: flex; align-items: center; justify-content: center; }
.mark {
  width: 280px; height: 280px;
  background: linear-gradient(135deg, #ff6b9d 0%, #c44dff 50%, #5a9cff 100%);
  -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 18 14 L 50 84 L 82 14 L 66 14 L 50 50 L 34 14 Z" fill="black"/></svg>') center/contain no-repeat;
  mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 18 14 L 50 84 L 82 14 L 66 14 L 50 50 L 34 14 Z" fill="black"/></svg>') center/contain no-repeat;
}
.glow {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(0, 212, 170, 0.12) 0%, transparent 60%);
}
</style></head><body>
<div class="glow"></div>
<div class="mark"></div>
</body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/workspace/verse2/verse2-avatar.png' });
    console.log('avatar written: 512x512 text-free gradient V');
    await page.close();
  }

  // ---- 2. OG IMAGE (1200x630, abstract, no text) ----
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(`<!doctype html><html><head><style>
body { margin: 0; width: 1200px; height: 630px; background: #0a0a0a; overflow: hidden; position: relative; }
.bg { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 30%, #2a0044 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, #001a2a 0%, transparent 50%); }
.rings { position: absolute; inset: 0; }
.ring { position: absolute; border-radius: 50%; border: 1px solid rgba(0, 212, 170, 0.15); }
.r1 { width: 200px; height: 200px; left: 100px; top: 80px; }
.r2 { width: 320px; height: 320px; left: 40px; top: 20px; }
.r3 { width: 440px; height: 440px; left: -20px; top: -40px; }
.r4 { width: 200px; height: 200px; right: 100px; bottom: 80px; }
.r5 { width: 320px; height: 320px; right: 40px; bottom: 20px; }
.r6 { width: 440px; height: 440px; right: -20px; bottom: -40px; }
.mark {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 220px; height: 220px;
  background: linear-gradient(135deg, #ff6b9d 0%, #c44dff 50%, #5a9cff 100%);
  -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 18 14 L 50 84 L 82 14 L 66 14 L 50 50 L 34 14 Z" fill="black"/></svg>') center/contain no-repeat;
  mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 18 14 L 50 84 L 82 14 L 66 14 L 50 50 L 34 14 Z" fill="black"/></svg>') center/contain no-repeat;
}
.dot { position: absolute; border-radius: 50%; }
.d1 { width: 8px; height: 8px; background: #ff6b9d; top: 30%; left: 15%; box-shadow: 0 0 20px #ff6b9d; }
.d2 { width: 12px; height: 12px; background: #c44dff; top: 70%; left: 22%; box-shadow: 0 0 24px #c44dff; }
.d3 { width: 6px; height: 6px; background: #5a9cff; top: 25%; right: 18%; box-shadow: 0 0 18px #5a9cff; }
.d4 { width: 10px; height: 10px; background: #00D4AA; bottom: 30%; right: 25%; box-shadow: 0 0 22px #00D4AA; }
</style></head><body>
<div class="bg"></div>
<div class="rings">
  <div class="ring r1"></div>
  <div class="ring r2"></div>
  <div class="ring r3"></div>
  <div class="ring r4"></div>
  <div class="ring r5"></div>
  <div class="ring r6"></div>
</div>
<div class="dot d1"></div>
<div class="dot d2"></div>
<div class="dot d3"></div>
<div class="dot d4"></div>
<div class="mark"></div>
</body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/workspace/verse2/web/og-image.png' });
    console.log('og-image written: 1200x630 abstract text-free');
    await page.close();
  }

  await browser.close();
})();
