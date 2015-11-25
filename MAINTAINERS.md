# For maintainers only

### Setup your minio-js Github Repository

Fork [minio-js upstream](https://github.com/minio/minio-js/fork) source repository to your own personal repository.
```bash
$ git clone https://github.com/$USER_ID/minio-js
$ cd minio-js
```

Minio Javascript library uses gulp for its dependency management http://gulpjs.com/

### Publishing new packages

#### Login to npm

```bash
$ npm login
Username: (minio)
Password: (or leave unchanged)
Email: (this IS public) (dev@minio.io)
```

#### Modify package.json with new version

```bash
$ head package.json
{
  "name": "minio",
  "version": "0.3.0",
  "description": "S3 Compatible Cloud Storage client",
...
...

```

#### Publish new version to npmjs

```bash
$ npm publish
```