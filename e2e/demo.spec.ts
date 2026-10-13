import { test, expect } from '@playwright/test'

test('每個情境都能開、只有車上能投稿、每天猜一題、預約不重複、小黃升級與拿到配件', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/?s=morning')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?s=morning')
  await expect(page.locator('[data-cap="lvl"]')).toHaveText('2')
  await expect(page.getByText('週二 10月13日')).toBeVisible()
  // 每個行程都有一則判斷；按「不用」按鈕就收起來
  await expect(page.locator('[data-cap="client"]').getByRole('button', { name: '預約 13:25' })).toBeVisible()
  await expect(page.locator('[data-cap="standup"]').getByRole('button')).toHaveCount(0)
  await expect(page.locator('[data-cap="agenda"]').getByText('內湖科技園區')).toHaveCount(0)
  await page.locator('[data-cap="dinner"]').getByRole('button', { name: '不用' }).click()
  await expect(page.locator('[data-cap="dinner"]').getByRole('button')).toHaveCount(0)
  await expect(page.locator('[data-cap="quizteaser"]')).toContainText('猜對了，連對 6 天')
  // 沒在車上：不能投稿
  await page.getByRole('button', { name: '猜一猜', exact: true }).click()
  await expect(page.getByText('搭 yoxi 時才能拍')).toBeVisible()

  await page.getByRole('button', { name: /行程前/ }).click()
  await expect(page.locator('[data-cap="push"]').getByText('您 14:00 有「客戶簡報」，需要叫車嗎？')).toBeVisible()
  await page.locator('[data-cap="fb"]').getByRole('button', { name: '預約 13:25' }).click()
  await page.getByRole('button', { name: '確認預約' }).click()
  await expect(page.getByText('下車後小黃會拿到小雨衣')).toBeVisible()
  await expect(page.locator('[data-cap="push"]').getByText(/已預約 13:25/)).toBeVisible()

  // 車上投稿：拍窗外 → AI 選題 → 投稿
  await page.getByRole('button', { name: /車上投稿/ }).click()
  await expect(page.getByText('行程中')).toBeVisible()
  await page.getByRole('button', { name: /拍窗外/ }).click()
  await expect(page.locator('[data-cap="checks"] li')).toHaveCount(4)
  await page.getByRole('button', { name: '投稿', exact: true }).click()
  await expect(page.getByText('已投稿・小黃經驗 +3')).toBeVisible()

  // 每天一題：猜對連對 +1、解鎖成就；猜過就不能再猜
  await page.getByRole('button', { name: /每天一題/ }).click()
  await page.locator('[data-cap="q-opts"]').getByRole('button', { name: /碧山路/ }).click()
  await expect(page.locator('[data-cap="q-result"]')).toHaveText('猜對了！連對 7 天・經驗 +3')
  await expect(page.getByText('解鎖成就：連對 7 天')).toBeVisible()
  await expect(page.locator('[data-cap="q-opts"] button:enabled')).toHaveCount(0)

  // 固定行程：前一晚鎖屏問要不要預約；點通知打開，看信心度與三段
  await page.getByRole('button', { name: /固定行程/ }).click()
  await expect(page.locator('[data-cap="push"]').getByText('明天週四 07:40 照常去台北車站嗎？')).toBeVisible()
  await page.locator('[data-cap="push"]').click()
  await expect(page.getByRole('heading', { name: '固定行程' })).toBeVisible()
  await expect(page.locator('[data-cap="habit1"]').getByText('近 4 週搭了 4 次')).toBeVisible()
  await expect(page.locator('[data-cap="habit2"]').getByText('信義區 → 家')).toBeVisible()
  await expect(page.locator('[data-cap="habit3"]')).toHaveCount(0)
  await page.locator('[data-cap="habit1"]').getByRole('button', { name: '預約明天 07:40' }).click()
  await page.getByRole('button', { name: '確認預約' }).click()
  await expect(page.getByText('下車後小黃會拿到通勤領結')).toBeVisible()
  await expect(page.locator('[data-cap="habit1"]').getByText('已預約明天 07:40')).toBeVisible()

  // 榮譽榜：你的照片成了題目
  await page.getByRole('button', { name: /榮譽榜/ }).click()
  await expect(page.locator('[data-cap="h-stat"]')).toHaveText('1,284 人猜，只有 295 人猜對')
  await expect(page.locator('[data-cap="h-title"]')).toContainText('封號「迷霧製造者」')
  await expect(page.locator('[data-cap="h-me"]')).toContainText('989')

  await page.getByRole('button', { name: /成就和配件/ }).click()
  await expect(page.locator('[data-cap="reward"]')).toContainText('14/20')
  // 33 天＋8 張×3＋1 題×5＋12 次猜對×3＝98；10/13、10/14 打開 +2，投稿 +3，出成題目 +5，猜對 +3 → 111
  await expect(page.getByText('經驗 111・再 89 點變成老司機小黃')).toBeVisible()
  await expect(page.locator('.p-gear .on')).toHaveCount(2)
  await expect(page.locator('.p-badges .on')).toHaveCount(3)

  await page.reload()
  await page.getByRole('button', { name: /車上投稿/ }).click()
  await expect(page.getByText('已投稿・小黃經驗 +3')).toBeVisible()
  expect(errors).toEqual([])
})
