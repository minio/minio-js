var gulp = require('gulp')
var babel = require('gulp-babel')
var mocha = require('gulp-mocha')
var concat = require('gulp-concat')
var sourcemaps = require('gulp-sourcemaps')
//var sourcemaps = require('gulp-sourcemaps')

gulp.task('default', ['test'], function() {
})

gulp.task('compile', function(cb) {
    gulp.src('src/**/*.js')
        .pipe(sourcemaps.init())
        .pipe(concat('minio.js'))
        .pipe(babel())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist/main'))
        .on('end', function() {
            cb()
        })
})

gulp.task('test:compile', function(cb) {
    gulp.src('test/**/*.js')
        .pipe(sourcemaps.init())
        .pipe(concat('minio-test.js'))
        .pipe(babel())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist/test'))
        .on('end', function() {
            cb()
        })
})

gulp.task('test',['compile', 'test:compile'], function () {
    gulp.src('dist/test/*.js', {read: false})
        .pipe(mocha({reporter: 'spec'}))
})

