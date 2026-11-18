import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Runs against the production build in ./out, so run `npm run build` first.

let app: ElectronApplication
let page: Page
let userData: string

test.beforeEach(async () => {
  userData = await mkdtemp(path.join(tmpdir(), 'time-tracker-e2e-'))
  const args = ['.']
  // Chromium's sandbox cannot run as root, which is common in Linux containers and CI.
  if (process.platform === 'linux') args.push('--no-sandbox')
  app = await electron.launch({
    args,
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, TIME_TRACKER_USER_DATA: userData }
  })
  page = await app.firstWindow()
  await page.waitForSelector('.timer-bar')
})

test.afterEach(async () => {
  await app?.close()
  await rm(userData, { recursive: true, force: true })
})

async function readData(): Promise<{ entries: { description: string; end: string | null; projectId: string | null }[]; projects: { id: string; name: string }[] }> {
  return JSON.parse(await readFile(path.join(userData, 'data.json'), 'utf8'))
}

test('tracks time for a project and saves it to disk', async () => {
  await expect(page).toHaveTitle('Time Tracker')

  // Create a project.
  await page.getByRole('button', { name: 'Projects' }).click()
  await page.getByLabel('New project name').fill('Client A')
  await page.getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByTestId('project-row')).toHaveCount(1)

  // Start a timer for it.
  await page.getByRole('button', { name: 'Timer' }).click()
  await page.getByPlaceholder('What are you working on?').fill('Write proposal')
  await page.locator('.timer-bar select').selectOption({ label: 'Client A' })
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect(page.getByTestId('timer-elapsed')).not.toHaveText('0:00:00', { timeout: 5000 })

  let data = await readData()
  expect(data.entries).toHaveLength(1)
  expect(data.entries[0]).toMatchObject({ description: 'Write proposal', end: null, projectId: data.projects[0].id })

  // Stop it; the entry shows up in today's list.
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  const row = page.getByTestId('entry-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Write proposal')
  await expect(row).toContainText('Client A')
  await expect(page.locator('.day-header h3')).toHaveText('Today')

  data = await readData()
  expect(data.entries[0].end).not.toBeNull()

  await page.screenshot({ path: 'test-results/timer.png' })

  // Reports include the project.
  await page.getByRole('button', { name: 'Reports' }).click()
  await expect(page.locator('.bar-list').first()).toContainText('Client A')
  await page.screenshot({ path: 'test-results/reports.png' })
})

test('adds a manual entry and rejects an end time before the start', async () => {
  await page.getByRole('button', { name: 'Add entry' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('What did you work on?').fill('Planning')
  await dialog.getByLabel('Start').fill('2026-03-10T10:00')
  await dialog.getByLabel('End').fill('2026-03-10T09:00')
  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('End time must be after the start time.')

  await dialog.getByLabel('End').fill('2026-03-10T11:15')
  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('entry-row')).toContainText('Planning')
  await expect(page.getByTestId('entry-row')).toContainText('1:15:00')
})
