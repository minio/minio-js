/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 MinIO, Inc.
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

const babel = require('gulp-babel')
const gulp = require('gulp')
const gulpIf = require('gulp-if')
const sourcemaps = require('gulp-sourcemaps')

const fs = require('fs')
const browserify = require('browserify')
const mocha = require('gulp-mocha')
const eslint = require('gulp-eslint')

const compileJS = (src, dest) => {
  return gulp
    .src(src)
    .pipe(sourcemaps.init())
    .pipe(
      babel({
        presets: [
          [
            '@babel/env',
            {
              targets: { node: 8 },
            },
          ],
        ],
      })
    )
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(dest))
}

const compile = () => compileJS('src/main/**/*.js', 'dist/main')
const testCompile = gulp.series(compile, () => {
  return compileJS('src/test/**/*.js', 'dist/test')
})

exports.browserify = gulp.series(compile, () => {
  return browserify('./dist/main/minio.js', {
    standalone: 'MinIO',
  })
    .bundle()
    .on('error', (err) => {
      // eslint-disable-next-line no-console
      console.log('Error : ' + err.message)
    })
    .pipe(fs.createWriteStream('./dist/main/minio-browser.js'))
})

exports.test = gulp.series(testCompile, () => {
  return gulp
    .src('dist/test/**/*.js', {
      read: false,
    })
    .pipe(
      mocha({
        exit: true,
        reporter: 'spec',
        ui: 'bdd',
      })
    )
})

function isFixed(file) {
  return file.eslint != null && file.eslint.fixed
}

exports.lint = () => {
  const hasFixFlag = process.argv.slice(2).includes('--fix')
  return (
    gulp
      .src(['src/**/*.js', 'gulpfile.js'])
      .pipe(eslint({ fix: hasFixFlag }))
      .pipe(eslint.format())
      .pipe(eslint.failAfterError())
      // if fixed, write the file to dest
      .pipe(gulpIf(isFixed, gulp.dest('src/')))
  )
}

exports.functionalTest = gulp.series(testCompile, () => {
  return gulp
    .src('dist/test/functional/*.js', {
      read: false,
    })
    .pipe(
      mocha({
        exit: true,
        reporter: 'spec',
        ui: 'bdd',
      })
    )
})

exports.compile = compile
exports.testCompile = testCompile
exports.default = gulp.series(exports.test, exports.browserify)
