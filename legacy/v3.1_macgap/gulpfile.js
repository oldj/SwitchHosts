/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';
/*eslint-disable no-console*/

const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const shell = require('gulp-shell');
const gulpif = require('gulp-if');
const uglify = require('gulp-uglify');
const browserify = require('gulp-browserify');
const header = require('gulp-header');
// const stylus = require('gulp-stylus');
const babel = require('gulp-babel');
const replace = require('gulp-replace-task');
const args = require('yargs').argv;
const moment = require('moment');

const IS_DEBUG = !!args.debug;

console.log('IS_DEBUG: ', IS_DEBUG);
console.log('--------------------');
const TPL_FILE_INFO = 'echo \'> (DEBUG ' + (IS_DEBUG ? 'on' : 'off') + ') <%= file.path %>\'';

const plist_fn = path.join(__dirname, 'app/SH3/MacGap/SwitchHosts!-Info.plist');

const output = {
    // 汉字 -> unicode
    ascii_only: true
};

gulp.task('zip', function () {
    const config = require('./app/src/config');
    let dir = args.dir;
    if (!dir || !fs.existsSync(dir)) {
        console.log(`bad --dir: "${dir}"`);
        return;
    }
    let c = fs.readFileSync(plist_fn, 'utf-8');
    let m = c.match(/CFBundleVersion[^\d]*?(\d+)/);
    if (!m) {
        console.log('CFBundleVersion not found!');
        return;
    }
    let v = m[1];
    let fn = `SwitchHosts!_v${config.VERSION}.${v}_for_mac.zip`;
    console.log('fn', fn);

    gulp.src('app/src/main.js')
        .pipe(shell([
            `cd ${dir} && zip -ry ${fn} ./SwitchHosts!.app`
        ]))
    ;
});

gulp.task('ver', function () {
    const fn_config = './app/src/config.js';
    const config = require('./app/src/config');

    let c = fs.readFileSync(plist_fn, 'utf-8');
    let m;
    let v;
    let v2;

    m = c.match(/CFBundleShortVersionString[^\d]*?([\d\.]+)/);
    if (!m) {
        console.log('CFBundleShortVersionString not found!');
        return;
    }
    v = m[1];
    console.log(`short version: ${v} -> ${config.VERSION}`);
    c = c.replace(/(CFBundleShortVersionString[^\d]*?)([\d\.]+)/, `$1${config.VERSION}`);

    m = c.match(/CFBundleVersion[^\d]*?(\d+)/);
    if (!m) {
        console.log('CFBundleVersion not found!');
        return;
    }
    v = parseInt(m[1]);
    v2 = v + 1;
    console.log(`version: ${v} -> ${v2}`);
    c = c.replace(/(CFBundleVersion[^\d]*?)(\d+)/, `$1${v2}`);

    //console.log(c);
    fs.writeFileSync(plist_fn, c, 'utf-8');

    c = fs.readFileSync(fn_config, 'utf-8');
    c = c.replace(/(bundle_version:\s*)(\d+)/, `$1${v2}`);
    fs.writeFileSync(fn_config, c, 'utf-8');
});

gulp.task('js', ['ver'], function () {
    const config = require('./app/src/config');

    let s = gulp.src(['app/src/**/*.js'])
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(gulpif(!IS_DEBUG, replace({
            patterns: [{
                match: /\/\/\s*\$-FOR-TEST[\s\S]*?\/\/\s*\$-END/ig,
                replacement: ''
            }]
        })))
        .pipe(gulp.dest('tmp/'));

    s.on('end', () => {
        gulp.src(['tmp/main.js'])
            .pipe(shell(TPL_FILE_INFO))
            .pipe(browserify({
                debug: IS_DEBUG
            }))
            .pipe(gulpif(!IS_DEBUG, uglify({
                output: output,
                compress: {
                    drop_console: true
                }
            })))
            .pipe(header(`/* ${moment().format('YYYY-MM-DD HH:mm:ss')} v${config.bundle_version} */\n`))
            .pipe(gulp.dest('app/SH3/public/js'))
        ;
    });
});

gulp.task('default', function () {
    gulp.start('js');
    gulp.watch('app/src/**/*.js', ['js']);
});
