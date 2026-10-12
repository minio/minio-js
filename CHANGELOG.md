# Changelog

## Unreleased

### Security

- Validate IAM container credential endpoint URLs before requesting
  credentials. Relative URIs remain bound to the ECS endpoint, and HTTP full
  URIs are limited to loopback and known ECS or EKS hosts. See
  [issue #1509](https://github.com/minio/minio-js/issues/1509) and
  [pull request #1510](https://github.com/minio/minio-js/pull/1510).
