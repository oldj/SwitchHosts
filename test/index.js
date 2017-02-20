/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict';

const path = require('path');
const {test} = require('ava');
const assert = require('assert');
const Application = require('spectron').Application;

let appPath = path.resolve(__dirname, '../app');
let electronPath = path.resolve(__dirname, '../node_modules/.bin/electron');

test.beforeEach(async t => {
    t.context.app = new Application({
        path: electronPath,
        args: [appPath]
    });

    await t.context.app.start();
});

test.afterEach(async t => {
    await t.context.app.stop();
});

test('basic', async t => {
    let app = t.context.app;

    await app.client.waitUntilWindowLoaded();
    const win = app.browserWindow;

    t.is(await app.client.getWindowCount(), 1);
    t.is(await app.client.getTitle(), 'SwitchHosts!');
    t.false(await win.isMinimized());
    t.false(await win.isDevToolsOpened());
    t.true(await win.isVisible());

    const {width, height} = await win.getBounds();
    t.true(width > 0);
    t.true(height > 0);
});
