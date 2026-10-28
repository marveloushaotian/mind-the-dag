// End-to-end check of the cloud workspace against a throwaway server (CI only).
// Usage: node e2e/workspace.mjs WEB_URL SERVER_URL SUPERUSER_EMAIL SUPERUSER_PASSWORD
import { chromium } from 'playwright';

const [WEB, API, SU_EMAIL, SU_PASS] = process.argv.slice(2);
const PASS = 'e2e-user-pass-123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 'setup';
const log = (s) => {
  step = s;
  console.log(`-> ${s}`);
};

async function api(path, init = {}, token) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function signIn(page, email) {
  await sleep(3500); // stay under the auth rate limit (2 per 3 s)
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Sign in' });
  await dlg.getByLabel('Email').fill(email);
  await dlg.getByLabel('Password').fill(PASS);
  await dlg.getByRole('button', { name: 'Sign in' }).click();
  await dlg.waitFor({ state: 'detached' });
}
const saved = (page) => page.locator('.save-state', { hasText: /^Saved$/ }).waitFor();

const browser = await chromium.launch();
try {
  log('create accounts (admin)');
  const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASS }) })).token;
  for (const [email, name] of [
    ['alice@example.test', 'Alice'],
    ['bob@example.test', 'Bob'],
  ])
    await api('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email, name, password: PASS, passwordConfirm: PASS }) }, su);

  const A = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const B = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  for (const p of [A, B]) p.on('pageerror', (e) => console.log(`::warning::page error: ${e.message}`));

  log('signed out: a draft in this browser');
  await A.goto(WEB);
  await A.getByRole('button', { name: 'New map' }).click();
  await A.waitForURL(/#\/map\//);
  await A.getByLabel('Map title').fill('Local one');
  await saved(A);
  await A.getByRole('button', { name: /all maps/ }).click();
  await A.getByText('Local one').waitFor();

  log('Alice signs in and moves the draft to My maps');
  await signIn(A, 'alice@example.test');
  await A.locator('.account-name', { hasText: 'Alice' }).waitFor();
  await A.getByRole('button', { name: /Move it to My maps/ }).click();
  await A.locator('.card-title', { hasText: 'Local one' }).waitFor();

  log('Alice makes a map in My maps');
  await A.getByRole('button', { name: 'New map' }).click();
  await A.waitForURL(/#\/cloud\//);
  await A.getByLabel('Map title').fill('Alpha map');
  await saved(A);
  await A.getByRole('button', { name: /all maps/ }).click();
  await A.locator('.card-title', { hasText: 'Alpha map' }).waitFor();

  log('Alice starts a group and invites Bob');
  await A.getByRole('button', { name: 'New group' }).click();
  await A.getByRole('dialog', { name: 'New group' }).getByLabel('Name').fill('Lab');
  await A.getByRole('button', { name: 'Create group' }).click();
  const gd = A.getByRole('dialog', { name: 'Lab' });
  await gd.getByLabel('Email address to invite').fill('Bob@Example.test');
  await gd.getByRole('button', { name: 'Invite' }).click();
  await gd.getByText('bob@example.test', { exact: true }).waitFor();
  await gd.getByRole('button', { name: 'Close' }).click();

  log('Alice makes a group map');
  await A.getByRole('button', { name: 'New map' }).click();
  await A.waitForURL(/#\/cloud\//);
  await A.getByText(/This map is shared with/).waitFor();
  await A.getByLabel('Map title').fill('Group map');
  await saved(A);
  const groupMapUrl = A.url();

  log('Bob signs in, joins and sees the group map but not Alice\'s own maps');
  await B.goto(WEB);
  await signIn(B, 'bob@example.test');
  await B.locator('.side-item', { hasText: 'Invitations' }).click();
  await B.getByRole('button', { name: 'Join group' }).click();
  await B.locator('.card-title', { hasText: 'Group map' }).waitFor();
  await B.locator('.side-item', { hasText: 'My maps' }).click();
  await B.getByText('No maps yet').waitFor();
  if (await B.locator('.card-title', { hasText: 'Alpha map' }).count()) throw new Error("Bob can see Alice's personal map");

  log('both edit the group map: the later save is held back');
  await B.goto(groupMapUrl);
  await B.getByLabel('Map title').fill('Group map (Bob)');
  await saved(B);
  await A.getByLabel('Map title').fill('Group map (Alice)');
  await A.getByText(/saved a newer version/).waitFor({ timeout: 15000 });
  await A.getByRole('button', { name: 'Use their version' }).click();
  await A.waitForFunction(() => document.querySelector('input[aria-label="Map title"]')?.value === 'Group map (Bob)');

  log('Bob leaves the group');
  await B.getByRole('button', { name: /all maps/ }).click();
  await B.locator('.side-item', { hasText: 'Lab' }).click();
  await B.getByRole('button', { name: 'Members' }).click();
  await B.getByRole('button', { name: 'Leave group' }).click();
  await B.locator('.home-title', { hasText: 'My maps' }).waitFor();
  if (await B.locator('.side-item', { hasText: 'Lab' }).count()) throw new Error('group still listed after leaving');

  console.log('e2e passed');
} catch (e) {
  console.log(`::error title=e2e failed at: ${step}::${String(e.message || e).split('\n')[0].slice(0, 400)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
