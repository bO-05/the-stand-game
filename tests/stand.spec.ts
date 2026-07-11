import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

async function canvasMetrics(page: import('@playwright/test').Page) {
  const buffer = await page.locator('#game-canvas').screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 6000));
  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
  }
  return { variance: max - min, buckets: buckets.size };
}

test('plays five objective levels, recovery, failure, restart, and finale on desktop and mobile', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?seed=12345');
  const chant = async () => {
    if (testInfo.project.name.includes('mobile')) await page.locator('#chant-button').click();
    else await page.keyboard.press('Space');
  };
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 8);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setState('active-play');
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
  });
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('playing');

  const metrics = await canvasMetrics(page);
  expect(metrics.variance).toBeGreaterThan(18);
  expect(metrics.buckets).toBeGreaterThan(12);

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setState('active-play');
    window.__THREE_GAME_TEST_HOOKS__?.setEnergy(100);
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(false);
  });
  const beforeX = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.x ?? 0);
  if (testInfo.project.name.includes('mobile')) {
    await page.locator('#lane-right').click();
  } else {
    await page.keyboard.press('KeyD');
  }
  await expect
    .poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.x ?? 0))
    .toBeGreaterThan(beforeX + 1);

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
    window.__THREE_GAME_TEST_HOOKS__?.setBeatOffset(-1200);
  });
  const beforeTiming = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as {
    cueIndex: number;
    score: number;
    energy: number;
  };
  await chant();
  const tooEarly = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as {
    cueIndex: number;
    score: number;
    energy: number;
    inputBuffered: boolean;
  };
  expect(tooEarly).toMatchObject({
    cueIndex: beforeTiming.cueIndex,
    score: beforeTiming.score,
    energy: beforeTiming.energy,
    inputBuffered: false,
  });

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setBeatOffset(-700));
  await chant();
  const queued = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as {
    cueIndex: number;
    score: number;
    inputBuffered: boolean;
  };
  expect(queued).toMatchObject({ cueIndex: beforeTiming.cueIndex, score: beforeTiming.score, inputBuffered: true });
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.advanceSimulation(320));
  const bufferedHit = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as {
    cueIndex: number;
    score: number;
    inputBuffered: boolean;
  };
  expect(bufferedHit.cueIndex).toBe(beforeTiming.cueIndex + 1);
  expect(bufferedHit.score).toBeGreaterThan(beforeTiming.score);
  expect(bufferedHit.inputBuffered).toBe(false);

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setBeatOffset(350));
  const beforeLate = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as { cueIndex: number; score: number };
  await chant();
  const lateHit = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as { cueIndex: number; score: number };
  expect(lateHit.cueIndex).toBe(beforeLate.cueIndex + 1);
  expect(lateHit.score).toBeGreaterThan(beforeLate.score);

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setBeatOffset(0));
  const beforeWrong = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as {
    cueIndex: number;
    targetLane: 0 | 1 | 2;
    energy: number;
  };
  await page.evaluate((target) => window.__THREE_GAME_TEST_HOOKS__?.setLane(((target + 1) % 3) as 0 | 1 | 2), beforeWrong.targetLane);
  await chant();
  const wrongLane = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as { cueIndex: number; energy: number };
  expect(wrongLane).toMatchObject({ cueIndex: beforeWrong.cueIndex, energy: beforeWrong.energy });

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setBeatOffset(500);
    window.__THREE_GAME_TEST_HOOKS__?.advanceSimulation(10);
  });
  const expiredCue = (await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getSnapshot())) as { cueIndex: number; energy: number };
  expect(expiredCue.cueIndex).toBe(beforeWrong.cueIndex + 1);
  expect(expiredCue.energy).toBeLessThan(beforeWrong.energy);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
    window.__THREE_GAME_TEST_HOOKS__?.completeCurrentRound();
  });
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('cycleClear');

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setState('recovery');
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
    window.__THREE_GAME_TEST_HOOKS__?.setBeatOffset(0);
  });
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('recovery');
  if (testInfo.project.name.includes('mobile')) await page.locator('#chant-button').click();
  else await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.score ?? 0)).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.start(12345, 0);
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
    for (let round = 0; round < 20; round += 1) {
      window.__THREE_GAME_TEST_HOOKS__?.completeCurrentRound();
      window.__THREE_GAME_TEST_HOOKS__?.advanceTransition();
      window.__THREE_GAME_TEST_HOOKS__?.advanceTransition();
      window.__THREE_GAME_TEST_HOOKS__?.advanceTransition();
    }
  });
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.seals)).toBe(5);
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('finale');

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('fail'));
  await expect(page.locator('#fail-screen')).toBeVisible();
  await page.locator('#fail-screen [data-restart]').click();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('countdown');

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setState('finale');
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
  });
  await expect(page.locator('#finale-hold')).toBeVisible();
  await testInfo.attach(`${testInfo.project.name}-finale`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('results'));
  await expect(page.locator('#results-screen')).toBeVisible();
  await expect(page.locator('#result-seals')).toHaveText('5/5');

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
