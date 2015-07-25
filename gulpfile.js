/*
 * Minio Javascript Library for Amazon S3 compatible cloud storage, (C) 2015 Minio, Inc.
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
var exec = require('child_process').exec
var gulp = require('gulp')
var sourcemaps = require('gulp-sourcemaps')
var notify = require('gulp-notify');
var jscs = require('gulp-jscs');
var jshint = require('gulp-jshint');

gulp.task('default', ['test'], function() {})

gulp.task('compile', function(cb) {
  compile('src/main/**/*.js', 'minio.js', 'dist/main', cb)
})

gulp.task('test:compile', ['compile'], function(cb) {
  compile('src/test/**/*.js', 'minio-test.js', 'dist/test', cb)
})

gulp.task('test', ['compile', 'test:compile'], function() {
  var mocha = require('gulp-mocha')
  gulp.src('dist/test/unit/*.js', {
      read: false
    })
    .pipe(mocha({
      reporter: 'spec'
    }))
})

gulp.task('example:compile', ['compile'], function(cb) {
  "use strict";
  compile('src/example/**/*.js', 'example.js', 'dist/example', cb)
})

gulp.task('example', ['compile', 'example:compile'], function(cb) {
  "use strict";
  exec('node dist/example/example.js', function(err, stdout, stderr) {
    console.log(stdout)
    console.log(stderr)
    cb(err)
  })
})

gulp.task('jscs', function() {
  gulp.src('src/main/*.js')
    .pipe(jscs())
    .pipe(notify({
      title: 'JSCS',
      message: 'JSCS Passed. Let it fly!'
    }))
});

gulp.task('lint', function() {
  gulp.src('src/main/*.js')
    .pipe(jshint('.jshintrc'))
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .pipe(notify({
      title: 'JSHint',
      message: 'JSHint Passed. Let it fly!',
    }))
});

function compile(src, name, dest, cb) {
  gulp.src(src)
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dest))
    .on('end', function() {
      cb()
    })
}
