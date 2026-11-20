# Security Policy

Chat+ (NextChat) takes the security and privacy of its users seriously. This document explains which versions receive security fixes, how to report a vulnerability, and the rules for responsible security research.

## Supported Versions

Security fixes are generally made against the latest version on the `main` branch.

| Version | Supported |
| --- | --- |
| Latest code on `main` | :white_check_mark: |
| Older commits and releases | :x: |

If you are running a deployment based on an older commit, update to the latest supported code before reporting an issue where practical. A fix may require a separate backport decision.

## Reporting a Vulnerability

**Please do not report suspected security vulnerabilities through public GitHub issues, discussions, pull requests, or social media.**

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability** (or **Report a vulnerability privately**).
3. Provide the details requested by GitHub, including the affected component and reproduction steps.

If private vulnerability reporting is unavailable, contact the repository maintainers privately through their GitHub account and ask for a secure channel. Do not include exploit details, credentials, personal data, or other sensitive information in a public message.

### What to Include

A useful report should include, where possible:

- A concise description and potential impact.
- The affected URL, API route, component, commit, or dependency version.
- Clear reproduction steps or a minimal proof of concept.
- Relevant request/response samples with session cookies, access tokens, API keys, email addresses, and other personal data removed.
- Any suggested mitigation.

You may submit a report without a working exploit if you have a credible security concern.

### What to Expect

- Maintainers will review the report and may ask for clarification or additional reproduction details.
- We will assess severity, affected versions, and the appropriate remediation.
- We will work with the reporter on a coordinated disclosure timeline when practical.
- We will let the reporter know when a fix or mitigation is available, subject to the information and contact details provided.

Please allow maintainers a reasonable opportunity to investigate and address a report before making it public. We do not promise a fixed response or remediation time.

## Scope

Reports are most useful when they concern security boundaries in this application, including:

- Authentication, session handling, account access, and authorization checks.
- Private and presence channel authorization and real-time event access.
- Chat, group, community, poll, event, announcement, member-management, and message APIs.
- Exposure or unauthorized modification of messages, attachments, user data, or community data.
- Input validation, injection, insecure direct object references, and privilege escalation.
- Rate limiting, abuse controls, and security-relevant denial-of-service weaknesses.
- Secret handling and configuration of integrations such as NextAuth, Google OAuth, Upstash Redis, Pusher Channels, and Vercel Blob.
- Vulnerable dependencies where a practical impact on this application can be demonstrated.

A dependency advisory without a demonstrated application impact may still be useful, but it may not be treated as an exploitable vulnerability in this project.

## Out of Scope

The following are generally not eligible for a security reward or urgent security fix unless they demonstrate a concrete impact on the application:

- Findings affecting only unsupported or significantly outdated deployments.
- Best-practice recommendations without an exploitable security impact.
- Missing security headers or scanner findings without a demonstrated attack path.
- Self-XSS, clickjacking on pages with no sensitive actions, or attacks requiring physical access to an unlocked device.
- Social engineering, phishing, spam, or attacks against maintainers and infrastructure not controlled by this project.
- Denial-of-service testing, high-volume automated scanning, or resource exhaustion.
- Reports about third-party services that cannot be reproduced as a security issue in this application's integration.

We may reclassify a report if its impact or reproduction details show a meaningful security risk.

## Responsible Testing Guidelines

When researching this application:

- Test only accounts and data that you own or have explicit permission to use.
- Do not access, modify, delete, or retain another person's messages, files, account, or personal information.
- Do not disrupt service, degrade availability, run load tests against live deployments, or perform destructive testing.
- Do not upload malware, exploit payloads intended to harm users, or files containing real personal data.
- Do not persist access, create backdoors, or attempt lateral movement into connected services.
- Stop testing and report the issue promptly if you encounter data belonging to another person.
- Keep vulnerability details confidential until maintainers have had a reasonable opportunity to investigate and remediate.

Please include only the minimum evidence needed to demonstrate the issue. Redact secrets and personal information from screenshots, logs, and proof-of-concept requests.

## Deployment and Secret Hygiene

Operators deploying their own instance are responsible for securing their environment. At a minimum:

- Use unique, strong production secrets and keep them out of source control, client-side bundles, logs, and issue reports.
- Configure OAuth redirect URLs and production origins explicitly; do not reuse development credentials in production.
- Restrict access to Redis, Pusher, and Blob credentials and rotate any credential that may have been exposed.
- Use HTTPS for production traffic and secure cookie settings appropriate to the deployment.
- Keep Node.js, Next.js, and application dependencies updated.
- Limit access to deployment dashboards, logs, backups, and stored attachments.
- Review environment variables and third-party service permissions before sharing a deployment or preview URL.

Never paste production credentials or live session tokens into a bug report.

## Disclosure

We appreciate responsible security research and will make reasonable efforts to coordinate disclosure with reporters. Please do not publish details that could put users or deployments at risk before a fix or mitigation is available.

This policy does not authorize testing against systems or accounts that you do not own or have permission to assess.
