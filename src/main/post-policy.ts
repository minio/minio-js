// Build PostPolicy object that can be signed by presignedPostPolicy
export class PostPolicy {
  public policy: Record<string, unknown>
  public formData: Record<string, unknown>

  constructor() {
    this.policy = {
      conditions: []
    }
    this.formData = {}
  }
  
  // set expiration date
  setExpires(date: { toISOString: () => any }) {
    if (!date) {
      throw new errors.InvalidDateError('Invalid date : cannot be null')
    }
    this.policy.expiration = date.toISOString()
  }
  
  // set object name
  setKey(objectName: string) {
    if (!isValidObjectName(objectName)) {
      throw new errors.InvalidObjectNameError(`Invalid object name : ${objectName}`)
    }
    this.policy.conditions.push(['eq', '$key', objectName])
    this.formData.key = objectName
  }
  
  // set object name prefix, i.e policy allows any keys with this prefix
  setKeyStartsWith(prefix: string) {
    if (!isValidPrefix(prefix)) {
      throw new errors.InvalidPrefixError(`Invalid prefix : ${prefix}`)
    }
    this.policy.conditions.push(['starts-with', '$key', prefix])
    this.formData.key = prefix
  }
  
  // set bucket name
  setBucket(bucketName: string) {
    if (!isValidBucketName(bucketName)) {
      throw new errors.InvalidBucketNameError(`Invalid bucket name : ${bucketName}`)
    }
    this.policy.conditions.push(['eq', '$bucket', bucketName])
    this.formData.bucket = bucketName
  }
  
  // set Content-Type
  setContentType(type: any) {
    if (!type) {
      throw new Error('content-type cannot be null')
    }
    this.policy.conditions.push(['eq', '$Content-Type', type])
    this.formData['Content-Type'] = type
  }
  
  // set Content-Type prefix, i.e image/ allows any image
  setContentTypeStartsWith(prefix: any) {
    if (!prefix) {
      throw new Error('content-type cannot be null')
    }
    this.policy.conditions.push(['starts-with', '$Content-Type', prefix])
    this.formData['Content-Type'] = prefix
  }
  
  // set Content-Disposition
  setContentDisposition(value: any) {
    if (!value) {
      throw new Error('content-disposition cannot be null')
    }
    this.policy.conditions.push(['eq', '$Content-Disposition', value])
    this.formData['Content-Disposition'] = value
  }
  
  // set minimum/maximum length of what Content-Length can be.
  setContentLengthRange(min: number, max: number) {
    if (min > max) {
      throw new Error('min cannot be more than max')
    }
    if (min < 0) {
      throw new Error('min should be > 0')
    }
    if (max < 0) {
      throw new Error('max should be > 0')
    }
    this.policy.conditions.push(['content-length-range', min, max])
  }
  
  // set user defined metadata
  setUserMetaData(metaData: { [s: string]: unknown } | ArrayLike<unknown>) {
    if (!isObject(metaData)) {
      throw new TypeError('metadata should be of type "object"')
    }
    Object.entries(metaData).forEach(([key, value]) => {
      const amzMetaDataKey = `x-amz-meta-${key}`
      this.policy.conditions.push(['eq', `$${amzMetaDataKey}`, value])
      this.formData[amzMetaDataKey] = value
    })
  }
}