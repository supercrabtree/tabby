import { test, expect, type Page, type Locator } from '@playwright/test';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function defaultState() {
  return {
    nodes: [
      {
        id: 'p1', type: 'tab', parentId: null, zone: 'permanent', position: 0,
        collapsed: false, firefoxTabId: 1, url: 'https://github.com', title: 'GitHub',
        favIconUrl: '', anchorUrl: 'https://github.com', status: 'complete', lastActiveAt: Date.now(),
      },
      {
        id: 'p2', type: 'tab', parentId: null, zone: 'permanent', position: 1,
        collapsed: false, firefoxTabId: 2, url: 'https://docs.example.com/page',
        title: 'Docs', favIconUrl: '', anchorUrl: 'https://docs.example.com',
        status: 'complete', lastActiveAt: Date.now(),
      },
      {
        id: 'f1', type: 'folder', parentId: null, zone: 'permanent', position: 2,
        collapsed: false, name: 'Work', color: null, icon: null,
      },
      {
        id: 'p3', type: 'tab', parentId: 'f1', zone: 'permanent', position: 0,
        collapsed: false, firefoxTabId: 3, url: 'https://jira.example.com', title: 'Jira',
        favIconUrl: '', anchorUrl: 'https://jira.example.com', status: 'complete', lastActiveAt: Date.now(),
      },
      {
        id: 'e1', type: 'tab', parentId: null, zone: 'ephemeral', position: 0,
        collapsed: false, firefoxTabId: 4, url: 'https://stackoverflow.com',
        title: 'Stack Overflow', favIconUrl: '', anchorUrl: null,
        status: 'complete', lastActiveAt: Date.now(),
      },
      {
        id: 'e2', type: 'tab', parentId: null, zone: 'ephemeral', position: 1,
        collapsed: false, firefoxTabId: 5, url: 'https://reddit.com',
        title: 'Reddit', favIconUrl: '', anchorUrl: null,
        status: 'complete', lastActiveAt: Date.now(),
      },
    ],
    recentlyClosed: [
      { id: 'c1', title: 'Old Page', url: 'https://old.example.com', favIconUrl: '', closedAt: Date.now() - 3_600_000 },
      { id: 'c2', title: 'Another Page', url: 'https://another.example.com', favIconUrl: '', closedAt: Date.now() - 7_200_000 },
    ],
    settings: { expiryMs: 24 * 60 * 60 * 1000 },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pushState(page: Page, state: ReturnType<typeof defaultState>) {
  await page.evaluate((s) => (window as any).__tabbyMock.pushState(s), state);
}

async function getMessages(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__tabbyMock.getMessages());
}

async function clearMessages(page: Page) {
  await page.evaluate(() => (window as any).__tabbyMock.clearMessages());
}

async function getTabsCalls(page: Page): Promise<{ method: string; args: any[] }[]> {
  return page.evaluate(() => (window as any).__tabbyMock.getTabsCalls());
}

async function clearAll(page: Page) {
  await page.evaluate(() => (window as any).__tabbyMock.clearAll());
}

async function openContextMenu(page: Page, locator: Locator) {
  await locator.click({ button: 'right' });
  await expect(page.locator('.context-menu')).toBeVisible();
}

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() => {
    const msgs = (window as any).__tabbyMock?.getMessages();
    return msgs?.some((m: any) => m.type === 'GET_STATE');
  });

  await pushState(page, defaultState());
  await expect(page.getByText('GitHub')).toBeVisible();
  await clearAll(page);
});

// ── Rendering ─────────────────────────────────────────────────────────────────

test.describe('Rendering', () => {
  test('shows permanent tabs in the permanent zone', async ({ page }) => {
    const zone = page.getByRole('group', { name: 'Permanent tabs' });
    await expect(zone.getByText('GitHub')).toBeVisible();
    await expect(zone.getByText('Docs')).toBeVisible();
  });

  test('shows folders with name and icon', async ({ page }) => {
    const zone = page.getByRole('group', { name: 'Permanent tabs' });
    const folder = zone.locator('.folder-row', { hasText: 'Work' });
    await expect(folder).toBeVisible();
    await expect(folder.locator('.folder-icon')).toHaveText('📂');
  });

  test('shows folder children when expanded', async ({ page }) => {
    const zone = page.getByRole('group', { name: 'Permanent tabs' });
    await expect(zone.getByText('Jira')).toBeVisible();
  });

  test('shows ephemeral tabs in the ephemeral zone', async ({ page }) => {
    const zone = page.getByRole('group', { name: 'Ephemeral tabs' });
    await expect(zone.getByText('Stack Overflow')).toBeVisible();
    await expect(zone.getByText('Reddit')).toBeVisible();
  });

  test('shows fold divider with new-folder button', async ({ page }) => {
    await expect(page.getByRole('separator').first()).toBeVisible();
    await expect(page.getByTitle('New folder')).toBeVisible();
  });
});

// ── Click to activate ─────────────────────────────────────────────────────────

test.describe('Click to activate', () => {
  test('clicking a tab sends ACTIVATE_TAB and focuses it', async ({ page }) => {
    const tab = page.locator('.tab-row', { hasText: 'GitHub' });
    await tab.click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'ACTIVATE_TAB', firefoxTabId: 1 });
    await expect(tab).toHaveClass(/focused/);
  });

  test('clicking a different tab moves focus', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'GitHub' }).click();
    await page.locator('.tab-row', { hasText: 'Reddit' }).click();

    await expect(page.locator('.tab-row', { hasText: 'Reddit' })).toHaveClass(/focused/);
    await expect(page.locator('.tab-row', { hasText: 'GitHub' })).not.toHaveClass(/focused/);
  });
});

// ── Close tab ─────────────────────────────────────────────────────────────────

test.describe('Close tab', () => {
  test('close button sends CLOSE_TAB', async ({ page }) => {
    const tab = page.locator('.tab-row', { hasText: 'GitHub' });
    await tab.locator('.close-btn').click({ force: true });

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'CLOSE_TAB', nodeId: 'p1' });
  });
});

// ── Keyboard navigation ──────────────────────────────────────────────────────

test.describe('Keyboard navigation', () => {
  test('ArrowDown walks through visible nodes in order', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();

    const expected = ['GitHub', 'Docs', 'Work', 'Jira', 'Stack Overflow', 'Reddit'];
    for (const title of expected) {
      await page.keyboard.press('ArrowDown');
      const locator = title === 'Work'
        ? page.locator('.folder-row', { hasText: title })
        : page.locator('.tab-row', { hasText: title });
      await expect(locator).toHaveClass(/focused/);
    }
  });

  test('ArrowUp moves focus backwards', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub
    await page.keyboard.press('ArrowDown'); // Docs

    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.tab-row', { hasText: 'GitHub' })).toHaveClass(/focused/);
  });

  test('ArrowUp does not move past first node', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub

    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.tab-row', { hasText: 'GitHub' })).toHaveClass(/focused/);
  });

  test('Enter on tab sends ACTIVATE_TAB', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub

    await page.keyboard.press('Enter');
    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'ACTIVATE_TAB', firefoxTabId: 1 });
  });

  test('Enter on folder toggles collapse', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub
    await page.keyboard.press('ArrowDown'); // Docs
    await page.keyboard.press('ArrowDown'); // Work folder

    await expect(page.locator('.tab-row', { hasText: 'Jira' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).not.toBeVisible();
  });

  test('Delete on tab sends CLOSE_TAB', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub

    await page.keyboard.press('Delete');
    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'CLOSE_TAB', nodeId: 'p1' });
  });

  test('ArrowLeft collapses expanded folder', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub
    await page.keyboard.press('ArrowDown'); // Docs
    await page.keyboard.press('ArrowDown'); // Work folder

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.folder-row', { hasText: 'Work' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).not.toBeVisible();
  });

  test('ArrowRight expands collapsed folder', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub
    await page.keyboard.press('ArrowDown'); // Docs
    await page.keyboard.press('ArrowDown'); // Work folder

    await page.keyboard.press('ArrowLeft'); // collapse
    await page.keyboard.press('ArrowRight'); // expand
    await expect(page.locator('.folder-row', { hasText: 'Work' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).toBeVisible();
  });

  test('ArrowRight on expanded folder moves into first child', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub
    await page.keyboard.press('ArrowDown'); // Docs
    await page.keyboard.press('ArrowDown'); // Work folder (expanded)

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).toHaveClass(/focused/);
  });

  test('ArrowLeft on child moves focus to parent folder', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();
    await page.keyboard.press('ArrowDown'); // GitHub
    await page.keyboard.press('ArrowDown'); // Docs
    await page.keyboard.press('ArrowDown'); // Work folder
    await page.keyboard.press('ArrowDown'); // Jira (child)

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.folder-row', { hasText: 'Work' })).toHaveClass(/focused/);
  });
});

// ── Collapse / expand ─────────────────────────────────────────────────────────

test.describe('Collapse and expand', () => {
  test('clicking a folder toggles collapse and hides children', async ({ page }) => {
    const folder = page.locator('.folder-row', { hasText: 'Work' });
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).toBeVisible();

    await folder.click();
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).not.toBeVisible();
    await expect(folder).toHaveAttribute('aria-expanded', 'false');

    await folder.click();
    await expect(page.locator('.tab-row', { hasText: 'Jira' })).toBeVisible();
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
  });
});

// ── Context menu ──────────────────────────────────────────────────────────────

test.describe('Context menu', () => {
  test('right-click on permanent tab shows permanent tab menu', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'GitHub' }).click({ button: 'right' });

    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Re-anchor here')).toBeVisible();
    await expect(menu.getByText('Move below fold')).toBeVisible();
    await expect(menu.getByText('Duplicate')).toBeVisible();
    await expect(menu.getByText('Reload')).toBeVisible();
    await expect(menu.getByText('Close')).toBeVisible();
  });

  test('right-click on ephemeral tab shows ephemeral tab menu', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'Stack Overflow' }).click({ button: 'right' });

    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Keep (move above fold)')).toBeVisible();
    await expect(menu.getByText('Duplicate')).toBeVisible();
    await expect(menu.getByText('Close')).toBeVisible();
  });

  test('right-click on folder shows folder menu', async ({ page }) => {
    await page.locator('.folder-row', { hasText: 'Work' }).click({ button: 'right' });

    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Rename')).toBeVisible();
    await expect(menu.getByText('New Subfolder')).toBeVisible();
    await expect(menu.getByText('Delete')).toBeVisible();
  });

  test('Escape closes context menu', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'GitHub' }).click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.context-menu')).not.toBeVisible();
  });

  test('clicking elsewhere closes context menu', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'GitHub' }).click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();

    await page.locator('.sidebar').click();
    await expect(page.locator('.context-menu')).not.toBeVisible();
  });
});

// ── Recently closed ──────────────────────────────────────────────────────────

test.describe('Recently closed', () => {
  test('shows header with entry count', async ({ page }) => {
    const header = page.locator('button.header', { hasText: 'Recently Closed' });
    await expect(header).toBeVisible();
    await expect(header.locator('.count')).toHaveText('2');
  });

  test('panel is collapsed by default', async ({ page }) => {
    await expect(page.locator('.entry', { hasText: 'Old Page' })).not.toBeVisible();
  });

  test('clicking header expands panel and shows entries', async ({ page }) => {
    await page.locator('button.header', { hasText: 'Recently Closed' }).click();

    await expect(page.locator('.entry', { hasText: 'Old Page' })).toBeVisible();
    await expect(page.locator('.entry', { hasText: 'Another Page' })).toBeVisible();
  });

  test('clicking an entry sends REOPEN_CLOSED', async ({ page }) => {
    await page.locator('button.header', { hasText: 'Recently Closed' }).click();
    await page.locator('.entry', { hasText: 'Old Page' }).click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'REOPEN_CLOSED', entryId: 'c1' });
  });

  test('clicking header again collapses the panel', async ({ page }) => {
    const header = page.locator('button.header', { hasText: 'Recently Closed' });
    await header.click();
    await expect(page.locator('.entry', { hasText: 'Old Page' })).toBeVisible();

    await header.click();
    await expect(page.locator('.entry', { hasText: 'Old Page' })).not.toBeVisible();
  });
});

// ── Context menu actions ──────────────────────────────────────────────────────

test.describe('Context menu actions', () => {
  test('Re-anchor here sends RE_ANCHOR', async ({ page }) => {
    await openContextMenu(page, page.locator('.tab-row', { hasText: 'GitHub' }));
    await page.getByText('Re-anchor here').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'RE_ANCHOR', nodeId: 'p1' });
  });

  test('Move below fold sends DEMOTE_NODE', async ({ page }) => {
    await openContextMenu(page, page.locator('.tab-row', { hasText: 'GitHub' }));
    await page.getByText('Move below fold').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'DEMOTE_NODE', nodeId: 'p1' });
  });

  test('Keep (move above fold) sends PROMOTE_NODE', async ({ page }) => {
    await openContextMenu(page, page.locator('.tab-row', { hasText: 'Stack Overflow' }));
    await page.getByText('Keep (move above fold)').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'PROMOTE_NODE', nodeId: 'e1' });
  });

  test('Duplicate calls browser.tabs.duplicate', async ({ page }) => {
    await openContextMenu(page, page.locator('.tab-row', { hasText: 'GitHub' }));
    await page.getByText('Duplicate').click();

    const calls = await getTabsCalls(page);
    expect(calls).toContainEqual({ method: 'duplicate', args: [1] });
  });

  test('Reload calls browser.tabs.reload', async ({ page }) => {
    await openContextMenu(page, page.locator('.tab-row', { hasText: 'GitHub' }));
    await page.getByText('Reload').click();

    const calls = await getTabsCalls(page);
    expect(calls).toContainEqual({ method: 'reload', args: [1] });
  });

  test('Close from context menu sends CLOSE_TAB', async ({ page }) => {
    await openContextMenu(page, page.locator('.tab-row', { hasText: 'GitHub' }));
    await page.locator('.context-menu .menu-item.danger').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'CLOSE_TAB', nodeId: 'p1' });
  });

  test('Flatten children sends FLATTEN_NODES for folder', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.getByText('Flatten children').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'FLATTEN_NODES', nodeIds: ['p3'] });
  });

  test('New Subfolder sends CREATE_FOLDER with parentId', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.getByText('New Subfolder').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual(expect.objectContaining({
      type: 'CREATE_FOLDER',
      name: 'New Folder',
      parentId: 'f1',
    }));
  });

  test('Delete folder sends DELETE_FOLDER', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.locator('.context-menu .menu-item.danger').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'DELETE_FOLDER', nodeId: 'f1' });
  });
});

// ── Folder inline rename ──────────────────────────────────────────────────────

test.describe('Folder inline rename', () => {
  test('renaming does not send message when name is unchanged', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.getByText('Rename').click();

    const input = page.locator('.folder-row .rename-input');
    await input.press('Enter');

    const msgs = await getMessages(page);
    expect(msgs).not.toContainEqual(expect.objectContaining({ type: 'RENAME_FOLDER' }));
  });

  test('typing and pressing Enter commits rename', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.getByText('Rename').click();

    const input = page.locator('.folder-row .rename-input');
    await input.fill('Projects');
    await input.press('Enter');

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual({ type: 'RENAME_FOLDER', nodeId: 'f1', name: 'Projects' });
    await expect(input).not.toBeVisible();
  });

  test('pressing Escape cancels rename', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.getByText('Rename').click();

    const input = page.locator('.folder-row .rename-input');
    await input.fill('Something else');
    await input.press('Escape');

    await expect(input).not.toBeVisible();
    const msgs = await getMessages(page);
    expect(msgs).not.toContainEqual(expect.objectContaining({ type: 'RENAME_FOLDER' }));
  });

  test('context menu Rename triggers rename mode', async ({ page }) => {
    await openContextMenu(page, page.locator('.folder-row', { hasText: 'Work' }));
    await page.getByText('Rename').click();

    const input = page.locator('.folder-row .rename-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Work');
  });
});

// ── Double-click anchor restore ───────────────────────────────────────────────

test.describe('Double-click anchor restore', () => {
  test('double-clicking a drifted permanent tab calls browser.tabs.update with anchor URL', async ({ page }) => {
    const driftedTab = page.locator('.tab-row', { hasText: 'Docs' });
    await driftedTab.dblclick();

    const calls = await getTabsCalls(page);
    expect(calls).toContainEqual({
      method: 'update',
      args: [2, { url: 'https://docs.example.com' }],
    });
  });

  test('double-clicking a tab at its anchor does not call update', async ({ page }) => {
    const anchoredTab = page.locator('.tab-row', { hasText: 'GitHub' });
    await anchoredTab.dblclick();

    const calls = await getTabsCalls(page);
    expect(calls).not.toContainEqual(expect.objectContaining({ method: 'update' }));
  });

  test('double-clicking an ephemeral tab does not call update', async ({ page }) => {
    const ephemeralTab = page.locator('.tab-row', { hasText: 'Stack Overflow' });
    await ephemeralTab.dblclick();

    const calls = await getTabsCalls(page);
    expect(calls).not.toContainEqual(expect.objectContaining({ method: 'update' }));
  });
});

// ── Zoom ──────────────────────────────────────────────────────────────────────

test.describe('Zoom', () => {
  test('Ctrl+= zooms in', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();

    const before = await page.evaluate(() => document.documentElement.style.fontSize);
    await page.keyboard.press('Control+=');
    const after = await page.evaluate(() => document.documentElement.style.fontSize);

    expect(parseFloat(after)).toBeGreaterThan(parseFloat(before || '19.2'));
  });

  test('Ctrl+- zooms out', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();

    await page.keyboard.press('Control+=');
    const zoomed = await page.evaluate(() => document.documentElement.style.fontSize);
    await page.keyboard.press('Control+-');
    const after = await page.evaluate(() => document.documentElement.style.fontSize);

    expect(parseFloat(after)).toBeLessThan(parseFloat(zoomed));
  });

  test('Ctrl+0 resets zoom', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await sidebar.click();

    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+0');

    const fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    expect(parseFloat(fontSize)).toBeCloseTo(19.2, 1);
  });
});

// ── Fold divider ──────────────────────────────────────────────────────────────

test.describe('Fold divider', () => {
  test('plus button creates a new root folder', async ({ page }) => {
    await page.getByTitle('New folder').click();

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual(expect.objectContaining({
      type: 'CREATE_FOLDER',
      name: 'New Folder',
      parentId: null,
    }));
  });
});

// ── Drag and drop ─────────────────────────────────────────────────────────────

test.describe('Drag and drop', () => {
  test('dragging a tab to the permanent zone sends MOVE_NODE', async ({ page }) => {
    const source = page.locator('.tab-row', { hasText: 'Stack Overflow' });
    const target = page.getByRole('group', { name: 'Permanent tabs' });

    await source.dragTo(target);

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual(expect.objectContaining({
      type: 'MOVE_NODE',
      nodeId: 'e1',
      newZone: 'permanent',
    }));
  });

  test('dragging a tab to the ephemeral zone sends MOVE_NODE', async ({ page }) => {
    const source = page.locator('.tab-row', { hasText: 'GitHub' });
    const target = page.getByRole('group', { name: 'Ephemeral tabs' });

    await source.dragTo(target);

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual(expect.objectContaining({
      type: 'MOVE_NODE',
      nodeId: 'p1',
      newZone: 'ephemeral',
    }));
  });

  test('dragging a tab to the fold divider promotes it', async ({ page }) => {
    const source = page.locator('.tab-row', { hasText: 'Stack Overflow' });
    const target = page.locator('.fold-divider');

    await source.dragTo(target);

    const msgs = await getMessages(page);
    expect(msgs).toContainEqual(expect.objectContaining({
      type: 'MOVE_NODE',
      nodeId: 'e1',
      newZone: 'permanent',
    }));
  });
});

// ── Visual regression ─────────────────────────────────────────────────────────

test.describe('Visual regression', () => {
  test.use({ viewport: { width: 300, height: 600 } });

  test('default state', async ({ page }) => {
    await expect(page).toHaveScreenshot('default-state.png');
  });

  test('collapsed folder', async ({ page }) => {
    await page.locator('.folder-row', { hasText: 'Work' }).click();
    await expect(page).toHaveScreenshot('collapsed-folder.png');
  });

  test('focused tab', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'GitHub' }).click();
    await expect(page).toHaveScreenshot('focused-tab.png');
  });

  test('context menu open', async ({ page }) => {
    await page.locator('.tab-row', { hasText: 'GitHub' }).click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();
    await expect(page).toHaveScreenshot('context-menu.png');
  });

  test('recently closed expanded', async ({ page }) => {
    await page.locator('button.header', { hasText: 'Recently Closed' }).click();
    await expect(page.locator('.entry', { hasText: 'Old Page' })).toBeVisible();
    await expect(page).toHaveScreenshot('recently-closed-expanded.png');
  });

  test('dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page).toHaveScreenshot('dark-mode.png');
  });
});
