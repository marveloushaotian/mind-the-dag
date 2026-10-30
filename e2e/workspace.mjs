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
  await card.getByRole('button', { name: /^Sign in with email$/ }).click();
  await page.locator('.account-name').waitFor();
}
const saved = async (page) => {
  await sleep(800); // the first save starts a moment after the last keystroke
  await page.locator('.save-state', { hasText: /^Saved$/ }).waitFor();
};

const browser = await chromium.launch();
const pages = {};
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
  Object.assign(pages, { A, B });
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

  log('Alice signs in: the draft moves into My maps by itself');
  await signIn(A, 'alice@example.test');
  await A.locator('.account-name', { hasText: 'Alice' }).waitFor();
  await A.getByText(/Moved 1 map from this browser into My maps/).waitFor();
  await A.locator('.card-title', { hasText: 'Local one' }).waitFor();
  if (await A.evaluate(() => JSON.parse(localStorage.getItem('mind-the-dag:index') || '[]').length)) throw new Error('draft still in this browser');

  log('new maps with the same name are numbered');
  for (const want of ['Untitled pipeline', 'Untitled pipeline 2']) {
    await A.getByRole('button', { name: 'New map' }).click();
    await A.waitForURL(/#\/cloud\//);
    await A.waitForFunction((t) => document.querySelector('input[aria-label="Map title"]')?.value === t, want);
    await A.getByRole('button', { name: /all maps/ }).click();
    await A.locator('.card-title', { hasText: want }).first().waitFor();
  }

  log('Alice makes a map in My maps');
  await A.getByRole('button', { name: 'New map' }).click();
  await A.waitForURL(/#\/cloud\//);
  await A.getByLabel('Map title').fill('Alpha map');
  await saved(A);
  await A.getByRole('button', { name: /all maps/ }).click();
  await A.locator('.card-title', { hasText: 'Alpha map' }).waitFor();

  log('renaming a map to a name already in My maps numbers it');
  await A.getByRole('button', { name: 'New map' }).click();
  await A.waitForURL(/#\/cloud\//);
  await A.getByLabel('Map title').fill('Alpha map');
  await A.getByLabel('Map title').press('Enter');
  await A.waitForFunction(() => document.querySelector('input[aria-label="Map title"]')?.value === 'Alpha map 2');
  await A.getByText(/Renamed to “Alpha map 2”/).waitFor();
  await saved(A);
  await A.getByRole('button', { name: /all maps/ }).click();
  await A.locator('.card-title', { hasText: 'Alpha map 2' }).waitFor();

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
  await inv.getByLabel(/^Label/).fill('Carol');
  await inv.getByLabel('Who can use it').selectOption({ label: 'One person' });
  await inv.getByLabel('Also join group').selectOption({ label: 'Lab' });
  await inv.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await inv.getByLabel('Invitation link').inputValue();
  await inv.getByRole('button', { name: 'Close' }).click();

  log('Alice opens her own link: it is shown as hers and uses no place');
  const home = A.url();
  await A.goto(link);
  await A.getByText('This is your invitation link').waitFor();
  await A.getByText('0 of 1 place used').waitFor();
  await A.getByRole('button', { name: 'Preview what they see' }).click();
  await A.getByRole('button', { name: 'Sign up with email' }).waitFor();
  await A.getByRole('button', { name: 'Close preview' }).click();
  await A.getByRole('button', { name: 'Your maps' }).click();
  await A.goto(home);

  log('Carol signs up through the link with email and password and lands in Lab');
  const Cpage = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pages.C = Cpage;
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
  await Cpage.getByText(/places on it have been used/).waitFor();
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

  log('Bob updates his display name and Alice sees it in the group');
  await B.getByRole('button', { name: 'Account menu for Bob', exact: true }).click();
  await B.getByRole('menuitem', { name: 'Account profile', exact: true }).click();
  await B.getByLabel('Display name', { exact: true }).fill('Bob Researcher');
  await B.getByRole('button', { name: 'Save name', exact: true }).click();
  await B.locator('.account-name', { hasText: 'Bob Researcher' }).waitFor();
  await A.getByRole('button', { name: /all maps/ }).click();
  await A.locator('.side-item', { hasText: 'Lab' }).click();
  await A.getByRole('button', { name: 'Members & settings' }).click();
  await A.locator('.member-list', { hasText: 'Bob Researcher' }).waitFor();
  await A.getByRole('button', { name: 'Close', exact: true }).click();
  await A.goto(groupMapUrl);
  await saved(A);

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

  log('an existing account without a name can defer the prompt, then complete its profile');
  const d = await api('/api/collections/users/records', { method: 'POST', body: JSON.stringify({ email: 'dana@example.test', name: '', password: PASS, passwordConfirm: PASS }) }, su);
  const Dpage = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pages.D = Dpage;
  await Dpage.goto(WEB);
  await signIn(Dpage, 'dana@example.test');
  await Dpage.getByRole('dialog', { name: 'Add your display name' }).waitFor();
  if (await Dpage.getByLabel('Display name', { exact: true }).inputValue()) throw new Error('fallback email used as a profile name');
  await Dpage.getByRole('button', { name: 'Not now', exact: true }).click();
  await Dpage.getByRole('button', { name: 'Account menu for Your account', exact: true }).click();
  await Dpage.getByRole('menuitem', { name: 'Account profile', exact: true }).click();
  await Dpage.getByLabel('Display name', { exact: true }).fill('Dana');
  await Dpage.getByRole('button', { name: 'Save name', exact: true }).click();
  await Dpage.locator('.account-name', { hasText: 'Dana' }).waitFor();
  await Dpage.reload();
  await Dpage.locator('.account-name', { hasText: 'Dana' }).waitFor();
  if ((await api(`/api/collections/users/records/${d.id}`, {}, su)).name !== 'Dana') throw new Error('display name not saved');

  log('the editor has the same account menu, with keyboard access and profile editing');
  await Dpage.getByRole('button', { name: 'New map', exact: true }).click();
  await Dpage.waitForURL(/#\/cloud\//);
  await saved(Dpage);
  const accountMapId = Dpage.url().split('/').at(-1);
  const accountMenu = Dpage.getByRole('button', { name: 'Account menu for Dana', exact: true });
  await accountMenu.press('ArrowDown');
  if (await Dpage.evaluate(() => document.activeElement?.textContent) !== 'Account profile') throw new Error('menu did not focus its first action');
  await Dpage.getByRole('menuitem', { name: 'Account profile', exact: true }).press('Escape');
  if (!(await accountMenu.evaluate((el) => el === document.activeElement))) throw new Error('menu did not return focus');
  await accountMenu.click();
  await Dpage.getByRole('menuitem', { name: 'Account profile', exact: true }).click();
  await Dpage.getByLabel('Display name', { exact: true }).fill('Dana Researcher');
  await Dpage.getByRole('button', { name: 'Save name', exact: true }).click();
  await Dpage.locator('.account-name', { hasText: 'Dana Researcher' }).waitFor();

  log('signing out from the editor saves the last edit and returns to sign-in');
  await Dpage.getByLabel('Map title').fill('Saved before signing out');
  await Dpage.getByRole('button', { name: 'Account menu for Dana Researcher', exact: true }).click();
  await Dpage.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await Dpage.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  if (await Dpage.locator('.account-menu').count()) throw new Error('account still visible after sign-out');
  if ((await api(`/api/collections/maps/records/${accountMapId}`, {}, su)).title !== 'Saved before signing out') throw new Error('last edit lost on sign-out');

  console.log('e2e passed');
} catch (e) {
  console.log(`::error title=e2e failed at: ${step}::${String(e.message || e).split('\n').filter(Boolean).slice(0, 4).join(' | ').slice(0, 600)}`);
  process.exitCode = 1;
  for (const [k, p] of Object.entries(pages)) {
    const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)).catch(() => '?');
    console.log(`::warning title=page ${k}::${p.url()} :: ${text}`);
  }
} finally {
  await browser.close();
}
