// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyLinkField, Modal, ShareDialog } from './dialogs';
import { GroupDialog, InviteLinksDialog } from './Home';
import type { Group, Member, SignupLink } from './cloud';
import { metagenomeExample } from './examples';
import { ExportDialog } from './exporters';
import { emptyDoc } from './model';

const api = vi.hoisted(() => ({
  member: { id: 'alice', name: 'Alice', email: 'alice@example.org', needsName: false, admin: true },
  groups: vi.fn(),
  members: vi.fn(),
  pending: vi.fn(),
  invite: vi.fn(),
  remove: vi.fn(),
  links: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  createMap: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock('./cloud', async (original) => ({
  ...(await original<typeof import('./cloud')>()),
  cloudEnabled: true,
  useMember: () => api.member,
  listMyGroups: api.groups,
  listMembers: api.members,
  listGroupInvitations: api.pending,
  invite: api.invite,
  removeMembership: api.remove,
  listSignupLinks: api.links,
  createSignupLink: api.createLink,
  deleteSignupLink: api.deleteLink,
  createCloudMap: api.createMap,
}));
vi.mock('./share', () => ({ shareUrl: api.snapshot }));
vi.mock('./motion', async (original) => ({ ...(await original<typeof import('./motion')>()), reducedMotion: () => true }));

const group: Group = { id: 'lab', name: 'Research lab', role: 'owner' } as Group;
const link: SignupLink = {
  id: 'invite1',
  code: 'sample-code',
  note: 'Presentation',
  groupId: null,
  groupName: null,
  expires: '2026-11-19 14:07:43.758Z',
  maxUses: 20,
  usedByNames: [],
};
let host: HTMLDivElement;
let root: Root;
async function mount(node: ReactNode) {
  await act(async () => root.render(node));
}
function button(label: string) {
  const result = [...host.querySelectorAll('button')].find((el) => el.textContent === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', window.navigator);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
  api.groups.mockResolvedValue([group]);
  api.members.mockResolvedValue([]);
  api.pending.mockResolvedValue([]);
  api.links.mockResolvedValue([]);
  api.invite.mockResolvedValue(undefined);
  api.createLink.mockResolvedValue(link);
  api.createMap.mockResolvedValue({ id: 'copy1' });
  api.snapshot.mockResolvedValue('https://example.org/#/view/snapshot');
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-05T12:00:00Z').getTime());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
  Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
});

const manage = (props = {}) => (
  <GroupDialog group={group} member={api.member as Member} onClose={vi.fn()} onChanged={vi.fn()} onGone={vi.fn()} {...props} />
);

describe('group invitation and membership journeys', () => {
  it('opens the invitation task directly, with account-email and acceptance instructions before sending', async () => {
    await mount(manage({ initialPage: 'invite' }));
    expect(host.textContent).toContain('Account profile');
    expect(host.textContent).toContain('no email is sent');
    expect(host.querySelector('input[type=email]')).not.toBeNull();
    expect(host.textContent).not.toContain('Delete group');
  });
  it('disables a pending request and shows acceptance instructions only after success', async () => {
    const request = deferred<void>();
    api.invite.mockReturnValue(request.promise);
    await mount(manage({ initialPage: 'invite' }));
    await fill(host.querySelector('input')!, 'Bob@Example.org');
    await submit();
    expect(api.invite).toHaveBeenCalledExactlyOnceWith('lab', 'bob@example.org');
    expect(button('Inviting…').disabled).toBe(true);
    expect(host.querySelector('[role=status]')).toBeNull();
    await act(async () => request.resolve());
    expect(host.querySelector('[role=status]')?.textContent).toContain('Group invitations');
    expect(host.querySelector('input')?.value).toBe('');
  });
  it('keeps the email and error after a failed invitation so it can be retried', async () => {
    api.invite.mockRejectedValueOnce(new Error('No account uses that email.'));
    await mount(manage({ initialPage: 'invite' }));
    await fill(host.querySelector('input')!, 'bob@example.org');
    await submit();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('No account');
    expect(host.querySelector('input')?.value).toBe('bob@example.org');
    expect(host.querySelector('[role=status]')).toBeNull();
    await submit();
    expect(api.invite).toHaveBeenCalledTimes(2);
  });
  it('requires confirmation before removing access and allows cancellation', async () => {
    api.members.mockResolvedValue([{ membershipId: 'membership1', userId: 'bob', name: 'Bob', role: 'member' }]);
    await mount(manage());
    await click('Remove');
    expect(api.remove).not.toHaveBeenCalled();
    expect(host.textContent).toContain('They will lose access');
    await click('Cancel');
    expect(host.querySelector('[aria-label="Confirm membership change"]')).toBeNull();
  });
  it('keeps owner-only settings out of a member account', async () => {
    await mount(manage({ group: { ...group, role: 'member' } }));
    expect(host.textContent).not.toContain('Settings');
    await click('Invite members');
    expect(host.querySelector('input[type=email]')).not.toBeNull();
  });
});

describe('registration links', () => {
  it('allows a specific quota and ends at a receipt rather than another create button', async () => {
    await mount(<InviteLinksDialog groups={[]} initialGroup={null} onClose={vi.fn()} />);
    expect(host.textContent).toContain('GitHub, Google or email');
    await fill(host.querySelector('input[type=number]')!, '7');
    await submit();
    expect(api.createLink).toHaveBeenCalledExactlyOnceWith('', null, 7);
    expect(host.textContent).toContain('Invitation link ready');
    expect(host.textContent).toContain('19 Nov 2026');
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('input[aria-label="Invitation link"]')?.getAttribute('readonly')).not.toBeNull();
    expect(host.textContent).toContain('Create another link');
  });
  it.each(['0', '21', '1.5', ''])('prevents an invalid quota (%s)', async (value) => {
    await mount(<InviteLinksDialog groups={[]} initialGroup={null} onClose={vi.fn()} />);
    await fill(host.querySelector('input[type=number]')!, value);
    expect(button('Create invitation link').disabled).toBe(true);
  });
  it('explains withdrawal and keeps the existing link intact until confirmed', async () => {
    api.links.mockResolvedValue([link]);
    await mount(<InviteLinksDialog groups={[]} initialGroup={null} onClose={vi.fn()} />);
    await click('Withdraw');
    expect(api.deleteLink).not.toHaveBeenCalled();
    expect(host.textContent).toContain('keep their accounts and group access');
    await click('Keep link');
    expect(api.deleteLink).not.toHaveBeenCalled();
  });
});

describe('sharing results and recovery', () => {
  it('distinguishes an immutable snapshot from group collaboration before copying', async () => {
    await mount(<ShareDialog doc={metagenomeExample()} place={{ kind: 'local', mapId: 'local' }} onClose={vi.fn()} />);
    expect(host.textContent).toContain('Later edits will not update');
    expect(host.querySelector('input')?.value).toContain('/view/snapshot');
    await click('Collaborate with a group');
    expect(host.textContent).toContain('Changes to these two copies stay separate');
    await click('Copy to group');
    expect(host.textContent).toContain('Continue editing the group copy');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('#/cloud/copy1');
    expect(host.textContent).not.toContain('Copy to group');
  });
  it('surfaces a failed group load with a working retry', async () => {
    api.groups.mockRejectedValueOnce(new Error('Offline'));
    await mount(<ShareDialog doc={metagenomeExample()} place={{ kind: 'local', mapId: 'local' }} onClose={vi.fn()} />);
    await click('Collaborate with a group');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Offline');
    await click('Try again');
    expect(host.querySelector('select')).not.toBeNull();
  });
  it('does not leave snapshot preparation stuck on failure', async () => {
    api.snapshot.mockRejectedValueOnce(new Error('Compression unavailable'));
    await mount(<ShareDialog doc={metagenomeExample()} place={{ kind: 'local', mapId: 'local' }} onClose={vi.fn()} />);
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Could not prepare');
    await click('Try again');
    expect(host.querySelector('input')?.value).toContain('/view/snapshot');
  });
  it('offers a selectable link when clipboard copying fails', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Permission denied'));
    await mount(<CopyLinkField url="https://example.org/invitation" />);
    await click('Copy link');
    const input = host.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(host.querySelector('[role=status]')?.textContent).toContain('link is selected');
  });
  it('uses a member-only map link for an existing group map without making a copy', async () => {
    await mount(
      <ShareDialog
        doc={metagenomeExample()}
        place={{ kind: 'cloud', mapId: 'shared1', groupId: 'lab', groupName: 'Research lab' }}
        onClose={vi.fn()}
      />,
    );
    expect(host.querySelector('input[aria-label="Group map link"]')?.getAttribute('value')).toContain('#/cloud/shared1');
    expect(host.textContent).toContain('Only members of this group can open');
    expect(api.createMap).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Copy to group');
  });
});

describe('export decisions', () => {
  it('lets users switch format without losing an empty-drawing error', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => new DOMRect() });
    const doc = emptyDoc();
    doc.legend.show = false;
    await mount(<ExportDialog doc={doc} theme="light" format="pdf" onClose={vi.fn()} onDone={vi.fn()} />);
    expect(host.querySelector('[role=alert]')?.textContent).toContain('nothing to export');
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = 'png';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).toContain('Slides and images');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('nothing to export');
    expect(button('Export').disabled).toBe(true);
    expect(host.textContent).toContain('Resolution');
  });
});

describe('keyboard continuity across dialogs', () => {
  it('keeps tab focus inside and restores the trigger after closing', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    await mount(
      <Modal title="Test" onClose={vi.fn()}>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );
    const first = host.querySelector('button')!;
    const last = button('Last');
    last.focus();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    first.focus();
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })),
    );
    expect(document.activeElement).toBe(last);
    await mount(null);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it('uses Escape only for the top dialog', async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();
    await mount(
      <Modal title="Parent" onClose={parentClose}>
        <Modal title="Child" onClose={childClose}>
          <button>Inside</button>
        </Modal>
      </Modal>,
    );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(childClose).toHaveBeenCalledOnce();
    expect(parentClose).not.toHaveBeenCalled();
  });
  it('keeps a pending operation open and prevents focus moving to the background', async () => {
    const close = vi.fn();
    const outside = document.createElement('button');
    document.body.append(outside);
    await mount(
      <Modal title="Saving" onClose={close} dismissible={false}>
        <button disabled>Saving…</button>
      </Modal>,
    );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(close).not.toHaveBeenCalled();
    outside.focus();
    expect(document.activeElement?.getAttribute('role')).toBe('dialog');
    outside.remove();
  });
});
