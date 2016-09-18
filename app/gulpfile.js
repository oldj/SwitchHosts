/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const fs = require('fs');
const path = require('path');
// const util = require('util');
const exec = require('child_process').exec;
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

gulp.task('pack', () => {
    let version = require('./src/version').version;
    let v1 = version.slice(0, 3).join('.');
    let v2 = version[3];

    let cmds = `
# for macOS
electron-packager . 'SwitchHosts!' --platform=darwin --arch=x64 --overwrite --asar=true --prune --icon=../assets/app.icns --ignore=node_modules/.bin --ignore=.git --ignore=dist --ignore=node_modules/electron-* --out=dist --app-version=${v1} --build-version=${v2}

# for windows x64
electron-packager . 'SwitchHosts!' --platform=win32  --arch=x64 --overwrite --asar=true --prune --icon=../assets/app.ico  --ignore=node_modules/.bin --ignore=.git --ignore=dist --ignore=node_modules/electron-* --out=dist --app-version=${v1} --build-version=${v2}

# for windows ia32
electron-packager . 'SwitchHosts!' --platform=win32  --arch=ia32 --overwrite --asar=true --prune --icon=../assets/app.ico  --ignore=node_modules/.bin --ignore=.git --ignore=dist --ignore=node_modules/electron-* --out=dist --app-version=${v1} --build-version=${v2}
`;

    console.log(`start packing, v: ${v1}.${v2} ..`);
    console.log(cmds);
    exec(cmds, (error, stdout, stderr) => {
        console.log('end pack.');
        if (error) {
            console.error(`exec error: ${error}`);
        }
        // if (stdout) console.log(`${stdout}`);
        // if (stderr) console.log(`${stderr}`);
    });
});

gulp.task('zip', () => {
    let version = require('./src/version').version;
    let v = version.join('.');

    let cmds = `
cd ./dist
rm -f ./SwitchHosts-*.zip
zip -ry SwitchHosts-macOS-x64_v${v}.zip ./SwitchHosts\\!-darwin-x64/SwitchHosts\\!.app
zip -ry SwitchHosts-win32-x64_v${v}.zip ./SwitchHosts\\!-win32-x64
zip -ry SwitchHosts-win32-ia32_v${v}.zip ./SwitchHosts\\!-win32-ia32
cd ..
`;

    console.log(`start zip ..`);
    exec(cmds, (error, stdout, stderr) => {
        console.log('end zip.');
        if (error) {
            console.error(`exec error: ${error}`);
        }
        // if (stdout) console.log(`${stdout}`);
        // if (stderr) console.log(`${stderr}`);
    });

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
