/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2021 MinIO, Inc.
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

// Note: YOUR-ACCESSKEYID, YOUR-SECRETACCESSKEY, my-bucketname and my-objectname
// are dummy values, please replace them with original values.
import fs from 'node:fs'
import os from 'node:os'

import * as Minio from 'minio'
import splitFile from 'split-file'

const s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY',
})

const bucketName = 'my-bucketname'
const composedObjName = 'my-objectname'

const oneMB = 1024 * 1024

// Create a bucket prior to running: mc mb local/source-bucket
const sampleRunComposeObject = async () => {
  const tmpDir = os.tmpdir()

  // generate 100 MB buffer and write to a file.
  const local100mbFileToBeSplitAndComposed = Buffer.alloc(100 * oneMB, 0)

  const tmpSubDir = `${tmpDir}/compose`
  const fileToSplit = `${tmpSubDir}/${composedObjName}`
  const partObjNameList = []

  fs.mkdir(tmpSubDir, { recursive: true }, function (err) {
    if (err) {
      console.log(err)
    } else {
      console.log('New Temp directory successfully created.')
    }
  })

  try {
    fs.writeFileSync(fileToSplit, local100mbFileToBeSplitAndComposed)
    console.log('Written 100 MB File ')
    // 100 MB split into 26 MB part size. ( just to test unequal parts ). But change as required.

    const names = await splitFile.splitFileBySize(fileToSplit, 26 * oneMB)

    console.log('Split and write 100 MB File(s) ', names)
    const putPartRequests = names.map((partFileName) => {
      const partObjName = partFileName.slice((tmpSubDir + '/').length)
      partObjNameList.push(partObjName)
      return s3Client.fPutObject(bucketName, partObjName, partFileName, {})
    })
    await Promise.all(putPartRequests)

    console.log('Uploaded part Files: ', names)
    const sourcePartObjList = partObjNameList.map((partObjName) => {
      return new Minio.CopySourceOptions({
        Bucket: bucketName,
        Object: partObjName,
      })
    })

    const destObjConfig = new Minio.CopyDestinationOptions({
      Bucket: bucketName,
      Object: composedObjName,
      Headers: {
        'Content-Type': 'application/octet-stream', //example to set headers
      },
    })

    try {
      const result = await s3Client.composeObject(destObjConfig, sourcePartObjList)
      console.log(result)
      console.log('Composed to a single file: ', composedObjName)
    } catch (err) {
      console.log('Error in compose object : ', err.message)
    } finally {
      console.log('Remove source parts: ')
      partObjNameList.map((partObjName) => {
        return s3Client.removeObject(bucketName, partObjName)
      })
      // Clean up generated parts locally
      fs.rmSync(tmpSubDir, { recursive: true, force: true })
      console.log('Clean up temp parts directory : ')
    }
  } catch (e) {
    console.log('Error Creating local files ', e)
  }
}

sampleRunComposeObject()
