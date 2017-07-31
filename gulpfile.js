/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 Minio, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var babel = require('gulp-babel')
var gulp = require('gulp')
var sourcemaps = require('gulp-sourcemaps')
var notify = require('gulp-notify');

var fs = require("fs");
var browserify = require("browserify");
var ts = require('gulp-typescript')
var mocha = require('gulp-mocha')
var eslint = require('gulp-eslint')

gulp.task('browserify', ['compile'], function() {
  browserify("./dist/main/minio.js", {
    standalone: 'Minio'
  })
    .bundle()
    .on("error", function (err) { console.log("Error : " + err.message); })
    .pipe(fs.createWriteStream("./dist/main/minio-browser.js"));
})

gulp.task('default', ['test', 'browserify'], function() {})

gulp.task('compile', function(cb) {
  compile('src/main/**/*.ts', 'dist/main', cb)
})

gulp.task('test:compile', ['compile'], function(cb) {
  compile('src/test/**/*.js', 'dist/test', cb)
})

gulp.task('test', ['compile', 'test:compile'], function() {
  gulp.src('dist/test/**/*.js', {
    read: false
  })
    .pipe(mocha({
      reporter: 'spec',
      ui: 'bdd',
    }))
})

gulp.task('lint', function() {
  gulp.src('src/**/*.js')
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
})

gulp.task('functional-test', ['compile'], function() {
  compile('src/test/functional/*.js', 'dist/test/functional/', function() {
    gulp.src('dist/test/functional/*.js', {
      read: false
    })
      .pipe(mocha({
        reporter: 'spec',
        ui: 'bdd',
      }))
  })
})

function compile(src, dest, cb) {
  var tsproject = ts.createProject('tsconfig.json')
  gulp.src(src)
    .pipe(tsproject())
    .js
    .pipe(gulp.dest(dest))
    .on('end', function() {
      cb()
    })
}
