
var Minio = require('minio')

var s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})

var versioningStateConfig = {Status:"Enabled"}

s3Client.putBucketVersioning("my-bucket", versioningStateConfig,function (error,res){
  if (error) {
    return console.log(error)
  }
  console.log(res)
})