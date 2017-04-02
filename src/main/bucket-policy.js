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

import _ from 'lodash'
import * as errors from './errors';
import { isValidBucketName } from './helpers'

export const Policy = {
  NONE: 'none',
  READONLY: 'readonly',
  WRITEONLY: 'writeonly',
  READWRITE: 'readwrite'
}

const resourcePrefix = 'arn:aws:s3:::'

const readActions = {
  bucket: [ 's3:GetBucketLocation' ],
  object: [ 's3:GetObject' ]
}

const writeActions = {
  bucket: [ 's3:GetBucketLocation', 's3:ListBucketMultipartUploads' ],
  object: [ 's3:AbortMultipartUpload', 's3:DeleteObject',
            's3:ListMultipartUploadParts', 's3:PutObject' ]
}

// Returns the string version of the bucket policy.
export function parseBucketPolicy(policy, bucketName, objectPrefix) {
  let statements = policy.Statement

  // If there are no statements, it's none.
  if (statements.length === 0) return Policy.NONE

  let bucketResource = `${resourcePrefix}${bucketName}`
  let objectResource = `${resourcePrefix}${bucketName}/${objectPrefix}`

  let actions = {
    bucket: [],
    object: []
  }

  // Loop through the statements and aggregate actions which are allowed.
  for (let i = 0; i < statements.length; i++) {
    let statement = statements[i]

    // Normalize the statement, as AWS will drop arrays with length 1.
    statement = normalizeStatement(statement)

    // Verify the statement before we union-ize the actions.
    if (!_.some(statement.Principal.AWS, value => value == '*')) continue
    if (statement.Effect != 'Allow') continue

    // Check for object actions or bucket actions, depending on the resource.
    if (pertainsTo(statement, objectResource)) {
      actions.object = _.union(actions.object, statement.Action)
    } else if (pertainsTo(statement, bucketResource)) {
      actions.bucket = _.union(actions.bucket, statement.Action)
    }
  }

  // Check for permissions.
  let canRead = false
  let canWrite = false

  // If it has a subarray inside, there are full permissions to either
  // read, write, or both.
  if (isSubArrayOf(actions.bucket, writeActions.bucket) &&
      isSubArrayOf(actions.object, writeActions.object)) {
    canWrite = true
  }

  if (isSubArrayOf(actions.bucket, readActions.bucket) &&
      isSubArrayOf(actions.object, readActions.object)) {
    canRead = true
  }

  if (canRead && canWrite) return Policy.READWRITE
  else if (canRead) return Policy.READONLY
  else if (canWrite) return Policy.WRITEONLY
  else return Policy.NONE
}

// Generate a statement payload to submit to S3 based on the given policy.
export function generateBucketPolicy(policy, bucketName, objectPrefix) {
  if (!isValidBucketName(bucketName)) {
    throw new errors.InvalidBucketNameError(`Invalid bucket name: ${bucketName}`)
  }
  if (!isValidBucketPolicy(policy)) {
      throw new errors.InvalidBucketPolicyError(`Invalid bucket policy: ${policy}` +
                                                `(must be 'none', 'readonly', 'writeonly', or 'readwrite')`)
  }

  // Merge the actions together based on the given policy.
  let actions = {
    bucket: [],
    object: []
  }

  if (policy == Policy.READONLY || policy == Policy.READWRITE) {
    // Do read statements.
    actions.bucket = _.concat(actions.bucket, readActions.bucket)
    actions.object = _.concat(actions.object, readActions.object)
  }

  if (policy == Policy.WRITEONLY || policy == Policy.READWRITE) {
    // Do write statements.
    actions.bucket = _.concat(actions.bucket, writeActions.bucket)
    actions.object = _.concat(actions.object, writeActions.object)
  }

  // Drop any duplicated actions.
  actions.bucket = _.uniq(actions.bucket)
  actions.object = _.uniq(actions.object)

  // Form statements from the actions. We'll create three statements:
  // one for basic bucket permissions, one for basic object permissions,
  // and finally a special statement for ListBucket, which should be
  // handled separately.
  let statements = []

  if (actions.bucket.length > 0) {
    statements.push(createStatement(actions.bucket, `${resourcePrefix}${bucketName}`))
  }

  if (actions.object.length > 0) {
    statements.push(createStatement(actions.object, `${resourcePrefix}${bucketName}/${objectPrefix}*`))
  }

  // If reading permission is on, add ListBucket.
  if (policy == Policy.READONLY || policy == Policy.READWRITE) {
    let listBucketStatement = createStatement([ 's3:ListBucket' ], `${resourcePrefix}${bucketName}`)

    // It has a condition on it if there is a prefix, thus we do it separately.
    if (objectPrefix !== '') {
      listBucketStatement.Condition = { StringEquals: { 's3:prefix': objectPrefix } }
    }

    statements.push(listBucketStatement)
  }

  // s3 requires a wrapper around the statements.
  return {
    'Version': '2012-10-17',
    'Statement': statements
  }
}

export function isValidBucketPolicy(policy) {
  return policy == Policy.NONE ||
         policy == Policy.READONLY ||
         policy == Policy.WRITEONLY ||
         policy == Policy.READWRITE
}

// Checks to see if the parent array has all the values in the child array.
// Take the intersection for both. If the lengths are the same, the contents
// of the child are inside the parent.
function isSubArrayOf(parent, child) {
  return (_.intersection(parent, child)).length == child.length
}

// Checks if the statement pertains to the given resource. Returns a boolean.
function pertainsTo(statement, resource) {
  let resources = statement.Resource

  for (let i = 0; i < resources.length; i++) {
    if (_.startsWith(resources[i], resource)) return true
  }

  return false
}

// Create an s3 Allow Statement.
function createStatement(action, resource) {
  return {
    Sid: '',
    Effect: 'Allow',
    Principal: { 'AWS': ['*'] },
    Action: action,
    Resource: [ resource ]
  }
}

// AWS will sometimes drop arrays of length 1 for their values, so normalize
// these back to arrays with length 1.
function normalizeStatement(statement) {
  if (typeof statement.Principal.AWS === 'string')
    statement.Principal.AWS = [ statement.Principal.AWS ]

  if (typeof statement.Action === 'string')
    statement.Action = [ statement.Action ]

  if (typeof statement.Resource === 'string')
    statement.Resource = [ statement.Resource ]

  return statement
}
