// SPDX-License-Identifier: AGPL-3.0-or-later
// R15: the Support sheet, from Home and from Settings, with the exact configured values and no request until something is tapped.
import { test, expect } from '@playwright/test'
import { prepare } from './helpers'
import { BTC_ADDRESS, LIGHTNING_ADDRESS, PAYSTACK_URL, SIGN_OFF } from '../../src/config/support'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('R15 support from Home and Settings', async ({ page, context }) => {
  await prepare(page)
  const requests: string[] = []
  context.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1')) requests.push(r.url()) })
  await page.goto('/')
  const signOff = page.getByTestId('home-signoff').getByRole('link')
  await expect(signOff).toHaveAttribute('href', SIGN_OFF.url)
  await page.getByTestId('support-open').first().click()
  const dialog = page.getByRole('dialog', { name: 'Support myPDF' })
  await expect(dialog).toBeVisible()
  const pay = dialog.getByTestId('paystack')
  await expect(pay).toHaveAttribute('href', PAYSTACK_URL); await expect(pay).toHaveAttribute('target', '_blank'); await expect(pay).toHaveAttribute('rel', /noopener/)
  await expect(dialog.getByTestId('lightning-value')).toHaveText(LIGHTNING_ADDRESS)
  await expect(dialog.getByTestId('onchain-value')).toHaveText(BTC_ADDRESS)
  await dialog.getByTestId('lightning-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LIGHTNING_ADDRESS)
  await dialog.getByTestId('onchain-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(BTC_ADDRESS)
  await expect(dialog.getByTestId('lightning-wallet')).toHaveAttribute('href', `lightning:${LIGHTNING_ADDRESS}`)
  await expect(dialog.getByTestId('onchain-wallet')).toHaveAttribute('href', `bitcoin:${BTC_ADDRESS}`)
  await expect(dialog).not.toContainText(/small|larger|amount|\$/i)
  expect(requests).toEqual([]) // nothing fired before a tap
  await page.keyboard.press('Escape')
  // from Settings, with the sign-off and source link
  await page.getByLabel('Settings').click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings.getByTestId('settings-signoff').getByRole('link')).toHaveAttribute('href', SIGN_OFF.url)
  await expect(settings.getByTestId('source-link')).toHaveAttribute('href', 'https://github.com/bgachichio/myPDF')
  await settings.getByTestId('support-open').click()
  await expect(page.getByRole('dialog', { name: 'Support myPDF' })).toBeVisible()
  expect(requests).toEqual([])
})
