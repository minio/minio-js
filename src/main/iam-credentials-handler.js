/*
 * Minio Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015 Minio, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
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

import got from "got"

/** url to AWS ec2 metadata store */
const metadataUrl = "http://169.254.169.254/latest/meta-data"
/** url to AWS ec2 metadata store for IAM role in the instance */
const iamRoleUrl = `${metadataUrl}/iam/security-credentials/`

class IAMRoleCredentialsHandler {
  constructor() {
    /** Promise to iam role for ec2 instance. */
    this._iamRolePromise = null
    this._credentials = null
    this._expiration = 0
  }

  _fetchCredentialsWithRole(iamRole) {
    if (!iamRole) return
    if (Date.now() >= this._expiration) {
      return got(`${iamRoleUrl}${iamRole}`, { timeout: 500, json: true }).then(
        ({ body: credentials }) => {
          const {
            AccessKeyId: accessKey,
            SecretAccessKey: secretKey,
            Expiration,
            Token: sessionToken
          } = credentials

          this._expiration = new Date(Expiration).getTime()
          this._credentials = { accessKey, secretKey, sessionToken }
          return this._credentials
        }
      )
    }
    return this._credentials
  }

  credentials() {
    // get iam role name if not retrieved
    this._iamRolePromise =
      this._iamRolePromise || got(iamRoleUrl, { timeout: 500 })

    // get credential
    return this._iamRolePromise.then(resp =>
      this._fetchCredentialsWithRole(resp.body)
    )
  }
}

export const iamCredentialsHandler = new IAMRoleCredentialsHandler()
