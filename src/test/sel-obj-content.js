
var Minio = require("../../dist/main/minio")

var minioClient = new Minio.Client({
  endPoint:"127.0.0.1",
  port:9000,
  useSSL:false,
  accessKey:"minio",
  secretKey :"minio123"
})
//mc
function selContent(bucketName, objectName, selConfig){
  const selPromise = minioClient.selectObjectContent(bucketName,objectName,selConfig)
  selPromise.then((res)=>{
    console.log("Final:",res)
  })
  selPromise.catch((err)=>{
    console.log("Error in Select:", err)
  })

}

const bucketName = 'sph-my-bucket'
const objName ="sample_data.csv"

selContent(bucketName, objName,{
  //RequestProgress:true,
  expression:"SELECT * FROM s3object s where s.\"Name\" = 'Jane'",
  inputSerialization : {'CSV': {"FileHeaderInfo": "Use"}, 'CompressionType': 'NONE'},
  outputSerialization : {'CSV': {}},
})