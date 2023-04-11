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

const gulp = require('gulp')
const gulpIf = require('gulp-if')
var ts = require("gulp-typescript")
var tsProject = ts.createProject("tsconfig.json")
const mocha = require('gulp-mocha')
const eslint = require('gulp-eslint')

const compile =  ()=>{
  return tsProject.src().pipe(tsProject()).js.pipe(gulp.dest("dist/"))
}

exports.test = gulp.series(()=>{
  return Promise.resolve()
}, () => {
  return gulp.src('dist/test/**/*.js', {
    read: false
  }).pipe(mocha({
    exit: true,
    reporter: 'spec',
    ui: 'bdd',
  }))
})

function isFixed(file) {
  return file.eslint != null && file.eslint.fixed
}

exports.lint = () => {
  const hasFixFlag = process.argv.slice(2).includes('--fix')
  return gulp.src(['src/**/*.js', 'gulpfile.js'])
    .pipe(eslint({fix: hasFixFlag}))
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
    // if fixed, write the file to dest
    .pipe(gulpIf(isFixed, gulp.dest('src/')))
}

exports.functionalTest = gulp.series(()=>{return Promise.resolve()}, () => {
  return gulp.src('dist/test/functional/*.js', {
    read: false
  }).pipe(mocha({
    exit: true,
    reporter: 'spec',
    ui: 'bdd',
  }))
})

exports.compile = compile
exports.default = gulp.series(exports.test)
