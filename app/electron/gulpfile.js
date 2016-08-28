/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');
const path = require('path');
const gulp = require('gulp');

gulp.task('update_version', () => {
    let fn = path.join(__dirname, 'src', 'version.js');
    let version = require('./src/version').version;
    version[3]++;

    console.log(`version -> ${version.join('.')}`);

    let cnt = `exports.version = ${JSON.stringify(version)};`
    fs.writeFile(fn, cnt, 'utf-8');
});

gulp.task('default', () => {
    gulp.start('update_version');

    gulp.watch([
        './main.js',
        './index.html',
        './src/**/*.*',
        '!./src/version.js'
    ], ['update_version']);
});
