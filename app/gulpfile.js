/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const beautify = require('js-beautify').js_beautify;

gulp.task('ver', () => {
    let fn = path.join(__dirname, 'src', 'version.js');
    let version = require('./src/version').version;
    version[3]++;

    console.log(`version -> ${version.join('.')}`);

    let cnt = `exports.version = ${JSON.stringify(version)};`;
    fs.writeFileSync(fn, cnt, 'utf-8');

    // update package.json
    fn = './package.json';
    cnt = fs.readFileSync(fn);
    let d = JSON.parse(cnt);
    d.version = version.slice(0, 3).join('.');
    cnt = beautify(JSON.stringify(d), {indent_size: 2});
    fs.writeFileSync(fn, cnt, 'utf-8');
});

gulp.task('default', () => {
    gulp.start('ver');

    gulp.watch([
        './main.js',
        './index.html',
        './src/**/*.*',
        '!./src/version.js'
    ], ['ver']);
});
