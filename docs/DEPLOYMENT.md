# Hosting handoff for EC2

You own hosting. No resources, public endpoints, DNS, cloud identities or paid services were created. The local Compose file is a development configuration; do not publish it unchanged.

## Reduced demonstration topology

1. Choose an EC2 Linux instance and storage budget. Install Docker/Compose. Transfer this repository without `.env`, local caches, private attachments or test data.
2. Create fresh deployment secrets outside source control. Replace local demo users/authentication before broad public use. Set `SIMULATOR_ENABLED=false` unless you intentionally need an authorized demonstration simulator.
3. Use private PostgreSQL (RDS is the documented target) and MongoDB Atlas connections through `DATABASE_URL`, `MONGO_URL` and `MONGO_DB`. Configure trusted CA validation and encrypted connections; never disable certificate verification. Keep database ports private and restrict security groups/network access to the application.
4. Build the existing Dockerfile. Run `node backend/migrate.js` once as a controlled migration job; run `node backend/seed.js` only for a synthetic demo environment. Start the API and worker as separate services with restart policies. Mount/pass secrets from your deployment secret store.
5. Serve HTTPS/WSS using a TLS reverse proxy or ALB. Route `/api`, `/health/ready`, `/ws/*` and the static frontend to the API container. Enable WebSocket upgrade, set suitable idle timeout, and health-check `/health/ready`. Do not expose database ports.
6. Run the complete integration and browser scenario against the hosted environment with disposable data. Verify logout/session expiry, cross-tenant denial, database recovery, offline devices and live reconnect.
7. Back up PostgreSQL and MongoDB; rehearse restore into a separate environment before claiming the documented RPO/RTO. Configure disk, lag, retry, failed notification and process alerts. Retain audit records according to your selected policy.

## Full architecture mapping

| Local implementation | Documented AWS target | Work still required |
|---|---|---|
| Express API + React build | EC2/ALB/Auto Scaling | TLS, health checks, instance rollout, capacity tests |
| PostgreSQL | Amazon RDS PostgreSQL | Network, credentials, TLS, backup, Multi-AZ choice |
| MongoDB container | MongoDB Atlas on AWS | Access policy, region, TLS, retention and backup |
| Durable events / live_events | SQS + worker + live gateway | Queue adapter, IAM, dead-letter queue, delivery contract tests |
| HTTP simulator / hashed credential | AWS IoT Core MQTT TLS | Certificates, topic policies, ingestion bridge, shadow/command bridge |
| Local signed sessions | Cognito | JWT issuer/audience/JWKS verification, role mapping, MFA and lifecycle |
| Simulated notification records | SNS | Authorized recipients, delivery adapter, retry/idempotency tests |
| No media | S3 | Consent/privacy controls, signed URLs, lifecycle policies |
| JSON error logs + data health | CloudWatch/CloudTrail | Log shipping, metrics, alarms, cloud audit |

The current durable live log permits multiple API instances to poll committed changes; background jobs use row locks/SKIP LOCKED. That supports a path toward replication, but does not establish measured horizontal scaling or production reliability. Run load and failure tests before claiming those targets.
