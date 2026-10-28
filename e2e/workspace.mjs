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
  const card = page.locator('.signin-card').first();
  if (!(await card.isVisible())) await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const alt = card.getByRole('button', { name: /email and password/ });
  if (await alt.count()) await alt.click();
  await card.getByLabel('Email').fill(email);
  await card.getByLabel('Password').fill(PASS);
  await card.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.account-name').waitFor();
}
const saved = async (page) => {
  await sleep(800); // the first save starts a moment after the last keystroke
  await page.locator('.save-state', { hasText: /^Saved$/ }).waitFor();
};

const browser = await chromium.launch();
try {
  log('create accounts (admin)');
  const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASS }) })).token;
  for (const [email, name, admin] of [
    ['alice@example.test', 'Alice', true],
    ['bob@example.test', 'Bob', false],
  ])
    await api('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email, name, admin, password: PASS, passwordConfirm: PASS }) }, su);

  const A = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const B = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  for (const p of [A, B]) p.on('pageerror', (e) => console.log(`::warning::page error: ${e.message}`));

  log('signed out: a draft in this browser');
  await A.goto(WEB);
  await A.getByRole('button', { name: /Try it without an account/ }).click();
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

  log('Alice (admin) makes an invitation link into Lab for someone new');
  await A.getByRole('button', { name: /all maps/ }).click();
  await A.getByRole('button', { name: 'Invite people' }).click();
  const inv = A.getByRole('dialog', { name: 'Invite people' });
  await inv.getByLabel(/^For/).fill('Carol');
  await inv.getByLabel('Also join group').selectOption({ label: 'Lab' });
  await inv.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await inv.getByLabel('Invitation link').inputValue();
  await inv.getByRole('button', { name: 'Close' }).click();

  log('Carol signs up through the link with email and password and lands in Lab');
  const Cpage = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await sleep(3500);
  await Cpage.goto(link);
  await Cpage.getByRole('button', { name: 'Sign up with email' }).click();
  await Cpage.getByLabel('Your name').fill('Carol');
  await Cpage.getByLabel('Email').fill('carol@example.test');
  await Cpage.getByLabel('Password').fill(PASS);
  await Cpage.getByRole('button', { name: 'Create account' }).click();
  await Cpage.locator('.account-name', { hasText: 'Carol' }).waitFor();
  await Cpage.locator('.home-title', { hasText: 'Lab' }).waitFor();
  await Cpage.locator('.card-title', { hasText: 'Group map' }).waitFor();
  await sleep(1000);
  await Cpage.goto(link);
  await Cpage.getByText(/already been used/).waitFor();
  await A.goto(groupMapUrl);

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
  console.log(`::error title=e2e failed at: ${step}::${String(e.message || e).split('\n').filter(Boolean).slice(0, 4).join(' | ').slice(0, 600)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
