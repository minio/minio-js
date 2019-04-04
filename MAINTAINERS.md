# For maintainers only
MinIO JS SDK uses [npm4+](https://www.npmjs.org/) build system.

## Responsibilities
Go through [Maintainer Responsibility Guide](https://gist.github.com/abperiasamy/f4d9b31d3186bbd26522).

## Setup your minio-js Github Repository
Clone [minio-js](https://github.com/minio/minio-js/) source repository locally.
```sh
$ git clone git@github.com:minio/minio-js
$ cd minio-js
```

### Build and verify
Run `install` gulp task to build and verify the SDK.
```sh
$ npm install
```

## Publishing new release
Edit `package.json` version and all other files to the latest version as shown below.
```sh
$ git grep 3.2.0 | cut -f1 -d: | xargs sed s/3.2.0/3.2.1/g -i
$ grep version package.json
  "version": "3.2.1",
$ git commit -a -m "Bump to 3.2.1 release"
```

### Publish to NPM
Login to your npm account.
```sh
$ npm login
...
Logged in as minio on https://registry.npmjs.org/.
```

Publish the new release to npm repository.
```
$ npm publish
```

### Tag
Tag and sign your release commit, additionally this step requires you to have access to MinIO's trusted private key.
```
$ export GNUPGHOME=/media/${USER}/minio/trusted
$ git tag -s 3.2.1
$ git push
$ git push --tags
```

### Announce
Announce new release by adding release notes at https://github.com/minio/minio-js/releases from `trusted@minio.io` account. Release notes requires two sections `highlights` and `changelog`. Highlights is a bulleted list of salient features in this release and Changelog contains list of all commits since the last release.

To generate `changelog`
```sh
git log --no-color --pretty=format:'-%d %s (%cr) <%an>' <last_release_tag>..<latest_release_tag>
```
