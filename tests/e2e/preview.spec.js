import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({page}) => {
  // Deterministic read-only fixtures. No wallet or chain is contacted.
  await page.route('https://bingo.jfmcss.com/**', route => {
    if(route.request().method() !== 'GET') throw new Error('Unexpected money-changing HTTP request')
    return route.fulfill({json: [{id:'classic',name:'Classic',entryFee:100,capacity:30,rakeBps:1000}]})
  })
})

for (const [width,height] of [[1920,1080],[1440,900],[1366,768],[768,1024],[390,844]]) {
  test(`major pages at ${width}x${height}: no JS errors or global overflow`, async ({page}) => {
    const errors=[]; const requests=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('requestfailed',r=>{if(!r.url().includes('fonts.')) requests.push(r.url())})
    await page.setViewportSize({width,height})
    await page.goto('/')
    await expect(page.getByText('Wagering paused · Preview available')).toBeVisible()
    await expect(page.getByText(/Bingo Live|Roulette Live|Domino Live|Poker Live/)).toHaveCount(0)
    for(const game of ['Bingo','Poker','Domino','Roulette']) {
      await page.locator('.cx-game-card').filter({has:page.getByRole('heading',{name:game,exact:true})}).getByRole('button').click()
      await expect(page.locator('.cx-live-room')).toBeVisible()
      const dimensions = await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}))
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.inner)
      await page.screenshot({path:`.audit/after-${game}-${width}.png`,fullPage:true})
      await page.getByRole('button',{name:'Canasino home',exact:true}).filter({visible:true}).click()
    }
    await page.screenshot({path:`.audit/after-home-${width}.png`,fullPage:true})
    expect(errors).toEqual([])
    expect(requests).toEqual([])
  })
}

test('wallet absent, fairness navigation, paused operations and mobile dialog', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.goto('/')
  await page.locator('.cx-wallet-button').click()
  await expect(page.getByRole('alert')).toContainText('FleetWallet is not detected')
  await page.getByRole('button',{name:'Dismiss wallet notice'}).click()
  await page.locator('.hero-button').click()
  await expect(page.getByRole('button',{name:'Unavailable during audit'}).first()).toBeDisabled()
  await page.getByRole('button',{name:/^Chat/}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.footer-link').click()
  await expect(page.getByText('EXAMPLE ONLY')).toBeVisible()
  await expect(page.getByText('Not verified', {exact:true})).toBeVisible()
})

test('accessibility: landing and all preview tables', async ({page}) => {
  await page.goto('/')
  for(const game of [null,'Bingo','Poker','Domino','Roulette']) {
    if(game) await page.locator('.cx-game-card').filter({has:page.getByRole('heading',{name:game,exact:true})}).getByRole('button').click()
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
    expect(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([])
    if(game) await page.getByRole('button',{name:'Canasino home',exact:true}).filter({visible:true}).click()
  }
})

test('mock wallet rejection gives feedback; restored wallet can disconnect', async ({page}) => {
  await page.addInitScript(() => {
    window.fleet = {
      isFleetWallet: true,
      getAccount: async () => null,
      connect: async () => { throw new Error('Signature rejected by user') },
      request: async () => { throw new Error('No transaction should be requested') },
    }
  })
  await page.goto('/')
  await page.locator('.cx-wallet-button').click()
  await expect(page.getByRole('alert')).toContainText('Signature rejected by user')
  await page.evaluate(() => {
    window.fleet.getAccount = async () => ({address:'ab'.repeat(20)})
    window.fleet.getBalance = async () => ({whole:'12.000001',symbol:'CNPY'})
  })
  // Reload keeps the init-script disconnected mock, so simulate a successful
  // explicit connection without relying on extension-specific event APIs.
  await page.evaluate(() => { window.fleet.connect = async () => ({address:'ab'.repeat(20)}) })
  await page.locator('.cx-wallet-button').click()
  await expect(page.getByRole('button',{name:/Disconnect wallet/})).toBeVisible()
  await page.getByRole('button',{name:/Disconnect wallet/}).click()
  await expect(page.locator('.cx-wallet-button')).toBeVisible()
})

test('unavailable lobby displays an error without writes', async ({page}) => {
  await page.route('https://bingo.jfmcss.com/**',r=>r.fulfill({status:503,body:'internal stack must not appear'}))
  await page.goto('/')
  await page.locator('.hero-button').click()
  await expect(page.getByText(/Game preview data unavailable/)).toBeVisible()
  await expect(page.getByText('internal stack must not appear')).toHaveCount(0)
})
