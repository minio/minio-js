
var Minio = require('minio')

var s3Client = new Minio.Client({
  endPoint: 's3.amazonaws.com',
  accessKey: 'YOUR-ACCESSKEYID',
  secretKey: 'YOUR-SECRETACCESSKEY'
})


s3Client.getBucketVersioning('my-bucketname', function (err,res){
  if (err) {
    return console.log(err)
  }
  console.log(res)
})