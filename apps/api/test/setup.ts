process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '4001';
process.env.LOG_LEVEL = 'silent';

process.env.DATABASE_URL = 'postgresql://fluxsolutions:fluxsolutions@localhost:5432/fluxsolutions_test';

process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.WEB_BASE_URL = 'http://localhost:3000';
process.env.CORS_ORIGIN = 'http://localhost:3000';

process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-1234';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-1234';
process.env.JWT_SHARE_SECRET = 'test-share-secret-test-share-secret-1234';

process.env.S3_ENDPOINT = 'http://localhost:9000';
process.env.S3_PUBLIC_ENDPOINT = 'http://localhost:9000';
process.env.S3_REGION = 'us-east-1';
process.env.S3_ACCESS_KEY = 'minioadmin';
process.env.S3_SECRET_KEY = 'minioadmin';
process.env.S3_BUCKET = 'fluxsolutions-files';

process.env.SKIP_STARTUP_CHECKS = 'true';
