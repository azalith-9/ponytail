#!/usr/bin/env node
// Smoke test for the ZCode plugin adapter: verify the manifest and hooks
// wiring are present and stay inside what the ZCode runtime supports.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SKILL_DIRS = [
  'ponytail',
  'ponytail-review',
  'ponytail-audit',
  'ponytail-debt',
  'ponytail-gain',
  'ponytail-help',
];

// HookEventName in ZCode's hook contracts. Registering anything else makes the
// loader emit plugin_hook_unsupported_event and silently drop the hook.
const ZCODE_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
];

function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

test('zcode plugin manifest exists and has required fields', () => {
  const manifest = readJSON('.zcode-plugin/plugin.json');
  assert.equal(manifest.name, 'ponytail');
  assert.ok(manifest.version, 'manifest must declare a version');
  assert.ok(manifest.description, 'manifest must declare a description');
  assert.ok(manifest.author, 'manifest must declare an author');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.hooks, './hooks/zcode-hooks.json');
});

test('zcode hooks config registers only events ZCode supports', () => {
  const hooksConfig = readJSON('hooks/zcode-hooks.json');
  const events = Object.keys(hooksConfig.hooks);
  for (const event of events) {
    assert.ok(
      ZCODE_EVENTS.includes(event),
      `ZCode does not support hook event ${event}`,
    );
  }
  assert.ok(hooksConfig.hooks.SessionStart, 'must register SessionStart (activation)');
  assert.ok(hooksConfig.hooks.UserPromptSubmit, 'must register UserPromptSubmit (mode tracking)');
  assert.ok(
    !events.includes('SubagentStart'),
    'ZCode has no SubagentStart; registering it only earns a plugin_hook_unsupported_event diagnostic',
  );
});

test('zcode hook commands run the shared scripts via ${CLAUDE_PLUGIN_ROOT}', () => {
  // ZCode expands ${CLAUDE_PLUGIN_ROOT} to the plugin root for plugin hooks
  // (same variable Claude Code uses), so the commands match claude-codex-hooks.json.
  const hooksConfig = readJSON('hooks/zcode-hooks.json');
  const activate = hooksConfig.hooks.SessionStart[0].hooks[0].command;
  assert.ok(
    activate.includes('${CLAUDE_PLUGIN_ROOT}/hooks/ponytail-activate.js'),
    'SessionStart must point at ponytail-activate.js inside the plugin root',
  );
  const tracker = hooksConfig.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.ok(
    tracker.includes('ponytail-mode-tracker.js'),
    'UserPromptSubmit must point at ponytail-mode-tracker.js',
  );
});

test('zcode manifest points at skills that actually ship', () => {
  const manifest = readJSON('.zcode-plugin/plugin.json');
  const skillsDir = path.join(root, manifest.skills);
  assert.ok(fs.existsSync(skillsDir), 'skills/ directory must exist');

  for (const skill of SKILL_DIRS) {
    const skillFile = path.join(skillsDir, skill, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillFile),
      `missing skill: skills/${skill}/SKILL.md`,
    );
  }
});

test('zcode runtime detects ZCODE_PLUGIN_ROOT and writes hookSpecificOutput JSON', () => {
  const { isZcode } = require('../hooks/ponytail-runtime');
  // isZcode is resolved at module load time from process.env; in the test
  // process ZCODE_PLUGIN_ROOT is unset, so isZcode must be false here.
  // The positive path is exercised in hooks.test.js via spawnSync.
  assert.equal(isZcode, false, 'isZcode must be false without ZCODE_PLUGIN_ROOT');
});
