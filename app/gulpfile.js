/**
 * @author oldj
 * @blog http://oldj.net
 */

var gulp = require("gulp");
var sourcemaps = require("gulp-sourcemaps");
//var shell = require("gulp-shell");
//var concat = require("gulp-concat");
var stylus = require("gulp-stylus");

gulp.task("stylus", function () {
    gulp.src(["./css/*.styl"])
        .pipe(sourcemaps.init())
        .pipe(stylus({
            compress: true
        }))
        .pipe(sourcemaps.write("./"))
        .pipe(gulp.dest("./css"))
        //.pipe(shell("echo 'update: <%= file.path %>'"))
        //.pipe(makeSCP_CMD())
    ;
});

gulp.task("default", function () {
    //gulp.start("react");
    gulp.start("stylus");

    gulp.watch([
        "./css/*.styl"
    ], ["stylus"]);
});
